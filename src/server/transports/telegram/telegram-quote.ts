/** Telegram reply / partial-quote fields → Cursor prompt text (Phase A). */

export interface TelegramQuoteSource {
  quote?: { text?: string };
  reply_to_message?: { text?: string; caption?: string };
}

const MAX_QUOTE_CHARS = 4000;

/** Strip basic HTML from Telegram-formatted agent messages when replying. */
export function stripTelegramHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Partial selection (`message.quote`) preferred; else full replied message text/caption.
 */
export function extractTelegramQuote(msg: TelegramQuoteSource | undefined): string | undefined {
  if (!msg) return undefined;

  const partial = msg.quote?.text?.trim();
  if (partial) return truncateQuote(partial);

  const replied = msg.reply_to_message;
  if (!replied) return undefined;

  const raw = (replied.text ?? replied.caption ?? '').trim();
  if (!raw) return undefined;

  const plain = raw.includes('<') ? stripTelegramHtml(raw) : raw;
  return truncateQuote(plain);
}

function truncateQuote(text: string): string {
  if (text.length <= MAX_QUOTE_CHARS) return text;
  return `${text.slice(0, MAX_QUOTE_CHARS - 1)}…`;
}

/**
 * Phase A prompt: plain-text "Regarding" block (no native Cursor blockquote yet).
 */
export function buildPromptWithQuote(userText: string, quoted?: string): string {
  const body = userText.trim();
  const qt = quoted?.trim();
  if (!qt) return body;
  const block = `Regarding:\n\n«${qt}»`;
  if (!body) return block;
  return `${block}\n\n${body}`;
}
