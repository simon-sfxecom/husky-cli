/**
 * RBAC Permission utilities for Husky CLI
 *
 * This module provides permission checking for CLI commands.
 * Permissions are fetched from the API and cached locally.
 */

import { getConfig, hasPermission, getRole, fetchAndCacheRole, clearRoleCache } from "../commands/config.js";
import { ExplainTopic } from "./error-hints.js";

// Agent roles (must match dashboard types.ts)
export type AgentRole =
  | "admin"
  | "supervisor"
  | "worker"
  | "reviewer"
  | "e2e_agent"
  | "pr_agent"
  | "support"
  | "devops";

/**
 * Check if current user has a specific permission.
 * Uses cached permissions from config.
 */
export function checkPermission(permission: string): boolean {
  return hasPermission(permission);
}

/**
 * Permission-specific hints for workers
 */
const workerPermissionHints: Record<string, string[]> = {
  "task:done": [
    "",
    "💡 As a worker, you cannot mark tasks as done directly.",
    "   Instead, submit your work for review:",
    "",
    "   1. Set the task to review status:",
    "      husky task update <id> --status review",
    "",
    "   2. Or notify the supervisor:",
    "      husky task message <id> -m \"Ready for review. PR: <url>\"",
    "",
    "   The supervisor will review your work and either forward it to",
    "   the review agent or get back to you with feedback.",
  ],
};

/**
 * Require a specific permission, exit with error if not granted.
 * Use this at the start of command handlers to enforce RBAC.
 */
export function requirePermission(permission: string): void {
  const config = getConfig();
  const role = config.role;

  if (!hasPermission(permission)) {
    console.error(`Error: Permission denied (${permission})`);
    if (role) {
      console.error(`Your role (${role}) does not have this permission.`);
    } else {
      console.error("Run 'husky config test' to refresh your role and permissions.");
    }

    // Show role-specific hints for certain permissions
    if (role === "worker" && workerPermissionHints[permission]) {
      for (const line of workerPermissionHints[permission]) {
        console.error(line);
      }
    } else {
      console.error(`\n💡 For configuration help: husky explain ${ExplainTopic.CONFIG}`);
    }
    process.exit(1);
  }
}

/**
 * Require one of several permissions.
 * Useful for commands that can be accessed by multiple permission types.
 */
export function requireAnyPermission(permissions: string[]): void {
  const hasAny = permissions.some((p) => hasPermission(p));
  if (!hasAny) {
    const config = getConfig();
    console.error(`Error: Permission denied`);
    console.error(`Required: one of [${permissions.join(", ")}]`);
    if (config.role) {
      console.error(`Your role (${config.role}) does not have these permissions.`);
    }
    console.error(`\n💡 For configuration help: husky explain ${ExplainTopic.CONFIG}`);
    process.exit(1);
  }
}

/**
 * Get the current agent role.
 * Returns undefined if role hasn't been fetched yet.
 */
export function getCurrentRole(): AgentRole | undefined {
  return getRole();
}

/**
 * Check if current agent has one of the specified roles.
 */
export function hasRole(...roles: AgentRole[]): boolean {
  const config = getConfig();
  return roles.includes(config.role as AgentRole);
}

/**
 * Require one of the specified roles, exit if not granted.
 */
export function requireRole(...roles: AgentRole[]): void {
  const config = getConfig();
  const currentRole = config.role as AgentRole | undefined;

  if (!currentRole || !roles.includes(currentRole)) {
    console.error(`Error: Role required: ${roles.join(" or ")}`);
    console.error(`Your role: ${currentRole || "not set"}`);
    process.exit(1);
  }
}

/**
 * Ensure permissions are loaded (fetches from API if needed).
 * Call this at CLI startup or before first permission check.
 */
export async function ensurePermissionsLoaded(): Promise<void> {
  await fetchAndCacheRole();
}

/**
 * Force refresh permissions from the API.
 * Clears the cache and fetches fresh permissions.
 */
export async function refreshPermissions(): Promise<void> {
  // Clear the cache timestamp to force a refresh
  clearRoleCache();
  // fetchAndCacheRole will now fetch fresh data
  await fetchAndCacheRole();
}

/**
 * Handle API response - refreshes permissions on 403 and shows error.
 * Use this when making API calls that might fail due to permission issues.
 *
 * @returns true if response is ok, false if handled error (exits on 403)
 */
export async function handleApiResponse(
  res: Response,
  operation: string
): Promise<boolean> {
  if (res.ok) return true;

  if (res.status === 403) {
    // Refresh permissions to get latest role info
    console.error(`Permission denied for: ${operation}`);
    console.error("Refreshing permissions...");
    await refreshPermissions();

    const config = getConfig();
    if (config.role) {
      console.error(`Your role (${config.role}) does not have permission for this operation.`);
      if (config.permissions) {
        console.error(`Current permissions: ${config.permissions.join(", ")}`);
      }
    } else {
      console.error("Could not determine your role. Check your API key.");
    }
    process.exit(1);
  }

  if (res.status === 401) {
    console.error("Authentication failed. Check your API key with: husky config test");
    process.exit(1);
  }

  // Return false for other errors to let caller handle
  return false;
}

/**
 * Role-based command group guards.
 * These can be used with commander's preAction hooks.
 */
export const guards = {
  /**
   * Guard for task:done permission
   */
  taskDone: () => requirePermission("task:done"),

  /**
   * Guard for task:start permission
   */
  taskStart: () => requirePermission("task:start"),

  /**
   * Guard for task:complete permission
   */
  taskComplete: () => requirePermission("task:complete"),

  /**
   * Guard for any biz permission
   */
  bizAccess: () => requireAnyPermission(["biz:tickets", "biz:orders", "biz:customers", "biz:*"]),

  /**
   * Guard for VM management
   */
  vmManage: () => requireAnyPermission(["vm:create", "vm:manage", "vm:*"]),

  /**
   * Guard for PR operations
   */
  prAccess: () => requireAnyPermission(["pr:create", "pr:merge", "pr:*"]),

  /**
   * Guard for deployment operations
   */
  deployAccess: () => requireAnyPermission(["deploy:preview", "deploy:sandbox", "deploy:*"]),

  /**
   * Guard for infrastructure operations (devops)
   */
  infraAccess: () => requireAnyPermission(["infra:monitor", "infra:update", "infra:*"]),

  /**
   * Guard for task:status permission
   */
  taskStatus: () => requirePermission("task:status"),
};
