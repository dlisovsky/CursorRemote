import type { WireMessage } from "../../shared/types.js";
import { getToken } from "./auth.js";

export function connectAgentStream(
  agentId: string,
  onEvent: (event: WireMessage) => void,
  lastSeq = 0,
): () => void {
  const token = getToken();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/agents/${agentId}/stream?token=${encodeURIComponent(token ?? "")}&lastSeq=${lastSeq}`;
  const ws = new WebSocket(url);
  let active = true;

  ws.onmessage = (msg) => {
    if (!active) return;
    const event = JSON.parse(msg.data as string) as WireMessage;
    if (event.type === "replay") {
      for (const e of event.events) onEvent(e);
      return;
    }
    onEvent(event);
  };

  return () => {
    active = false;
    ws.onmessage = null;
    if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", () => ws.close(), { once: true });
    } else {
      ws.close();
    }
  };
}
