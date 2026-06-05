import type { ChatElement } from '../../types.js';
import { isEphemeralElement } from './formatter.js';
import { matchesRecentTelegramInbound } from './telegram-inbound-prompt.js';

/** Edit / write tools that show filename and +/- line counts. */
export function isFileEditTool(element: ChatElement): boolean {
  return element.type === 'tool' && !!element.filename;
}

/** Id of the latest assistant message in the sync tail (one reply bubble in Telegram). */
export function lastAssistantIdInTail(tail: ChatElement[]): string | undefined {
  for (let i = tail.length - 1; i >= 0; i--) {
    if (tail[i].type === 'assistant') return tail[i].id;
  }
  return undefined;
}

/**
 * Whether this chat row should not get its own Telegram message.
 * Default: hide tools & thoughts; only the latest assistant reply; dedupe Telegram "You:".
 */
export function shouldSkipTelegramElement(
  element: ChatElement,
  opts: {
    showTools: boolean;
    threadId: number;
    lastAssistantId?: string;
  }
): boolean {
  if (element.type === 'human') {
    return matchesRecentTelegramInbound(opts.threadId, element.text);
  }
  if (element.type === 'thought') return true;
  if (element.type === 'tool') return !opts.showTools;
  if (element.type === 'assistant' && opts.lastAssistantId) {
    return element.id !== opts.lastAssistantId;
  }
  return false;
}

/** Ephemeral rows in the compact live feed (tools optional). */
export function filterEphemeralForLiveFeed(
  elements: ChatElement[],
  showTools: boolean
): ChatElement[] {
  if (showTools) return elements;
  return elements.filter(el => el.type !== 'tool');
}

export function shouldSkipMessageForCompactLive(
  useCompactLive: boolean,
  element: ChatElement,
  showTools: boolean,
  threadId: number,
  lastAssistantId?: string
): boolean {
  if (shouldSkipTelegramElement(element, { showTools, threadId, lastAssistantId })) {
    return true;
  }
  return useCompactLive && isEphemeralElement(element);
}
