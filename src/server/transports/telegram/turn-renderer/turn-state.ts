import type {
  AgentStatus,
  Approval,
  ChatElement,
  ComposerQueueState,
  Questionnaire,
} from '../../../types.js';

/**
 * One agent turn, rendered as a single self-updating Telegram message.
 *
 *   prompt arrives ──► live panel (reply to anchor) ──► edits ──► final answer
 *
 * The phase drives both the pinned header and the inline keyboard. See the
 * design doc (Eng Review A2) for the debounced done-detection contract.
 */
export type TurnPhase =
  | 'received'        // prompt accepted, nothing streamed yet
  | 'thinking'        // agent thinking / generating
  | 'running_tool'    // a tool is in flight
  | 'awaiting_question' // questionnaire widget is active
  | 'awaiting_approval' // pendingApprovals present
  | 'queued'          // prompts queued in composer toolbar, agent idle
  | 'answering'       // assistant reply streaming in
  | 'done'            // turn complete, final answer shown
  | 'stopped'         // user forced stop
  | 'error';          // agent error

export interface PinnedHeader {
  /** Short status label, e.g. "Thinking", "Running tool", current activity text. */
  statusLabel: string;
  /** One-line summary of the in-flight tool, when running_tool. */
  activeTool?: string;
}

/**
 * Pure reducer input. Built from CursorState (home window) or an extended
 * WindowSnapshot (background windows) at wiring time. Kept decoupled from the
 * monitor types so the reducer stays trivially testable.
 */
export interface TurnSnapshot {
  agentStatus: AgentStatus;
  agentActivityText: string | null;
  agentActivityLive: boolean;
  messages: ChatElement[];
  pendingApprovals: Approval[];
  composerQueue: ComposerQueueState;
  questionnaire: Questionnaire | null;
  /** Composer accepts input (agent not busy). */
  inputAvailable: boolean;
  /** Monotonic-ish timestamp of this snapshot (ms since epoch). */
  at: number;
}

export interface TurnState {
  threadId: number;
  origin: 'telegram' | 'mac';
  /** The prompt that started this turn (for the anchor message / context). */
  promptText: string;
  phase: TurnPhase;
  pinned: PinnedHeader;
  /** Rolling window of the most recent thinking / tool lines (last N visible). */
  scrollTail: string[];
  /** Active questionnaire mirrored from Cursor, or null. */
  question: Questionnaire | null;
  /** Pending approvals mirrored from Cursor. */
  approvals: Approval[];
  /** Queued composer prompts mirrored from Cursor. */
  queue: ComposerQueueState;
  /** Final assistant answer HTML for this turn; set when phase === 'done'. */
  finalAnswerHtml?: string;
  /** Id of the assistant element used for the final answer (dedup / change detection). */
  finalAnswerId?: string;

  // ── A2 done-detection bookkeeping (carried across reduce calls) ──
  /** Consecutive snapshots where end-conditions held. */
  idleStableCount: number;
  /** True once the turn has shown any activity — gates done so a just-sent
   *  prompt (still idle in the DOM) cannot be finalized prematurely. */
  seenActivity: boolean;
  startedAt: number;
  /** Set when the turn first reached a terminal phase. */
  endedAt?: number;
}

export interface ReduceOptions {
  /** Max lines kept in the scrolling tail. */
  tailLength: number;
  /** Consecutive stable polls required before declaring 'done'. */
  doneStablePolls: number;
  /** After done, re-open the same panel if activity resumes within this window. */
  graceMs: number;
}

export const DEFAULT_REDUCE_OPTIONS: ReduceOptions = {
  tailLength: 8,
  doneStablePolls: 2,
  graceMs: 4000,
};

export function isTerminalPhase(phase: TurnPhase): boolean {
  return phase === 'done' || phase === 'stopped' || phase === 'error';
}
