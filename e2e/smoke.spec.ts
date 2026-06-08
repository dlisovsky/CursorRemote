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

  const prompt = page.getByPlaceholder("Prompt the agent…");
  await prompt.fill("Count slowly from 1 to 20, one number per line.");
  await page.getByLabel("Send").click();

  const stopBtn = page.getByText("Stop generating");
  await expect(stopBtn).toBeVisible({ timeout: 30_000 });
  await stopBtn.click();
  await expect(stopBtn).toBeHidden({ timeout: 30_000 });

  await prompt.fill("Reply with exactly: E2E_OK");
  await page.getByLabel("Send").click();
  await expect(page.getByText("E2E_OK")).toBeVisible({ timeout: 90_000 });
});
