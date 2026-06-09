import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export interface TranscribeResult {
  text: string;
  language: string;
  durationMs: number;
}

const SETUP =
  "Voice transcription requires faster-whisper. Install: pip install faster-whisper " +
  "and set TRANSCRIBE_MODEL in .env";

function resolveScript(): string | null {
  const candidates = [
    path.join(process.cwd(), "scripts/transcribe-voice.py"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/transcribe-voice.py"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function transcribeAudioFile(audioPath: string): Promise<TranscribeResult> {
  if (!config.transcribe.enabled) throw new Error("Voice transcription is disabled");

  const scriptPath = resolveScript();
  if (!scriptPath) throw new Error(SETUP);

  const { pythonPath, model, languages, timeoutMs } = config.transcribe;
  const langs = languages.join(",");

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, audioPath, "--model", model, "--languages", langs], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Transcription timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      const code = (err as NodeJS.ErrnoException).code;
      reject(code === "ENOENT" ? new Error(SETUP) : err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const msg = stderr.trim() || `Transcription failed (exit ${code})`;
        reject(new Error(msg.includes("faster-whisper") ? SETUP : msg));
        return;
      }
      const line = stdout.trim().split("\n").filter(Boolean).pop();
      if (!line) {
        reject(new Error("Could not transcribe audio"));
        return;
      }
      try {
        const parsed = JSON.parse(line) as { text?: string; language?: string; duration_ms?: number };
        const text = (parsed.text ?? "").trim();
        if (!text) {
          reject(new Error("Could not transcribe audio"));
          return;
        }
        resolve({
          text,
          language: parsed.language ?? "unknown",
          durationMs: parsed.duration_ms ?? 0,
        });
      } catch {
        reject(new Error("Could not parse transcription output"));
      }
    });
  });
}
