import { Router } from "express";
import type { AuthedRequest } from "../middleware.js";
import * as orchestrator from "../sdk/orchestrator.js";
import * as store from "../registry/store.js";

function assertOwned(agentId: string, user: AuthedRequest["user"]) {
  const row = store.getAgentRow(agentId);
  if (!row || row.telegram_user_id !== user?.telegramUserId) return null;
  return store.getAgent(agentId);
}

export const agentsRouter = Router();

agentsRouter.get("/", (req, res) => {
  const user = (req as AuthedRequest).user!;
  res.json(store.listAgents(user.telegramUserId));
});

agentsRouter.get("/:id/history", (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  res.json({ events: store.listAgentHistory(agent.id) });
});

agentsRouter.get("/:id", (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  res.json({ ...agent, activeRunId: orchestrator.getActiveRunId(agent.id) });
});

agentsRouter.post("/:id/send", async (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "text_required" });
  try {
    res.json(await orchestrator.sendPrompt(agent.id, text));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ code: "run_error", message });
  }
});

agentsRouter.post("/:id/queue/:qid/force", async (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  try {
    res.json(await orchestrator.forceSendQueued(agent.id, req.params.qid!));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

agentsRouter.delete("/:id/queue/:qid", (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  orchestrator.cancelQueued(agent.id, req.params.qid!);
  res.status(204).end();
});

agentsRouter.post("/runs/:runId/cancel", async (req, res) => {
  const agentId = String(req.body?.agentId ?? "");
  const agent = assertOwned(agentId, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  await orchestrator.cancelRun(agent.id);
  res.status(204).end();
});

agentsRouter.delete("/:id", async (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  await orchestrator.closeAgent(agent.id);
  res.status(204).end();
});
