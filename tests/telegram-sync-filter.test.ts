import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatElement, ToolCallElement } from '../src/server/types.js';
import {
  collectCurrentTurnLiveElements,
  filterEphemeralForLiveFeed,
  findLastHumanIndexInTail,
  isFileEditTool,
  isHistoricalAssistantInTail,
  lastAssistantIdAfterHuman,
  lastAssistantIdInTail,
  shouldSkipMessageForCompactLive,
  shouldSkipTelegramElement,
  trackedMessageSharesLivePanel,
} from '../src/server/transports/telegram/telegram-sync-filter.js';
import { recordTelegramInboundPrompt } from '../src/server/transports/telegram/telegram-inbound-prompt.js';

const assistant = (id: string, flatIndex: number, text: string): ChatElement => ({
  type: 'assistant',
  id,
  flatIndex,
  text,
  html: text,
  codeBlocks: [],
});

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

  it('skips non-latest assistant messages within the same turn only', () => {
    const tail: ChatElement[] = [
      assistant('a1', 0, 'part 1'),
      assistant('a2', 1, 'part 2'),
    ];
    const lastId = lastAssistantIdAfterHuman(tail);
    assert.equal(lastId, 'a2');
    assert.equal(
      shouldSkipTelegramElement(tail[0], {
        showTools: false,
        threadId: 1,
        lastAssistantIdInCurrentTurn: lastId,
      }),
      true
    );
    assert.equal(
      shouldSkipTelegramElement(tail[1], {
        showTools: false,
        threadId: 1,
        lastAssistantIdInCurrentTurn: lastId,
      }),
      false
    );
  });

  it('does not skip historical assistant when a new human starts a turn', () => {
    const tail: ChatElement[] = [
      assistant('a1', 0, 'prior reply'),
      { type: 'human', id: 'h2', flatIndex: 1, text: 'new prompt', mentions: [] },
    ];
    assert.equal(findLastHumanIndexInTail(tail), 1);
    assert.equal(lastAssistantIdAfterHuman(tail), undefined);
    assert.equal(isHistoricalAssistantInTail(tail, tail[0]), true);
    assert.equal(
      shouldSkipTelegramElement(tail[0], {
        showTools: false,
        threadId: 1,
        lastAssistantIdInCurrentTurn: undefined,
        isHistoricalAssistant: true,
      }),
      false
    );
  });

  it('drops in-turn assistant partials after a new human but keeps the prior turn reply', () => {
    const tail: ChatElement[] = [
      assistant('a1', 0, 'done'),
      { type: 'human', id: 'h2', flatIndex: 1, text: 'next', mentions: [] },
      assistant('a2', 2, 'streaming'),
      assistant('a3', 3, 'streaming 2'),
    ];
    const lastId = lastAssistantIdAfterHuman(tail);
    assert.equal(lastId, 'a3');
    assert.equal(isHistoricalAssistantInTail(tail, tail[0]), true);
    assert.equal(
      shouldSkipTelegramElement(tail[0], {
        showTools: false,
        threadId: 1,
        lastAssistantIdInCurrentTurn: lastId,
        isHistoricalAssistant: true,
      }),
      false
    );
    assert.equal(
      shouldSkipTelegramElement(tail[2], {
        showTools: false,
        threadId: 1,
        lastAssistantIdInCurrentTurn: lastId,
      }),
      true
    );
    assert.equal(
      shouldSkipTelegramElement(tail[3], {
        showTools: false,
        threadId: 1,
        lastAssistantIdInCurrentTurn: lastId,
      }),
      false
    );
  });

  it('lastAssistantIdInTail alias matches after-human scope', () => {
    const tail: ChatElement[] = [
      assistant('a1', 0, 'old'),
      { type: 'human', id: 'h', flatIndex: 1, text: 'q', mentions: [] },
      assistant('a2', 2, 'new'),
    ];
    assert.equal(lastAssistantIdInTail(tail), 'a2');
    assert.equal(lastAssistantIdAfterHuman(tail), 'a2');
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

  it('collectCurrentTurnLiveElements includes completed tools in the turn', () => {
    const tail: ChatElement[] = [
      { type: 'human', id: 'h', flatIndex: 0, text: 'go', mentions: [] },
      {
        type: 'tool',
        id: 't1',
        flatIndex: 1,
        toolCallId: 'tc',
        status: 'completed',
        action: 'Grep',
        details: 'pattern',
      },
      assistant('a1', 2, 'answer'),
    ];
    const out = collectCurrentTurnLiveElements(tail, 0, false);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'tool');
  });

  it('trackedMessageSharesLivePanel protects panel-backed rows', () => {
    assert.equal(trackedMessageSharesLivePanel([42], 42, undefined), true);
    assert.equal(trackedMessageSharesLivePanel([99], 42, undefined), false);
    assert.equal(trackedMessageSharesLivePanel(undefined, 42, undefined), false);
  });

  it('collectCurrentTurnLiveElements includes completed thoughts in the turn', () => {
    const tail: ChatElement[] = [
      { type: 'human', id: 'h', flatIndex: 0, text: 'go', mentions: [] },
      {
        type: 'thought',
        id: 'th',
        flatIndex: 1,
        duration: 'for 2s',
        action: 'Explored files',
        thoughtKind: 'step_summary',
      },
      assistant('a1', 2, 'answer'),
    ];
    const out = collectCurrentTurnLiveElements(tail, 0, false);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'thought');
  });

  it('shouldSkipMessageForCompactLive routes latest assistant to the panel', () => {
    const tail: ChatElement[] = [
      { type: 'human', id: 'h', flatIndex: 0, text: 'q', mentions: [] },
      assistant('a1', 1, 'reply'),
    ];
    const lastId = lastAssistantIdAfterHuman(tail);
    assert.equal(
      shouldSkipMessageForCompactLive(true, tail[1], false, 1, lastId, false),
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
