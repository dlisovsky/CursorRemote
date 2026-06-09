import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_INIT_DATA, MOCK_TG_USER_ID } from "../shared/types.js";

describe("validateInitData", () => {
  beforeEach(() => {
    process.env.MOCK_TG = "true";
    process.env.CURSOR_API_KEY = "test-key";
  });

  it("accepts mock initData with hash=mock", async () => {
    const { validateInitData } = await import("../server/src/auth.js");
    const user = validateInitData(MOCK_INIT_DATA);
    expect(user?.telegramUserId).toBe(MOCK_TG_USER_ID);
  });

  it("rejects empty initData", async () => {
    const { validateInitData } = await import("../server/src/auth.js");
    expect(validateInitData("")).toBeNull();
  });
});
