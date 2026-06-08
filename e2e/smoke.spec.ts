import { expect, test } from "@playwright/test";

test("mock auth → projects → agent chat", async ({ page }) => {
  const authDone = page.waitForResponse(
    (r) => r.url().includes("/auth/telegram") && r.status() === 200,
    { timeout: 30_000 },
  );
  await page.goto("/");
  await authDone;
  await expect(page.getByText("Authentication failed")).not.toBeVisible();
  await expect(page.getByText("Your projects")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New agent" }).click();
  await expect(page.getByPlaceholder("Prompt the agent…")).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("Prompt the agent…").fill("Reply with exactly: E2E_OK");
  await page.getByLabel("Send").click();
  await expect(page.getByText("E2E_OK")).toBeVisible({ timeout: 90_000 });
});
