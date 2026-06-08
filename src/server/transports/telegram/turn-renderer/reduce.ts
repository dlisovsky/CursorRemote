import type {
  ChatElement,
  ThoughtBlock,
  ToolCallElement,
  LoadingIndicator,
  AssistantMessage,
} from '../../../types.js';
import { findLastHumanIndexInTail, lastAssistantIdAfterHuman } from '../telegram-sync-filter.js';
import { formatElement } from '../formatter.js';
import {
  type TurnState,
  type TurnSnapshot,
  type TurnPhase,
  type ReduceOptions,
  DEFAULT_REDUCE_OPTIONS,
  isTerminalPhase,
} from './turn-state.js';

const NOOP_HASH = (s: string): string => s;

/** Elements that belong to the current turn (strictly after the last human row). */
function currentTurnElements(messages: ChatElement[]): ChatElement[] {
  const lastHumanIdx = findLastHumanIndexInTail(messages);
  return lastHumanIdx >= 0 ? messages.slice(lastHumanIdx + 1) : [];
}

function thoughtLine(t: ThoughtBlock): string {
  const prefix = t.thoughtKind === 'step_summary' ? '📎 ' : '';
  const body = (t.action || t.detail || 'Thinking').trim();
  return `${prefix}${body}`;
}

function toolLine(t: ToolCallElement): string {
  const icon = t.status === 'loading' ? '⏳' : '✓';
  const name = t.filename ? `${t.action} ${t.filename}` : t.action || t.details || 'Tool';
  let counts = '';
  if (typeof t.additions === 'number' || typeof t.deletions === 'number') {
    const add = t.additions ?? 0;
    const del = t.deletions ?? 0;
    counts = ` (+${add}/-${del})`;
  }
  return `${icon} ${name}${counts}`.trim();
}

function loadingLine(l: LoadingIndicator): string {
  return (l.text || 'Working').trim();
}

/** Build the rolling tail: the last N thinking / tool / loading lines of the current turn. */
function buildScrollTail(turnEls: ChatElement[], tailLength: number): string[] {
  const lines: string[] = [];
  for (const el of turnEls) {
    if (el.type === 'thought') lines.push(thoughtLine(el));
    else if (el.type === 'tool') lines.push(toolLine(el));
    else if (el.type === 'loading') lines.push(loadingLine(el));
  }
  return lines.slice(-tailLength);
}

function inFlightTool(turnEls: ChatElement[]): ToolCallElement | undefined {
  for (let i = turnEls.length - 1; i >= 0; i--) {
    const el = turnEls[i];
    if (el.type === 'tool' && el.status === 'loading') return el;
  }
  return undefined;
}

function latestAssistant(messages: ChatElement[]): AssistantMessage | undefined {
  const id = lastAssistantIdAfterHuman(messages);
  if (!id) return undefined;
  const el = messages.find(m => m.id === id && m.type === 'assistant');
  return el as AssistantMessage | undefined;
}

function activeQuestion(snapshot: TurnSnapshot): boolean {
  const q = snapshot.questionnaire;
  if (!q || !q.questions.length) return false;
  return q.questions.some(qq => qq.isActive) || q.activeIndex >= 0;
}

function statusLabelFor(phase: TurnPhase, snapshot: TurnSnapshot): string {
  const activity = snapshot.agentActivityText?.trim();
  if (activity) return activity;
  switch (phase) {
    case 'received': return 'Processing';
    case 'thinking': return 'Thinking';
    case 'running_tool': return 'Running tool';
    case 'answering': return 'Writing reply';
    case 'awaiting_question': return 'Waiting for your answer';
    case 'awaiting_approval': return 'Waiting for approval';
    case 'queued': return 'Queued';
    case 'done': return 'Done';
    case 'stopped': return 'Stopped';
    case 'error': return 'Error';
  }
}

/**
 * Pure reducer: (previous turn state, fresh snapshot) -> next turn state.
 *
 * Phase priority: error > approval > question > (done | queued | running_tool |
 * answering | thinking). Done-detection is debounced (A2): end-conditions must
 * hold for `doneStablePolls` consecutive snapshots. A turn that already ended
 * re-opens if activity resumes within `graceMs`.
 */
export function reduce(
  prev: TurnState,
  snapshot: TurnSnapshot,
  options: ReduceOptions = DEFAULT_REDUCE_OPTIONS,
): TurnState {
  const turnEls = currentTurnElements(snapshot.messages);
  const tool = inFlightTool(turnEls);
  const hasApproval = snapshot.pendingApprovals.length > 0;
  const hasQuestion = activeQuestion(snapshot);
  const hasQueue = snapshot.composerQueue?.items?.length > 0;
  const assistantNow = latestAssistant(snapshot.messages);
  const hasTurnContent = turnEls.length > 0 || assistantNow !== undefined;

  const softEndLike =
    snapshot.agentStatus === 'idle' &&
    !snapshot.agentActivityLive &&
    !tool &&
    !hasApproval &&
    !hasQuestion;

  const endLike = softEndLike && snapshot.inputAvailable;
  const endLikeWithAnswer = softEndLike && !snapshot.inputAvailable &&
    !!(prev.finalAnswerHtml?.trim() || (assistantNow && formatElement(assistantNow, NOOP_HASH).html?.trim()));

  const canFinalize = endLike || endLikeWithAnswer;

  const seenActivity = prev.seenActivity || !canFinalize || hasTurnContent;

  let idleStableCount = prev.idleStableCount;
  let phase: TurnPhase;

  if (snapshot.agentStatus === 'error') {
    phase = 'error';
    idleStableCount = 0;
  } else if (hasApproval) {
    phase = 'awaiting_approval';
    idleStableCount = 0;
  } else if (hasQuestion) {
    phase = 'awaiting_question';
    idleStableCount = 0;
  } else if (endLike) {
    if (hasQueue) {
      phase = 'queued';
      idleStableCount = 0;
    } else if (isTerminalPhase(prev.phase)) {
      // Already terminal and still quiet — stay terminal (no churn).
      phase = prev.phase;
    } else if (!seenActivity) {
      // Prompt just sent; DOM still idle. Hold in 'received' — don't finalize.
      phase = 'received';
      idleStableCount = 0;
    } else {
      idleStableCount = prev.idleStableCount + 1;
      const answerReady = !!(
        (assistantNow && formatElement(assistantNow, NOOP_HASH).html?.trim())
        || prev.finalAnswerHtml?.trim()
      );
      // With an answer captured, finalize after just 1 idle poll — the
      // debounce protects against transient idle blips between tool calls,
      // but once the reply is in, idle means done.
      const threshold = answerReady ? 1 : options.doneStablePolls;
      if (idleStableCount >= threshold) {
        phase = 'done';
      } else {
        phase = 'answering';
      }
    }
  } else {
    // Activity present.
    idleStableCount = 0;
    if (isTerminalPhase(prev.phase)) {
      const within = prev.endedAt !== undefined && snapshot.at - prev.endedAt <= options.graceMs;
      // Re-open the panel: a late tool/thought/answer arrived. (Outside grace,
      // the transport should already have started a fresh turn on a new human.)
      void within;
    }
    if (tool || snapshot.agentStatus === 'running_tool') phase = 'running_tool';
    else if (snapshot.agentStatus === 'generating') phase = 'answering';
    else phase = 'thinking';
  }

  const assistant = assistantNow;
  const next: TurnState = {
    threadId: prev.threadId,
    origin: prev.origin,
    promptText: prev.promptText,
    phase,
    pinned: {
      statusLabel: statusLabelFor(phase, snapshot),
      activeTool: tool ? toolLine(tool) : undefined,
    },
    scrollTail: buildScrollTail(turnEls, options.tailLength),
    question: hasQuestion ? snapshot.questionnaire : null,
    approvals: snapshot.pendingApprovals,
    queue: snapshot.composerQueue,
    idleStableCount,
    seenActivity,
    startedAt: prev.startedAt,
    endedAt: prev.endedAt,
  };

  if (assistant) {
    const formatted = formatElement(assistant, NOOP_HASH).html?.trim();
    if (formatted) {
      next.finalAnswerHtml = formatted;
      next.finalAnswerId = assistant.id;
    } else if (prev.finalAnswerId === assistant.id && prev.finalAnswerHtml) {
      // Keep the last non-empty streamed chunk if a late snapshot arrives empty.
      next.finalAnswerHtml = prev.finalAnswerHtml;
      next.finalAnswerId = prev.finalAnswerId;
    }
  } else if (isTerminalPhase(prev.phase) && prev.finalAnswerHtml && phase === prev.phase) {
    next.finalAnswerHtml = prev.finalAnswerHtml;
    next.finalAnswerId = prev.finalAnswerId;
  }

  if (isTerminalPhase(phase) && !isTerminalPhase(prev.phase)) {
    next.endedAt = snapshot.at;
  } else if (!isTerminalPhase(phase)) {
    next.endedAt = undefined;
  }

  return next;
}

/** Initial state for a freshly accepted prompt. */
export function initTurnState(
  threadId: number,
  origin: 'telegram' | 'mac',
  promptText: string,
  now: number,
): TurnState {
  return {
    threadId,
    origin,
    promptText,
    phase: 'received',
    pinned: { statusLabel: 'Processing' },
    scrollTail: [],
    question: null,
    approvals: [],
    queue: { items: [] },
    idleStableCount: 0,
    seenActivity: false,
    startedAt: now,
  };
}

/** Mark a turn as force-stopped by the user (cannot be derived from the DOM). */
export function markStopped(prev: TurnState, now: number): TurnState {
  return { ...prev, phase: 'stopped', endedAt: now, idleStableCount: 0 };
}
