import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issueJwt, validateInitData, verifyJwt } from "./auth.js";
import { config } from "./config.js";
import { attachUser, requireAuth } from "./middleware.js";
import { initRegistry, getAgentRow } from "./registry/store.js";
import { projectsRouter } from "./routes/projects.js";
import { agentsRouter } from "./routes/agents.js";
import * as orchestrator from "./sdk/orchestrator.js";
import * as bridge from "./sdk/stream-bridge.js";

initRegistry();
await orchestrator.startupReconcile();

const app = express();
app.use(express.json());
app.use(attachUser);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    projects: config.projectPaths().length,
    mockTelegram: config.mockTelegram,
  });
});

app.post("/auth/telegram", (req, res) => {
  const initData = String(req.body?.initData ?? "");
  const user = validateInitData(initData);
  if (!user) return res.status(401).json({ code: "auth_failed", message: "Invalid initData" });
  res.json({ token: issueJwt(user), userId: user.telegramUserId });
});

app.use("/projects", requireAuth, projectsRouter);
app.use("/agents", requireAuth, agentsRouter);

const tmaDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../tma/dist");
app.use(express.static(tmaDist));

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (!url.pathname.startsWith("/agents/") || !url.pathname.endsWith("/stream")) {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token");
  const user = token ? verifyJwt(token) : null;
  if (!user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const agentId = url.pathname.split("/")[2];
  const row = getAgentRow(agentId!);
  if (!row || row.telegram_user_id !== user.telegramUserId) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const lastSeq = Number(url.searchParams.get("lastSeq") ?? "0");
    bridge.subscribe(agentId!, ws, lastSeq);
    orchestrator.syncQueueToClient(agentId!);
    const activeRunId = orchestrator.getActiveRunId(agentId!);
    if (activeRunId) bridge.replayActiveRun(ws, activeRunId, lastSeq);
    wss.emit("connection", ws, req);
  });
});

server.listen(config.port, () => {
  const projects = config.projectPaths();
  console.log(`CursorRemote backend http://localhost:${config.port}`);
  console.log(`Cursor model: ${config.model.id}`);
  if (projects.length === 0) {
    console.warn("PROJECT_PATHS is empty — add comma-separated repo paths to .env");
  } else {
    console.log(`Projects (${projects.length}): ${projects.map((p) => path.basename(p)).join(", ")}`);
  }
  const publicUrl = process.env.PUBLIC_URL?.trim();
  if (publicUrl) console.log(`Public URL: ${publicUrl}`);
  if (config.mockTelegram) console.log("MOCK_TG=true — Chrome mock mode enabled");
});
