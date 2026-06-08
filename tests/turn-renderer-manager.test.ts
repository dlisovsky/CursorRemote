import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnRendererManager } from '../src/server/transports/telegram/turn-renderer/turn-manager.js';
import { FakeTelegram } from './turn-renderer-fake-telegram.js';
import {
  snap, human, assistant, loadingTool, thought, questionnaire, approval, queue, resetClock,
} from './turn-renderer-snapshots.js';

const CHAT = 555;
const THREAD = 77;

function makeClock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function makeManager(api: FakeTelegram, now: () => number) {
  return new TurnRendererManager({
    api,
    chatId: CHAT,
    hashSelector: (sp) => sp,
    now,
    coordinatorOptions: { minThreadIntervalMs: 0, editsPerSec: 1000, capacity: 1000 },
  });
}

test('telegram turn: one panel, streams, finalizes to the answer (no message spam)', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);

  await m.beginTelegramTurn(THREAD, 'do the thing', 9000);
  // Initial live panel sent once, anchored as a reply to the user's message.
  assert.equal(api.sends().length, 1, 'one live panel posted');
  assert.equal(api.sends()[0].replyTo, 9000, 'panel replies to the prompt message');
  const panelId = api.sends()[0].messageId!;

  // Stream: thinking → tool → answer
  await m.ingest(THREAD, snap({ agentStatus: 'thinking', messages: [human('do the thing'), thought('Exploring')] }));
  await m.flush();
  clock.advance(1000);
  await m.ingest(THREAD, snap({ agentStatus: 'running_tool', messages: [human('do the thing'), loadingTool('Edit', 'a.ts')] }));
  await m.flush();
  clock.advance(1000);

  // One idle poll with the answer → done (answer present = fast finalize).
  const finalMsgs = [human('do the thing'), assistant('Here is the result')];
  await m.ingest(THREAD, snap({ agentStatus: 'idle', agentActivityLive: false, inputAvailable: true, messages: finalMsgs }));
  await m.flush();

  assert.equal(api.sends().length, 1, 'never posts extra messages for a short turn');
  assert.ok(api.edits().length >= 1, 'panel was edited in place');
  for (const e of api.edits()) assert.equal(e.messageId, panelId, 'all edits target the one panel');
  assert.match(api.edits().at(-1)!.text!, /Here is the result/, 'final edit shows the answer');
  assert.equal(m.peekTurn(THREAD)?.phase, 'done');
});

test('does not finalize before the agent starts (received holds)', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);
  await m.beginTelegramTurn(THREAD, 'hi', 9000);

  // Agent hasn't started: idle DOM, no turn content. Several polls.
  for (let i = 0; i < 4; i++) {
    await m.ingest(THREAD, snap({ agentStatus: 'idle', agentActivityLive: false, inputAvailable: true, messages: [] }));
    await m.flush();
    clock.advance(1000);
  }
  assert.equal(m.peekTurn(THREAD)?.phase, 'received', 'stays in received until activity');
});

test('mac-origin prompt is mirrored and gets the same live panel', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);

  // First sight establishes a baseline (idle history) — no turn opened.
  await m.ingest(THREAD, snap({ agentStatus: 'idle', agentActivityLive: false, inputAvailable: true, messages: [human('old', 'h0')] }));
  await m.flush();
  assert.equal(api.sends().length, 0, 'no panel resurrected from history');

  // A new human appears with activity, not from Telegram → mac-origin.
  await m.ingest(THREAD, snap({
    agentStatus: 'thinking',
    messages: [human('old', 'h0'), human('mac prompt', 'h1'), thought('Working')],
  }));
  await m.flush();

  const sends = api.sends();
  assert.equal(sends.length, 2, 'mirror message + live panel');
  assert.match(sends[0].text!, /From Mac/);
  assert.match(sends[0].text!, /mac prompt/);
  assert.equal(m.peekTurn(THREAD)?.origin, 'mac');
});

test('question turn surfaces option buttons; freeform arms capture', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);
  await m.beginTelegramTurn(THREAD, 'ask me', 9000);

  await m.ingest(THREAD, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    questionnaire: questionnaire(), messages: [human('ask me'), thought('thinking')],
  }));
  await m.flush();
  assert.equal(m.peekTurn(THREAD)?.phase, 'awaiting_question');

  m.armFreeform(THREAD, 'sel-C');
  assert.equal(m.isFreeformArmed(THREAD), true);
  assert.equal(m.consumeFreeform(THREAD), 'sel-C');
  assert.equal(m.isFreeformArmed(THREAD), false);
});

test('stop marks the turn stopped and re-renders', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);
  await m.beginTelegramTurn(THREAD, 'go', 9000);
  await m.ingest(THREAD, snap({ agentStatus: 'running_tool', messages: [human('go'), loadingTool('Edit')] }));
  await m.flush();

  m.markStopped(THREAD);
  await m.flush();
  assert.equal(m.peekTurn(THREAD)?.phase, 'stopped');
  assert.match(api.edits().at(-1)!.text!, /Stopped/);
});

test('approval turn shows approve/reject on the panel', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);
  await m.beginTelegramTurn(THREAD, 'build', 9000);
  await m.ingest(THREAD, snap({
    agentStatus: 'waiting_approval', agentActivityLive: false,
    pendingApprovals: [approval()], messages: [human('build'), thought('preparing')],
  }));
  await m.flush();
  const kb = JSON.stringify(api.edits().at(-1)!.keyboard);
  assert.match(kb, /apr:/);
  assert.match(kb, /rej:/);
});

test('queued prompt turn shows send-now / cancel', async () => {
  resetClock();
  const api = new FakeTelegram();
  const clock = makeClock();
  const m = makeManager(api, clock.now);
  await m.beginTelegramTurn(THREAD, 'first', 9000);
  await m.ingest(THREAD, snap({
    agentStatus: 'idle', agentActivityLive: false, inputAvailable: true,
    composerQueue: queue(), messages: [human('first'), assistant('done'), thought('x')],
  }));
  await m.flush();
  assert.equal(m.peekTurn(THREAD)?.phase, 'queued');
  const kb = JSON.stringify(api.edits().at(-1)!.keyboard);
  assert.match(kb, /qsf:|qcn:/);
});
