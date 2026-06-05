import { createWriteStream, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import https from 'node:https';
import type { TelegramApiClient } from './tg-types.js';

const DOWNLOAD_TIMEOUT_MS = 60_000;

function downloadBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        family: 4,
        timeout: DOWNLOAD_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Download failed: HTTP ${status}`));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
    });
    req.end();
  });
}

export async function downloadVoiceFile(
  api: TelegramApiClient,
  botToken: string,
  fileId: string,
  dataDir: string
): Promise<string> {
  const fileInfo = await api.getFile(fileId);
  const cacheDir = join(dataDir, 'voice-cache');
  mkdirSync(cacheDir, { recursive: true });

  const ext = fileInfo.file_path?.split('.').pop() ?? 'ogg';
  const localPath = join(cacheDir, `${randomUUID()}.${ext}`);
  const url = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;

  console.log(`[telegram-voice] Downloading file_id=${fileId} → ${localPath}`);
  const data = await downloadBinary(url);
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(localPath);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write(data);
    stream.end();
  });

  console.log(`[telegram-voice] Downloaded ${data.length} bytes`);
  return localPath;
}
