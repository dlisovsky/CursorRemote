/** Shared wire protocol between TMA and backend. */

/** Default Cursor agent model for all SDK sessions. */
export const DEFAULT_CURSOR_MODEL = "composer-2.5" as const;

export const MOCK_TG_USER_ID = 999_000_001;
export const MOCK_TG_USERNAME = "mock_dev";

/** Fake initData payload shape for Chrome dev (server accepts when MOCK_TG=true). */
export const MOCK_INIT_DATA = `user=${encodeURIComponent(
  JSON.stringify({ id: MOCK_TG_USER_ID, username: MOCK_TG_USERNAME }),
)}&auth_date=${Math.floor(Date.now() / 1000)}&hash=mock`;

export type AgentStatus = "idle" | "running" | "error" | "stale";

export type RunStatus = "pending" | "running" | "finished" | "error" | "cancelled";

export type WireErrorCode =
  | "auth_failed"
  | "agent_create_failed"
  | "agent_stale"
  | "run_error"
  | "run_cancelled"
  | "not_found"
  | "internal";

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
}

export interface AgentInfo {
  id: string;
  projectId: string;
  cursorAgentId: string | null;
  title: string;
  status: AgentStatus;
  lastActiveAt: string;
  createdAt: string;
}

/** Cursor IDE Composer chat discovered from ~/.cursor/projects/.../agent-transcripts/. */
export interface IdeSessionInfo {
  id: string;
  /** Cursor Composer sidebar title (composer.composerHeaders). */
  title: string;
  /** Cursor Composer subtitle — last activity summary. */
  subtitle: string;
  updatedAt: string;
  linkedCursorAgentId: string | null;
  source: "cursor_ide";
  /** True when session maps to an SDK agent ID and can be imported for remote chat. */
  canResume: boolean;
}

export interface IdeTranscriptLine {
  role: "user" | "assistant";
  text: string;
  tools?: { name: string; summary: string }[];
}

export interface QueueItem {
  id: string;
  text: string;
  position: number;
}

export interface UserAttachmentMeta {
  id: string;
  name: string;
  mime: string;
  path: string;
}

export type WireMessage =
  | { type: "user_message"; runId: string; text: string; queued?: boolean; images?: UserAttachmentMeta[] }
  | { type: "assistant_delta"; runId: string; text: string }
  | { type: "assistant_complete"; runId: string; text: string }
  | { type: "thinking"; runId: string; duration?: number }
  | {
      type: "tool_call";
      runId: string;
      name: string;
      status: "running" | "completed" | "error";
      args?: unknown;
      result?: unknown;
    }
  | { type: "run_status"; runId: string; status: RunStatus }
  | { type: "queue_update"; items: QueueItem[] }
  | { type: "error"; code: WireErrorCode; message: string; runId?: string }
  | { type: "replay"; events: WireMessage[]; lastSeq: number };

export interface AuthResponse {
  token: string;
  userId: number;
}

export interface SendResponse {
  runId: string;
  queued?: boolean;
  queueId?: string;
}
