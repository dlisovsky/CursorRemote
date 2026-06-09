import path from "node:path";
import { Router } from "express";
import type { ProjectInfo } from "../../../shared/types.js";
import { config } from "../config.js";
import * as store from "../registry/store.js";
import * as orchestrator from "../sdk/orchestrator.js";
import { getIdeSessionMeta, listIdeSessions, loadIdeSession } from "../ide-transcripts.js";
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
    projects.map((project) => {
      const agents = store.listAgents(user.telegramUserId, project.id);
      const registered = new Set(
        agents.map((a) => a.cursorAgentId).filter((id): id is string => Boolean(id)),
      );
      const cwd = project.path;
      return {
        ...project,
        agents,
        ideSessions: listIdeSessions(cwd, registered),
      };
    }),
  );
});

projectsRouter.get("/:projectId/ide-sessions/:sessionId", (req, res) => {
  const cwd = projectPath(req.params.projectId!);
  if (!cwd) return res.status(404).json({ error: "project_not_found" });

  const sessionId = req.params.sessionId!;
  const meta = getIdeSessionMeta(cwd, sessionId);
  if (!meta) return res.status(404).json({ error: "not_found" });

  const lines = loadIdeSession(cwd, sessionId);
  if (!lines) return res.status(404).json({ error: "not_found" });

  res.json({
    sessionId,
    title: meta.title,
    subtitle: meta.subtitle,
    lines,
    messageCount: lines.length,
  });
});

projectsRouter.post("/:projectId/ide-sessions/:sessionId/resume", async (req, res) => {
  const user = (req as AuthedRequest).user!;
  const projectId = req.params.projectId!;
  const sessionId = req.params.sessionId!;
  const cwd = projectPath(projectId);
  if (!cwd) return res.status(404).json({ error: "project_not_found" });

  const cursorAgentId = sessionId.startsWith("agent-") ? sessionId : null;
  if (!cursorAgentId) {
    return res.status(400).json({
      code: "not_resumable",
      message: "This IDE chat has no SDK agent ID — view only.",
    });
  }

  const meta = getIdeSessionMeta(cwd, sessionId);
  const title = String(req.body?.title ?? "").trim() || meta?.title || "Imported agent";

  try {
    const agent = await orchestrator.importAgentFromCursor({
      telegramUserId: user.telegramUserId,
      projectId,
      cwd,
      title,
      cursorAgentId,
    });
    res.status(201).json(agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ code: "agent_create_failed", message });
  }
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
