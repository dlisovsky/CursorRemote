import path from "node:path";
import { DEFAULT_CURSOR_MODEL } from "../../shared/types.js";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3847),
  cursorApiKey: () => required("CURSOR_API_KEY"),
  telegramBotToken: () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  mockTelegram: process.env.MOCK_TG === "true",
  jwtSecret: process.env.JWT_SECRET?.trim() ?? "dev-jwt-secret-change-me",
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 86_400),
  dbPath: process.env.DB_PATH?.trim() ?? path.join(process.cwd(), "data", "agents.db"),
  /** Comma-separated absolute paths to project repos. */
  projectPaths: (): string[] => {
    const raw = process.env.PROJECT_PATHS?.trim();
    if (!raw) return [process.cwd()];
    return raw.split(",").map((p) => path.resolve(p.trim())).filter(Boolean);
  },
  model: { id: process.env.CURSOR_MODEL?.trim() || DEFAULT_CURSOR_MODEL },
};
