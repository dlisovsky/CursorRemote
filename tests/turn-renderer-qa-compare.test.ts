import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTurn, type CapturedEvent } from '../scripts/qa-telegram-compare.js';

const PROMPT = 500;

function ev(p: Partial<CapturedEvent> & Pick<CapturedEvent, 'kind' | 'messageId' | 'fromBot'>): CapturedEvent {
  return { text: '', ts: 0, ...p };
}

test('healthy turn: one panel reply, several edits, final answer', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: PROMPT, fromBot: false, text: 'do it' }),
    ev({ kind: 'new', messageId: 600, fromBot: true, replyTo: PROMPT, text: '⏳ Processing' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: '💭 Thinking' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: '🛠 Running tool' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: 'Here is the answer' }),
  ];
  const a = analyzeTurn(events, PROMPT);
  assert.equal(a.panelId, 600);
  assert.equal(a.panelEdits, 3);
  assert.match(a.panelFinalText, /answer/);
  assert.deepEqual(a.violations, []);
});

test('detects message spam (two replies to the prompt)', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: 600, fromBot: true, replyTo: PROMPT, text: 'panel' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: 'panel edit' }),
    ev({ kind: 'new', messageId: 601, fromBot: true, replyTo: PROMPT, text: 'second message' }),
  ];
  const a = analyzeTurn(events, PROMPT);
  assert.ok(a.violations.some(v => /spam/i.test(v)));
});

test('flags a panel that never streamed', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: 600, fromBot: true, replyTo: PROMPT, text: 'panel only' }),
  ];
  const a = analyzeTurn(events, PROMPT);
  assert.ok(a.violations.some(v => /never edited/i.test(v)));
});

test('flags missing panel', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: 700, fromBot: true, text: 'unrelated' }),
  ];
  const a = analyzeTurn(events, PROMPT);
  assert.equal(a.panelId, undefined);
  assert.ok(a.violations.some(v => /No live panel/i.test(v)));
});

test('bounded continuation for long answers is allowed', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: 600, fromBot: true, replyTo: PROMPT, text: 'head' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: 'head final' }),
    ev({ kind: 'new', messageId: 601, fromBot: true, text: 'tail part 1' }),
  ];
  const a = analyzeTurn(events, PROMPT, { maxContinuation: 4 });
  assert.deepEqual(a.extraBotMessageIds, [601]);
  assert.deepEqual(a.violations, []);
});

test('flags Done header without answer body', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: 600, fromBot: true, replyTo: PROMPT, text: '⏳ Processing' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: '✅ Done' }),
  ];
  const a = analyzeTurn(events, PROMPT);
  assert.ok(a.violations.some(v => /without the agent answer/i.test(v)));
});

test('too much continuation trips the limit', () => {
  const events: CapturedEvent[] = [
    ev({ kind: 'new', messageId: 600, fromBot: true, replyTo: PROMPT, text: 'head' }),
    ev({ kind: 'edit', messageId: 600, fromBot: true, text: 'head final' }),
    ev({ kind: 'new', messageId: 601, fromBot: true, text: 'x' }),
    ev({ kind: 'new', messageId: 602, fromBot: true, text: 'x' }),
  ];
  const a = analyzeTurn(events, PROMPT, { maxContinuation: 1 });
  assert.ok(a.violations.some(v => /Too many extra/i.test(v)));
});
