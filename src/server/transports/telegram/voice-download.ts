import type { TelegramApiClient } from './tg-types.js';
import { downloadTelegramFile } from './file-download.js';

export async function downloadVoiceFile(
  api: TelegramApiClient,
  botToken: string,
  fileId: string,
  dataDir: string
): Promise<string> {
  console.log(`[telegram-voice] Downloading file_id=${fileId}`);
  const localPath = await downloadTelegramFile(api, botToken, fileId, dataDir, 'voice-cache', 'ogg');
  console.log(`[telegram-voice] Downloaded → ${localPath}`);
  return localPath;
}
