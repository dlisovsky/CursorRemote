import type { ProjectsWireMessage, ProjectSnapshot } from "../../shared/types.js";
import { getToken } from "./auth.js";

export function connectProjectsStream(
  onSnapshot: (projects: ProjectSnapshot[]) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const token = getToken();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/projects/stream?token=${encodeURIComponent(token ?? "")}`;
  const ws = new WebSocket(url);
  let active = true;

  ws.onopen = () => onStatus?.(true);
  ws.onclose = () => onStatus?.(false);
  ws.onerror = () => onStatus?.(false);

  ws.onmessage = (msg) => {
    if (!active) return;
    const event = JSON.parse(msg.data as string) as ProjectsWireMessage;
    if (event.type === "projects_snapshot") onSnapshot(event.projects);
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
