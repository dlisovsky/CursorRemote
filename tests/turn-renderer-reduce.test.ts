import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, initTurnState, markStopped } from '../src/server/transports/telegram/turn-renderer/reduce.js';
import type { TurnState } from '../src/server/transports/telegram/turn-renderer/turn-state.js';
import {
  snap, human, assistant, loadingTool, thought, questionnaire, approval, queue, tick, resetClock,
} from './turn-renderer-snapshots.js';

function fresh(): TurnState {
  resetClock();
  return initTurnState(42, 'telegram', 'do the thing', tick(0));
}

test('starts in received', () => {
  const s = fresh();
  assert.equal(s.phase, 'received');
  assert.equal(s.threadId, 42);
});

test('thinking → running_tool with pinned active tool', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'thinking', messages: [human('hi')] }));
  assert.equal(s.phase, 'thinking');

  s = reduce(s, snap({
    agentStatus: 'running_tool',
    messages: [human('hi'), loadingTool('Edit', 'foo.ts')],
  }));
  assert.equal(s.phase, 'running_tool');
  assert.match(s.pinned.activeTool ?? '', /foo\.ts/);
  assert.match(s.pinned.activeTool ?? '', /\+2\/-1/);
});

test('scroll tail keeps the most recent lines only', () => {
  let s = fresh();
  const msgs = [human('hi')];
  for (let i = 0; i < 20; i++) msgs.push(thought(`step ${i}`, `th${i}`, i + 1));
  s = reduce(s, snap({ agentStatus: 'thinking', messages: msgs }));
  assert.ok(s.scrollTail.length <= 8, `tail should be capped, got ${s.scrollTail.length}`);
  assert.equal(s.scrollTail[s.scrollTail.length - 1], 'step 19');
});

test('idle without answer debounces to doneStablePolls before done', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'thinking', messages: [human('hi')] }));
  // First idle poll without answer — not done yet.
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    messages: [human('hi')],
  }));
  assert.notEqual(s.phase, 'done', 'first idle without answer should not finalize');
  // Second idle poll → done (doneStablePolls=2).
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    messages: [human('hi')],
  }));
  assert.equal(s.phase, 'done');
});

test('with answer captured, first idle poll finalizes done immediately', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'thinking', messages: [human('hi')] }));
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    messages: [human('hi'), assistant('all done')],
  }));
  assert.equal(s.phase, 'done', 'answer + idle should finalize on first poll');
  assert.ok(s.finalAnswerHtml && s.finalAnswerHtml.includes('all done'));
  assert.ok(s.endedAt !== undefined);
});

test('without answer, done is debounced to doneStablePolls', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'thinking', messages: [human('hi')] }));
  // First idle snapshot WITHOUT an answer.
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    messages: [human('hi')],
  }));
  assert.notEqual(s.phase, 'done', 'no answer yet, should not finalize on first idle');
  assert.equal(s.idleStableCount, 1);

  // Second idle → done (reaches doneStablePolls=2 threshold).
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    messages: [human('hi')],
  }));
  assert.equal(s.phase, 'done');
});

test('transient idle blip between steps does not finalize', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'thinking', messages: [human('hi')] }));
  // idle blip
  s = reduce(s, snap({ agentStatus: 'idle', agentActivityLive: false, inputAvailable: true, messages: [human('hi')] }));
  assert.equal(s.idleStableCount, 1);
  // activity resumes → counter resets, not done
  s = reduce(s, snap({ agentStatus: 'running_tool', messages: [human('hi'), loadingTool('Edit', 'x.ts')] }));
  assert.equal(s.phase, 'running_tool');
  assert.equal(s.idleStableCount, 0);
});

test('approval takes priority over everything', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'waiting_approval', agentActivityLive: false,
    pendingApprovals: [approval()],
    messages: [human('hi')],
  }));
  assert.equal(s.phase, 'awaiting_approval');
  assert.equal(s.approvals.length, 1);
});

test('active questionnaire → awaiting_question', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    questionnaire: questionnaire(),
    messages: [human('hi')],
  }));
  assert.equal(s.phase, 'awaiting_question');
  assert.ok(s.question);
});

test('queued prompts while idle → queued (not done)', () => {
  let s = fresh();
  s = reduce(s, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    composerQueue: queue(),
    messages: [human('hi'), assistant('done')],
  }));
  assert.equal(s.phase, 'queued');
  assert.equal(s.queue.items.length, 1);
});

test('markStopped is terminal and sticky while quiet', () => {
  let s = fresh();
  s = reduce(s, snap({ agentStatus: 'running_tool', messages: [human('hi'), loadingTool('Edit')] }));
  s = markStopped(s, tick());
  assert.equal(s.phase, 'stopped');
  // A subsequent quiet snapshot keeps it stopped.
  s = reduce(s, snap({ agentStatus: 'idle', agentActivityLive: false, inputAvailable: true, messages: [human('hi')] }));
  assert.equal(s.phase, 'stopped');
});
