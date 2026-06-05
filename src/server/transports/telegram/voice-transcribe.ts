import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TranscribeConfig } from '../../types.js';

const DEFAULT_TRANSCRIBE_TIMEOUT_MS = 600_000;

export interface TranscribeResult {
  text: string;
  language: string;
  durationMs: number;
}

const SETUP_INSTRUCTIONS =
  'Local transcription requires faster-whisper. Run:\n' +
  '  python3 -m venv ~/.cursor-remote-transcribe\n' +
  '  source ~/.cursor-remote-transcribe/bin/activate\n' +
  '  pip install faster-whisper\n' +
  'Then set cursorRemote.transcribe.pythonPath to the venv python.';

export function resolveTranscribeScript(config: TranscribeConfig): string | null {
  if (config.scriptPath && existsSync(config.scriptPath)) {
    return config.scriptPath;
  }

  const bundleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(bundleDir, '../../../transcribe/transcribe-voice.py'),
    resolve(bundleDir, '../../../../transcribe/transcribe-voice.py'),
    resolve(process.cwd(), 'dist/transcribe/transcribe-voice.py'),
    resolve(process.cwd(), 'scripts/transcribe-voice.py'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

export async function transcribeVoiceFile(
  audioPath: string,
  config: TranscribeConfig
): Promise<TranscribeResult> {
  const scriptPath = resolveTranscribeScript(config);
  if (!scriptPath) {
    console.error('[telegram-voice] Transcribe script not found');
    throw new Error(SETUP_INSTRUCTIONS);
  }

  const timeoutMs = config.timeoutMs || DEFAULT_TRANSCRIBE_TIMEOUT_MS;
  console.log(`[telegram-voice] Transcribing ${audioPath} model=${config.model} python=${config.pythonPath} timeout_ms=${timeoutMs}`);

  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath, [scriptPath, audioPath, '--model', config.model], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Transcription timed out after ${Math.round(timeoutMs / 1000)}s (first run may need model download — run prefetch script)`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      stderr += chunk.toString();
      if (line) console.log(`[telegram-voice] python: ${line}`);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(SETUP_INSTRUCTIONS));
        return;
      }
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const msg = stderr.trim() || `Transcription failed (exit ${code})`;
        console.error(`[telegram-voice] Transcription error: ${msg}`);
        reject(new Error(msg.includes('faster-whisper') ? SETUP_INSTRUCTIONS : msg));
        return;
      }

      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(new Error('Could not transcribe audio'));
        return;
      }

      try {
        const parsed = JSON.parse(line) as { text?: string; language?: string; duration_ms?: number };
        const text = (parsed.text ?? '').trim();
        if (!text) {
          reject(new Error('Could not transcribe audio'));
          return;
        }
        console.log(`[telegram-voice] Done language=${parsed.language ?? 'unknown'} duration_ms=${parsed.duration_ms ?? 0} chars=${text.length}`);
        resolve({
          text,
          language: parsed.language ?? 'unknown',
          durationMs: parsed.duration_ms ?? 0,
        });
      } catch {
        reject(new Error('Could not parse transcription output'));
      }
    });
  });
}
