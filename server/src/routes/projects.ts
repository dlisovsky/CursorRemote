import path from "node:path";
import { Router } from "express";
import type { ProjectInfo } from "../../../shared/types.js";
import { config } from "../config.js";
import * as store from "../registry/store.js";
import * as orchestrator from "../sdk/orchestrator.js";
import type { AuthedRequest } from "../middleware.js";

function projectPath(projectId: string): string | null {
  return config.projectPaths().find((p) => Buffer.from(p).toString("base64url") === projectId) ?? null;
}

export const projectsRouter = Router();

projectsRouter.get("/", (req, res) => {
  const user = (req as AuthedRequest).user!;
  const projects: ProjectInfo[] = config.projectPaths().map((p) => ({
    id: Buffer.from(p).toString("base64url"),
    name: path.basename(p),
    path: p,
  }));

  res.json(
    projects.map((project) => ({
      ...project,
      agents: store.listAgents(user.telegramUserId, project.id),
    })),
  );
});

projectsRouter.post("/:projectId/agents", async (req, res) => {
  const user = (req as AuthedRequest).user!;
  const projectId = req.params.projectId!;
  const cwd = projectPath(projectId);
  if (!cwd) return res.status(404).json({ error: "project_not_found" });

  const title = String(req.body?.title ?? `Agent ${path.basename(cwd)}`);
  try {
    const agent = await orchestrator.createAgent({
      telegramUserId: user.telegramUserId,
      projectId,
      cwd,
      title,
    });
    res.status(201).json(agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ code: "agent_create_failed", message });
  }
});
