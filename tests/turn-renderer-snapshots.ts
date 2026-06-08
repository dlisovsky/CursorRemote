import type {
  ChatElement,
  Questionnaire,
  Approval,
  ComposerQueueState,
  AgentStatus,
} from '../src/server/types.js';
import type { TurnSnapshot } from '../src/server/transports/telegram/turn-renderer/turn-state.js';

let clock = 1_000_000;
export function tick(ms = 300): number { clock += ms; return clock; }
export function resetClock(): void { clock = 1_000_000; }

export function human(text: string, id = 'h1', flatIndex = 0): ChatElement {
  return { type: 'human', id, flatIndex, text, mentions: [] };
}

export function assistant(text: string, id = 'a1', flatIndex = 9): ChatElement {
  return { type: 'assistant', id, flatIndex, text, html: `<p>${text}</p>`, codeBlocks: [] };
}

export function loadingTool(action: string, filename?: string, id = 't1', flatIndex = 1): ChatElement {
  return {
    type: 'tool', id, flatIndex, toolCallId: `tc-${id}`, status: 'loading',
    action, details: '', filename, additions: 2, deletions: 1,
  };
}

export function thought(action: string, id = 'th1', flatIndex = 2): ChatElement {
  return { type: 'thought', id, flatIndex, duration: '', action, thoughtKind: 'thinking_step' };
}

export function snap(partial: Partial<TurnSnapshot> & { messages: ChatElement[] }): TurnSnapshot {
  return {
    agentStatus: 'thinking' as AgentStatus,
    agentActivityText: null,
    agentActivityLive: true,
    pendingApprovals: [] as Approval[],
    composerQueue: { items: [] } as ComposerQueueState,
    questionnaire: null as Questionnaire | null,
    inputAvailable: false,
    at: tick(),
    ...partial,
  };
}

export function questionnaire(): Questionnaire {
  return {
    questions: [
      {
        number: '1', text: 'Pick a framework', isActive: true,
        options: [
          { letter: 'A', label: 'React', isFreeform: false, selectorPath: 'sel-A' },
          { letter: 'B', label: 'Vue', isFreeform: false, selectorPath: 'sel-B' },
          { letter: 'C', label: 'Other', isFreeform: true, selectorPath: 'sel-C' },
        ],
      },
    ],
    activeIndex: 0,
    totalLabel: 'Question 1 of 1',
    skipSelectorPath: 'sel-skip',
    continueSelectorPath: '',
    continueDisabled: true,
  };
}

export function approval(): Approval {
  return {
    id: 'apr-1',
    description: 'Run shell command -- npm run build',
    actions: [
      { label: 'Run', type: 'approve', selectorPath: 'sel-run' },
      { label: 'Skip', type: 'reject', selectorPath: 'sel-skip' },
    ],
  };
}

export function queue(): ComposerQueueState {
  return {
    queueLabel: '1 Queued',
    items: [{ id: 'q1', text: 'next thing', sendNowSelectorPath: 'sel-send', cancelSelectorPath: 'sel-cancel' }],
  };
}
