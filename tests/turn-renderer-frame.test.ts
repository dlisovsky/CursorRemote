import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTurn } from '../src/server/transports/telegram/turn-renderer/frame.js';
import { reduce, initTurnState } from '../src/server/transports/telegram/turn-renderer/reduce.js';
import type { TurnState } from '../src/server/transports/telegram/turn-renderer/turn-state.js';
import { snap, human, assistant, loadingTool, questionnaire, approval, queue, tick, resetClock } from './turn-renderer-snapshots.js';

const idHash = (s: string): string => s; // identity (selector path fits for tests)

function fresh(): TurnState {
  resetClock();
  return initTurnState(7, 'telegram', 'hi', tick(0));
}

function buttonData(view: ReturnType<typeof renderTurn>): string[] {
  return (view.keyboard?.inline_keyboard ?? []).flat().map(b => b.callback_data);
}

test('answering frame includes streaming assistant text', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'generating',
    messages: [human('hi'), { type: 'assistant', id: 'a1', flatIndex: 9, text: '2+2 is 4', html: '', codeBlocks: [] }],
  }));
  const view = renderTurn(s, idHash);
  assert.match(view.liveHtml, /2\+2 is 4/);
});

test('thinking frame shows status + Stop button', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'thinking', messages: [human('hi'), loadingTool('Edit', 'a.ts')] }));
  const view = renderTurn(s, idHash);
  assert.match(view.liveHtml, /<b>/);
  assert.deepEqual(buttonData(view), ['stp:']);
  assert.equal(view.continuation.length, 0);
});

test('rolling window stays within the Telegram limit', () => {
  const s = fresh();
  // 50 long lines — must clamp under the live limit.
  s.phase = 'thinking';
  s.pinned = { statusLabel: 'Thinking' };
  s.scrollTail = Array.from({ length: 50 }, (_, i) => `line ${i} `.repeat(60));
  const view = renderTurn(s, idHash);
  assert.ok(view.liveHtml.length <= 3900, `live html too long: ${view.liveHtml.length}`);
});

test('question frame: option buttons, freeform as qfo, and Cancel', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    questionnaire: questionnaire(), messages: [human('hi')],
  }));
  const view = renderTurn(s, idHash);
  const data = buttonData(view);
  assert.ok(data.includes('qan:sel-A'), 'discrete option A uses qan');
  assert.ok(data.includes('qan:sel-B'), 'discrete option B uses qan');
  const freeform = data.find(d => d.startsWith('qfo:'));
  assert.ok(freeform, 'freeform option uses qfo callback');
  assert.equal(freeform, 'qfo:sel-C', 'qfo carries the freeform option selector hash');
  assert.ok(data.includes('stp:'), 'has Cancel/Stop');
  assert.match(view.liveHtml, /Pick a framework/);
});

test('approval frame surfaces approve/reject buttons', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'waiting_approval', agentActivityLive: false,
    pendingApprovals: [approval()], messages: [human('hi')],
  }));
  const view = renderTurn(s, idHash);
  const data = buttonData(view).join(' ');
  assert.match(data, /apr:/);
  assert.match(data, /rej:/);
});

test('queued frame surfaces send-now / cancel', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    composerQueue: queue(), messages: [human('hi'), assistant('done')],
  }));
  const view = renderTurn(s, idHash);
  const data = buttonData(view).join(' ');
  assert.match(data, /qsf:|qcn:/);
});

test('done with a long answer spills into continuation messages', () => {
  const s = fresh();
  s.phase = 'done';
  s.finalAnswerHtml = 'X'.repeat(9000);
  s.pinned = { statusLabel: 'Done' };
  const view = renderTurn(s, idHash);
  assert.ok(view.liveHtml.length <= 4096);
  assert.ok(view.continuation.length >= 1, 'long answer should overflow');
  assert.equal(view.keyboard, undefined, 'done clears the keyboard');
});

test('short done answer fits in the live panel, no continuation', () => {
  const s = fresh();
  s.phase = 'done';
  s.finalAnswerHtml = '<p>all set</p>';
  const view = renderTurn(s, idHash);
  assert.equal(view.continuation.length, 0);
  assert.match(view.liveHtml, /all set/);
});
