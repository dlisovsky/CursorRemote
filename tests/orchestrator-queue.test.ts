import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-orch-test-"));
const dbPath = path.join(tmpDir, "test.db");

const fanOut = vi.fn();

function hangingRun(id: string) {
  return {
    id,
    requestId: `req-${id}`,
    stream: async function* () {
      await new Promise(() => {});
    },
    wait: () => new Promise(() => {}),
    supports: (cap: string) => cap === "cancel",
    cancel: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock("../server/src/sdk/stream-bridge.js", () => ({
  fanOut,
  subscribe: vi.fn(),
  replayActiveRun: vi.fn(),
}));

vi.mock("@cursor/sdk", () => ({
  Agent: {
    create: vi.fn(),
    resume: vi.fn(),
  },
  CursorAgentError: class CursorAgentError extends Error {},
}));

describe("orchestrator queue", () => {
  beforeEach(async () => {
    vi.resetModules();
    fanOut.mockClear();
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

  it("queues prompts while a run is active", async () => {
    const { Agent } = await import("@cursor/sdk");
    const sdk = {
      agentId: "cursor-agent-1",
      send: vi.fn().mockResolvedValue(hangingRun("run-active")),
      close: vi.fn(),
    };
    vi.mocked(Agent.create).mockResolvedValue(sdk as never);

    const orchestrator = await import("../server/src/sdk/orchestrator.js");
    const store = await import("../server/src/registry/store.js");

    const agent = await orchestrator.createAgent({
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Queue test",
    });

    const first = await orchestrator.sendPrompt(agent.id, "first prompt");
    expect(first.queued).toBeUndefined();

    const second = await orchestrator.sendPrompt(agent.id, "second prompt");
    expect(second.queued).toBe(true);
    expect(second.queueId).toBeTruthy();

    expect(orchestrator.getQueueItems(agent.id)).toHaveLength(1);
    expect(orchestrator.getQueueItems(agent.id)[0]?.text).toBe("second prompt");

    const queueUpdates = fanOut.mock.calls.filter((c) => c[2]?.type === "queue_update");
    expect(queueUpdates.length).toBeGreaterThan(0);
  });

  it("cancelQueued removes an item and publishes queue_update", async () => {
    const { Agent } = await import("@cursor/sdk");
    const sdk = {
      agentId: "cursor-agent-2",
      send: vi.fn().mockResolvedValue(hangingRun("run-2")),
      close: vi.fn(),
    };
    vi.mocked(Agent.create).mockResolvedValue(sdk as never);

    const orchestrator = await import("../server/src/sdk/orchestrator.js");
    const agent = await orchestrator.createAgent({
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Cancel queue",
    });

    await orchestrator.sendPrompt(agent.id, "running");
    const queued = await orchestrator.sendPrompt(agent.id, "to cancel");
    orchestrator.cancelQueued(agent.id, queued.queueId!);

    expect(orchestrator.getQueueItems(agent.id)).toHaveLength(0);
    const lastQueue = [...fanOut.mock.calls].reverse().find((c) => c[2]?.type === "queue_update");
    expect(lastQueue?.[2]).toEqual({ type: "queue_update", items: [] });
  });

  it("forceSendQueued waits for cancel before sending", async () => {
    const { Agent } = await import("@cursor/sdk");

    function cancellableRun(id: string) {
      const state = { cancelled: false };
      return {
        id,
        requestId: `req-${id}`,
        stream: async function* () {
          while (!state.cancelled) {
            await new Promise((r) => setTimeout(r, 5));
          }
        },
        wait: async () => ({ status: "cancelled" as const }),
        supports: (cap: string) => cap === "cancel",
        cancel: vi.fn().mockImplementation(async () => {
          state.cancelled = true;
        }),
      };
    }

    let runSeq = 0;
    const sdk = {
      agentId: "cursor-agent-3",
      send: vi.fn().mockImplementation(async () => cancellableRun(`run-force-${++runSeq}`)),
      close: vi.fn(),
    };
    vi.mocked(Agent.create).mockResolvedValue(sdk as never);

    const orchestrator = await import("../server/src/sdk/orchestrator.js");
    const agent = await orchestrator.createAgent({
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Force send",
    });

    await orchestrator.sendPrompt(agent.id, "running");
    const queued = await orchestrator.sendPrompt(agent.id, "force me");
    expect(queued.queued).toBe(true);

    const result = await orchestrator.forceSendQueued(agent.id, queued.queueId!);
    expect(result.queued).toBeUndefined();
    expect(sdk.send).toHaveBeenCalledTimes(2);
    expect(sdk.send.mock.calls[1]?.[0]).toContain("force me");
  });
});
