import { describe, expect, it } from "vitest";
import { buildPromptWithAttachments } from "../server/src/media/prompt.js";

describe("buildPromptWithAttachments", () => {
  it("returns text only when no images", () => {
    expect(buildPromptWithAttachments("hello", [])).toBe("hello");
  });

  it("includes workspace paths for images", () => {
    const out = buildPromptWithAttachments("fix this", [
      {
        id: "1",
        name: "shot.png",
        mime: "image/png",
        relativePath: ".cursor-remote/inbox/1-shot.png",
        absolutePath: "/tmp/.cursor-remote/inbox/1-shot.png",
      },
    ]);
    expect(out).toContain("fix this");
    expect(out).toContain(".cursor-remote/inbox/1-shot.png");
  });
});
