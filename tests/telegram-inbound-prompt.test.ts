import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesRecentTelegramInbound,
  recordTelegramInboundPrompt,
} from '../src/server/transports/telegram/telegram-inbound-prompt.js';

describe('telegram inbound prompt dedupe', () => {
  it('matches exact text sent from Telegram', () => {
    recordTelegramInboundPrompt(42, 'hello from voice');
    assert.equal(matchesRecentTelegramInbound(42, 'hello from voice'), true);
    assert.equal(matchesRecentTelegramInbound(42, 'other'), false);
  });

  it('matches human tail after Regarding quote block', () => {
    recordTelegramInboundPrompt(
      7,
      'Regarding:\n\n«note»\n\nfix the bug'
    );
    assert.equal(matchesRecentTelegramInbound(7, 'fix the bug'), true);
  });

  it('does not match a short suffix of an unrelated long prompt', () => {
    recordTelegramInboundPrompt(3, 'a'.repeat(100) + 'please run npm test');
    assert.equal(matchesRecentTelegramInbound(3, 'test'), false);
  });
});
