/**
 * Chat-level token bucket (P1). All forum topics live in ONE supergroup, so
 * Telegram rate-limits edits per chat. A single bucket gates every outbound
 * edit/send across topics; per-thread coalescing (RenderCoordinator) ensures
 * only the latest frame per topic competes for a token, so stale frames are
 * dropped rather than queued.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = (t - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.lastRefill = t;
  }

  tryTake(n = 1): boolean {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** Visible for tests. */
  get available(): number {
    this.refill();
    return this.tokens;
  }
}
