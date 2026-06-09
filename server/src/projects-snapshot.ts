import path from "node:path";
import type { ProjectChatRowSnapshot, ProjectSnapshot } from "../../shared/types.js";
import { getAgentActivity } from "./agent-activity.js";
import { config } from "./config.js";
import { listIdeSessions } from "./ide-transcripts.js";
import * as store from "./registry/store.js";

export function buildProjectsSnapshot(telegramUserId: number): ProjectSnapshot[] {
  return config.projectPaths().map((projectPath) => {
    const id = Buffer.from(projectPath).toString("base64url");
    const agents = store.listAgents(telegramUserId, id);
    const registered = new Set(
      agents.map((a) => a.cursorAgentId).filter((cursorId): cursorId is string => Boolean(cursorId)),
    );

    const rows: ProjectChatRowSnapshot[] = [
      ...agents.map(
        (agent): ProjectChatRowSnapshot => ({
          kind: "agent",
          id: agent.id,
          title: agent.title,
          sortAt: agent.lastActiveAt,
          status: agent.status,
          activity: getAgentActivity(agent.id),
        }),
      ),
      ...listIdeSessions(projectPath, registered).map(
        (session): ProjectChatRowSnapshot => ({
          kind: "ide",
          id: session.id,
          title: session.title,
          subtitle: session.subtitle,
          sortAt: session.updatedAt,
          updatedAt: session.updatedAt,
          canResume: session.canResume,
        }),
      ),
    ];

    rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt));

    return {
      id,
      name: path.basename(projectPath),
      chats: rows,
    };
  });
}
