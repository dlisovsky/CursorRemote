import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderCoordinator } from '../src/server/transports/telegram/turn-renderer/scheduler.js';
import type { RenderedTurn } from '../src/server/transports/telegram/turn-renderer/frame.js';
import { FakeTelegram } from './turn-renderer-fake-telegram.js';

function view(html: string, continuation: string[] = []): RenderedTurn {
  return { liveHtml: html, keyboard: { inline_keyboard: [[{ text: '⏹ Stop', callback_data: 'stp:' }]] }, continuation };
}

function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('edits the one live panel in place (no new messages)', async () => {
  const api = new FakeTelegram();
  const clock = makeClock();
  const rc = new RenderCoordinator(api, 555, { now: clock.now, minThreadIntervalMs: 900, editsPerSec: 10, capacity: 10 });
  rc.setLivePanel(100, 9001);

  rc.requestRender(100, view('frame 1'));
  await rc.pump();
  clock.advance(1000);
  rc.requestRender(100, view('frame 2'));
  await rc.pump();

  assert.equal(api.sends().length, 0, 'never sends new messages during streaming');
  assert.equal(api.edits().length, 2);
  assert.equal(api.edits()[1].messageId, 9001);
  assert.equal(api.edits()[1].text, 'frame 2');
});

test('coalesces: intermediate frames within the thread interval are dropped', async () => {
  const api = new FakeTelegram();
  const clock = makeClock();
  const rc = new RenderCoordinator(api, 555, { now: clock.now, minThreadIntervalMs: 900, editsPerSec: 10, capacity: 10 });
  rc.setLivePanel(100, 9001);

  rc.requestRender(100, view('a'));
  await rc.pump();           // flushes 'a'
  rc.requestRender(100, view('b'));
  await rc.pump();           // too soon (interval) → dropped
  rc.requestRender(100, view('c'));
  await rc.pump();           // still too soon → dropped
  clock.advance(1000);
  await rc.pump();           // now flush latest = 'c'

  const texts = api.edits().map(e => e.text);
  assert.deepEqual(texts, ['a', 'c'], 'b was coalesced away');
});

test('identical frame is not re-sent', async () => {
  const api = new FakeTelegram();
  const clock = makeClock();
  const rc = new RenderCoordinator(api, 555, { now: clock.now, minThreadIntervalMs: 0, editsPerSec: 100, capacity: 100 });
  rc.setLivePanel(100, 9001);

  rc.requestRender(100, view('same'));
  await rc.pump();
  rc.requestRender(100, view('same'));
  await rc.pump();
  assert.equal(api.edits().length, 1, 'no edit when nothing changed');
});

test('global bucket throttles edits across many topics', async () => {
  const api = new FakeTelegram();
  const clock = makeClock();
  // Budget: capacity 2, refill 1/sec. Three topics all want to edit at t=0.
  const rc = new RenderCoordinator(api, 555, { now: clock.now, minThreadIntervalMs: 0, editsPerSec: 1, capacity: 2 });
  for (const tid of [1, 2, 3]) { rc.setLivePanel(tid, 8000 + tid); rc.requestRender(tid, view(`t${tid}`)); }

  await rc.pump(); // only 2 tokens available → 2 edits
  assert.equal(api.edits().length, 2, 'bucket caps the burst at capacity');

  clock.advance(1000); // refill 1 token
  await rc.pump();
  assert.equal(api.edits().length, 3, 'third topic flushes after refill');
});

test('done overflow sends continuation after the panel edit', async () => {
  const api = new FakeTelegram();
  const clock = makeClock();
  const rc = new RenderCoordinator(api, 555, { now: clock.now, minThreadIntervalMs: 0, editsPerSec: 100, capacity: 100 });
  rc.setLivePanel(100, 9001);

  rc.requestRender(100, view('head', ['tail part']));
  await rc.pump(); // edits the panel
  await rc.pump(); // sends the continuation

  assert.equal(api.edits().length, 1);
  assert.equal(api.sends().length, 1);
  assert.equal(api.sends()[0].text, 'tail part');
  assert.equal(api.sends()[0].threadId, 100);
});
