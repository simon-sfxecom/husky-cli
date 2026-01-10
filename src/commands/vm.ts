import { Command } from "commander";
import { getConfig } from "./config.js";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import {
  DEFAULT_AGENT_CONFIGS,
  generateStartupScript,
  listDefaultAgentTypes,
  getDefaultAgentConfig,
  type AgentType,
  type AgentTypeConfig,
} from "../lib/agent-templates.js";
import { requirePermission } from "../lib/permissions.js";

export const vmCommand = new Command("vm").description("Manage VM sessions");

// Helper: Ensure API is configured
function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error(
      "Error: API URL not configured. Run: husky config set api-url <url>",
    );
    process.exit(1);
  }
  return config;
}

interface APIAgentType {
  id: string;
  name: string;
  slug: string;
  description: string;
  departmentId?: string;
  agentConfig: AgentTypeConfig;
  createdAt: string;
  updatedAt: string;
}

async function fetchAgentTypes(): Promise<APIAgentType[] | null> {
  const config = getConfig();
  if (!config.apiUrl) return null;

  try {
    const res = await fetch(`${config.apiUrl}/api/agent-types`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchAgentTypeBySlug(
  slug: string,
): Promise<APIAgentType | null> {
  const config = getConfig();
  if (!config.apiUrl) return null;

  try {
    const res = await fetch(`${config.apiUrl}/api/agent-types?slug=${slug}`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getAgentTypeConfig(
  slug: string,
): Promise<{ config: AgentTypeConfig; name: string } | null> {
  const apiType = await fetchAgentTypeBySlug(slug);
  if (apiType) {
    return { config: apiType.agentConfig, name: apiType.name };
  }

  const defaultConfig = getDefaultAgentConfig(slug);
  if (defaultConfig) {
    const name = slug.charAt(0).toUpperCase() + slug.slice(1) + " Agent";
    return { config: defaultConfig, name };
  }

  return null;
}

// Helper: Prompt for confirmation
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Type definitions
type VMSessionStatus =
  | "pending"
  | "provisioning"
  | "starting"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "completed"
  | "failed"
  | "terminated"
  | "preempted"
  | "rejected";

type VMAgentType = "claude-code" | "gemini-cli" | "opencode" | "custom";

interface VMSession {
  id: string;
  name: string;
  prompt: string;
  taskId?: string;
  workflowId?: string;
  agentType: VMAgentType;
  businessAgentType?: string;
  vmName: string;
  vmZone: string;
  machineType: string;
  vmStatus: VMSessionStatus;
  vmIpAddress?: string;
  repoUrl?: string;
  branch?: string;
  output?: string;
  exitCode?: number;
  prUrl?: string;
  costEstimate?: number;
  runtimeMinutes?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

interface VMSessionLog {
  id: string;
  level: string;
  message: string;
  source: string;
  timestamp: string;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").toUpperCase();
}

// husky vm list
vmCommand
  .command("list")
  .description("List all VM sessions")
  .option("--json", "Output as JSON")
  .option(
    "--status <status>",
    "Filter by status (pending, starting, running, completed, failed, terminated)",
  )
  .option(
    "--agent <agent>",
    "Filter by agent type (claude-code, gemini-cli, opencode, custom)",
  )
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const url = new URL("/api/vm-sessions", config.apiUrl);
      if (options.status) {
        url.searchParams.set("vmStatus", options.status);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      let sessions: VMSession[] = data.sessions || [];

      // Filter by agent type if specified
      if (options.agent) {
        sessions = sessions.filter(
          (s: VMSession) => s.agentType === options.agent,
        );
      }

      if (options.json) {
        console.log(JSON.stringify({ sessions, stats: data.stats }, null, 2));
      } else {
        printVMSessions(sessions, data.stats);
      }
    } catch (error) {
      console.error("Error fetching VM sessions:", error);
      process.exit(1);
    }
  });

// husky vm create <name>
vmCommand
  .command("create <name>")
  .description("Create a new VM session")
  .option("-p, --prompt <prompt>", "Initial prompt for the agent")
  .option(
    "--agent <agent>",
    "Agent type (claude-code, gemini-cli, opencode, custom)",
    "opencode",
  )
  .option(
    "-t, --type <type>",
    "Business agent type (support, accounting, marketing, research)",
  )
  .option("--config <configId>", "VM config to use")
  .option("--project <projectId>", "Link to project")
  .option("--task <taskId>", "Link to task")
  .option("--repo <repoUrl>", "Git repository URL")
  .option("--branch <branch>", "Git branch to use")
  .option("--machine-type <machineType>", "GCP machine type", "e2-medium")
  .option("--zone <zone>", "GCP zone", "europe-west1-b")
  .option("--json", "Output as JSON")
  .action(async (name, options) => {
    // RBAC: Only supervisor and devops can create VMs
    requirePermission("vm:create");

    const config = ensureConfig();

    const validBusinessTypes = [
      "support",
      "accounting",
      "marketing",
      "research",
    ];
    if (options.type && !validBusinessTypes.includes(options.type)) {
      console.error(`Error: Invalid business agent type '${options.type}'`);
      console.error(`Valid types: ${validBusinessTypes.join(", ")}`);
      process.exit(1);
    }

    if (options.type && !options.prompt) {
      const defaultPrompts: Record<string, string> = {
        support:
          "Du bist ein Support Agent. Starte mit /shift-start um die Schicht zu beginnen.",
        accounting:
          "Du bist ein Accounting Agent. Pruefe /inbox fuer neue Belege.",
        marketing:
          "Du bist ein Marketing Agent. Pruefe /campaigns fuer aktuelle Kampagnen.",
        research:
          "Du bist ein Research Agent. Pruefe /youtube fuer neue Videos zu analysieren.",
      };
      options.prompt = defaultPrompts[options.type] || "Agent bereit.";
    }

    if (!options.prompt) {
      console.error(
        "Error: --prompt is required (or use --type for default prompt)",
      );
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name,
          prompt: options.prompt,
          agentType: options.agent,
          businessAgentType: options.type,
          taskId: options.task,
          workflowId: options.project,
          repoUrl: options.repo,
          branch: options.branch,
          machineType: options.machineType,
          zone: options.zone,
          startTrigger: "manual",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${res.status}`);
      }

      const session: VMSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        console.log(`Created VM session: ${session.name}`);
        console.log(`  ID:       ${session.id}`);
        console.log(`  Agent:    ${session.agentType}`);
        if (session.businessAgentType) {
          console.log(`  Type:     ${session.businessAgentType}`);
        }
        console.log(`  Status:   ${formatStatus(session.vmStatus)}`);
        console.log(`  VM Name:  ${session.vmName}`);
        console.log(`  Zone:     ${options.zone}`);
        console.log(`\nTo start the VM, run: husky vm start ${session.id}`);
        if (session.businessAgentType) {
          console.log(
            `\nAfter VM is ready, the ${session.businessAgentType} agent will be auto-configured.`,
          );
        }
      }
    } catch (error) {
      console.error("Error creating VM session:", error);
      process.exit(1);
    }
  });

// husky vm get <id>
vmCommand
  .command("get <id>")
  .description("Get VM session details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const session: VMSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        printVMSessionDetail(session);
      }
    } catch (error) {
      console.error("Error fetching VM session:", error);
      process.exit(1);
    }
  });

// husky vm update <id>
vmCommand
  .command("update <id>")
  .description("Update VM session")
  .option("-n, --name <name>", "New name")
  .option("-p, --prompt <prompt>", "New prompt")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string> = {};
    if (options.name) updateData.name = options.name;
    if (options.prompt) updateData.prompt = options.prompt;

    if (Object.keys(updateData).length === 0) {
      console.error(
        "Error: No update options provided. Use -n/--name or -p/--prompt",
      );
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(
            `Error: ${errorData.error || `API returned ${res.status}`}`,
          );
        }
        process.exit(1);
      }

      const session: VMSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        console.log(`VM session updated successfully`);
        console.log(`  Name:   ${session.name}`);
        console.log(`  Status: ${formatStatus(session.vmStatus)}`);
      }
    } catch (error) {
      console.error("Error updating VM session:", error);
      process.exit(1);
    }
  });

// husky vm delete <id>
vmCommand
  .command("delete <id>")
  .description("Delete VM session")
  .option("--force", "Skip confirmation")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Confirm deletion unless --force is provided
    if (!options.force) {
      try {
        const getRes = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!getRes.ok) {
          if (getRes.status === 404) {
            console.error(`Error: VM session ${id} not found`);
          } else {
            console.error(`Error: API returned ${getRes.status}`);
          }
          process.exit(1);
        }

        const session: VMSession = await getRes.json();
        const confirmed = await confirm(
          `Delete VM session "${session.name}" (${id})?`,
        );

        if (!confirmed) {
          console.log("Deletion cancelled.");
          process.exit(0);
        }
      } catch (error) {
        console.error("Error fetching VM session:", error);
        process.exit(1);
      }
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify({ deleted: true, id }, null, 2));
      } else {
        console.log(`VM session deleted`);
      }
    } catch (error) {
      console.error("Error deleting VM session:", error);
      process.exit(1);
    }
  });

// husky vm start <id>
vmCommand
  .command("start <id>")
  .description("Start/provision the VM")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    // RBAC: Only supervisor and devops can start VMs
    requirePermission("vm:manage");

    const config = ensureConfig();

    console.log("Starting VM provisioning...");
    console.log("This may take a few minutes...\n");

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(
            `Error: ${errorData.error || `API returned ${res.status}`}`,
          );
        }
        process.exit(1);
      }

      const data = await res.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const session = data.session;
        console.log(`VM started successfully!`);
        console.log(`  Name:   ${session.name}`);
        console.log(`  Status: ${formatStatus(session.vmStatus)}`);
        if (session.vmIpAddress) {
          console.log(`  IP:     ${session.vmIpAddress}`);
        }
        console.log(`\nTo view logs, run: husky vm logs ${id}`);
      }
    } catch (error) {
      console.error("Error starting VM session:", error);
      process.exit(1);
    }
  });

// husky vm stop <id>
vmCommand
  .command("stop <id>")
  .description("Stop the VM")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    console.log("Stopping VM...\n");

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(
            `Error: ${errorData.error || `API returned ${res.status}`}`,
          );
        }
        process.exit(1);
      }

      const data = await res.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const session = data.session;
        console.log(`VM stopped successfully`);
        console.log(`  Name:   ${session.name}`);
        console.log(`  Status: ${formatStatus(session.vmStatus)}`);
      }
    } catch (error) {
      console.error("Error stopping VM session:", error);
      process.exit(1);
    }
  });

// husky vm logs <id>
vmCommand
  .command("logs <id>")
  .description("Get VM logs")
  .option("--follow", "Stream logs (poll for updates)")
  .option("--tail <n>", "Last n log entries", "50")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();
    const limit = parseInt(options.tail, 10);

    const fetchLogs = async (): Promise<VMSessionLog[]> => {
      const url = new URL(`/api/vm-sessions/${id}/logs`, config.apiUrl);
      url.searchParams.set("limit", limit.toString());

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
          process.exit(1);
        }
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      return data.logs || [];
    };

    try {
      const logs = await fetchLogs();

      if (options.json) {
        console.log(JSON.stringify(logs, null, 2));
        if (options.follow) {
          console.error(
            "Note: --json mode does not support --follow streaming",
          );
        }
        return;
      }

      // Print initial logs
      for (const log of logs) {
        printLog(log);
      }

      if (options.follow) {
        console.log("\n--- Following logs (Ctrl+C to stop) ---\n");

        let lastLogCount = logs.length;
        const pollInterval = 3000; // 3 seconds

        // Poll for new logs
        const interval = setInterval(async () => {
          try {
            const newLogs = await fetchLogs();
            if (newLogs.length > lastLogCount) {
              // Print only new logs
              for (const log of newLogs.slice(lastLogCount)) {
                printLog(log);
              }
              lastLogCount = newLogs.length;
            }
          } catch (error) {
            console.error("Error fetching logs:", error);
          }
        }, pollInterval);

        // Handle graceful shutdown
        process.on("SIGINT", () => {
          clearInterval(interval);
          console.log("\nStopped following logs.");
          process.exit(0);
        });

        // Keep process alive
        await new Promise(() => {});
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      process.exit(1);
    }
  });

// husky vm approve <id>
vmCommand
  .command("approve <id>")
  .description("Approve VM session plan")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(
        `${config.apiUrl}/api/vm-sessions/${id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
          },
        },
      );

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(
            `Error: ${errorData.error || `API returned ${res.status}`}`,
          );
        }
        process.exit(1);
      }

      const data = await res.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`Plan approved`);
        console.log(`  ${data.message}`);
      }
    } catch (error) {
      console.error("Error approving plan:", error);
      process.exit(1);
    }
  });

// husky vm reject <id>
vmCommand
  .command("reject <id>")
  .description("Reject VM session plan")
  .option("-r, --reason <reason>", "Rejection reason")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          reason: options.reason,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM session ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(
            `Error: ${errorData.error || `API returned ${res.status}`}`,
          );
        }
        process.exit(1);
      }

      const data = await res.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`Plan rejected`);
        console.log(`  ${data.message}`);
        if (options.reason) {
          console.log(`  Reason: ${options.reason}`);
        }
      }
    } catch (error) {
      console.error("Error rejecting plan:", error);
      process.exit(1);
    }
  });

vmCommand
  .command("types")
  .description("List available business agent types")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const apiTypes = await fetchAgentTypes();

    if (apiTypes && apiTypes.length > 0) {
      if (options.json) {
        console.log(JSON.stringify(apiTypes, null, 2));
        return;
      }

      console.log("\n  Available Agent Types (from API)");
      console.log("  " + "-".repeat(70));

      for (const type of apiTypes) {
        console.log(`\n  ${type.slug.toUpperCase()} - ${type.name}`);
        console.log(`    ${type.description}`);
        console.log(
          `    Directories: ${type.agentConfig.directories.slice(0, 3).join(", ")}...`,
        );
      }
    } else {
      const types = listDefaultAgentTypes();

      if (options.json) {
        console.log(JSON.stringify(DEFAULT_AGENT_CONFIGS, null, 2));
        return;
      }

      console.log("\n  Available Agent Types (defaults)");
      console.log("  " + "-".repeat(70));

      for (const type of types) {
        const config = DEFAULT_AGENT_CONFIGS[type];
        console.log(`\n  ${type.toUpperCase()}`);
        console.log(`    Default prompt: ${config.defaultPrompt}`);
        console.log(
          `    Directories: ${config.directories.slice(0, 3).join(", ")}...`,
        );
      }
    }

    console.log("\n  Usage:");
    console.log("    husky vm create my-agent --type support");
    console.log("    husky vm init --type accounting\n");
  });

vmCommand
  .command("init")
  .description(
    "Initialize agent workspace on current machine (run this ON the VM)",
  )
  .requiredOption(
    "-t, --type <type>",
    "Business agent type slug (e.g., support, accounting, marketing, research)",
  )
  .option(
    "--workspace <path>",
    "Workspace directory",
    process.env.HOME + "/workspace",
  )
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const agentTypeSlug = options.type;
    const typeData = await getAgentTypeConfig(agentTypeSlug);

    if (!typeData) {
      const validTypes = listDefaultAgentTypes();
      console.error(`Error: Unknown agent type '${agentTypeSlug}'`);
      console.error(`Default types: ${validTypes.join(", ")}`);
      console.error(`Or configure API to fetch custom types.`);
      process.exit(1);
    }

    const { config, name: agentName } = typeData;
    const workspace = options.workspace;

    console.log(`\n  Initializing ${agentName}...`);
    console.log(`  Workspace: ${workspace}\n`);

    try {
      if (!fs.existsSync(workspace)) {
        fs.mkdirSync(workspace, { recursive: true });
      }

      for (const dir of config.directories) {
        const fullPath = path.join(workspace, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
          console.log(`  Created: ${dir}`);
        }
      }

      const geminiDir = path.join(workspace, ".gemini", "commands");
      if (!fs.existsSync(geminiDir)) {
        fs.mkdirSync(geminiDir, { recursive: true });
      }

      const scriptsDir = path.join(workspace, "scripts");
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      const geminiMd = `# ${agentName} VM - Project Rules

## Rolle
Du bist ein autonomer ${agentName}. 

## Tech Stack
- Runtime: Google Cloud VM
- AI Model: Google Vertex AI (europe-west1) - DSGVO-konform
- CLI: Husky CLI fuer alle Business-Operationen

## Workspace
${config.directories.map((d: string) => `- ${d}/`).join("\n")}

## Status Updates
\`\`\`bash
husky task message <task-id> -m "<status>"
\`\`\`
`;
      fs.writeFileSync(path.join(workspace, "GEMINI.md"), geminiMd);
      console.log(`  Created: GEMINI.md`);

      if (options.json) {
        console.log(
          JSON.stringify(
            { success: true, workspace, type: agentTypeSlug, name: agentName },
            null,
            2,
          ),
        );
      } else {
        console.log(`\n  ${agentName} initialized!`);
        console.log(`\n  Next steps:`);
        console.log(`    cd ${workspace}`);
        console.log(`    gemini`);
      }
    } catch (error) {
      console.error("Error initializing agent:", error);
      process.exit(1);
    }
  });

vmCommand
  .command("startup-script")
  .description("Generate VM startup script for agent type")
  .requiredOption("-t, --type <type>", "Business agent type slug")
  .option("--husky-url <url>", "Husky API URL")
  .option("--husky-key <key>", "Husky API Key")
  .option("--project <project>", "GCP Project ID")
  .action(async (options) => {
    const apiType = await fetchAgentTypeBySlug(options.type);

    if (apiType) {
      const script = generateStartupScript(
        {
          id: apiType.id,
          departmentId: apiType.departmentId || "",
          name: apiType.name,
          slug: apiType.slug,
          description: apiType.description,
          agentConfig: apiType.agentConfig,
          createdAt: apiType.createdAt,
          updatedAt: apiType.updatedAt,
        },
        options.huskyUrl,
        options.huskyKey,
        options.project,
      );
      console.log(script);
      return;
    }

    const validTypes = listDefaultAgentTypes();
    if (!validTypes.includes(options.type)) {
      console.error(`Error: Unknown agent type '${options.type}'`);
      console.error(`Default types: ${validTypes.join(", ")}`);
      process.exit(1);
    }

    const script = generateStartupScript(
      options.type,
      options.huskyUrl,
      options.huskyKey,
      options.project,
    );

    console.log(script);
  });

// ============================================================================
// VM Monitoring Commands
// ============================================================================

// Patterns that indicate an agent is stuck
const STUCK_PATTERNS = [
  { pattern: /Do you want to allow|Allow this action|allow this tool/i, reason: "Waiting for allow/deny prompt" },
  { pattern: /\[y\/n\]|\[Y\/n\]|\(yes\/no\)/i, reason: "Waiting for yes/no confirmation" },
  { pattern: /Press Enter to continue|press any key/i, reason: "Waiting for user input" },
  { pattern: /Error:|error:|FAILED|failed/i, reason: "Error detected" },
  { pattern: /permission denied|Permission denied/i, reason: "Permission denied error" },
  { pattern: /timed out|timeout|Timeout/i, reason: "Timeout error" },
];

interface VMMonitorStatus {
  vmName: string;
  zone: string;
  ip?: string;
  sessions: SessionStatus[];
  isStuck: boolean;
  stuckReason?: string;
}

interface SessionStatus {
  sessionName: string;
  lastOutput: string;
  isStuck: boolean;
  stuckReason?: string;
}

// Helper to run SSH command on a VM using spawnSync (no shell injection)
function sshCommand(vmName: string, zone: string, command: string): string | null {
  try {
    const result = spawnSync("gcloud", [
      "compute", "ssh", vmName,
      `--zone=${zone}`,
      `--command=${command}`,
    ], { encoding: "utf-8", timeout: 30000 });

    if (result.status !== 0) return null;
    return result.stdout?.trim() || null;
  } catch {
    return null;
  }
}

// Get tmux sessions on a VM
function getTmuxSessions(vmName: string, zone: string): string[] {
  const result = sshCommand(vmName, zone, "tmux list-sessions -F '#{session_name}' 2>/dev/null || true");
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}

// Capture last lines from a tmux session
function captureTmuxOutput(vmName: string, zone: string, sessionName: string, lines: number = 50): string | null {
  return sshCommand(vmName, zone, `tmux capture-pane -t ${sessionName} -p -S -${lines} 2>/dev/null || true`);
}

// Check if output matches stuck patterns
function checkForStuckPatterns(output: string): { isStuck: boolean; reason?: string } {
  for (const { pattern, reason } of STUCK_PATTERNS) {
    if (pattern.test(output)) {
      return { isStuck: true, reason };
    }
  }
  return { isStuck: false };
}

// husky vm monitor
vmCommand
  .command("monitor")
  .description("Monitor agent status across running VMs")
  .option("--vm <name>", "Monitor specific VM only")
  .option("--watch", "Continuous monitoring (refresh every 10s)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    // Get running VMs from API
    const getRunningVMs = async (): Promise<VMSession[]> => {
      const url = new URL("/api/vm-sessions", config.apiUrl);
      url.searchParams.set("vmStatus", "running");

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      return data.sessions || [];
    };

    const monitorVMs = async () => {
      let sessions: VMSession[];

      try {
        sessions = await getRunningVMs();
      } catch (error) {
        console.error("Error fetching VMs:", error);
        return [];
      }

      // Filter by VM name if specified
      if (options.vm) {
        sessions = sessions.filter(
          (s) => s.vmName === options.vm || s.name === options.vm || s.id === options.vm
        );
      }

      if (sessions.length === 0) {
        console.log("\n  No running VMs found.");
        return [];
      }

      const results: VMMonitorStatus[] = [];

      for (const session of sessions) {
        const vmStatus: VMMonitorStatus = {
          vmName: session.vmName,
          zone: session.vmZone,
          ip: session.vmIpAddress,
          sessions: [],
          isStuck: false,
        };

        // Get tmux sessions on this VM
        const tmuxSessions = getTmuxSessions(session.vmName, session.vmZone);

        if (tmuxSessions.length === 0) {
          vmStatus.sessions.push({
            sessionName: "(none)",
            lastOutput: "No tmux sessions running",
            isStuck: false,
          });
        } else {
          for (const tmuxSession of tmuxSessions) {
            const output = captureTmuxOutput(session.vmName, session.vmZone, tmuxSession) || "";
            const stuckCheck = checkForStuckPatterns(output);

            const sessionStatus: SessionStatus = {
              sessionName: tmuxSession,
              lastOutput: output.split("\n").slice(-10).join("\n"),
              isStuck: stuckCheck.isStuck,
              stuckReason: stuckCheck.reason,
            };

            vmStatus.sessions.push(sessionStatus);

            if (stuckCheck.isStuck) {
              vmStatus.isStuck = true;
              vmStatus.stuckReason = `${tmuxSession}: ${stuckCheck.reason}`;
            }
          }
        }

        results.push(vmStatus);
      }

      return results;
    };

    // Initial check
    const results = await monitorVMs();

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      if (!options.watch) return;
    } else {
      printMonitorResults(results);
    }

    // Watch mode
    if (options.watch) {
      console.log("\n--- Monitoring (Ctrl+C to stop, refreshing every 10s) ---\n");

      const interval = setInterval(async () => {
        const newResults = await monitorVMs();
        if (options.json) {
          console.log(JSON.stringify(newResults, null, 2));
        } else {
          console.log("\x1b[2J\x1b[H"); // Clear screen
          console.log(`VM Monitor - ${new Date().toLocaleTimeString()}`);
          printMonitorResults(newResults);
        }
      }, 10000);

      process.on("SIGINT", () => {
        clearInterval(interval);
        console.log("\nMonitoring stopped.");
        process.exit(0);
      });

      await new Promise(() => {});
    }
  });

// husky vm unstuck <vmName>
vmCommand
  .command("unstuck <vmName>")
  .description("Try to unstick an agent by sending input")
  .option("--session <name>", "Target specific tmux session", "main")
  .option("--action <action>", "Action to send (see --list-actions)", "enter")
  .option("--zone <zone>", "GCP zone", "europe-west1-b")
  .option("--text <text>", "Send custom text (use with --action custom)")
  .option("--list-actions", "Show all available actions")
  .option("--json", "Output as JSON")
  .action(async (vmName, options) => {
    // All available actions for different AI agents
    const actionKeys: Record<string, string> = {
      // Basic actions
      enter: "Enter",
      yes: "y Enter",
      no: "n Enter",

      // Claude Code / OpenCode prompts
      allow: "y Enter",           // Allow single action
      deny: "n Enter",            // Deny action
      "allow-all": "a Enter",     // Allow all (OpenCode)
      a: "a Enter",               // Shorthand for allow-all

      // Numbered menu selections (common in OpenCode)
      "1": "1 Enter",
      "2": "2 Enter",
      "3": "3 Enter",
      "4": "4 Enter",
      "5": "5 Enter",

      // Common responses
      skip: "s Enter",            // Skip
      cancel: "Escape",           // Cancel/escape
      quit: "q Enter",            // Quit
      continue: "c Enter",        // Continue
      retry: "r Enter",           // Retry

      // Custom text (use with --text)
      custom: "",
    };

    // Show available actions
    if (options.listActions) {
      console.log("\n  Available unstuck actions:\n");
      console.log("  Basic:");
      console.log("    enter        - Press Enter");
      console.log("    yes / y      - Send 'y' + Enter");
      console.log("    no / n       - Send 'n' + Enter");
      console.log("\n  AI Agent Prompts:");
      console.log("    allow        - Allow action (y + Enter)");
      console.log("    deny         - Deny action (n + Enter)");
      console.log("    allow-all/a  - Allow all (a + Enter) - OpenCode");
      console.log("\n  Menu Selections:");
      console.log("    1, 2, 3, 4, 5 - Send number + Enter");
      console.log("\n  Other:");
      console.log("    skip         - Skip (s + Enter)");
      console.log("    cancel       - Escape key");
      console.log("    quit         - Quit (q + Enter)");
      console.log("    continue     - Continue (c + Enter)");
      console.log("    retry        - Retry (r + Enter)");
      console.log("    custom       - Use with --text to send custom input");
      console.log("\n  Examples:");
      console.log("    husky vm unstuck supervisor --action allow-all");
      console.log("    husky vm unstuck worker-1 --action 2");
      console.log('    husky vm unstuck support --action custom --text "my response"');
      console.log("");
      return;
    }

    // Handle custom text action
    let keys: string;
    if (options.action === "custom") {
      if (!options.text) {
        console.error("Error: --text is required when using --action custom");
        process.exit(1);
      }
      // Escape special characters for tmux send-keys
      const escapedText = options.text.replace(/"/g, '\\"').replace(/'/g, "\\'");
      keys = `"${escapedText}" Enter`;
    } else {
      keys = actionKeys[options.action] || "Enter";
      if (!actionKeys[options.action]) {
        console.warn(`Warning: Unknown action "${options.action}", sending Enter`);
      }
    }

    console.log(`Sending "${options.action}" to ${vmName}:${options.session}...`);

    try {
      // First check if session exists
      const sessions = getTmuxSessions(vmName, options.zone);
      if (!sessions.includes(options.session)) {
        console.error(`Error: Session "${options.session}" not found on ${vmName}`);
        console.log(`Available sessions: ${sessions.join(", ") || "(none)"}`);
        process.exit(1);
      }

      // Send keys to tmux session
      const result = spawnSync("gcloud", [
        "compute", "ssh", vmName,
        `--zone=${options.zone}`,
        `--command=tmux send-keys -t ${options.session} ${keys}`,
      ], { encoding: "utf-8", timeout: 30000 });

      if (result.status !== 0) {
        throw new Error(result.stderr || "Failed to send keys");
      }

      // Wait a moment and capture output
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const output = captureTmuxOutput(vmName, options.zone, options.session, 20);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          action: options.action,
          vmName,
          session: options.session,
          lastOutput: output?.split("\n").slice(-10).join("\n"),
        }, null, 2));
      } else {
        console.log(`\nAction sent successfully!`);
        console.log(`\nLast output from ${options.session}:`);
        console.log("---");
        console.log(output?.split("\n").slice(-10).join("\n") || "(no output)");
        console.log("---");
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// husky vm ssh <vmName>
vmCommand
  .command("ssh <vmName>")
  .description("SSH into a VM (opens interactive shell)")
  .option("--zone <zone>", "GCP zone", "europe-west1-b")
  .option("--command <cmd>", "Run command instead of interactive shell")
  .action(async (vmName, options) => {
    if (options.command) {
      const result = sshCommand(vmName, options.zone, options.command);
      if (result !== null) {
        console.log(result);
      } else {
        console.error("Failed to execute command");
        process.exit(1);
      }
    } else {
      // Interactive SSH
      spawnSync("gcloud", ["compute", "ssh", vmName, `--zone=${options.zone}`], {
        stdio: "inherit",
      });
    }
  });

function printMonitorResults(results: VMMonitorStatus[]) {
  console.log("\n  VM MONITOR STATUS");
  console.log("  " + "=".repeat(80));

  for (const vm of results) {
    const stuckIndicator = vm.isStuck ? " [STUCK]" : "";
    console.log(`\n  ${vm.vmName}${stuckIndicator}`);
    console.log(`  Zone: ${vm.zone} | IP: ${vm.ip || "N/A"}`);
    console.log("  " + "-".repeat(60));

    for (const session of vm.sessions) {
      const sessionStuck = session.isStuck ? ` <- STUCK: ${session.stuckReason}` : "";
      console.log(`\n  [${session.sessionName}]${sessionStuck}`);

      const lines = session.lastOutput.split("\n").slice(-5);
      for (const line of lines) {
        console.log(`    ${line.substring(0, 76)}`);
      }
    }
  }

  const stuckVMs = results.filter((r) => r.isStuck);
  if (stuckVMs.length > 0) {
    console.log("\n  " + "=".repeat(80));
    console.log(`  WARNING: ${stuckVMs.length} VM(s) appear stuck:`);
    for (const vm of stuckVMs) {
      console.log(`    - ${vm.vmName}: ${vm.stuckReason}`);
    }
    console.log(`\n  To unstick, run: husky vm unstuck <vmName> --action allow`);
  }

  console.log("");
}

// Print helpers
function printVMSessions(
  sessions: VMSession[],
  stats?: { runningCount: number; todayCost: number },
) {
  if (sessions.length === 0) {
    console.log("\n  No VM sessions found.");
    console.log(
      "  Create one with: husky vm create <name> --prompt <prompt>\n",
    );
    return;
  }

  if (stats) {
    console.log(
      `\n  Running VMs: ${stats.runningCount} | Today's Cost: $${stats.todayCost.toFixed(2)}`,
    );
  }

  console.log("\n  VM SESSIONS");
  console.log("  " + "-".repeat(90));
  console.log(
    `  ${"ID".padEnd(24)} ${"NAME".padEnd(20)} ${"STATUS".padEnd(16)} ${"AGENT".padEnd(14)} CREATED`,
  );
  console.log("  " + "-".repeat(90));

  for (const session of sessions) {
    const truncatedName =
      session.name.length > 18
        ? session.name.substring(0, 15) + "..."
        : session.name;
    const status = formatStatus(session.vmStatus).padEnd(16);
    const createdAt = new Date(session.createdAt).toLocaleDateString();

    console.log(
      `  ${session.id.padEnd(24)} ${truncatedName.padEnd(20)} ${status} ${session.agentType.padEnd(14)} ${createdAt}`,
    );
  }

  console.log("");
}

function printVMSessionDetail(session: VMSession) {
  console.log(`\n  VM Session: ${session.name}`);
  console.log("  " + "-".repeat(60));
  console.log(`  ID:           ${session.id}`);
  console.log(`  Status:       ${formatStatus(session.vmStatus)}`);
  console.log(`  Agent:        ${session.agentType}`);
  if (session.businessAgentType) {
    console.log(`  Type:         ${session.businessAgentType}`);
  }
  console.log(`  VM Name:      ${session.vmName}`);
  console.log(`  Zone:         ${session.vmZone}`);
  console.log(`  Machine Type: ${session.machineType}`);

  if (session.vmIpAddress) {
    console.log(`  IP Address:   ${session.vmIpAddress}`);
  }

  if (session.repoUrl) {
    console.log(`  Repository:   ${session.repoUrl}`);
    if (session.branch) {
      console.log(`  Branch:       ${session.branch}`);
    }
  }

  if (session.taskId) {
    console.log(`  Task ID:      ${session.taskId}`);
  }

  if (session.workflowId) {
    console.log(`  Workflow ID:  ${session.workflowId}`);
  }

  console.log(`\n  Prompt:`);
  console.log(`    ${session.prompt}`);

  if (session.costEstimate !== undefined) {
    console.log(`\n  Cost Estimate: $${session.costEstimate.toFixed(4)}`);
  }

  if (session.runtimeMinutes !== undefined) {
    console.log(`  Runtime:       ${session.runtimeMinutes} minutes`);
  }

  if (session.prUrl) {
    console.log(`\n  Pull Request: ${session.prUrl}`);
  }

  if (session.output) {
    console.log(`\n  Output:`);
    const outputLines = session.output.split("\n").slice(0, 10);
    for (const line of outputLines) {
      console.log(`    ${line}`);
    }
    if (session.output.split("\n").length > 10) {
      console.log(`    ... (truncated)`);
    }
  }

  if (session.lastError) {
    console.log(`\n  Last Error: ${session.lastError}`);
  }

  console.log(`\n  Created:  ${new Date(session.createdAt).toLocaleString()}`);
  if (session.startedAt) {
    console.log(`  Started:  ${new Date(session.startedAt).toLocaleString()}`);
  }
  if (session.completedAt) {
    console.log(
      `  Completed: ${new Date(session.completedAt).toLocaleString()}`,
    );
  }

  console.log("");
}

function printLog(log: VMSessionLog) {
  const timestamp = new Date(log.timestamp).toLocaleTimeString();
  const level = log.level.toUpperCase().padEnd(5);
  const source = `[${log.source}]`.padEnd(10);

  // Color based on level
  let prefix = "";
  if (log.level === "error") {
    prefix = "x ";
  } else if (log.level === "warn") {
    prefix = "! ";
  } else {
    prefix = "  ";
  }

  console.log(`${prefix}${timestamp} ${level} ${source} ${log.message}`);
}
