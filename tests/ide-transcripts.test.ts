import { describe, expect, it } from "vitest";
import { loadComposerHeadersForWorkspace } from "../server/src/composer-headers.js";
import { extractUserText, listIdeSessions, loadIdeSession } from "../server/src/ide-transcripts.js";

describe("extractUserText", () => {
  it("pulls text from user_query tags", () => {
    expect(extractUserText("<user_query>\ntest message 2+2\n</user_query>")).toBe("test message 2+2");
  });

  it("pulls text from agentConversationTurn JSON", () => {
    const raw = JSON.stringify({
      agentConversationTurn: { userMessage: { text: "hello from sdk" } },
    });
    expect(extractUserText(raw)).toBe("hello from sdk");
  });
});

describe("composer headers", () => {
  it("loads Cursor sidebar titles for this workspace", () => {
    const headers = loadComposerHeadersForWorkspace(process.cwd());
    const arithmetic = [...headers.values()].find((h) => h.name.includes("Arithmetic"));
    if (arithmetic) {
      expect(arithmetic.subtitle.length).toBeGreaterThan(0);
    }
  });
});

describe("listIdeSessions", () => {
  it("lists IDE chats without parsing transcript bodies", () => {
    const cwd = process.cwd();
    const sessions = listIdeSessions(cwd);
    expect(sessions.length).toBeGreaterThan(0);
    const probe =
      sessions.find((s) => s.title.includes("Arithmetic")) ??
      sessions.find((s) => s.id === "78072f36-fffa-4cbb-8dee-06a7ae1ceca1");
    expect(probe).toBeDefined();
    expect(probe!.linkedCursorAgentId).toBeNull();
    expect(probe!.subtitle).toBeTruthy();
  });

  it("loads transcript lines on demand", () => {
    const cwd = process.cwd();
    const sessions = listIdeSessions(cwd);
    const probe = sessions[0];
    expect(probe).toBeDefined();
    const lines = loadIdeSession(cwd, probe!.id);
    expect(lines?.length).toBeGreaterThan(0);
    expect(lines?.some((l) => l.role === "user")).toBe(true);
    expect(lines?.some((l) => l.role === "assistant")).toBe(true);
  });
});
