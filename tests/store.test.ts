import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-store-test-"));
const dbPath = path.join(tmpDir, "test.db");

describe("registry store", () => {
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

  it("creates and lists agents", async () => {
    const store = await import("../server/src/registry/store.js");
    store.createAgent({
      id: "a1",
      telegramUserId: 1,
      projectId: "p1",
      cwd: "/tmp",
      title: "Test",
    });
    const agents = store.listAgents(1);
    expect(agents).toHaveLength(1);
    expect(agents[0]?.title).toBe("Test");
  });
});
