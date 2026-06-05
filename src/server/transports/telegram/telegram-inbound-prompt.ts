/** Avoid echoing Telegram-originated prompts back as Cursor "You:" human rows. */

const TTL_MS = 15 * 60 * 1000;

interface RecentInbound {
  text: string;
  at: number;
}

const recentByThread = new Map<number, RecentInbound>();

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function recordTelegramInboundPrompt(threadId: number, promptText: string): void {
  const text = promptText.trim();
  if (!text) return;
  recentByThread.set(threadId, { text, at: Date.now() });
}

/** True when Cursor's human row is the same text we just sent from Telegram. */
export function matchesRecentTelegramInbound(threadId: number, humanText: string): boolean {
  const entry = recentByThread.get(threadId);
  if (!entry) return false;
  if (Date.now() - entry.at > TTL_MS) {
    recentByThread.delete(threadId);
    return false;
  }

  const raw = entry.text;
  const h = normalize(humanText);
  const p = normalize(raw);
  if (!h || !p) return false;
  if (h === p) return true;
  // Avoid skipping unrelated short human lines that happen to suffix-match an old long prompt.
  if (p.endsWith(h) && h.length >= 20 && h.length >= p.length * 0.5) return true;

  // Quote-style prompts: split raw text so newlines are not collapsed by normalize().
  const blocks = raw.split('\n\n');
  const tail = blocks[blocks.length - 1] ?? '';
  const tailNorm = normalize(tail.replace(/^«[^»]*»\s*/, ''));
  if (tailNorm && tailNorm === h) return true;

  return false;
}
