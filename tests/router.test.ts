import { describe, expect, it } from "vitest";
import { parseHash, routeToHash } from "../tma/src/router.js";

describe("hash router", () => {
  it("parses projects home", () => {
    expect(parseHash("#/")).toEqual({ page: "projects" });
    expect(parseHash("")).toEqual({ page: "projects" });
  });

  it("parses agent route", () => {
    expect(parseHash("#/agents/abc-123")).toEqual({ page: "agent", agentId: "abc-123" });
  });

  it("parses ide route", () => {
    expect(parseHash("#/ide/proj1/sess2")).toEqual({
      page: "ide",
      projectId: "proj1",
      sessionId: "sess2",
    });
  });

  it("round-trips agent hash", () => {
    const route = { page: "agent" as const, agentId: "x/y" };
    expect(parseHash(routeToHash(route))).toEqual(route);
  });
});
