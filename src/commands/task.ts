import { Command } from "commander";
import { getConfig } from "./config.js";

export const taskCommand = new Command("task")
  .description("Manage tasks");

// husky task list
taskCommand
  .command("list")
  .description("List all tasks")
  .option("-s, --status <status>", "Filter by status")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const url = new URL("/api/tasks", config.apiUrl);
      if (options.status) {
        url.searchParams.set("status", options.status);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const tasks = await res.json();
      printTasks(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      process.exit(1);
    }
  });

// husky task start <id>
taskCommand
  .command("start <id>")
  .description("Start working on a task")
  .action(async (id) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/tasks/${id}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ agent: "claude-code" }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const task = await res.json();
      console.log(`✓ Started: ${task.title}`);
    } catch (error) {
      console.error("Error starting task:", error);
      process.exit(1);
    }
  });

// husky task done <id>
taskCommand
  .command("done <id>")
  .description("Mark task as done")
  .option("--pr <url>", "Link to PR")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/tasks/${id}/done`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ prUrl: options.pr }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const task = await res.json();
      console.log(`✓ Completed: ${task.title}`);
    } catch (error) {
      console.error("Error completing task:", error);
      process.exit(1);
    }
  });

// husky task create <title>
taskCommand
  .command("create <title>")
  .description("Create a new task")
  .option("-d, --description <desc>", "Task description")
  .option("--project <projectId>", "Project ID")
  .option("--path <path>", "Path in project")
  .option("-p, --priority <priority>", "Priority (low, medium, high)", "medium")
  .action(async (title, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          title,
          description: options.description,
          projectId: options.project,
          linkedPath: options.path,
          priority: options.priority,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const task = await res.json();
      console.log(`✓ Created: #${task.id} ${task.title}`);
    } catch (error) {
      console.error("Error creating task:", error);
      process.exit(1);
    }
  });

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  agent?: string;
}

function printTasks(tasks: Task[]) {
  const byStatus: Record<string, Task[]> = {
    backlog: [],
    in_progress: [],
    review: [],
    done: [],
  };

  for (const task of tasks) {
    if (byStatus[task.status]) {
      byStatus[task.status].push(task);
    }
  }

  const statusLabels: Record<string, string> = {
    backlog: "BACKLOG",
    in_progress: "IN PROGRESS",
    review: "REVIEW",
    done: "DONE",
  };

  for (const [status, label] of Object.entries(statusLabels)) {
    const statusTasks = byStatus[status];
    if (statusTasks.length === 0) continue;

    console.log(`\n  ${label}`);
    console.log("  " + "─".repeat(50));

    for (const task of statusTasks) {
      const agentStr = task.agent ? ` (${task.agent})` : "";
      const doneStr = status === "done" ? " ✓" : "";
      console.log(
        `  #${task.id.slice(0, 6)}  ${task.title.padEnd(30)}  ${task.priority}${agentStr}${doneStr}`
      );
    }
  }

  console.log("");
}
