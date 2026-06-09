import type { AgentInfo, AuthResponse, IdeSessionInfo, IdeTranscriptLine, SendResponse } from "../../shared/types.js";

export type AgentDetail = AgentInfo & { activeRunId?: string };
import { ensureAuth } from "./auth.js";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await ensureAuth();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface ProjectWithAgents {
  id: string;
  name: string;
  path: string;
  agents: AgentInfo[];
  ideSessions: IdeSessionInfo[];
}

export async function login(): Promise<AuthResponse> {
  const token = await ensureAuth();
  return { token, userId: 0 };
}

export function fetchProjects(): Promise<ProjectWithAgents[]> {
  return api("/projects");
}

export function fetchIdeSession(
  projectId: string,
  sessionId: string,
): Promise<{
  sessionId: string;
  title: string;
  subtitle: string;
  canResume: boolean;
  lines: IdeTranscriptLine[];
  messageCount: number;
}> {
  return api(`/projects/${projectId}/ide-sessions/${sessionId}`);
}

export function resumeIdeSession(projectId: string, sessionId: string): Promise<AgentInfo> {
  return api(`/projects/${projectId}/ide-sessions/${sessionId}/resume`, { method: "POST", body: "{}" });
}

export function createAgent(projectId: string, title?: string): Promise<AgentInfo> {
  return api(`/projects/${projectId}/agents`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function fetchAgent(agentId: string): Promise<AgentDetail> {
  return api(`/agents/${agentId}`);
}

export function fetchAgentHistory(agentId: string): Promise<{ events: import("../../shared/types.js").WireMessage[] }> {
  return api(`/agents/${agentId}/history`);
}

export interface OutgoingAttachment {
  name: string;
  mime: string;
  data: string;
}

export function sendPrompt(
  agentId: string,
  text: string,
  attachments?: OutgoingAttachment[],
): Promise<SendResponse> {
  return api(`/agents/${agentId}/send`, {
    method: "POST",
    body: JSON.stringify({ text, attachments: attachments ?? [] }),
  });
}

export function transcribeVoice(
  agentId: string,
  audio: string,
  mime: string,
): Promise<{ text: string; language: string; durationMs: number }> {
  return api(`/agents/${agentId}/transcribe`, {
    method: "POST",
    body: JSON.stringify({ audio, mime }),
  });
}

export function attachmentUrl(agentId: string, fileId: string): string {
  return `/agents/${agentId}/files/${fileId}`;
}

export function cancelRun(agentId: string, runId: string): Promise<void> {
  return api(`/agents/runs/${runId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ agentId }),
  });
}

export function cancelQueuedItem(agentId: string, queueId: string): Promise<void> {
  return api(`/agents/${agentId}/queue/${queueId}`, { method: "DELETE" });
}

export function forceSendQueued(agentId: string, queueId: string): Promise<SendResponse> {
  return api(`/agents/${agentId}/queue/${queueId}/force`, { method: "POST" });
}
