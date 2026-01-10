import { Command } from "commander";
import { getConfig } from "./config.js";
import { getWorkerIdentity, ensureWorkerRegistered } from "../lib/worker.js";

export const workerCommand = new Command("worker")
  .description("Manage workers and sessions");

// husky worker whoami - Show current worker identity
workerCommand
  .command("whoami")
  .description("Show current worker identity")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    const identity = getWorkerIdentity();

    // Fetch role from API, fallback to cached config
    let role = config.role || "unknown";
    let permissions: string[] = config.permissions || [];
    let roleSource = "cached";

    if (config.apiUrl && config.apiKey) {
      try {
        const res = await fetch(`${config.apiUrl}/api/auth/whoami`, {
          headers: { "x-api-key": config.apiKey },
        });
        if (res.ok) {
          const data = await res.json();
          role = data.role || role;
          permissions = data.permissions || permissions;
          roleSource = "api";
        }
      } catch {
        // Fallback to cached role from config
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ ...identity, role, permissions, roleSource }, null, 2));
    } else {
      console.log("\n  Worker Identity");
      console.log("  " + "─".repeat(40));
      console.log(`  ID:       ${identity.workerId}`);
      console.log(`  Name:     ${identity.workerName}`);
      console.log(`  Host:     ${identity.hostname}`);
      console.log(`  User:     ${identity.username}`);
      console.log(`  Platform: ${identity.platform}`);
      console.log(`  Version:  ${identity.agentVersion}`);
      console.log("  " + "─".repeat(40));
      console.log(`  Role:     ${role}${roleSource === "cached" ? " (cached)" : ""}`);
      if (permissions.length > 0) {
        console.log(`  Perms:    ${permissions.join(", ")}`);
      }
      console.log("");
    }
  });

// husky worker register - Register worker with API
workerCommand
  .command("register")
  .description("Register this worker with the API")
  .action(async () => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const workerId = await ensureWorkerRegistered(config.apiUrl, config.apiKey || "");
      const identity = getWorkerIdentity();
      console.log(`✓ Worker registered: ${workerId}`);
      console.log(`  Name: ${identity.workerName}`);
    } catch (error) {
      console.error("Error registering worker:", error);
      process.exit(1);
    }
  });

// husky worker list - List all registered workers
workerCommand
  .command("list")
  .description("List all registered workers")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/workers`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const workers = await res.json();

      if (options.json) {
        console.log(JSON.stringify(workers, null, 2));
        return;
      }

      if (workers.length === 0) {
        console.log("No workers registered.");
        return;
      }

      console.log("\n  Registered Workers");
      console.log("  " + "─".repeat(60));

      for (const worker of workers) {
        const statusIcon = worker.lastSeen && isRecent(worker.lastSeen) ? "🟢" : "⚪";
        const typeIcon = worker.type === "claude-code" ? "🤖" : "👤";
        console.log(`  ${statusIcon} ${typeIcon} ${worker.id.slice(0, 12).padEnd(12)} │ ${worker.name?.slice(0, 30).padEnd(30)} │ ${worker.hostname || "—"}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error fetching workers:", error);
      process.exit(1);
    }
  });

// husky worker sessions - List active sessions
workerCommand
  .command("sessions")
  .description("List active worker sessions")
  .option("--all", "Show all sessions (not just active)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const endpoint = options.all
        ? `${config.apiUrl}/api/workers/sessions`
        : `${config.apiUrl}/api/workers/sessions/active`;

      const res = await fetch(endpoint, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const sessions = await res.json();

      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      if (sessions.length === 0) {
        console.log(options.all ? "No sessions found." : "No active sessions.");
        return;
      }

      console.log(`\n  ${options.all ? "All" : "Active"} Sessions`);
      console.log("  " + "─".repeat(70));

      for (const session of sessions) {
        const statusIcon = session.status === "active" ? "🟢" : "⚪";
        const taskInfo = session.currentTaskId ? `Task: ${session.currentTaskId.slice(0, 8)}` : "No task";
        const timeAgo = session.lastHeartbeat ? formatTimeAgo(session.lastHeartbeat) : "—";
        console.log(`  ${statusIcon} ${session.id.slice(0, 12).padEnd(12)} │ ${session.workerId.slice(0, 12).padEnd(12)} │ ${taskInfo.padEnd(20)} │ ${timeAgo}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error fetching sessions:", error);
      process.exit(1);
    }
  });

// husky worker activity - Show who is working on what
workerCommand
  .command("activity")
  .description("Show current activity (who is working on what)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      // Fetch active sessions and in-progress tasks in parallel
      const [sessionsRes, tasksRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/workers/sessions/active`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        }),
        fetch(`${config.apiUrl}/api/tasks?status=in_progress`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        }),
      ]);

      if (!sessionsRes.ok || !tasksRes.ok) {
        throw new Error("API error fetching activity");
      }

      const sessions = await sessionsRes.json();
      const tasks = await tasksRes.json();

      if (options.json) {
        console.log(JSON.stringify({ sessions, tasks }, null, 2));
        return;
      }

      console.log("\n  Current Activity");
      console.log("  " + "═".repeat(70));

      if (tasks.length === 0) {
        console.log("  No tasks currently in progress.");
      } else {
        for (const task of tasks) {
          const agentIcon = task.agent?.includes("claude") ? "🤖" : task.agent ? "👤" : "❓";
          const workerInfo = task.workerId ? `Worker: ${task.workerId.slice(0, 8)}` : "No worker";
          console.log(`\n  ${agentIcon} ${task.title.slice(0, 50)}`);
          console.log(`     ID: ${task.id.slice(0, 12)} │ ${task.agent || "unassigned"} │ ${workerInfo}`);
          if (task.projectName) {
            console.log(`     Project: ${task.projectName}`);
          }
        }
      }

      console.log("\n  " + "─".repeat(70));
      console.log(`  Active Sessions: ${sessions.length}`);
      console.log(`  Tasks In Progress: ${tasks.length}`);
      console.log("");
    } catch (error) {
      console.error("Error fetching activity:", error);
      process.exit(1);
    }
  });

// Helper: Check if timestamp is recent (within 5 minutes)
function isRecent(timestamp: string): boolean {
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff < 5 * 60 * 1000; // 5 minutes
}

// Helper: Format time ago
function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
