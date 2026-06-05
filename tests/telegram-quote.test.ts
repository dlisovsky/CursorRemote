import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromptWithQuote,
  extractTelegramQuote,
  stripTelegramHtml,
} from '../src/server/transports/telegram/telegram-quote.js';

describe('telegram quote (Phase A)', () => {
  it('buildPromptWithQuote wraps partial quote and user text', () => {
    const out = buildPromptWithQuote('explain this', 'selected snippet');
    assert.match(out, /^Regarding:/);
    assert.match(out, /«selected snippet»/);
    assert.match(out, /explain this$/);
  });

  it('buildPromptWithQuote quote-only', () => {
    assert.equal(buildPromptWithQuote('', 'only quote'), 'Regarding:\n\n«only quote»');
  });

  it('buildPromptWithQuote without quote passes text through', () => {
    assert.equal(buildPromptWithQuote('hello', undefined), 'hello');
  });

  it('extractTelegramQuote prefers message.quote over reply_to_message', () => {
    const q = extractTelegramQuote({
      quote: { text: 'partial' },
      reply_to_message: { text: 'full message body' },
    });
    assert.equal(q, 'partial');
  });

  it('extractTelegramQuote falls back to replied message text', () => {
    const q = extractTelegramQuote({
      reply_to_message: { text: 'agent said this' },
    });
    assert.equal(q, 'agent said this');
  });

  it('stripTelegramHtml removes tags', () => {
    assert.equal(stripTelegramHtml('<b>Hi</b> there'), 'Hi there');
  });
});
