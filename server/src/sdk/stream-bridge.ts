import type { WebSocket } from "ws";
import type { WireMessage } from "../../../shared/types.js";
import * as store from "../registry/store.js";

type Subscriber = { ws: WebSocket; lastSeq: number };

const subscribersByAgent = new Map<string, Set<Subscriber>>();

export function subscribe(agentId: string, ws: WebSocket, lastSeq = 0): void {
  const sub: Subscriber = { ws, lastSeq };
  let set = subscribersByAgent.get(agentId);
  if (!set) {
    set = new Set();
    subscribersByAgent.set(agentId, set);
  }
  set.add(sub);

  ws.on("close", () => {
    set?.delete(sub);
    if (set?.size === 0) subscribersByAgent.delete(agentId);
  });
}

function send(ws: WebSocket, event: WireMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

export function fanOut(agentId: string, runId: string | null, event: WireMessage): number {
  const seq = runId ? store.appendRunEvent(runId, event) : 0;
  const set = subscribersByAgent.get(agentId);
  if (!set) return seq;
  for (const sub of set) {
    send(sub.ws, event);
    sub.lastSeq = seq;
  }
  return seq;
}

export function replayActiveRun(ws: WebSocket, runId: string, afterSeq: number): void {
  const events = store.listRunEvents(runId, afterSeq);
  if (events.length === 0) return;
  send(ws, {
    type: "replay",
    events: events.map((e) => e.event),
    lastSeq: events[events.length - 1]!.seq,
  });
}
