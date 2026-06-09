import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-send-test-"));
const dbPath = path.join(tmpDir, "test.db");

function hangingRun(id: string) {
  return {
    id,
    requestId: `req-${id}`,
    stream: async function* () {
      await new Promise(() => {});
    },
    wait: () => new Promise(() => {}),
    supports: () => false,
    cancel: vi.fn(),
  };
}

vi.mock("@cursor/sdk", () => ({
  Agent: {
    create: vi.fn(),
    resume: vi.fn(),
  },
  CursorAgentError: class CursorAgentError extends Error {},
}));

describe("orchestrator sendPrompt", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.DB_PATH = dbPath;
    process.env.CURSOR_API_KEY = "test-key";
    const { initRegistry } = await import("../server/src/registry/store.js");
    initRegistry();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates run row before persisting user_message events", async () => {
    const { Agent } = await import("@cursor/sdk");
    const sdk = {
      agentId: "cursor-agent-send",
      send: vi.fn().mockResolvedValue(hangingRun("run-send-1")),
      close: vi.fn(),
    };
    vi.mocked(Agent.create).mockResolvedValue(sdk as never);

    const orchestrator = await import("../server/src/sdk/orchestrator.js");
    const store = await import("../server/src/registry/store.js");

    const agent = await orchestrator.createAgent({
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Send test",
    });

    const { runId } = await orchestrator.sendPrompt(agent.id, "2+2");
    const events = store.listRunEvents(runId, 0);
    expect(events.some((e) => e.event.type === "user_message")).toBe(true);
  });
});
