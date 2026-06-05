export type LiveFeedUpdateAction = 'none' | 'delete' | 'send' | 'edit';

/** Decide whether to send, edit, delete, or skip a compact live-feed Telegram message. */
export function planLiveFeedUpdate(
  html: string,
  existingMsgId: number | undefined,
  lastContentHash: string | undefined,
  contentHash: string
): LiveFeedUpdateAction {
  if (!html.trim()) {
    return existingMsgId !== undefined ? 'delete' : 'none';
  }
  if (existingMsgId !== undefined && lastContentHash === contentHash) {
    return 'none';
  }
  return existingMsgId !== undefined ? 'edit' : 'send';
}

export { shouldSkipMessageForCompactLive } from './telegram-sync-filter.js';
