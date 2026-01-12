import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".husky");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// Agent roles for RBAC (must match dashboard types)
type AgentRole = "supervisor" | "worker" | "reviewer" | "e2e_agent" | "pr_agent" | "support";

interface Config {
  apiUrl?: string;
  apiKey?: string;
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
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Fetch role and permissions from /api/auth/whoami
 * Caches the result in config for 1 hour
 */
export async function fetchAndCacheRole(): Promise<{ role?: AgentRole; permissions?: string[] }> {
  const config = getConfig();

  // Check if we have cached role that's less than 1 hour old
  if (config.role && config.roleLastChecked) {
    const lastChecked = new Date(config.roleLastChecked);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (lastChecked > oneHourAgo) {
      return { role: config.role, permissions: config.permissions };
    }
  }

  // Fetch fresh role/permissions
  if (!config.apiUrl || !config.apiKey) {
    return {};
  }

  try {
    const url = new URL("/api/auth/whoami", config.apiUrl);
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": config.apiKey },
    });

    if (res.ok) {
      const data = await res.json();
      // Update config cache
      config.role = data.role;
      config.permissions = data.permissions;
      config.roleLastChecked = new Date().toISOString();
      saveConfig(config);
      return { role: data.role, permissions: data.permissions };
    }
  } catch {
    // Ignore fetch errors, return cached or empty
  }

  return { role: config.role, permissions: config.permissions };
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
 * Get current role from config (may be undefined if not fetched)
 */
export function getRole(): AgentRole | undefined {
  return getConfig().role;
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
      console.log("  Brain:    agent-type");
      process.exit(1);
    }

    // Validation for specific keys
    if (key === "api-url" || key === "billbee-base-url") {
      const validation = validateApiUrl(value);
      if (!validation.valid) {
        console.error(`Error: ${validation.error}`);
        process.exit(1);
      }
    }

    if (key === "agent-type") {
      const validTypes = ["support", "claude", "gotess", "supervisor", "worker"];
      if (!validTypes.includes(value)) {
        console.error(`Error: Invalid agent type. Must be one of: ${validTypes.join(", ")}`);
        process.exit(1);
      }
    }

    // Set the value
    (config as Record<string, string>)[configKey] = value;
    saveConfig(config);

    // Mask sensitive values in output
    const sensitiveKeys = ["api-key", "billbee-api-key", "billbee-password", "zendesk-api-token", "seatable-api-token", "gotess-token", "gemini-api-key", "nocodb-api-token"];
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
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }
    if (!config.apiKey) {
      console.error("Error: API key not configured. Run: husky config set api-key <key>");
      process.exit(1);
    }

    console.log("Testing API connection...");

    try {
      // First test basic connectivity with /api/tasks
      const tasksUrl = new URL("/api/tasks", config.apiUrl);
      const tasksRes = await fetch(tasksUrl.toString(), {
        headers: { "x-api-key": config.apiKey },
      });

      if (!tasksRes.ok) {
        if (tasksRes.status === 401) {
          console.error(`API connection failed: Unauthorized (HTTP 401)`);
          console.error("  Check your API key with: husky config set api-key <key>");
          process.exit(1);
        } else if (tasksRes.status === 403) {
          console.error(`API connection failed: Forbidden (HTTP 403)`);
          console.error("  Your API key may not have the required permissions");
          process.exit(1);
        } else {
          console.error(`API connection failed: HTTP ${tasksRes.status}`);
          process.exit(1);
        }
      }

      console.log(`API connection successful (API URL: ${config.apiUrl})`);

      // Now fetch role/permissions from whoami
      const whoamiUrl = new URL("/api/auth/whoami", config.apiUrl);
      const whoamiRes = await fetch(whoamiUrl.toString(), {
        headers: { "x-api-key": config.apiKey },
      });

      if (whoamiRes.ok) {
        const data = await whoamiRes.json();
        // Cache the role/permissions
        const updatedConfig = getConfig();
        updatedConfig.role = data.role;
        updatedConfig.permissions = data.permissions;
        updatedConfig.roleLastChecked = new Date().toISOString();
        saveConfig(updatedConfig);

        console.log(`\nRBAC Info:`);
        console.log(`  Role: ${data.role || "(not assigned)"}`);
        if (data.permissions && data.permissions.length > 0) {
          console.log(`  Permissions: ${data.permissions.join(", ")}`);
        }
        if (data.agentId) {
          console.log(`  Agent ID: ${data.agentId}`);
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        console.error(`API connection failed: Could not connect to ${config.apiUrl}`);
        console.error("  Check your API URL with: husky config set api-url <url>");
      } else {
        console.error(`API connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
      process.exit(1);
    }
  });
