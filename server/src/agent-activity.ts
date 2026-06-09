/** In-memory activity labels for running SDK agents (projects list subtitle). */

const activityByAgent = new Map<string, string>();

export function setAgentActivity(agentId: string, label: string | null): void {
  if (label) activityByAgent.set(agentId, label);
  else activityByAgent.delete(agentId);
}

export function getAgentActivity(agentId: string): string | undefined {
  return activityByAgent.get(agentId);
}
