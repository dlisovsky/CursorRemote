import { describe, expect, it } from "vitest";
import { normalizeSdkMessage } from "../server/src/sdk/normalize.js";

describe("normalizeSdkMessage", () => {
  it("maps assistant chunks to assistant_delta", () => {
    const events = normalizeSdkMessage("run-1", {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
      },
    } as never);
    expect(events).toEqual([{ type: "assistant_delta", runId: "run-1", text: "Hello" }]);
  });

  it("maps tool_call events", () => {
    const events = normalizeSdkMessage("run-1", {
      type: "tool_call",
      name: "read",
      status: "running",
      args: { path: "package.json" },
    } as never);
    expect(events[0]).toMatchObject({ type: "tool_call", name: "read", status: "running" });
  });
});
