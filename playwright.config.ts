import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:5187",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev:server",
      port: 4871,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, MOCK_TG: "true" },
    },
    {
      command: "npm run dev:tma",
      port: 5187,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_MOCK_TG: "true" },
    },
  ],
});
