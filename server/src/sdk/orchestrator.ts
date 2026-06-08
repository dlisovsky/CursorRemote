import { randomUUID } from "node:crypto";
import { Agent, CursorAgentError, type Run, type SDKAgent } from "@cursor/sdk";
import type { WireErrorCode } from "../../../shared/types.js";
import { config } from "../config.js";
import * as store from "../registry/store.js";
import { normalizeSdkMessage } from "./normalize.js";
import type { QueueItem, UserAttachmentMeta } from "../../../shared/types.js";
import { buildPromptWithAttachments } from "../media/prompt.js";
import { saveAttachments, type IncomingAttachment } from "../media/attachments.js";
import * as bridge from "./stream-bridge.js";

const handles = new Map<string, SDKAgent>();
const activeRuns = new Map<string, Run>();
const promptQueues = new Map<string, { id: string; text: string; attachments?: IncomingAttachment[] }[]>();

export interface SendPromptInput {
  text: string;
  attachments?: IncomingAttachment[];
}

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
  await sendPrompt(agentId, { text: next.text, attachments: next.attachments });
}

function preparePrompt(agentId: string, input: SendPromptInput): {
  displayText: string;
  sdkText: string;
  images: UserAttachmentMeta[];
} {
  const cwd = store.getAgentCwd(agentId);
  if (!cwd) throw new Error("Agent cwd missing");

  const attachments = input.attachments ?? [];
  if (attachments.length > 0 && !config.attachments.enabled) {
    throw new Error("Photo attachments are disabled");
  }

  const saved =
    attachments.length > 0
      ? saveAttachments(cwd, attachments, {
          maxCount: config.attachments.maxCount,
          maxBytes: config.attachments.maxBytes,
        })
      : [];

  const images: UserAttachmentMeta[] = saved.map((s) => ({
    id: s.id,
    name: s.name,
    mime: s.mime,
    path: s.relativePath,
  }));

  const displayText = input.text.trim() || (images.length ? `📷 ${images.length} image(s)` : "");
  const sdkText = buildPromptWithAttachments(input.text, saved);
  if (!sdkText.trim()) throw new Error("text_required");

  return { displayText, sdkText, images };
}

export async function sendPrompt(
  agentId: string,
  input: SendPromptInput | string,
): Promise<{ runId: string; queued?: boolean; queueId?: string }> {
  const payload: SendPromptInput = typeof input === "string" ? { text: input } : input;
  const { displayText, sdkText, images } = preparePrompt(agentId, payload);

  if (activeRuns.has(agentId)) {
    const id = randomUUID();
    const q = promptQueues.get(agentId) ?? [];
    q.push({ id, text: displayText, attachments: payload.attachments });
    promptQueues.set(agentId, q);
    publishQueue(agentId);
    return { runId: id, queued: true, queueId: id };
  }

  const sdk = await getOrResumeHandle(agentId);
  const run = await sdk.send(sdkText);
  store.createRun({ id: run.id, agentId, cursorRunId: run.id, requestId: run.requestId });
  bridge.fanOut(agentId, run.id, {
    type: "user_message",
    runId: run.id,
    text: displayText,
    images: images.length ? images : undefined,
  });
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
  return sendPrompt(agentId, { text: item!.text, attachments: item!.attachments });
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
