import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ServerConfig, SelectorConfig } from './types.js';

/** Allowed Whisper language codes for Telegram voice (comma-separated env). */
export function parseTranscribeLanguages(raw: string | undefined): string[] {
  const fallback = ['en', 'ru'];
  if (!raw?.trim()) return fallback;
  const langs = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return langs.length > 0 ? langs : fallback;
}

export function loadConfig(): ServerConfig {
  const preRegisteredRaw = process.env.TELEGRAM_ALLOWED_USERS ?? '';
  const preRegisteredUsers = preRegisteredRaw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  const dataDir = process.env.DATA_DIR ?? resolve(process.cwd(), 'data');

  return {
    cdpUrl: process.env.CDP_URL ?? 'http://127.0.0.1:9222',
    serverPort: parseInt(process.env.SERVER_PORT ?? '3000', 10),
    serverHost: process.env.SERVER_HOST ?? '127.0.0.1',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '300', 10),
    debounceMs: parseInt(process.env.DEBOUNCE_MS ?? '150', 10),
    selectorsPath: process.env.SELECTORS_PATH ?? './selectors.json',
    logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) ?? 'info',
    webappPassword: process.env.WEBAPP_PASSWORD ?? '',
    windowTitleQualifier: process.env.WINDOW_TITLE_QUALIFIER !== 'false',
    dataDir,
    telegram: {
      enabled: process.env.TELEGRAM_ENABLED === 'true',
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      preRegisteredUsers,
      impl: (process.env.TELEGRAM_IMPL === 'raw' ? 'raw' : 'grammy') as 'grammy' | 'raw',
      voiceEnabled: process.env.TELEGRAM_VOICE_ENABLED !== 'false',
      compactLive: process.env.TELEGRAM_COMPACT_LIVE !== 'false',
      showTools:
        process.env.TELEGRAM_SHOW_TOOLS === 'true' ||
        process.env.TELEGRAM_SHOW_FILE_TOOLS === 'true',
      photosEnabled: process.env.TELEGRAM_PHOTOS_ENABLED !== 'false',
      photoMaxCount: parseInt(process.env.TELEGRAM_PHOTO_MAX_COUNT ?? '10', 10),
      photoMaxBytes: parseInt(process.env.TELEGRAM_PHOTO_MAX_BYTES ?? String(10 * 1024 * 1024), 10),
    },
    transcribe: {
      pythonPath: process.env.TRANSCRIBE_PYTHON ?? 'python3',
      model: process.env.TRANSCRIBE_MODEL ?? 'small',
      scriptPath: process.env.TRANSCRIBE_SCRIPT || undefined,
      languages: parseTranscribeLanguages(process.env.TRANSCRIBE_LANGUAGES),
      timeoutMs: parseInt(process.env.TRANSCRIBE_TIMEOUT_MS ?? '600000', 10),
    },
  };
}

export function loadSelectors(config: ServerConfig): SelectorConfig {
  const fullPath = resolve(config.selectorsPath);
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as SelectorConfig;
  } catch (err) {
    console.warn(`[config] Could not load selectors from ${fullPath}, using defaults`);
    return getDefaultSelectors();
  }
}

function getDefaultSelectors(): SelectorConfig {
  return {
    chatContainer: {
      strategies: [
        "#workbench\\.parts\\.auxiliarybar",
        "div.composer-bar.editor",
        "[class*='composer-bar']",
        "[class*='composer-panel']",
        "[class*='chat-widget']",
      ],
    },
    approveButton: {
      strategies: [
        "button[aria-label*='Accept']",
        "button[aria-label*='Approve']",
        "button[aria-label*='Run']",
        "button[aria-label*='Allow']",
      ],
      textMatch: ['Accept', 'Approve', 'Run', 'Allow', 'Accept All'],
    },
    rejectButton: {
      strategies: [
        "button[aria-label*='Reject']",
        "button[aria-label*='Deny']",
        "button[aria-label*='Cancel']",
      ],
      textMatch: ['Reject', 'Deny', 'Cancel', 'Skip'],
    },
    chatInput: {
      strategies: [
        "textarea[class*='input']",
        "[contenteditable='true']",
        "[role='textbox']",
        "textarea",
      ],
    },
    stopGeneration: {
      strategies: [
        "button[aria-label='Stop generation']",
        "button[aria-label*='Stop generation']",
        ".composer-bar button[aria-label*='Stop']",
        "#workbench\\.parts\\.auxiliarybar button[aria-label*='Stop']",
      ],
      textMatch: ['Stop generation', 'Stop'],
    },
    agentStatus: {
      strategies: [
        "[class*='status']",
        "[class*='thinking']",
        "[class*='spinner']",
        "[class*='loading']",
      ],
    },
  };
}
