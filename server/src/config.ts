import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CURSOR_MODEL } from "../../shared/types.js";

function defaultTranscribePython(): string {
  const venv = path.join(os.homedir(), ".cursor-remote-transcribe", "bin", "python");
  if (fs.existsSync(venv)) return venv;
  return "python3";
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function resolveJwtSecret(): string {
  const v = process.env.JWT_SECRET?.trim();
  if (v) return v;
  if (process.env.MOCK_TG === "true") return "dev-jwt-secret-change-me";
  throw new Error("Missing env: JWT_SECRET (required when MOCK_TG is not true)");
}

export const config = {
  port: Number(process.env.PORT ?? 4871),
  cursorApiKey: () => required("CURSOR_API_KEY"),
  telegramBotToken: () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  mockTelegram: process.env.MOCK_TG === "true",
  get jwtSecret(): string {
    return resolveJwtSecret();
  },
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 86_400),
  dbPath: process.env.DB_PATH?.trim() ?? path.join(process.cwd(), "data", "agents.db"),
  /** Comma-separated absolute paths to project repos. */
  projectPaths: (): string[] => {
    const raw = process.env.PROJECT_PATHS?.trim();
    if (!raw) return [process.cwd()];
    return raw.split(",").map((p) => path.resolve(p.trim())).filter(Boolean);
  },
  model: { id: process.env.CURSOR_MODEL?.trim() || DEFAULT_CURSOR_MODEL },
  transcribe: {
    enabled: process.env.VOICE_ENABLED !== "false",
    pythonPath: process.env.TRANSCRIBE_PYTHON?.trim() || defaultTranscribePython(),
    model: process.env.TRANSCRIBE_MODEL?.trim() || "tiny",
    languages: (process.env.TRANSCRIBE_LANGUAGES?.trim() || "en,ru")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    timeoutMs: Number(process.env.TRANSCRIBE_TIMEOUT_MS ?? 600_000),
  },
  attachments: {
    enabled: process.env.PHOTOS_ENABLED !== "false",
    maxCount: Number(process.env.PHOTO_MAX_COUNT ?? 4),
    maxBytes: Number(process.env.PHOTO_MAX_BYTES ?? 5 * 1024 * 1024),
  },
  uploadDir: process.env.UPLOAD_DIR?.trim() ?? path.join(process.cwd(), "data", "voice-cache"),
};
