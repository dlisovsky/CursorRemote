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

  ws.onmessage = (msg) => {
    const event = JSON.parse(msg.data as string) as WireMessage;
    if (event.type === "replay") {
      for (const e of event.events) onEvent(e);
      return;
    }
    onEvent(event);
  };

  return () => ws.close();
}
