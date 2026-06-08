export type ChatItem =
  | { kind: "user"; id: string; text: string; queued?: boolean }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean; cancelled?: boolean }
  | {
      kind: "tool";
      id: string;
      runId: string;
      name: string;
      status: "running" | "completed" | "error";
      detail?: string;
    }
  | { kind: "thinking"; id: string; label: string }
  | { kind: "system"; id: string; text: string };

export function toolDetail(args?: unknown): string | undefined {
  if (args && typeof args === "object" && args !== null && "path" in args) {
    const path = (args as { path?: unknown }).path;
    if (typeof path === "string" && path) return path;
  }
  return undefined;
}
