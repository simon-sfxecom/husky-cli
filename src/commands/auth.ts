import { Command } from "commander";
import { getConfig, setSessionConfig, clearSessionConfig, getSessionConfig, fetchAndCacheRole } from "./config.js";
import {
  getPermissions,
  clearPermissionsCache,
  getCacheStatus,
  hasPermission,
  canAccessKnowledgeBase
} from "../lib/permissions-cache.js";
import { getApiClient } from "../lib/api-client.js";

interface SessionAgent {
  id: string;
  name: string;
  emoji?: string;
}

interface SessionResponse {
  token: string;
  expiresAt: string;
  role: string;
  agent: SessionAgent;
}

const API_KEY_ROLES = [
  "admin", "supervisor", "worker", "reviewer", "support",
  "purchasing", "ops", "e2e_agent", "pr_agent"
] as const;

/**
 * Fetch VM Identity Token from GCP Metadata Server
 * This token is cryptographically signed by Google and proves the caller is running on a specific GCP VM.
 * Returns null if not running on GCP or metadata server is unavailable.
 *
 * Note: format=full is required to include google.compute_engine claims (instance_name, project_id, etc.)
 */
async function getVMIdentityToken(audience: string = "husky-api"): Promise<string | null> {
  try {
    const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${audience}&format=full`;
    const res = await fetch(url, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (res.ok) {
      return (await res.text()).trim();
    }
  } catch {
    // Not on GCP or metadata server unavailable - this is expected for local development
  }
  return null;
}

type ApiKeyRole = typeof API_KEY_ROLES[number];

interface ApiKeyListItem {
  id: string;
  keyPrefix: string;
  name: string;
  role: ApiKeyRole;
  scopes?: string[];
  createdBy: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revoked: boolean;
  createdAt: string;
}

interface CreateApiKeyResponse {
  id: string;
  keyPrefix: string;
  name: string;
  role: ApiKeyRole;
  plainTextKey: string;
  expiresAt?: string;
  createdAt: string;
  warning: string;
}

export const authCommand = new Command("auth")
  .description("Manage API keys and authentication");

authCommand
  .command("keys")
  .description("List all API keys")
  .option("--include-revoked", "Include revoked keys")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const api = getApiClient();
      const query = options.includeRevoked ? "?includeRevoked=true" : "";
      const data = await api.get<{ keys: ApiKeyListItem[] }>(`/api/auth/keys${query}`);

      if (options.json) {
        console.log(JSON.stringify(data.keys, null, 2));
        return;
      }

      if (data.keys.length === 0) {
        console.log("No API keys found.");
        return;
      }

      console.log("\nAPI Keys:");
      console.log("─".repeat(80));
      for (const key of data.keys) {
        const status = key.revoked ? "🔴 REVOKED" : "🟢 ACTIVE";
        const expires = key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "Never";
        const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never";
        
        console.log(`${status} ${key.keyPrefix}...  ${key.name}`);
        console.log(`   Role: ${key.role}  |  Expires: ${expires}  |  Last used: ${lastUsed}`);
        console.log(`   ID: ${key.id}`);
        console.log("");
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("create-key")
  .description("Create a new API key")
  .requiredOption("--name <name>", "Human-readable name for the key")
  .requiredOption("--role <role>", `Role: ${API_KEY_ROLES.join(", ")}`)
  .option("--scopes <scopes>", "Comma-separated additional scopes")
  .option("--expires-in-days <days>", "Expiration in days (1-365)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      if (!API_KEY_ROLES.includes(options.role)) {
        console.error(`Invalid role: ${options.role}`);
        console.error(`Valid roles: ${API_KEY_ROLES.join(", ")}`);
        process.exit(1);
      }

      const body: Record<string, unknown> = {
        name: options.name,
        role: options.role,
      };

      if (options.scopes) {
        body.scopes = options.scopes.split(",").map((s: string) => s.trim());
      }

      if (options.expiresInDays) {
        const days = parseInt(options.expiresInDays, 10);
        if (isNaN(days) || days < 1 || days > 365) {
          console.error("--expires-in-days must be between 1 and 365");
          process.exit(1);
        }
        body.expiresInDays = days;
      }

      const api = getApiClient();
      const result = await api.post<CreateApiKeyResponse>("/api/auth/keys", body);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log("\n✅ API Key Created Successfully");
      console.log("─".repeat(60));
      console.log(`Name:      ${result.name}`);
      console.log(`Role:      ${result.role}`);
      console.log(`Key ID:    ${result.id}`);
      console.log(`Prefix:    ${result.keyPrefix}`);
      if (result.expiresAt) {
        console.log(`Expires:   ${new Date(result.expiresAt).toLocaleDateString()}`);
      }
      console.log("");
      console.log("🔑 API KEY (store securely - shown only once):");
      console.log("");
      console.log(`   ${result.plainTextKey}`);
      console.log("");
      console.log("⚠️  " + result.warning);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("revoke-key <id>")
  .description("Revoke an API key")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    try {
      const api = getApiClient();
      const result = await api.delete<{ success: boolean; id: string; keyPrefix: string; revokedAt: string }>(
        `/api/auth/keys/${id}`
      );

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n✅ API Key Revoked: ${result.keyPrefix}...`);
      console.log(`   Revoked at: ${new Date(result.revokedAt).toLocaleString()}`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("whoami")
  .description("Show current authentication info")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const api = getApiClient();
      const data = await api.get<{
        role: string;
        permissions: string[];
        scopes?: string[];
        keyId?: string;
        source: string;
        agent?: string;
      }>("/api/auth/whoami");

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log("\n🔐 Authentication Info");
      console.log("─".repeat(40));
      console.log(`Role:       ${data.role}`);
      if (data.keyId) {
        console.log(`Key ID:     ${data.keyId}`);
      }
      if (data.agent) {
        console.log(`Agent:      ${data.agent}`);
      }
      console.log(`Source:     ${data.source}`);
      if (data.scopes && data.scopes.length > 0) {
        console.log(`Scopes:     ${data.scopes.join(", ")}`);
      }
      console.log("");
      console.log("Permissions:");
      for (const perm of data.permissions) {
        console.log(`  • ${perm}`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("permissions")
  .description("Show cached permissions (5-min cache)")
  .option("--refresh", "Force refresh from API")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      if (options.refresh) {
        clearPermissionsCache();
      }

      const perms = await getPermissions();
      const cacheStatus = getCacheStatus();

      if (options.json) {
        console.log(JSON.stringify({
          ...perms,
          cache: cacheStatus,
        }, null, 2));
        return;
      }

      const cacheAge = cacheStatus.age ? Math.round(cacheStatus.age / 1000) : 0;
      const expiresIn = cacheStatus.expiresIn ? Math.round(cacheStatus.expiresIn / 1000) : 0;

      console.log("\n🔑 Cached Permissions");
      console.log("─".repeat(50));
      console.log(`Role:         ${perms.role}`);
      console.log(`Cache age:    ${cacheAge}s (expires in ${expiresIn}s)`);
      console.log("");
      console.log("Permissions:");
      for (const perm of perms.permissions) {
        console.log(`  • ${perm}`);
      }
      if (perms.knowledgeBases.length > 0) {
        console.log("");
        console.log("Knowledge Bases:");
        for (const kb of perms.knowledgeBases) {
          console.log(`  • ${kb}`);
        }
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("can <permission>")
  .description("Check if current key has a specific permission")
  .option("--json", "Output as JSON")
  .action(async (permission, options) => {
    try {
      const allowed = await hasPermission(permission);

      if (options.json) {
        console.log(JSON.stringify({ permission, allowed }));
        return;
      }

      if (allowed) {
        console.log(`✅ Permission granted: ${permission}`);
      } else {
        console.log(`❌ Permission denied: ${permission}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("can-access-kb <kb>")
  .description("Check if current key can access a knowledge base")
  .option("--json", "Output as JSON")
  .action(async (kb, options) => {
    try {
      const allowed = await canAccessKnowledgeBase(kb);

      if (options.json) {
        console.log(JSON.stringify({ knowledgeBase: kb, allowed }));
        return;
      }

      if (allowed) {
        console.log(`✅ Access granted to KB: ${kb}`);
      } else {
        console.log(`❌ Access denied to KB: ${kb}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("login")
  .description("Create a session token for this agent")
  .requiredOption("--agent <name>", "Agent name or alias (must be registered in Firestore)")
  .option("--force", "Clear existing session before creating new one")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const config = getConfig();
      if (!config.apiUrl || !config.apiKey) {
        console.error("API not configured. Run: husky config set api-url <url> && husky config set api-key <key>");
        process.exit(1);
      }

      // Clear existing session if --force flag is set
      if (options.force) {
        clearSessionConfig();
        clearPermissionsCache();
      }

      // Try to get VM Identity Token from GCP Metadata Server
      // This will be null on local development machines
      const vmIdentityToken = await getVMIdentityToken();

      const url = new URL("/api/auth/session", config.apiUrl);
      const requestBody: Record<string, unknown> = { agent: options.agent };
      if (vmIdentityToken) {
        requestBody.vmIdentityToken = vmIdentityToken;
      }

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        if (res.status === 404) {
          console.error(`Agent '${options.agent}' not found. Register the agent first.`);
        } else {
          console.error(`Login failed: ${error.message || error.error || `HTTP ${res.status}`}`);
        }
        process.exit(1);
      }

      const session: SessionResponse = await res.json();
      // Extract agent id for storage (API returns object with id, name, emoji)
      setSessionConfig({
        token: session.token,
        expiresAt: session.expiresAt,
        role: session.role,
        agent: session.agent.id,
      });

      // Clear permissions cache so next check uses the new session role
      clearPermissionsCache();

      // Fetch and cache permissions for the new session role
      await fetchAndCacheRole();

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          agent: session.agent.id,
          agentName: session.agent.name,
          role: session.role,
          expiresAt: session.expiresAt,
        }, null, 2));
        return;
      }

      const expiresAt = new Date(session.expiresAt);
      console.log("\n✅ Session created");
      console.log("─".repeat(40));
      console.log(`Agent:    ${session.agent.name} (${session.agent.id})`);
      console.log(`Role:     ${session.role}`);
      console.log(`Expires:  ${expiresAt.toLocaleString()}`);
      console.log("");
      console.log("All API calls will now use this session token.");
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });

authCommand
  .command("logout")
  .description("Clear the current session token")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const session = getSessionConfig();
    
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, message: "No active session" }));
      } else {
        console.log("No active session to clear.");
      }
      return;
    }

    clearSessionConfig();
    clearPermissionsCache();

    if (options.json) {
      console.log(JSON.stringify({ success: true, agent: session.agent }));
      return;
    }

    console.log(`✅ Session cleared for agent '${session.agent}'`);
  });

authCommand
  .command("session")
  .description("Show current session status")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const session = getSessionConfig();

    if (!session || !session.token) {
      if (options.json) {
        console.log(JSON.stringify({ active: false }));
      } else {
        console.log("No active session. Run: husky auth login --agent <name>");
      }
      return;
    }

    const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
    const now = new Date();
    const isExpired = expiresAt ? expiresAt < now : true;
    const expiresInMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0;
    const expiresInMinutes = Math.max(0, Math.floor(expiresInMs / 60000));

    if (options.json) {
      console.log(JSON.stringify({
        active: !isExpired,
        agent: session.agent,
        role: session.role,
        expiresAt: session.expiresAt,
        expired: isExpired,
        expiresInMinutes,
      }, null, 2));
      return;
    }

    console.log("\n🔐 Session Status");
    console.log("─".repeat(40));
    console.log(`Agent:    ${session.agent || "(unknown)"}`);
    console.log(`Role:     ${session.role || "(unknown)"}`);
    
    if (isExpired) {
      console.log(`Status:   🔴 EXPIRED`);
      console.log(`Expired:  ${expiresAt?.toLocaleString() || "(unknown)"}`);
      console.log("");
      console.log("Run: husky auth refresh --agent <name>");
    } else {
      console.log(`Status:   🟢 ACTIVE`);
      console.log(`Expires:  ${expiresAt?.toLocaleString()} (${expiresInMinutes} minutes)`);
    }
  });

authCommand
  .command("refresh")
  .description("Refresh the session token")
  .option("--agent <name>", "Agent name (uses current session agent if not specified)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const config = getConfig();
      if (!config.apiUrl || !config.apiKey) {
        console.error("API not configured. Run: husky config set api-url <url> && husky config set api-key <key>");
        process.exit(1);
      }

      const currentSession = getSessionConfig();
      const agentName = options.agent || currentSession?.agent;

      if (!agentName) {
        console.error("No agent specified and no active session. Use: husky auth refresh --agent <name>");
        process.exit(1);
      }

      // Try to get VM Identity Token from GCP Metadata Server
      const vmIdentityToken = await getVMIdentityToken();

      const url = new URL("/api/auth/session", config.apiUrl);
      const requestBody: Record<string, unknown> = { agent: agentName };
      if (vmIdentityToken) {
        requestBody.vmIdentityToken = vmIdentityToken;
      }

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        console.error(`Refresh failed: ${error.message || error.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }

      const session: SessionResponse = await res.json();
      // Extract agent id for storage (API returns object with id, name, emoji)
      setSessionConfig({
        token: session.token,
        expiresAt: session.expiresAt,
        role: session.role,
        agent: session.agent.id,
      });

      // Clear permissions cache and refresh for the session role
      clearPermissionsCache();
      await fetchAndCacheRole();

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          agent: session.agent.id,
          agentName: session.agent.name,
          role: session.role,
          expiresAt: session.expiresAt,
        }, null, 2));
        return;
      }

      const expiresAt = new Date(session.expiresAt);
      console.log(`✅ Session refreshed for '${session.agent.name}' (expires: ${expiresAt.toLocaleString()})`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      process.exit(1);
    }
  });
