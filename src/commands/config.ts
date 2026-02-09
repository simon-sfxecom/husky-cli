import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { ErrorHelpers, errorWithHint, ExplainTopic } from "../lib/error-hints.js";
import { getApiClient } from "../lib/api-client.js";
import { AGENT_ROLES, isValidAgentRole, type AgentRole } from "../types/roles.js";

// Re-export for backward compatibility
const VALID_ROLES = AGENT_ROLES;

const CONFIG_DIR = join(homedir(), ".husky");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Validate if a string is a valid AgentRole
 */
function isValidRole(role: string): role is AgentRole {
  return isValidAgentRole(role);
}

interface Config {
  apiUrl?: string;
  apiKey?: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
  sessionAgent?: string;
  sessionRole?: string;
  workerId?: string;
  workerName?: string;
  role?: AgentRole;
  permissions?: string[];
  roleLastChecked?: string;
  billbeeApiKey?: string;
  billbeeUsername?: string;
  billbeePassword?: string;
  billbeeBaseUrl?: string;
  zendeskSubdomain?: string;
  zendeskEmail?: string;
  zendeskApiToken?: string;
  seatableApiToken?: string;
  seatableServerUrl?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  gcpProjectId?: string;
  gcpLocation?: string;
  gotessToken?: string;
  gotessBookId?: string;
  agentType?: string;
  geminiApiKey?: string;
  nocodbApiToken?: string;
  nocodbBaseUrl?: string;
  nocodbWorkspaceId?: string;
  skuterzoneUsername?: string;
  skuterzonePassword?: string;
  skuterzoneBaseUrl?: string;
  emoveUsername?: string;
  emovePassword?: string;
  emoveBaseUrl?: string;
  wattizUsername?: string;
  wattizPassword?: string;
  wattizBaseUrl?: string;
  wattizLanguage?: string;
  gtasksSubject?: string;
  gcsBucket?: string;
  shopifyDomain?: string;
  shopifyToken?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  youtubeApiKey?: string;
  xBearerToken?: string;
}

// API Key validation - must be at least 16 characters, alphanumeric + common key chars (base64, JWT, etc.)
function validateApiKey(key: string): { valid: boolean; error?: string } {
  if (key.length < 16) {
    return { valid: false, error: "API key must be at least 16 characters long" };
  }
  // Allow: letters, numbers, dashes, underscores, dots, plus, slash, equals (base64/JWT compatible)
  if (!/^[a-zA-Z0-9_\-\.+/=]+$/.test(key)) {
    return { valid: false, error: "API key contains invalid characters" };
  }
  return { valid: true };
}

// URL validation
function validateApiUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "API URL must use http or https protocol" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

export function getConfig(): Config {
  try {
    let config: Config = {};
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      config = JSON.parse(content);
    }

    // Environment variable overrides (useful for testing)
    if (process.env.HUSKY_API_URL) {
      config.apiUrl = process.env.HUSKY_API_URL;
    }
    if (process.env.HUSKY_API_KEY) {
      config.apiKey = process.env.HUSKY_API_KEY;
    }

    return config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 }); // rwx------ for directory
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 }); // rw------- for file
  // Ensure permissions are set even if file existed
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Ignore chmod errors on Windows
  }
}

/**
 * Fetch role and permissions from /api/auth/whoami
 * Uses session token (Bearer) only.
 * Caches the result in config for 1 hour.
 */
export async function fetchAndCacheRole(): Promise<{ role?: AgentRole; permissions?: string[] }> {
  const config = getConfig();

  // Session token is the only supported auth mode for runtime requests.
  if (!config.sessionToken || !config.sessionRole || !config.sessionExpiresAt) {
    return {};
  }

  if (!isValidRole(config.sessionRole)) {
    return {};
  }

  const expiresAt = new Date(config.sessionExpiresAt);
  if (expiresAt <= new Date()) {
    return {};
  }

  // Check if we have cached role that's less than 5 minutes old
  // Short TTL ensures revoked permissions are detected quickly
  const PERMISSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  if (config.permissions && config.roleLastChecked) {
    const lastChecked = new Date(config.roleLastChecked);
    const cacheExpiry = new Date(Date.now() - PERMISSION_CACHE_TTL_MS);
    if (lastChecked > cacheExpiry) {
      return { role: config.sessionRole, permissions: config.permissions };
    }
  }

  // If API URL is unavailable, return the session role with cached permissions.
  if (!config.apiUrl) {
    return { role: config.sessionRole, permissions: config.permissions };
  }

  try {
    const api = getApiClient();
    const data = await api.get<{ role?: AgentRole; permissions?: string[] }>("/api/auth/whoami");
    // Keep sessionRole as source of truth; refresh permissions from whoami.
    config.permissions = data.permissions;
    config.roleLastChecked = new Date().toISOString();
    saveConfig(config);
    return { role: config.sessionRole, permissions: data.permissions };
  } catch {
    // Ignore fetch errors, return cached or empty
  }

  return { role: config.sessionRole, permissions: config.permissions };
}

/**
 * Check if current config has a specific permission
 */
export function hasPermission(permission: string): boolean {
  const config = getConfig();
  if (!config.permissions) return false;

  // Direct match
  if (config.permissions.includes(permission)) return true;

  // Wildcard match (e.g., "task:*" matches "task:read")
  const [resource] = permission.split(":");
  if (config.permissions.includes(`${resource}:*`)) return true;

  return false;
}

/**
 * Get current role from config.
 * Uses sessionRole (from auth login) when session is active.
 * Validates that the role is a known valid role before returning.
 */
export function getRole(): AgentRole | undefined {
  const config = getConfig();

  // Check if there's an active (non-expired) session
  if (config.sessionToken && config.sessionRole && config.sessionExpiresAt) {
    const expiresAt = new Date(config.sessionExpiresAt);
    if (expiresAt > new Date()) {
      // Session is active, validate and use session role
      if (isValidRole(config.sessionRole)) {
        return config.sessionRole;
      }
      // Invalid role in session - treat as no session
      console.error(`Warning: Invalid session role '${config.sessionRole}' in config`);
      return undefined;
    }
  }

  return undefined;
}

/**
 * Clear the role cache to force a refresh on next fetchAndCacheRole call
 */
export function clearRoleCache(): void {
  const config = getConfig();
  delete config.roleLastChecked;
  saveConfig(config);
}

// Helper to set a single config value (used by interactive mode and worker identity)
export function setConfig(key: "apiUrl" | "apiKey" | "workerId" | "workerName", value: string): void {
  const config = getConfig();
  config[key] = value;
  saveConfig(config);
}

export function setGotessConfig(token: string, bookId: string): void {
  const config = getConfig();
  config.gotessToken = token;
  config.gotessBookId = bookId;
  saveConfig(config);
}

export function setSessionConfig(session: {
  token: string;
  expiresAt: string;
  agent: string;
  role: string;
  permissions?: string[];  // Optional: if provided by API, store directly
}): void {
  const config = getConfig();
  config.sessionToken = session.token;
  config.sessionExpiresAt = session.expiresAt;
  config.sessionAgent = session.agent;
  config.sessionRole = session.role;
  // Clear old permissions and role cache to force re-fetch for new session role
  delete config.roleLastChecked;
  if (session.permissions) {
    // If permissions provided, use them directly
    config.permissions = session.permissions;
    config.roleLastChecked = new Date().toISOString();
  } else {
    // Clear permissions to force re-fetch
    delete config.permissions;
  }
  saveConfig(config);
}

export function clearSessionConfig(): void {
  const config = getConfig();
  delete config.sessionToken;
  delete config.sessionExpiresAt;
  delete config.sessionAgent;
  delete config.sessionRole;
  saveConfig(config);
}

/**
 * Check if there's an active (non-expired) session
 */
export function isSessionActive(): boolean {
  const config = getConfig();
  if (!config.sessionToken || !config.sessionExpiresAt) {
    return false;
  }
  const expiresAt = new Date(config.sessionExpiresAt);
  return expiresAt > new Date();
}

/**
 * Check if the API is properly configured for making requests.
 * Returns true if we have an API URL and an active session.
 */
export function isApiConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.apiUrl && isSessionActive());
}

/**
 * Get authentication headers for API requests.
 * Returns Bearer token if session is active.
 * Use this for all API calls to ensure consistent auth.
 */
export function getAuthHeaders(): Record<string, string> {
  const config = getConfig();

  // Check if there's an active (non-expired) session
  if (config.sessionToken && config.sessionExpiresAt) {
    const expiresAt = new Date(config.sessionExpiresAt);
    if (expiresAt > new Date()) {
      // Session is active - use Bearer token
      return { Authorization: `Bearer ${config.sessionToken}` };
    }
  }

  return {};
}

/**
 * Ensure the session is valid, refreshing if needed.
 * Returns true if session is active, false otherwise.
 */
export async function ensureValidSession(): Promise<boolean> {
  const config = getConfig();

  // No session at all
  if (!config.sessionToken || !config.sessionExpiresAt) {
    return false;
  }

  const expiresAt = new Date(config.sessionExpiresAt);
  const msLeft = expiresAt.getTime() - Date.now();

  // Refresh if expiring soon (5 min) to avoid 401 mid-command.
  const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
  const shouldRefresh = msLeft <= REFRESH_THRESHOLD_MS;
  if (!shouldRefresh) {
    return true;
  }

  if (!config.apiUrl) {
    // Can't refresh without API URL. If the token is already expired, fail.
    if (msLeft <= 0) {
      clearSessionConfig();
      return false;
    }
    return true;
  }

  try {
    const res = await fetch(new URL("/api/auth/refresh", config.apiUrl).toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.sessionToken}` },
    });

    if (!res.ok) {
      if (msLeft <= 0) {
        clearSessionConfig();
        return false;
      }
      // Keep the current token (it is still valid but close to expiry).
      return true;
    }

    const data = await res.json() as { token: string; expiresAt: string; role?: string; agent?: { id: string; name?: string; emoji?: string } };

    if (!data.token || !data.expiresAt) {
      if (msLeft <= 0) {
        clearSessionConfig();
        return false;
      }
      return true;
    }

    setSessionConfig({
      token: data.token,
      expiresAt: data.expiresAt,
      agent: data.agent?.id || config.sessionAgent || "unknown",
      role: data.role || config.sessionRole || "worker",
    });

    return true;
  } catch {
    if (msLeft <= 0) {
      clearSessionConfig();
      return false;
    }
    return true;
  }
}

export function getSessionConfig(): {
  token?: string;
  expiresAt?: string;
  agent?: string;
  role?: string;
} | null {
  const config = getConfig();
  if (!config.sessionToken) return null;
  return {
    token: config.sessionToken,
    expiresAt: config.sessionExpiresAt,
    agent: config.sessionAgent,
    role: config.sessionRole,
  };
}

export const configCommand = new Command("config")
  .description("Manage CLI configuration");

// husky config set <key> <value>
configCommand
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key, value) => {
    const config = getConfig();

    // Key mappings for kebab-case to camelCase
    const keyMappings: Record<string, keyof Config> = {
      "api-url": "apiUrl",
      "api-key": "apiKey",
      // Billbee
      "billbee-api-key": "billbeeApiKey",
      "billbee-username": "billbeeUsername",
      "billbee-password": "billbeePassword",
      "billbee-base-url": "billbeeBaseUrl",
      // Zendesk
      "zendesk-subdomain": "zendeskSubdomain",
      "zendesk-email": "zendeskEmail",
      "zendesk-api-token": "zendeskApiToken",
      // SeaTable
      "seatable-api-token": "seatableApiToken",
      "seatable-server-url": "seatableServerUrl",
      // Qdrant
      "qdrant-url": "qdrantUrl",
      "qdrant-api-key": "qdrantApiKey",
      // GCP
      "gcp-project-id": "gcpProjectId",
      "gcp-location": "gcpLocation",
      "gotess-token": "gotessToken",
      "gotess-book-id": "gotessBookId",
      "agent-type": "agentType",
      // Gemini
      "gemini-api-key": "geminiApiKey",
      // NocoDB
      "nocodb-api-token": "nocodbApiToken",
      "nocodb-base-url": "nocodbBaseUrl",
      "nocodb-workspace-id": "nocodbWorkspaceId",
      // Skuterzone
      "skuterzone-username": "skuterzoneUsername",
      "skuterzone-password": "skuterzonePassword",
      "skuterzone-base-url": "skuterzoneBaseUrl",
      // Emove Distribution
      "emove-username": "emoveUsername",
      "emove-password": "emovePassword",
      "emove-base-url": "emoveBaseUrl",
      // Wattiz
      "wattiz-username": "wattizUsername",
      "wattiz-password": "wattizPassword",
      "wattiz-base-url": "wattizBaseUrl",
      "wattiz-language": "wattizLanguage",
      "gtasks-subject": "gtasksSubject",
      "reddit-client-id": "redditClientId",
      "reddit-client-secret": "redditClientSecret",
      "youtube-api-key": "youtubeApiKey",
      "x-bearer-token": "xBearerToken",
    };

    const configKey = keyMappings[key];
    if (!configKey) {
      console.error(`Unknown config key: ${key}`);
      console.log("Available keys:");
      console.log("  Core:     api-url, api-key");
      console.log("  Billbee:  billbee-api-key, billbee-username, billbee-password, billbee-base-url");
      console.log("  Zendesk:  zendesk-subdomain, zendesk-email, zendesk-api-token");
      console.log("  SeaTable: seatable-api-token, seatable-server-url");
      console.log("  Qdrant:   qdrant-url, qdrant-api-key");
      console.log("  GCP:      gcp-project-id, gcp-location");
      console.log("  Gotess:   gotess-token, gotess-book-id");
      console.log("  Gemini:   gemini-api-key");
      console.log("  NocoDB:   nocodb-api-token, nocodb-base-url, nocodb-workspace-id");
      console.log("  Skuterzone: skuterzone-username, skuterzone-password, skuterzone-base-url");
      console.log("  Emove: emove-username, emove-password, emove-base-url");
      console.log("  Wattiz: wattiz-username, wattiz-password, wattiz-base-url, wattiz-language");
      console.log("  GTasks: gtasks-subject");
      console.log("  Research: reddit-client-id, reddit-client-secret, youtube-api-key, x-bearer-token");
      console.log("  Brain:    agent-type");
      console.error("\n💡 For configuration help: husky explain config");
      process.exit(1);
    }

    // Validation for specific keys
    if (key === "api-url" || key === "billbee-base-url") {
      const validation = validateApiUrl(value);
      if (!validation.valid) {
        errorWithHint(
          validation.error || "Invalid URL",
          ExplainTopic.CONFIG,
          "Learn about proper URL format"
        );
      }
    }

    if (key === "agent-type") {
      const validTypes = ["support", "claude", "gotess", "supervisor", "worker"];
      if (!validTypes.includes(value)) {
        errorWithHint(
          `Invalid agent type. Must be one of: ${validTypes.join(", ")}`,
          ExplainTopic.CONFIG,
          "See available configuration options"
        );
      }
    }

    // Set the value
    (config as Record<string, string>)[configKey] = value;
    saveConfig(config);

    // Mask sensitive values in output
    const sensitiveKeys = ["api-key", "billbee-api-key", "billbee-password", "zendesk-api-token", "seatable-api-token", "gotess-token", "gemini-api-key", "nocodb-api-token", "skuterzone-username", "skuterzone-password", "emove-username", "emove-password", "wattiz-username", "wattiz-password", "reddit-client-secret", "youtube-api-key", "x-bearer-token"];
    const displayValue = sensitiveKeys.includes(key) ? "***" : value;
    console.log(`✓ Set ${key} = ${displayValue}`);
  });

// husky config get <key>
configCommand
  .command("get <key>")
  .description("Get a configuration value")
  .action((key) => {
    const config = getConfig();

    if (key === "api-url") {
      console.log(config.apiUrl || "(not set)");
    } else if (key === "api-key") {
      console.log(config.apiKey ? "***" : "(not set)");
    } else {
      console.error(`Unknown config key: ${key}`);
      process.exit(1);
    }
  });

// husky config list
configCommand
  .command("list")
  .description("List all configuration")
  .action(() => {
    const config = getConfig();
    console.log("Configuration:");
    console.log(`  api-url: ${config.apiUrl || "(not set)"}`);
    console.log(`  api-key: ${config.apiKey ? "***" : "(not set)"}`);
  });

// husky config test
configCommand
  .command("test")
  .description("Test API connection with configured credentials")
  .action(async () => {
    const config = getConfig();

    // Check if configuration is complete
    if (!config.apiUrl) {
      ErrorHelpers.missingApiUrl();
    }
    if (!isSessionActive()) {
      console.error("No active session. Run: husky auth login --agent <name>");
      process.exit(1);
    }

    console.log("Testing API connection...");

    try {
      const api = getApiClient();

      // First test basic connectivity with /api/tasks
      await api.get("/api/tasks");

      console.log(`API connection successful (API URL: ${config.apiUrl})`);

      // Show session info and refresh permission cache from whoami.
      console.log(`\nSession Info:`);
      console.log(`  Agent: ${config.sessionAgent || "(unknown)"}`);
      console.log(`  Role: ${config.sessionRole || "(unknown)"}`);
      console.log(`  Expires: ${config.sessionExpiresAt ? new Date(config.sessionExpiresAt).toLocaleString() : "(unknown)"}`);

      try {
        const data = await api.get<{ role?: AgentRole; permissions?: string[]; agentId?: string }>("/api/auth/whoami");
        const updatedConfig = getConfig();
        updatedConfig.permissions = data.permissions;
        updatedConfig.roleLastChecked = new Date().toISOString();
        saveConfig(updatedConfig);

        console.log(`\nRBAC Info (Session):`);
        console.log(`  Role: ${data.role || config.sessionRole || "(unknown)"}`);
        if (data.permissions && data.permissions.length > 0) {
          console.log(`  Permissions: ${data.permissions.join(", ")}`);
        }
        if (data.agentId) {
          console.log(`  Agent ID: ${data.agentId}`);
        }
      } catch {
        // whoami failed, but tasks worked - connection is fine
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      if (errorMsg.includes("401")) {
        console.error(`API connection failed: Unauthorized (HTTP 401)`);
        console.error("  Session is missing or expired. Run: husky auth login --agent <name>");
        console.error("\n  For configuration help: husky explain config");
        process.exit(1);
      } else if (errorMsg.includes("403")) {
        console.error(`API connection failed: Forbidden (HTTP 403)`);
        console.error("  Your session role may not have the required permissions");
        console.error("\n  For configuration help: husky explain config");
        process.exit(1);
      } else if (error instanceof TypeError && errorMsg.includes("fetch")) {
        console.error(`API connection failed: Could not connect to ${config.apiUrl}`);
        console.error("  Check your API URL with: husky config set api-url <url>");
        console.error("\n  For configuration help: husky explain config");
      } else {
        console.error(`API connection failed: ${errorMsg}`);
        console.error("\n  For configuration help: husky explain config");
      }
      process.exit(1);
    }
  });
