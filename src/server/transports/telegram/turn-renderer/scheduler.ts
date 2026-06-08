import type { TelegramApiClient, TgKeyboard } from '../tg-types.js';
import type { RenderedTurn } from './frame.js';
import { TokenBucket } from './rate-limiter.js';

export interface RenderCoordinatorOptions {
  /** Global edits/sec budget for the whole chat. */
  editsPerSec: number;
  /** Burst capacity of the global bucket. */
  capacity: number;
  /** Minimum gap between two edits of the same topic's live panel. */
  minThreadIntervalMs: number;
  /** Injectable clock (tests). */
  now: () => number;
}

const DEFAULTS: RenderCoordinatorOptions = {
  editsPerSec: 3,
  capacity: 5,
  minThreadIntervalMs: 900,
  now: Date.now,
};

interface ThreadRender {
  liveMsgId?: number;
  view?: RenderedTurn;
  flushedHtml?: string;
  flushedKeyboard?: string;
  lastEditAt: number;
  /** How many continuation messages have been sent already. */
  sentContinuation: number;
}

function keyboardKey(kb?: TgKeyboard): string {
  return kb ? JSON.stringify(kb.inline_keyboard) : '';
}

/**
 * Owns every topic's live panel. Per-thread it keeps only the LATEST requested
 * frame (coalescing); a global TokenBucket fairly orders edits across topics.
 * The pump loop flushes eligible threads; intermediate frames are dropped.
 */
export class RenderCoordinator {
  private readonly opts: RenderCoordinatorOptions;
  private readonly bucket: TokenBucket;
  private readonly threads = new Map<number, ThreadRender>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: TelegramApiClient,
    private readonly chatId: number,
    options: Partial<RenderCoordinatorOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    this.bucket = new TokenBucket(this.opts.capacity, this.opts.editsPerSec, this.opts.now);
  }

  private thread(threadId: number): ThreadRender {
    let t = this.threads.get(threadId);
    if (!t) {
      t = { lastEditAt: Number.NEGATIVE_INFINITY, sentContinuation: 0 };
      this.threads.set(threadId, t);
    }
    return t;
  }

  setLivePanel(threadId: number, liveMsgId: number): void {
    this.thread(threadId).liveMsgId = liveMsgId;
  }

  /** Queue the latest frame for a topic. Coalesces: only the newest view survives. */
  requestRender(threadId: number, view: RenderedTurn): void {
    const t = this.thread(threadId);
    t.view = view;
  }

  retire(threadId: number): void {
    this.threads.delete(threadId);
  }

  start(intervalMs = 200): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.pump(); }, intervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Flush eligible topics, one edit each, gated by the global bucket. */
  async pump(): Promise<void> {
    const now = this.opts.now();
    for (const [threadId, t] of this.threads) {
      if (!t.view || t.liveMsgId === undefined) continue;

      const htmlChanged = t.view.liveHtml !== t.flushedHtml;
      const kbKey = keyboardKey(t.view.keyboard);
      const kbChanged = kbKey !== (t.flushedKeyboard ?? '');
      const continuationPending = t.view.continuation.length > t.sentContinuation;

      if (!htmlChanged && !kbChanged && !continuationPending) continue;
      if (now - t.lastEditAt < this.opts.minThreadIntervalMs) continue;
      if (!this.bucket.tryTake()) continue;

      t.lastEditAt = now;

      if (htmlChanged || kbChanged) {
        try {
          await this.api.editMessageText(this.chatId, t.liveMsgId, t.view.liveHtml, {
            parse_mode: 'HTML',
            reply_markup: t.view.keyboard ?? { inline_keyboard: [] },
          });
          t.flushedHtml = t.view.liveHtml;
          t.flushedKeyboard = kbKey;
        } catch (err) {
          // Leave dirty; next pump retries. Don't advance flushed markers.
          void err;
        }
        continue; // one operation per topic per pump
      }

      // Only continuation messages remain; send the next one.
      if (continuationPending) {
        const idx = t.sentContinuation;
        try {
          await this.api.sendMessage(this.chatId, t.view.continuation[idx], {
            message_thread_id: threadId,
            parse_mode: 'HTML',
          });
          t.sentContinuation += 1;
        } catch (err) {
          void err;
        }
      }
    }
  }
}
