import { Command } from "commander";
import { getConfig } from "./config.js";
import * as readline from "readline";

export const julesCommand = new Command("jules")
  .description("Manage Jules AI coding sessions");

// Helper: Ensure API is configured
function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return config;
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
type JulesSessionStatus =
  | "pending"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

interface JulesSession {
  id: string;
  julesSessionId: string;
  name: string;
  prompt: string;
  sourceId: string;
  sourceName?: string;
  branch?: string;
  status: JulesSessionStatus;
  planSummary?: string;
  requirePlanApproval: boolean;
  prUrl?: string;
  prNumber?: number;
  commitSha?: string;
  taskId?: string;
  workflowId?: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

interface JulesActivity {
  id: string;
  sessionId: string;
  type: "plan" | "message" | "code_change" | "pr_created" | "error";
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

interface JulesSource {
  id: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  connected: boolean;
}

// Status display config
const STATUS_CONFIG: Record<JulesSessionStatus, { label: string; icon: string }> = {
  pending: { label: "Pending", icon: "[...]" },
  planning: { label: "Planning", icon: "[P]" },
  awaiting_approval: { label: "Awaiting Approval", icon: "[!]" },
  executing: { label: "Executing", icon: "[>]" },
  completed: { label: "Completed", icon: "[OK]" },
  failed: { label: "Failed", icon: "[X]" },
  cancelled: { label: "Cancelled", icon: "[-]" },
};

// husky jules list
julesCommand
  .command("list")
  .description("List all Jules sessions")
  .option("--json", "Output as JSON")
  .option("--status <status>", "Filter by status (pending, planning, awaiting_approval, executing, completed, failed, cancelled)")
  .option("--source <source>", "Filter by source ID")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const url = new URL("/api/jules-sessions", config.apiUrl);
      if (options.status) {
        url.searchParams.set("status", options.status);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      let sessions: JulesSession[] = data.sessions || [];

      // Filter by source if specified
      if (options.source) {
        sessions = sessions.filter((s) => s.sourceId === options.source || s.sourceName?.includes(options.source));
      }

      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
      } else {
        printSessions(sessions);
      }
    } catch (error) {
      console.error("Error fetching Jules sessions:", error);
      process.exit(1);
    }
  });

// husky jules create
julesCommand
  .command("create")
  .description("Create a new Jules session")
  .requiredOption("-n, --name <name>", "Session name")
  .requiredOption("--source <source>", "Source ID (use 'jules sources' to list available sources)")
  .option("--prompt <prompt>", "Task prompt/description")
  .option("--branch <branch>", "Git branch to work on")
  .option("--source-name <sourceName>", "Source name (cached for display)")
  .option("--task <taskId>", "Link to a task ID")
  .option("--workflow <workflowId>", "Link to a workflow ID")
  .option("--no-approval", "Skip plan approval (auto-approve)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    if (!options.prompt) {
      console.error("Error: --prompt is required. Provide a description of what Jules should do.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name: options.name,
          prompt: options.prompt,
          sourceId: options.source,
          sourceName: options.sourceName,
          branch: options.branch,
          taskId: options.task,
          workflowId: options.workflow,
          requirePlanApproval: options.approval !== false,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || `API error: ${res.status}`);
      }

      const session: JulesSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        console.log(`Created Jules session: ${session.name}`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Jules Session ID: ${session.julesSessionId}`);
        console.log(`  Status: ${STATUS_CONFIG[session.status].label}`);
        console.log(`  Source: ${session.sourceName || session.sourceId}`);
        if (session.branch) {
          console.log(`  Branch: ${session.branch}`);
        }
        console.log(`  Plan Approval: ${session.requirePlanApproval ? "Required" : "Auto-approve"}`);
      }
    } catch (error) {
      console.error("Error creating Jules session:", error);
      process.exit(1);
    }
  });

// husky jules get <id>
julesCommand
  .command("get <id>")
  .description("Get Jules session details")
  .option("--json", "Output as JSON")
  .option("--activities", "Include activities in output")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Jules session ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const session = await res.json();

      if (options.json) {
        if (!options.activities && session.activities) {
          delete session.activities;
        }
        console.log(JSON.stringify(session, null, 2));
      } else {
        printSessionDetail(session, options.activities);
      }
    } catch (error) {
      console.error("Error fetching Jules session:", error);
      process.exit(1);
    }
  });

// husky jules update <id>
julesCommand
  .command("update <id>")
  .description("Update a Jules session")
  .option("-n, --name <name>", "New name")
  .option("--status <status>", "New status")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string> = {};
    if (options.name) updateData.name = options.name;
    if (options.status) {
      const validStatuses = ["pending", "planning", "awaiting_approval", "executing", "completed", "failed", "cancelled"];
      if (!validStatuses.includes(options.status)) {
        console.error(`Error: Invalid status "${options.status}". Must be one of: ${validStatuses.join(", ")}`);
        process.exit(1);
      }
      updateData.status = options.status;
    }

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided. Use -n or --status");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Jules session ${id} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const session: JulesSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        console.log(`Jules session updated successfully`);
        console.log(`  Name: ${session.name}`);
        console.log(`  Status: ${STATUS_CONFIG[session.status].label}`);
      }
    } catch (error) {
      console.error("Error updating Jules session:", error);
      process.exit(1);
    }
  });

// husky jules delete <id>
julesCommand
  .command("delete <id>")
  .description("Delete a Jules session")
  .option("--force", "Skip confirmation")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    if (!options.force) {
      // First fetch session details to show what will be deleted
      try {
        const getRes = await fetch(`${config.apiUrl}/api/jules-sessions/${id}`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!getRes.ok) {
          if (getRes.status === 404) {
            console.error(`Error: Jules session ${id} not found`);
          } else {
            console.error(`Error: API returned ${getRes.status}`);
          }
          process.exit(1);
        }

        const session = await getRes.json();
        const confirmed = await confirm(`Delete Jules session "${session.name}" (${id})?`);

        if (!confirmed) {
          console.log("Deletion cancelled.");
          process.exit(0);
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        process.exit(1);
      }
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Jules session ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify({ deleted: true, id }, null, 2));
      } else {
        console.log(`Jules session deleted`);
      }
    } catch (error) {
      console.error("Error deleting Jules session:", error);
      process.exit(1);
    }
  });

// husky jules message <id>
julesCommand
  .command("message <id>")
  .description("Send a message to a Jules session")
  .requiredOption("-m, --message <message>", "Message content")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions/${id}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          prompt: options.message,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Jules session ${id} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const session: JulesSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        console.log(`Message sent to Jules session`);
        console.log(`  Status: ${STATUS_CONFIG[session.status].label}`);
        if (session.planSummary) {
          console.log(`  Plan: ${session.planSummary.substring(0, 100)}...`);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      process.exit(1);
    }
  });

// husky jules approve <id>
julesCommand
  .command("approve <id>")
  .description("Approve a Jules session plan")
  .option("--feedback <feedback>", "Optional feedback for the approval")
  .option("--reject", "Reject the plan instead of approving")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          approved: !options.reject,
          feedback: options.feedback,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Jules session ${id} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const session: JulesSession = await res.json();

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
      } else {
        if (options.reject) {
          console.log(`Jules plan rejected`);
        } else {
          console.log(`Jules plan approved`);
        }
        console.log(`  Status: ${STATUS_CONFIG[session.status].label}`);
      }
    } catch (error) {
      console.error("Error processing approval:", error);
      process.exit(1);
    }
  });

// husky jules activities <id>
julesCommand
  .command("activities <id>")
  .description("Get session activities")
  .option("--json", "Output as JSON")
  .option("--limit <n>", "Limit number of activities", "20")
  .option("--sync", "Sync activities from Jules API")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const url = new URL(`/api/jules-sessions/${id}/activities`, config.apiUrl);
      if (options.sync) {
        url.searchParams.set("sync", "true");
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Jules session ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const data = await res.json();
      let activities: JulesActivity[] = data.activities || [];

      // Apply limit
      const limit = parseInt(options.limit, 10);
      if (limit > 0 && activities.length > limit) {
        activities = activities.slice(-limit);
      }

      if (options.json) {
        console.log(JSON.stringify(activities, null, 2));
      } else {
        printActivities(activities);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
      process.exit(1);
    }
  });

// husky jules sources
julesCommand
  .command("sources")
  .description("List available Jules sources (GitHub repositories)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/jules-sessions/sources`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();

      if (!data.configured) {
        console.error("Error: Jules API is not configured. Add JULES_API_KEY to Secret Manager.");
        process.exit(1);
      }

      const sources: JulesSource[] = data.sources || [];

      if (options.json) {
        console.log(JSON.stringify(sources, null, 2));
      } else {
        printSources(sources);
      }
    } catch (error) {
      console.error("Error fetching Jules sources:", error);
      process.exit(1);
    }
  });

// Print helpers
function printSessions(sessions: JulesSession[]) {
  if (sessions.length === 0) {
    console.log("\n  No Jules sessions found.");
    console.log("  Create one with: husky jules create -n <name> --source <sourceId> --prompt <prompt>\n");
    return;
  }

  console.log("\n  JULES SESSIONS");
  console.log("  " + "-".repeat(100));
  console.log(
    `  ${"ID".padEnd(24)} ${"NAME".padEnd(30)} ${"STATUS".padEnd(18)} ${"SOURCE".padEnd(20)} CREATED`
  );
  console.log("  " + "-".repeat(100));

  for (const session of sessions) {
    const truncatedName = session.name.length > 28 ? session.name.substring(0, 25) + "..." : session.name;
    const sourceName = session.sourceName || session.sourceId;
    const truncatedSource = sourceName.length > 18 ? sourceName.substring(0, 15) + "..." : sourceName;
    const statusLabel = STATUS_CONFIG[session.status]?.label || session.status;
    const createdAt = new Date(session.createdAt).toLocaleDateString();

    console.log(
      `  ${session.id.padEnd(24)} ${truncatedName.padEnd(30)} ${statusLabel.padEnd(18)} ${truncatedSource.padEnd(20)} ${createdAt}`
    );
  }

  console.log("");
}

function printSessionDetail(session: JulesSession & { activities?: JulesActivity[] }, showActivities: boolean) {
  const statusConfig = STATUS_CONFIG[session.status];

  console.log(`\n  Jules Session: ${session.name}`);
  console.log("  " + "-".repeat(60));
  console.log(`  ID:               ${session.id}`);
  console.log(`  Jules Session ID: ${session.julesSessionId}`);
  console.log(`  Status:           ${statusConfig.icon} ${statusConfig.label}`);
  console.log(`  Source:           ${session.sourceName || session.sourceId}`);
  if (session.branch) {
    console.log(`  Branch:           ${session.branch}`);
  }
  console.log(`  Plan Approval:    ${session.requirePlanApproval ? "Required" : "Auto-approve"}`);

  console.log(`\n  Prompt:`);
  const promptLines = session.prompt.split("\n").slice(0, 5);
  for (const line of promptLines) {
    console.log(`    ${line.substring(0, 80)}`);
  }
  if (session.prompt.split("\n").length > 5) {
    console.log(`    ...`);
  }

  if (session.planSummary) {
    console.log(`\n  Plan Summary:`);
    console.log(`    ${session.planSummary.substring(0, 200)}`);
    if (session.planSummary.length > 200) {
      console.log(`    ...`);
    }
  }

  if (session.prUrl) {
    console.log(`\n  Pull Request:`);
    console.log(`    URL: ${session.prUrl}`);
    if (session.prNumber) {
      console.log(`    Number: #${session.prNumber}`);
    }
    if (session.commitSha) {
      console.log(`    Commit: ${session.commitSha.substring(0, 7)}`);
    }
  }

  if (session.lastError) {
    console.log(`\n  Last Error:`);
    console.log(`    ${session.lastError.substring(0, 200)}`);
  }

  if (session.taskId) {
    console.log(`\n  Linked Task: ${session.taskId}`);
  }
  if (session.workflowId) {
    console.log(`  Linked Workflow: ${session.workflowId}`);
  }

  console.log(`\n  Timestamps:`);
  console.log(`    Created:   ${new Date(session.createdAt).toLocaleString()}`);
  console.log(`    Updated:   ${new Date(session.updatedAt).toLocaleString()}`);
  if (session.startedAt) {
    console.log(`    Started:   ${new Date(session.startedAt).toLocaleString()}`);
  }
  if (session.completedAt) {
    console.log(`    Completed: ${new Date(session.completedAt).toLocaleString()}`);
  }

  if (showActivities && session.activities && session.activities.length > 0) {
    console.log(`\n  Activities (${session.activities.length}):`);
    console.log("  " + "-".repeat(60));
    printActivities(session.activities.slice(-10));
  }

  console.log("");
}

function printActivities(activities: JulesActivity[]) {
  if (activities.length === 0) {
    console.log("\n  No activities found.\n");
    return;
  }

  const typeIcons: Record<string, string> = {
    plan: "[PLAN]",
    message: "[MSG]",
    code_change: "[CODE]",
    pr_created: "[PR]",
    error: "[ERR]",
  };

  console.log("\n  ACTIVITIES");
  console.log("  " + "-".repeat(80));

  for (const activity of activities) {
    const icon = typeIcons[activity.type] || `[${activity.type.toUpperCase()}]`;
    const timestamp = new Date(activity.timestamp).toLocaleString();
    const content = activity.content.substring(0, 60);

    console.log(`  ${timestamp}  ${icon.padEnd(8)} ${content}`);
    if (activity.content.length > 60) {
      console.log(`                              ${activity.content.substring(60, 120)}...`);
    }
  }

  console.log("");
}

function printSources(sources: JulesSource[]) {
  if (sources.length === 0) {
    console.log("\n  No Jules sources configured.");
    console.log("  Connect a GitHub repository in the Jules dashboard.\n");
    return;
  }

  console.log("\n  JULES SOURCES (GitHub Repositories)");
  console.log("  " + "-".repeat(90));
  console.log(
    `  ${"ID".padEnd(24)} ${"FULL NAME".padEnd(35)} ${"DEFAULT BRANCH".padEnd(15)} CONNECTED`
  );
  console.log("  " + "-".repeat(90));

  for (const source of sources) {
    const truncatedName = source.fullName.length > 33 ? source.fullName.substring(0, 30) + "..." : source.fullName;
    const connected = source.connected ? "Yes" : "No";

    console.log(
      `  ${source.id.padEnd(24)} ${truncatedName.padEnd(35)} ${source.defaultBranch.padEnd(15)} ${connected}`
    );
  }

  console.log("");
}
