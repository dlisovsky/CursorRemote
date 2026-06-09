import type { AgentInfo, IdeSessionInfo } from "../../../shared/types.js";

export type ProjectChatRow =
  | { kind: "agent"; id: string; title: string; sortAt: string; agent: AgentInfo }
  | {
      kind: "ide";
      id: string;
      title: string;
      sortAt: string;
      session: IdeSessionInfo;
      canResume: boolean;
    };

export function mergeProjectChats(agents: AgentInfo[], ideSessions: IdeSessionInfo[] = []): ProjectChatRow[] {
  const rows: ProjectChatRow[] = [
    ...agents.map((agent) => ({
      kind: "agent" as const,
      id: agent.id,
      title: agent.title,
      sortAt: agent.lastActiveAt,
      agent,
    })),
    ...ideSessions.map((session) => ({
      kind: "ide" as const,
      id: session.id,
      title: session.title,
      sortAt: session.updatedAt,
      session,
      canResume: session.canResume,
    })),
  ];
  return rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
}
