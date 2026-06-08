import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-bridge-test-"));
const dbPath = path.join(tmpDir, "test.db");

function mockWs() {
  const listeners = new Map<string, () => void>();
  return {
    readyState: 1,
    OPEN: 1,
    send: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      listeners.set(event, cb);
    }),
    close: () => listeners.get("close")?.(),
  };
}

describe("stream-bridge", () => {
  beforeEach(async () => {
    process.env.DB_PATH = dbPath;
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

  it("fans out events to subscribed websocket clients", async () => {
    const bridge = await import("../server/src/sdk/stream-bridge.js");
    const store = await import("../server/src/registry/store.js");

    store.createAgent({
      id: "agent-1",
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Test",
    });
    store.createRun({ id: "run-1", agentId: "agent-1", cursorRunId: "run-1", requestId: "req-1" });

    const ws = mockWs();
    bridge.subscribe("agent-1", ws as never);

    bridge.fanOut("agent-1", "run-1", { type: "assistant_delta", runId: "run-1", text: "Hi" });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(ws.send.mock.calls[0]![0] as string);
    expect(payload).toEqual({ type: "assistant_delta", runId: "run-1", text: "Hi" });
  });

  it("replays run events after lastSeq", async () => {
    const bridge = await import("../server/src/sdk/stream-bridge.js");
    const store = await import("../server/src/registry/store.js");

    store.createAgent({
      id: "agent-1",
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Test",
    });
    store.createRun({ id: "run-1", agentId: "agent-1", cursorRunId: "run-1", requestId: "req-1" });
    store.appendRunEvent("run-1", { type: "user_message", runId: "run-1", text: "Hello" });
    store.appendRunEvent("run-1", { type: "assistant_complete", runId: "run-1", text: "World" });

    const ws = mockWs();
    bridge.replayActiveRun(ws as never, "run-1", 0);

    expect(ws.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(ws.send.mock.calls[0]![0] as string);
    expect(payload.type).toBe("replay");
    expect(payload.events).toHaveLength(2);
  });
});
