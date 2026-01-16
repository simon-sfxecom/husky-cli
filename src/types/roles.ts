export const AGENT_ROLES = [
  "admin",
  "supervisor",
  "worker",
  "reviewer",
  "e2e_agent",
  "pr_agent",
  "support",
  "purchasing",
  "ops",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export function isValidAgentRole(role: string): role is AgentRole {
  return AGENT_ROLES.includes(role as AgentRole);
}
