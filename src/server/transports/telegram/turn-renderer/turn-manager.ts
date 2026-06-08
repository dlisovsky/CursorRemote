import type { TelegramApiClient } from '../tg-types.js';
import type { ChatElement } from '../../../types.js';
import { findLastHumanIndexInTail } from '../telegram-sync-filter.js';
import { escapeHtml } from '../formatter.js';
import { RenderCoordinator, type RenderCoordinatorOptions } from './scheduler.js';
import { renderTurn } from './frame.js';
import { reduce, initTurnState, markStopped } from './reduce.js';
import { toTurnSnapshot, type SnapshotLike } from './to-snapshot.js';
import {
  type TurnState,
  type ReduceOptions,
  DEFAULT_REDUCE_OPTIONS,
  isTerminalPhase,
} from './turn-state.js';

export interface TurnManagerDeps {
  api: TelegramApiClient;
  chatId: number;
  /** Records selectorPath → short hash for callback data (reuses MessageTracker). */
  hashSelector: (selectorPath: string) => string;
  /** True if the given text was just sent from Telegram (so it's not mac-origin). */
  isTelegramInbound?: (threadId: number, text: string) => boolean;
  now?: () => number;
  coordinatorOptions?: Partial<RenderCoordinatorOptions>;
  reduceOptions?: ReduceOptions;
}

interface ThreadCtx {
  turn: TurnState | null;
  /** Last human element id we've observed, to detect new turns. */
  baselineHumanId: string | undefined;
  /** Anchor message id the live panel relates to (reply target / mirror). */
  anchorMsgId?: number;
  /** Selector path of an armed freeform "Other" option awaiting a text answer (C1). */
  freeformSelector?: string;
  /** When set, ignore snapshots until we see a new human element appear.
   *  Prevents stale DOM from a previous turn from contaminating a fresh panel. */
  awaitingNewHuman?: boolean;
}

function lastHumanId(messages: ChatElement[]): string | undefined {
  const idx = findLastHumanIndexInTail(messages);
  return idx >= 0 ? messages[idx].id : undefined;
}

function humanTextById(messages: ChatElement[], id: string): string {
  const el = messages.find(m => m.id === id);
  return el && el.type === 'human' ? el.text : '';
}

function isActive(s: SnapshotLike): boolean {
  if (s.agentActivityLive) return true;
  if (s.agentStatus !== 'idle') return true;
  const idx = findLastHumanIndexInTail(s.messages);
  const tail = idx >= 0 ? s.messages.slice(idx + 1) : s.messages;
  return tail.some(el => el.type === 'tool' || el.type === 'thought' || el.type === 'loading' || el.type === 'assistant');
}

/**
 * Owns the Cursor-faithful turn experience for every topic. The transport feeds
 * it window snapshots; it detects turn boundaries (telegram- and mac-origin
 * alike), drives one self-updating live panel per turn via the RenderCoordinator,
 * and exposes hooks for the Stop button and freeform answer capture (C1).
 *
 * Decoupled from grammy — it only needs the TelegramApiClient interface, so the
 * headless QA layer drives it with a fake API and recorded snapshots.
 */
export class TurnRendererManager {
  private readonly coordinator: RenderCoordinator;
  private readonly threads = new Map<number, ThreadCtx>();
  private readonly now: () => number;
  private readonly reduceOpts: ReduceOptions;

  constructor(private readonly deps: TurnManagerDeps) {
    this.now = deps.now ?? Date.now;
    this.reduceOpts = deps.reduceOptions ?? DEFAULT_REDUCE_OPTIONS;
    this.coordinator = new RenderCoordinator(deps.api, deps.chatId, {
      now: this.now,
      ...deps.coordinatorOptions,
    });
  }

  start(intervalMs = 200): void { this.coordinator.start(intervalMs); }
  stop(): void { this.coordinator.stop(); }
  /** Flush pending panel edits now (tests / shutdown). */
  async flush(): Promise<void> { await this.coordinator.pump(); }

  private ctx(threadId: number): ThreadCtx {
    let c = this.threads.get(threadId);
    if (!c) { c = { turn: null, baselineHumanId: undefined }; this.threads.set(threadId, c); }
    return c;
  }

  private hash = (sp: string): string => this.deps.hashSelector(sp);

  /**
   * Open a new turn from a Telegram-origin prompt. Posts the live panel
   * immediately so the user sees "Processing" before the DOM shows anything.
   */
  async beginTelegramTurn(threadId: number, text: string, anchorMsgId?: number): Promise<void> {
    await this.openTurn(threadId, 'telegram', text, anchorMsgId);
  }

  private async openTurn(
    threadId: number,
    origin: 'telegram' | 'mac',
    text: string,
    anchorMsgId?: number,
  ): Promise<void> {
    const c = this.ctx(threadId);
    const state = initTurnState(threadId, origin, text, this.now());

    let anchor = anchorMsgId;
    if (origin === 'mac') {
      // Mirror the Mac-typed prompt so the topic reads identically to a TG prompt.
      const mirror = await this.deps.api.sendMessage(
        this.deps.chatId,
        `👤 <b>From Mac</b>\n${escapeHtml(text || '(prompt)')}`,
        { message_thread_id: threadId, parse_mode: 'HTML' },
      );
      anchor = mirror.message_id;
    }

    const view = renderTurn(state, this.hash);
    const panel = await this.deps.api.sendMessage(this.deps.chatId, view.liveHtml, {
      message_thread_id: threadId,
      parse_mode: 'HTML',
      reply_markup: view.keyboard,
      // Anchor the panel to the user's prompt (TG) or the mirror (Mac) so the
      // topic reads like a reply thread, mirroring Cursor's composer.
      reply_to_message_id: anchor,
    });

    c.turn = state;
    c.anchorMsgId = anchor;
    c.awaitingNewHuman = true;
    this.coordinator.setLivePanel(threadId, panel.message_id);
    this.coordinator.requestRender(threadId, view);
  }

  /** Feed a fresh snapshot for a topic. Detects new turns and re-renders the panel. */
  async ingest(threadId: number, snapshot: SnapshotLike): Promise<void> {
    const c = this.ctx(threadId);
    const currentHuman = lastHumanId(snapshot.messages);
    const tsnap = toTurnSnapshot(snapshot, this.now());

    // Guard: after beginTelegramTurn, skip snapshots that still show the
    // previous turn's DOM (the new human prompt hasn't appeared yet).
    if (c.awaitingNewHuman) {
      if (c.baselineHumanId === undefined) {
        // First ingest after openTurn — record current human as baseline, keep waiting.
        c.baselineHumanId = currentHuman;
        return;
      }
      if (currentHuman && currentHuman !== c.baselineHumanId) {
        c.awaitingNewHuman = false;
        c.baselineHumanId = currentHuman;
      } else {
        return;
      }
    }

    // Active, non-terminal turn → just reduce and render.
    if (c.turn && !isTerminalPhase(c.turn.phase)) {
      c.turn = reduce(c.turn, tsnap, this.reduceOpts);
      this.coordinator.requestRender(threadId, renderTurn(c.turn, this.hash));
      c.baselineHumanId = currentHuman ?? c.baselineHumanId;
      return;
    }

    // No turn, or the previous turn already ended.
    if (c.baselineHumanId === undefined) {
      // First sight of this topic — establish a baseline, don't resurrect history.
      c.baselineHumanId = currentHuman;
      if (c.turn && !isTerminalPhase(c.turn.phase)) { /* unreachable */ }
      return;
    }

    if (currentHuman !== c.baselineHumanId && isActive(snapshot)) {
      // A new human prompt we didn't explicitly open. If it matches a recent
      // Telegram inbound it's a Telegram turn (the user's message is already in
      // the thread, so no mirror); otherwise it's Mac-origin and we mirror it.
      const text = currentHuman ? humanTextById(snapshot.messages, currentHuman) : '';
      const fromTelegram = this.deps.isTelegramInbound?.(threadId, text) ?? false;
      await this.openTurn(threadId, fromTelegram ? 'telegram' : 'mac', text);
      c.turn = reduce(c.turn!, tsnap, this.reduceOpts);
      this.coordinator.requestRender(threadId, renderTurn(c.turn, this.hash));
    }
    c.baselineHumanId = currentHuman ?? c.baselineHumanId;
  }

  /** User tapped Stop / Cancel for this topic's turn. */
  markStopped(threadId: number): void {
    const c = this.threads.get(threadId);
    if (!c?.turn) return;
    c.turn = markStopped(c.turn, this.now());
    this.coordinator.requestRender(threadId, renderTurn(c.turn, this.hash));
  }

  // ── Freeform "Other" capture (C1) ──
  /** Arm: the next text message in this topic is the freeform answer for `selectorPath`. */
  armFreeform(threadId: number, selectorPath: string): void {
    this.ctx(threadId).freeformSelector = selectorPath;
  }
  isFreeformArmed(threadId: number): boolean {
    return this.threads.get(threadId)?.freeformSelector !== undefined;
  }
  /** Consume the armed freeform selector (clears the armed state). */
  consumeFreeform(threadId: number): string | undefined {
    const c = this.threads.get(threadId);
    if (!c) return undefined;
    const sel = c.freeformSelector;
    c.freeformSelector = undefined;
    return sel;
  }
  disarmFreeform(threadId: number): void {
    const c = this.threads.get(threadId);
    if (c) c.freeformSelector = undefined;
  }

  /** True while a topic's turn is live (non-terminal) — used to poll-boost its window (A1). */
  hasActiveTurn(threadId: number): boolean {
    const turn = this.threads.get(threadId)?.turn;
    return !!turn && !isTerminalPhase(turn.phase);
  }

  /** Visible for tests. */
  peekTurn(threadId: number): TurnState | null {
    return this.threads.get(threadId)?.turn ?? null;
  }
}
