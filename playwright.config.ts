import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev:server",
      port: 3847,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, MOCK_TG: "true" },
    },
    {
      command: "npm run dev:tma",
      port: 5173,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_MOCK_TG: "true" },
    },
  ],
});
