import { describe, expect, it } from "vitest";
import { chatItemsFromHistory } from "../tma/src/chat/history.js";

describe("chatItemsFromHistory", () => {
  it("rebuilds user and assistant messages", () => {
    const items = chatItemsFromHistory([
      { type: "user_message", runId: "r1", text: "Hi" },
      { type: "assistant_complete", runId: "r1", text: "Hello" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "user", text: "Hi" });
    expect(items[1]).toMatchObject({ kind: "assistant", text: "Hello" });
  });
});
