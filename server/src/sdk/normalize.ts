import type { InteractionUpdate, SDKMessage } from "@cursor/sdk";
import type { RunStatus, WireMessage } from "../../../shared/types.js";

export function normalizeSdkMessage(runId: string, event: SDKMessage): WireMessage[] {
  switch (event.type) {
    case "assistant": {
      const text = event.message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      return [{ type: "assistant_delta", runId, text }];
    }
    case "tool_call":
      return [
        {
          type: "tool_call",
          runId,
          name: event.name,
          status: event.status,
          args: event.args,
          result: event.result,
        },
      ];
    case "thinking":
      return [{ type: "thinking", runId, duration: event.thinking_duration_ms }];
    case "status": {
      const statusMap: Record<string, RunStatus> = {
        RUNNING: "running",
        FINISHED: "finished",
        ERROR: "error",
        CANCELLED: "cancelled",
        CREATING: "running",
        EXPIRED: "error",
      };
      const mapped = statusMap[event.status] ?? "running";
      return [{ type: "run_status", runId, status: mapped }];
    }
    default:
      return [];
  }
}

export function normalizeDelta(runId: string, update: InteractionUpdate): WireMessage | null {
  if (update.type === "text-delta") {
    return { type: "assistant_delta", runId, text: update.text };
  }
  return null;
}
