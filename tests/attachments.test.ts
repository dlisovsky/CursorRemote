import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAttachmentPath, saveAttachments } from "../server/src/media/attachments.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cr-attach-"));

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("attachments", () => {
  it("saves base64 images under agent cwd inbox", () => {
    const saved = saveAttachments(
      tmp,
      [{ name: "bug.png", mime: "image/png", data: Buffer.from("png").toString("base64") }],
      { maxCount: 4, maxBytes: 1024 * 1024 },
    );
    expect(saved).toHaveLength(1);
    expect(fs.existsSync(saved[0]!.absolutePath)).toBe(true);
    expect(saved[0]!.relativePath).toContain(".cursor-remote/inbox");
  });

  it("rejects path traversal", () => {
    expect(resolveAttachmentPath(tmp, "../secret")).toBeNull();
  });
});
