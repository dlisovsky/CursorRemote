import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { AgentInfo, AgentStatus, RunStatus, WireMessage } from "../../../shared/types.js";
import { config } from "../config.js";

const schema = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql"),
  "utf8",
);

export interface AgentRow {
  id: string;
  telegram_user_id: number;
  project_id: string;
  cursor_agent_id: string | null;
  cwd: string;
  title: string;
  status: AgentStatus;
  created_at: string;
  last_active_at: string;
}

let db: DatabaseSync;

export function initRegistry(): void {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(schema);
  db.prepare("DELETE FROM run_events WHERE created_at < datetime('now', '-7 days')").run();
}

function rowToAgent(row: AgentRow): AgentInfo {
  return {
    id: row.id,
    projectId: row.project_id,
    cursorAgentId: row.cursor_agent_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

export function createAgent(input: {
  id: string;
  telegramUserId: number;
  projectId: string;
  cwd: string;
  title: string;
  cursorAgentId?: string;
}): AgentInfo {
  db.prepare(
    `INSERT INTO agents (id, telegram_user_id, project_id, cwd, title, cursor_agent_id)
     VALUES ($id, $telegramUserId, $projectId, $cwd, $title, $cursorAgentId)`,
  ).run({
    id: input.id,
    telegramUserId: input.telegramUserId,
    projectId: input.projectId,
    cwd: input.cwd,
    title: input.title,
    cursorAgentId: input.cursorAgentId ?? null,
  });
  return getAgent(input.id)!;
}

export function findAgentByCursorAgentId(
  telegramUserId: number,
  cursorAgentId: string,
): AgentInfo | null {
  const row = asRows<AgentRow>(
    db
      .prepare(
        `SELECT * FROM agents WHERE telegram_user_id = ? AND cursor_agent_id = ? AND archived_at IS NULL LIMIT 1`,
      )
      .all(telegramUserId, cursorAgentId),
  )[0];
  return row ? rowToAgent(row) : null;
}

export function getAgent(id: string): AgentInfo | null {
  const row = getAgentRow(id);
  return row ? rowToAgent(row) : null;
}

function asRow<T>(row: Record<string, unknown> | undefined): T | null {
  return (row as T | undefined) ?? null;
}

function asRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows as T[];
}

export function getAgentRow(id: string): AgentRow | null {
  return asRow<AgentRow>(
    db.prepare("SELECT * FROM agents WHERE id = ? AND archived_at IS NULL").get(id),
  );
}

export function listAllAgentsForReconcile(): { id: string; cursorAgentId: string | null; cwd: string }[] {
  const rows = db
    .prepare(
      `SELECT id, cursor_agent_id, cwd FROM agents WHERE archived_at IS NULL AND cursor_agent_id IS NOT NULL`,
    )
    .all() as unknown as { id: string; cursor_agent_id: string | null; cwd: string }[];
  return rows.map((r) => ({ id: r.id, cursorAgentId: r.cursor_agent_id, cwd: r.cwd }));
}

export function listAgents(telegramUserId: number, projectId?: string): AgentInfo[] {
  const rows = projectId
    ? asRows<AgentRow>(
        db
          .prepare(
            `SELECT * FROM agents WHERE telegram_user_id = ? AND project_id = ? AND archived_at IS NULL
           ORDER BY last_active_at DESC`,
          )
          .all(telegramUserId, projectId),
      )
    : asRows<AgentRow>(
        db
          .prepare(
            `SELECT * FROM agents WHERE telegram_user_id = ? AND archived_at IS NULL
           ORDER BY last_active_at DESC`,
          )
          .all(telegramUserId),
      );
  return rows.map(rowToAgent);
}

export function updateAgentStatus(id: string, status: AgentStatus, cursorAgentId?: string): void {
  if (cursorAgentId) {
    db.prepare(
      `UPDATE agents SET status = ?, cursor_agent_id = ?, last_active_at = datetime('now') WHERE id = ?`,
    ).run(status, cursorAgentId, id);
  } else {
    db.prepare(`UPDATE agents SET status = ?, last_active_at = datetime('now') WHERE id = ?`).run(
      status,
      id,
    );
  }
}

export function archiveAgent(id: string): void {
  db.prepare(`UPDATE agents SET archived_at = datetime('now'), status = 'idle' WHERE id = ?`).run(id);
}

export function getAgentCwd(id: string): string | null {
  const row = db.prepare("SELECT cwd FROM agents WHERE id = ?").get(id) as { cwd: string } | undefined;
  return row?.cwd ?? null;
}

export function createRun(input: {
  id: string;
  agentId: string;
  cursorRunId?: string;
  requestId?: string;
}): void {
  db.prepare(
    `INSERT INTO runs (id, agent_id, cursor_run_id, request_id, status) VALUES (?, ?, ?, ?, 'running')`,
  ).run(input.id, input.agentId, input.cursorRunId ?? null, input.requestId ?? null);
}

export function finishRun(id: string, status: RunStatus): void {
  db.prepare(`UPDATE runs SET status = ?, finished_at = datetime('now') WHERE id = ?`).run(status, id);
}

export function appendRunEvent(runId: string, event: WireMessage): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM run_events WHERE run_id = ?")
    .get(runId) as { max_seq: number };
  const seq = row.max_seq + 1;
  db.prepare(`INSERT INTO run_events (run_id, seq, event_json) VALUES (?, ?, ?)`).run(
    runId,
    seq,
    JSON.stringify(event),
  );
  return seq;
}

export function listRunEvents(runId: string, afterSeq = 0, limit = 200): { seq: number; event: WireMessage }[] {
  const rows = db
    .prepare(
      `SELECT seq, event_json FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
    )
    .all(runId, afterSeq, limit) as { seq: number; event_json: string }[];
  return rows.map((r) => ({ seq: r.seq, event: JSON.parse(r.event_json) as WireMessage }));
}

export function listAgentHistory(agentId: string, limit = 400): WireMessage[] {
  const rows = db
    .prepare(
      `SELECT re.event_json FROM run_events re
       INNER JOIN runs r ON r.id = re.run_id
       WHERE r.agent_id = ?
       ORDER BY r.started_at ASC, re.seq ASC
       LIMIT ?`,
    )
    .all(agentId, limit) as { event_json: string }[];
  return rows.map((r) => JSON.parse(r.event_json) as WireMessage);
}
