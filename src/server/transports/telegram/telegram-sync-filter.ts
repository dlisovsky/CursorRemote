import type { ChatElement } from '../../types.js';
import { isEphemeralElement } from './formatter.js';
import { matchesRecentTelegramInbound } from './telegram-inbound-prompt.js';

/** Edit / write tools that show filename and +/- line counts. */
export function isFileEditTool(element: ChatElement): boolean {
  return element.type === 'tool' && !!element.filename;
}

/** Index of the last human message in the sync tail (start of the "current" turn). */
export function findLastHumanIndexInTail(tail: ChatElement[]): number {
  for (let i = tail.length - 1; i >= 0; i--) {
    if (tail[i].type === 'human') return i;
  }
  return -1;
}

/**
 * Latest assistant message in the current turn only (strictly after the last human).
 * Older assistant replies from prior turns must stay on Telegram.
 */
export function lastAssistantIdAfterHuman(tail: ChatElement[]): string | undefined {
  const lastHumanIdx = findLastHumanIndexInTail(tail);
  for (let i = tail.length - 1; i > lastHumanIdx; i--) {
    if (tail[i].type === 'assistant') return tail[i].id;
  }
  return undefined;
}

/** @deprecated Use lastAssistantIdAfterHuman — same-turn scope only. */
export function lastAssistantIdInTail(tail: ChatElement[]): string | undefined {
  return lastAssistantIdAfterHuman(tail);
}

export function isHistoricalAssistantInTail(tail: ChatElement[], element: ChatElement): boolean {
  if (element.type !== 'assistant') return false;
  const lastHumanIdx = findLastHumanIndexInTail(tail);
  const idx = tail.findIndex(el => el.id === element.id);
  return idx >= 0 && idx <= lastHumanIdx;
}

/**
 * Whether this chat row should not get its own Telegram message.
 * Default: hide tools & thoughts; only the latest in-turn assistant reply; dedupe Telegram "You:".
 */
export function shouldSkipTelegramElement(
  element: ChatElement,
  opts: {
    showTools: boolean;
    threadId: number;
    /** Latest assistant after the last human in tail; omit when none in the current turn yet. */
    lastAssistantIdInCurrentTurn?: string;
    /** Assistant from a completed prior turn — never delete its Telegram bubble. */
    isHistoricalAssistant?: boolean;
  }
): boolean {
  if (element.type === 'human') {
    return matchesRecentTelegramInbound(opts.threadId, element.text);
  }
  if (element.type === 'thought') return true;
  if (element.type === 'tool') return !opts.showTools;
  if (element.type === 'assistant') {
    if (opts.isHistoricalAssistant) return false;
    if (opts.lastAssistantIdInCurrentTurn) {
      return element.id !== opts.lastAssistantIdInCurrentTurn;
    }
    return false;
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

/**
 * Thoughts, in-flight tools, and optional completed tools from the current turn
 * (after the last human). Shown in the single editable agent panel.
 */
export function collectCurrentTurnLiveElements(
  tail: ChatElement[],
  lastHumanIdx: number,
  _showTools: boolean,
): ChatElement[] {
  const start = lastHumanIdx >= 0 ? lastHumanIdx + 1 : 0;
  const out: ChatElement[] = [];
  for (const el of tail.slice(start)) {
    if (el.type === 'thought' || el.type === 'loading' || el.type === 'tool') {
      out.push(el);
    }
  }
  return out;
}

/** Do not delete Telegram rows that are the compact live panel (or prompt-status bubble). */
export function trackedMessageSharesLivePanel(
  telegramMsgIds: number[] | undefined,
  livePanelMsgId: number | undefined,
  promptStatusMsgId: number | undefined,
): boolean {
  if (!telegramMsgIds?.length) return false;
  const protectedIds = new Set(
    [livePanelMsgId, promptStatusMsgId].filter((id): id is number => id !== undefined),
  );
  return telegramMsgIds.some(id => protectedIds.has(id));
}

export function shouldSkipMessageForCompactLive(
  useCompactLive: boolean,
  element: ChatElement,
  showTools: boolean,
  threadId: number,
  lastAssistantIdInCurrentTurn?: string,
  isHistoricalAssistant?: boolean
): boolean {
  if (shouldSkipTelegramElement(element, {
    showTools,
    threadId,
    lastAssistantIdInCurrentTurn,
    isHistoricalAssistant,
  })) {
    return true;
  }
  if (
    useCompactLive &&
    element.type === 'assistant' &&
    !isHistoricalAssistant &&
    lastAssistantIdInCurrentTurn === element.id
  ) {
    return true;
  }
  // In compact mode, tools/thoughts/loading live only in the editable panel — never as separate TG messages.
  if (useCompactLive && (element.type === 'tool' || element.type === 'thought' || element.type === 'loading')) {
    return true;
  }
  return useCompactLive && isEphemeralElement(element);
}
