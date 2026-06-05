import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatElement, ToolCallElement } from '../src/server/types.js';
import {
  planLiveFeedUpdate,
  shouldSkipMessageForCompactLive,
} from '../src/server/transports/telegram/live-feed-sync.js';

describe('planLiveFeedUpdate', () => {
  const hash = 'abc123';

  it('returns none when html empty and no existing message', () => {
    assert.equal(planLiveFeedUpdate('', undefined, undefined, hash), 'none');
  });

  it('returns delete when html empty but message exists', () => {
    assert.equal(planLiveFeedUpdate('', 42, hash, hash), 'delete');
  });

  it('returns none when content hash unchanged', () => {
    assert.equal(planLiveFeedUpdate('<b>busy</b>', 42, hash, hash), 'none');
  });

  it('returns send when html present and no message yet', () => {
    assert.equal(planLiveFeedUpdate('● Planning…', undefined, undefined, hash), 'send');
  });

  it('returns edit when html changed', () => {
    assert.equal(planLiveFeedUpdate('● Reading file', 42, 'old', 'new'), 'edit');
  });
});

describe('shouldSkipMessageForCompactLive', () => {
  const loadingTool: ToolCallElement = {
    type: 'tool',
    id: 'tool:1',
    flatIndex: 1,
    toolCallId: 'tc1',
    status: 'loading',
    action: 'Read',
    details: 'foo.ts',
  };

  it('skips loading tools when compact live is on', () => {
    assert.equal(shouldSkipMessageForCompactLive(true, loadingTool), true);
  });

  it('does not skip when compact live is off', () => {
    assert.equal(shouldSkipMessageForCompactLive(false, loadingTool), false);
  });

  it('does not skip completed tools when compact is on', () => {
    const done: ChatElement = { ...loadingTool, status: 'completed' };
    assert.equal(shouldSkipMessageForCompactLive(true, done), false);
  });
});
