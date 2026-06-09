import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { AuthedRequest } from "../middleware.js";
import * as orchestrator from "../sdk/orchestrator.js";
import * as store from "../registry/store.js";
import { config } from "../config.js";
import { resolveAttachmentPath } from "../media/attachments.js";
import { transcribeAudioFile } from "../media/transcribe.js";

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
  const text = String(req.body?.text ?? "");
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  if (!text.trim() && attachments.length === 0) {
    return res.status(400).json({ error: "text_required" });
  }
  try {
    res.json(await orchestrator.sendPrompt(agent.id, { text, attachments }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ code: "run_error", message });
  }
});

agentsRouter.post("/:id/transcribe", async (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });
  if (!config.transcribe.enabled) {
    return res.status(503).json({ error: "voice_disabled" });
  }

  const data = String(req.body?.audio ?? "");
  const mime = String(req.body?.mime ?? "audio/webm");
  if (!data) return res.status(400).json({ error: "audio_required" });

  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const tempPath = path.join(config.uploadDir, `${agent.id}-${Date.now()}.${ext}`);

  try {
    fs.writeFileSync(tempPath, Buffer.from(data, "base64"));
    const result = await transcribeAudioFile(tempPath);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ code: "transcribe_error", message });
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  }
});

agentsRouter.get("/:id/files/:fileId", (req, res) => {
  const agent = assertOwned(req.params.id!, (req as AuthedRequest).user);
  if (!agent) return res.status(404).json({ error: "not_found" });

  const cwd = store.getAgentCwd(agent.id);
  if (!cwd) return res.status(404).json({ error: "not_found" });

  const fileId = req.params.fileId!;
  const inbox = path.join(cwd, ".cursor-remote/inbox");
  if (!fs.existsSync(inbox)) return res.status(404).json({ error: "not_found" });

  const match = fs.readdirSync(inbox).find((name) => name.startsWith(`${fileId}-`));
  if (!match) return res.status(404).json({ error: "not_found" });

  const relative = path.join(".cursor-remote/inbox", match);
  const absolute = resolveAttachmentPath(cwd, relative);
  if (!absolute) return res.status(404).json({ error: "not_found" });

  res.sendFile(absolute);
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
