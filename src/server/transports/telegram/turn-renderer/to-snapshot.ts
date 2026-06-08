import type {
  AgentStatus,
  Approval,
  ChatElement,
  ComposerQueueState,
  Questionnaire,
} from '../../../types.js';
import type { TurnSnapshot } from './turn-state.js';

/** Structural shape shared by WindowSnapshot and CursorState for the fields we need. */
export interface SnapshotLike {
  agentStatus: AgentStatus;
  agentActivityText: string | null;
  agentActivityLive: boolean;
  messages: ChatElement[];
  pendingApprovals: Approval[];
  composerQueue: ComposerQueueState;
  questionnaire: Questionnaire | null;
  inputAvailable?: boolean;
}

/** Map a window/cursor snapshot into the pure-reducer input. */
export function toTurnSnapshot(s: SnapshotLike, at: number): TurnSnapshot {
  const inputAvailable = s.inputAvailable ?? (s.agentStatus === 'idle' && !s.agentActivityLive);
  return {
    agentStatus: s.agentStatus,
    agentActivityText: s.agentActivityText,
    agentActivityLive: s.agentActivityLive,
    messages: s.messages,
    pendingApprovals: s.pendingApprovals,
    composerQueue: s.composerQueue,
    questionnaire: s.questionnaire,
    inputAvailable,
    at,
  };
}
