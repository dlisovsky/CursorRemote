import { describe, expect, it } from "vitest";
import { getAgentActivity, setAgentActivity } from "../server/src/agent-activity.js";

describe("agent-activity", () => {
  it("sets and clears activity labels", () => {
    setAgentActivity("agent-1", "Using Read…");
    expect(getAgentActivity("agent-1")).toBe("Using Read…");
    setAgentActivity("agent-1", null);
    expect(getAgentActivity("agent-1")).toBeUndefined();
  });
});
