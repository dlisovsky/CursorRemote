/**
 * SDK smoke test — validates blocking prerequisites before TMA/backend work.
 *
 * Usage:
 *   export CURSOR_API_KEY="cursor_..."
 *   npm run sdk:smoke
 *
 * Checks:
 * 1. run.stream() event shapes + onDelta streaming
 * 2. run.cancel()
 * 3. Agent.resume() after dispose
 */
import "dotenv/config";
import { Agent, CursorAgentError, type InteractionUpdate, type SDKMessage } from "@cursor/sdk";
import { DEFAULT_CURSOR_MODEL } from "../shared/types.js";

const apiKey = process.env.CURSOR_API_KEY?.trim();
if (!apiKey) {
  console.error("Missing CURSOR_API_KEY. Add it to .env or export it in your shell.");
  process.exit(1);
}

const cwd = process.cwd();
const model = { id: process.env.CURSOR_MODEL?.trim() || DEFAULT_CURSOR_MODEL };

function log(section: string, detail?: unknown) {
  const ts = new Date().toISOString();
  if (detail === undefined) console.log(`[${ts}] ${section}`);
  else console.log(`[${ts}] ${section}`, detail);
}

function summarizeMessage(event: SDKMessage) {
  const base: Record<string, unknown> = { type: event.type };
  if (event.type === "assistant") {
    const text = event.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    base.textLen = text.length;
    base.preview = text.slice(0, 80);
  }
  if ("run_id" in event) base.runId = event.run_id;
  return base;
}

function summarizeDelta(update: InteractionUpdate) {
  return { type: update.type };
}

async function disposeAgent(agent: { close(): void }) {
  agent.close();
}

async function streamRun(label: string, run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>) {
  log(`${label}: run started`, { runId: run.id, requestId: run.requestId });

  const eventTypes = new Set<string>();
  let assistantEvents = 0;

  for await (const event of run.stream()) {
    eventTypes.add(event.type);
    log(`${label}: event`, summarizeMessage(event));
    if (event.type === "assistant") assistantEvents++;
  }

  const result = await run.wait();
  log(`${label}: finished`, {
    status: result.status,
    eventTypes: [...eventTypes],
    assistantEvents,
  });
  return result;
}

async function testCreateStreamCancel() {
  log("=== Test 1: create → send → stream → cancel ===");

  const agent = await Agent.create({ apiKey, model, local: { cwd } });
  try {
    log("agent created", { agentId: agent.agentId });

    const deltaTypes = new Set<string>();
    let sawOnDelta = false;

    const run = await agent.send("Reply with exactly: smoke-ok. Do not use tools.", {
      onDelta: ({ update }) => {
        sawOnDelta = true;
        deltaTypes.add(update.type);
        log("onDelta", summarizeDelta(update));
      },
    });

    log("prompt sent", { runId: run.id, requestId: run.requestId });

    const eventTypes = new Set<string>();
    let sawAssistant = false;

    for await (const event of run.stream()) {
      eventTypes.add(event.type);
      log("event", summarizeMessage(event));
      if (event.type === "assistant") sawAssistant = true;
      if (sawAssistant && run.supports("cancel")) {
        log("cancelling run after first assistant event");
        await run.cancel();
        break;
      }
    }

    const result = await run.wait();
    log("Test 1 done", {
      status: result.status,
      streamEventTypes: [...eventTypes],
      sawOnDelta,
      deltaTypes: [...deltaTypes],
      agentId: agent.agentId,
    });

    return agent.agentId;
  } finally {
    await disposeAgent(agent);
  }
}

async function testResume(agentId: string) {
  log("=== Test 2: resume after dispose ===");

  const agent = await Agent.resume(agentId, { apiKey, model });
  try {
    log("agent resumed", { agentId: agent.agentId });

    const deltaTypes = new Set<string>();
    const run = await agent.send("Say only: resume-ok", {
      onDelta: ({ update }) => {
        deltaTypes.add(update.type);
      },
    });

    await streamRun("resume-run", run);
    log("resume deltas", { deltaTypes: [...deltaTypes] });
  } finally {
    await disposeAgent(agent);
  }
}

async function main() {
  log("SDK smoke test starting", { cwd });

  try {
    const agentId = await testCreateStreamCancel();
    await testResume(agentId);
    log("=== All smoke tests passed ===");
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error("CursorAgentError:", err.message, { retryable: err.isRetryable });
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
