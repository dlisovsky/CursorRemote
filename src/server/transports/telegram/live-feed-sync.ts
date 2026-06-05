import type { ChatElement } from '../../types.js';
import { isEphemeralElement } from './formatter.js';

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

/** Ephemeral rows are rendered in the live feed, not as separate Telegram messages. */
export function shouldSkipMessageForCompactLive(
  useCompactLive: boolean,
  element: ChatElement
): boolean {
  return useCompactLive && isEphemeralElement(element);
}
