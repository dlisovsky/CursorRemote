import type { ProjectChatRowSnapshot, ProjectSnapshot } from "../../../shared/types.js";
import type { ProjectWithAgents } from "../api.js";
import { mergeProjectChats } from "./sessionList.js";

export function projectsToSnapshots(projects: ProjectWithAgents[]): ProjectSnapshot[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    chats: mergeProjectChats(project.agents, project.ideSessions ?? []).map(
      (row): ProjectChatRowSnapshot =>
        row.kind === "agent"
          ? {
              kind: "agent",
              id: row.agent.id,
              title: row.title,
              sortAt: row.sortAt,
              status: row.agent.status,
            }
          : {
              kind: "ide",
              id: row.session.id,
              title: row.title,
              subtitle: row.session.subtitle,
              sortAt: row.sortAt,
              updatedAt: row.session.updatedAt,
              canResume: row.canResume,
            },
    ),
  }));
}
