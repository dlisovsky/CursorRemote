import type { AgentStatus, RunStatus } from "../../shared/types.js";

export function agentStatusColor(status: AgentStatus): string {
  switch (status) {
    case "running":
      return "blue";
    case "error":
      return "red";
    case "stale":
      return "orange";
    default:
      return "gray";
  }
}

export function runStatusLabel(status: RunStatus | AgentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
