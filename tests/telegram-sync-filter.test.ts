import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatElement, ToolCallElement } from '../src/server/types.js';
import {
  filterEphemeralForLiveFeed,
  isFileEditTool,
  lastAssistantIdInTail,
  shouldSkipTelegramElement,
} from '../src/server/transports/telegram/telegram-sync-filter.js';
import { recordTelegramInboundPrompt } from '../src/server/transports/telegram/telegram-inbound-prompt.js';

describe('telegram sync filter', () => {
  const fileTool: ToolCallElement = {
    type: 'tool',
    id: 't1',
    flatIndex: 1,
    toolCallId: 'tc',
    status: 'completed',
    action: 'Edit',
    details: 'x.ts',
    filename: 'x.ts',
  };

  it('isFileEditTool when filename present', () => {
    assert.equal(isFileEditTool(fileTool), true);
  });

  it('skips all tools when showTools is false', () => {
    assert.equal(
      shouldSkipTelegramElement(fileTool, { showTools: false, threadId: 1 }),
      true
    );
    assert.equal(
      shouldSkipTelegramElement(fileTool, { showTools: true, threadId: 1 }),
      false
    );
  });

  it('skips non-latest assistant messages', () => {
    const tail: ChatElement[] = [
      { type: 'assistant', id: 'a1', flatIndex: 0, text: 'part 1', html: 'p1', codeBlocks: [] },
      { type: 'assistant', id: 'a2', flatIndex: 1, text: 'part 2', html: 'p2', codeBlocks: [] },
    ];
    const lastId = lastAssistantIdInTail(tail);
    assert.equal(lastId, 'a2');
    assert.equal(
      shouldSkipTelegramElement(tail[0], { showTools: false, threadId: 1, lastAssistantId: lastId }),
      true
    );
    assert.equal(
      shouldSkipTelegramElement(tail[1], { showTools: false, threadId: 1, lastAssistantId: lastId }),
      false
    );
  });

  it('skips human row that echoes Telegram inbound', () => {
    recordTelegramInboundPrompt(99, 'voice text here');
    const human: ChatElement = {
      type: 'human',
      id: 'h1',
      flatIndex: 0,
      text: 'voice text here',
      mentions: [],
    };
    assert.equal(
      shouldSkipTelegramElement(human, { showTools: false, threadId: 99 }),
      true
    );
  });

  it('filterEphemeralForLiveFeed removes tools when hidden', () => {
    const thought = {
      type: 'thought' as const,
      id: 'th1',
      flatIndex: 0,
      duration: '',
      action: 'Planning',
    };
    const out = filterEphemeralForLiveFeed([fileTool, thought], false);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'thought');
  });
});
