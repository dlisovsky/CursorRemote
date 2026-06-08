import { randomUUID } from "node:crypto";
import { Agent, CursorAgentError, type Run, type SDKAgent } from "@cursor/sdk";
import type { WireErrorCode } from "../../../shared/types.js";
import { config } from "../config.js";
import * as store from "../registry/store.js";
import { normalizeSdkMessage } from "./normalize.js";
import type { QueueItem } from "../../../shared/types.js";
import * as bridge from "./stream-bridge.js";

const handles = new Map<string, SDKAgent>();
const activeRuns = new Map<string, Run>();
const promptQueues = new Map<string, { id: string; text: string }[]>();

export async function startupReconcile(): Promise<void> {
  const apiKey = config.cursorApiKey();
  const model = config.model;

  for (const agent of store.listAllAgentsForReconcile()) {
    if (!agent.cursorAgentId) continue;
    try {
      const sdk = await Agent.resume(agent.cursorAgentId, {
        apiKey,
        model,
        local: { cwd: agent.cwd },
      });
      handles.set(agent.id, sdk);
      store.updateAgentStatus(agent.id, "idle");
    } catch {
      store.updateAgentStatus(agent.id, "stale");
    }
  }
}

export async function createAgent(input: {
  telegramUserId: number;
  projectId: string;
  cwd: string;
  title: string;
}): Promise<ReturnType<typeof store.createAgent>> {
  const id = randomUUID();
  const apiKey = config.cursorApiKey();
  try {
    const sdk = await Agent.create({
      apiKey,
      model: config.model,
      local: { cwd: input.cwd },
    });
    const row = store.createAgent({
      id,
      telegramUserId: input.telegramUserId,
      projectId: input.projectId,
      cwd: input.cwd,
      title: input.title,
      cursorAgentId: sdk.agentId,
    });
    handles.set(id, sdk);
    return row;
  } catch (err) {
    const message = err instanceof CursorAgentError ? err.message : String(err);
    throw Object.assign(new Error(message), { code: "agent_create_failed" as WireErrorCode });
  }
}

export async function getOrResumeHandle(agentId: string): Promise<SDKAgent> {
  const existing = handles.get(agentId);
  if (existing) return existing;

  const meta = store.getAgent(agentId);
  const cwd = store.getAgentCwd(agentId);
  if (!meta?.cursorAgentId || !cwd) throw new Error("Agent stale");

  const sdk = await Agent.resume(meta.cursorAgentId, {
    apiKey: config.cursorApiKey(),
    model: config.model,
    local: { cwd },
  });
  handles.set(agentId, sdk);
  store.updateAgentStatus(agentId, "idle");
  return sdk;
}

function publishQueue(agentId: string): void {
  const q = promptQueues.get(agentId) ?? [];
  bridge.fanOut(agentId, null, {
    type: "queue_update",
    items: q.map((item, i) => ({ id: item.id, text: item.text, position: i })),
  });
}

async function consumeRun(agentId: string, run: Run): Promise<void> {
  activeRuns.set(agentId, run);
  store.createRun({ id: run.id, agentId, cursorRunId: run.id, requestId: run.requestId });
  store.updateAgentStatus(agentId, "running");

  let assistantText = "";

  try {
    for await (const event of run.stream()) {
      for (const wire of normalizeSdkMessage(run.id, event)) {
        if (wire.type === "assistant_delta") assistantText += wire.text;
        bridge.fanOut(agentId, run.id, wire);
      }
    }
    const result = await run.wait();
    const status =
      result.status === "error" ? "error" : result.status === "cancelled" ? "cancelled" : "finished";
    store.finishRun(run.id, status);
    bridge.fanOut(agentId, run.id, { type: "run_status", runId: run.id, status });
    if (assistantText) {
      bridge.fanOut(agentId, run.id, {
        type: "assistant_complete",
        runId: run.id,
        text: assistantText,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bridge.fanOut(agentId, run.id, { type: "error", code: "run_error", message, runId: run.id });
    store.finishRun(run.id, "error");
  } finally {
    activeRuns.delete(agentId);
    store.updateAgentStatus(agentId, "idle");
    void drainQueue(agentId);
  }
}

async function drainQueue(agentId: string): Promise<void> {
  const q = promptQueues.get(agentId);
  if (!q?.length || activeRuns.has(agentId)) return;
  const next = q.shift()!;
  if (q.length === 0) promptQueues.delete(agentId);
  else promptQueues.set(agentId, q);
  publishQueue(agentId);
  await sendPrompt(agentId, next.text);
}

export async function sendPrompt(
  agentId: string,
  text: string,
): Promise<{ runId: string; queued?: boolean; queueId?: string }> {
  if (activeRuns.has(agentId)) {
    const id = randomUUID();
    const q = promptQueues.get(agentId) ?? [];
    q.push({ id, text });
    promptQueues.set(agentId, q);
    publishQueue(agentId);
    return { runId: id, queued: true, queueId: id };
  }

  const sdk = await getOrResumeHandle(agentId);
  const run = await sdk.send(text);
  bridge.fanOut(agentId, run.id, { type: "user_message", runId: run.id, text });
  void consumeRun(agentId, run);
  return { runId: run.id };
}

export async function cancelRun(agentId: string): Promise<void> {
  const run = activeRuns.get(agentId);
  if (!run?.supports("cancel")) return;
  await run.cancel();
}

export async function forceSendQueued(agentId: string, queueId: string): Promise<{ runId: string }> {
  await cancelRun(agentId);
  const q = promptQueues.get(agentId) ?? [];
  const idx = q.findIndex((x) => x.id === queueId);
  if (idx < 0) throw new Error("Queue item not found");
  const [item] = q.splice(idx, 1);
  promptQueues.set(agentId, q);
  publishQueue(agentId);
  return sendPrompt(agentId, item!.text);
}

export function cancelQueued(agentId: string, queueId: string): void {
  const q = (promptQueues.get(agentId) ?? []).filter((x) => x.id !== queueId);
  if (q.length) promptQueues.set(agentId, q);
  else promptQueues.delete(agentId);
  publishQueue(agentId);
}

export async function closeAgent(agentId: string): Promise<void> {
  handles.get(agentId)?.close();
  handles.delete(agentId);
  store.archiveAgent(agentId);
}

export function getActiveRunId(agentId: string): string | undefined {
  return activeRuns.get(agentId)?.id;
}

export function getQueueItems(agentId: string): QueueItem[] {
  const q = promptQueues.get(agentId) ?? [];
  return q.map((item, i) => ({ id: item.id, text: item.text, position: i }));
}

export function syncQueueToClient(agentId: string): void {
  publishQueue(agentId);
}
