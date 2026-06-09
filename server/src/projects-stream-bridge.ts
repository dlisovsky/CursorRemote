import type { WebSocket } from "ws";
import type { ProjectsWireMessage } from "../../shared/types.js";
import { buildProjectsSnapshot } from "./projects-snapshot.js";
import * as store from "./registry/store.js";

type Subscriber = { ws: WebSocket };

const subscribersByUser = new Map<number, Set<Subscriber>>();
const lastSnapshotJson = new Map<number, string>();
let idePollTimer: ReturnType<typeof setInterval> | null = null;

const IDE_POLL_MS = 3000;

function send(ws: WebSocket, event: ProjectsWireMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

function snapshotForUser(telegramUserId: number): ProjectsWireMessage {
  return { type: "projects_snapshot", projects: buildProjectsSnapshot(telegramUserId) };
}

function fanOutIfChanged(telegramUserId: number, force = false): void {
  const set = subscribersByUser.get(telegramUserId);
  if (!set?.size) return;

  const msg = snapshotForUser(telegramUserId);
  const json = JSON.stringify(msg);
  if (!force && lastSnapshotJson.get(telegramUserId) === json) return;
  lastSnapshotJson.set(telegramUserId, json);

  for (const sub of set) send(sub.ws, msg);
}

export function sendSnapshot(ws: WebSocket, telegramUserId: number): void {
  const msg = snapshotForUser(telegramUserId);
  lastSnapshotJson.set(telegramUserId, JSON.stringify(msg));
  send(ws, msg);
}

function syncIdePoller(): void {
  const hasSubs = subscribersByUser.size > 0;
  if (hasSubs && !idePollTimer) {
    idePollTimer = setInterval(() => {
      for (const userId of subscribersByUser.keys()) fanOutIfChanged(userId);
    }, IDE_POLL_MS);
  }
  if (!hasSubs && idePollTimer) {
    clearInterval(idePollTimer);
    idePollTimer = null;
  }
}

export function subscribe(telegramUserId: number, ws: WebSocket): void {
  const sub: Subscriber = { ws };
  let set = subscribersByUser.get(telegramUserId);
  if (!set) {
    set = new Set();
    subscribersByUser.set(telegramUserId, set);
  }
  set.add(sub);

  ws.on("close", () => {
    set?.delete(sub);
    if (set?.size === 0) {
      subscribersByUser.delete(telegramUserId);
      lastSnapshotJson.delete(telegramUserId);
    }
    syncIdePoller();
  });

  syncIdePoller();
}

/** Push projects list update to all WS clients for this user. */
export function notifyUser(telegramUserId: number): void {
  fanOutIfChanged(telegramUserId);
}

/** Push after agent-scoped change (status, activity). */
export function notifyAgent(agentId: string): void {
  const row = store.getAgentRow(agentId);
  if (!row) return;
  fanOutIfChanged(row.telegram_user_id);
}
