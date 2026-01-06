import { Command } from "commander";
import { getConfig } from "./config.js";
import * as readline from "readline";

export const processCommand = new Command("process")
  .description("Manage processes");

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

// TypeScript interface
interface Process {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Status labels
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  draft: "Draft",
  archived: "Archived",
};

// husky process list
processCommand
  .command("list")
  .description("List all processes")
  .option("--json", "Output as JSON")
  .option("--status <status>", "Filter by status")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const url = new URL("/api/processes", config.apiUrl);
      if (options.status) {
        url.searchParams.set("status", options.status);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const processes: Process[] = await res.json();

      if (options.json) {
        console.log(JSON.stringify(processes, null, 2));
      } else {
        printProcesses(processes);
      }
    } catch (error) {
      console.error("Error fetching processes:", error);
      process.exit(1);
    }
  });

// husky process create <name>
processCommand
  .command("create <name>")
  .description("Create a new process")
  .option("-d, --description <desc>", "Process description")
  .option("--status <status>", "Initial status")
  .option("--json", "Output as JSON")
  .action(async (name, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/processes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name,
          description: options.description,
          status: options.status,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${res.status}`);
      }

      const processData: Process = await res.json();

      if (options.json) {
        console.log(JSON.stringify(processData, null, 2));
      } else {
        console.log(`Created process: ${processData.name}`);
        console.log(`  ID: ${processData.id}`);
        console.log(`  Status: ${processData.status}`);
      }
    } catch (error) {
      console.error("Error creating process:", error);
      process.exit(1);
    }
  });

// husky process get <id>
processCommand
  .command("get <id>")
  .description("Get process details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/processes/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Process ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const processData: Process = await res.json();

      if (options.json) {
        console.log(JSON.stringify(processData, null, 2));
      } else {
        printProcessDetail(processData);
      }
    } catch (error) {
      console.error("Error fetching process:", error);
      process.exit(1);
    }
  });

// husky process update <id>
processCommand
  .command("update <id>")
  .description("Update a process")
  .option("-n, --name <name>", "New name")
  .option("-d, --description <desc>", "New description")
  .option("--status <status>", "New status")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload with only changed fields
    const updates: Record<string, string> = {};
    if (options.name) updates.name = options.name;
    if (options.description) updates.description = options.description;
    if (options.status) updates.status = options.status;

    if (Object.keys(updates).length === 0) {
      console.error("Error: No update options provided.");
      console.log("Use -n/--name, -d/--description, or --status");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/processes/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Process ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const processData: Process = await res.json();

      if (options.json) {
        console.log(JSON.stringify(processData, null, 2));
      } else {
        console.log(`Process updated successfully`);
        console.log(`  Name: ${processData.name}`);
        console.log(`  Status: ${processData.status}`);
        const changedFields = Object.keys(updates).join(", ");
        console.log(`  Changed: ${changedFields}`);
      }
    } catch (error) {
      console.error("Error updating process:", error);
      process.exit(1);
    }
  });

// husky process delete <id>
processCommand
  .command("delete <id>")
  .description("Delete a process")
  .option("--force", "Skip confirmation")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Confirm deletion unless --force is provided
    if (!options.force) {
      // First fetch process details to show what will be deleted
      try {
        const getRes = await fetch(`${config.apiUrl}/api/processes/${id}`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!getRes.ok) {
          if (getRes.status === 404) {
            console.error(`Error: Process ${id} not found`);
          } else {
            console.error(`Error: API returned ${getRes.status}`);
          }
          process.exit(1);
        }

        const processData: Process = await getRes.json();
        const confirmed = await confirm(`Delete process "${processData.name}" (${id})?`);

        if (!confirmed) {
          console.log("Deletion cancelled.");
          process.exit(0);
        }
      } catch (error) {
        console.error("Error fetching process:", error);
        process.exit(1);
      }
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/processes/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Process ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      console.log(`Process deleted`);
    } catch (error) {
      console.error("Error deleting process:", error);
      process.exit(1);
    }
  });

// ============================================
// OUTPUT FORMATTERS
// ============================================

function printProcesses(processes: Process[]) {
  if (processes.length === 0) {
    console.log("\n  No processes found.");
    console.log("  Create one with: husky process create <name>\n");
    return;
  }

  console.log("\n  PROCESSES");
  console.log("  " + "-".repeat(70));
  console.log(
    `  ${"ID".padEnd(24)} ${"NAME".padEnd(30)} ${"STATUS".padEnd(12)}`
  );
  console.log("  " + "-".repeat(70));

  for (const proc of processes) {
    const statusLabel = STATUS_LABELS[proc.status] || proc.status;
    const truncatedName = proc.name.length > 28 ? proc.name.substring(0, 25) + "..." : proc.name;

    console.log(
      `  ${proc.id.padEnd(24)} ${truncatedName.padEnd(30)} ${statusLabel}`
    );
  }

  console.log("  " + "-".repeat(70));
  console.log(`  Total: ${processes.length} process(es)\n`);
}

function printProcessDetail(proc: Process) {
  const statusLabel = STATUS_LABELS[proc.status] || proc.status;

  console.log(`\n  Process: ${proc.name}`);
  console.log("  " + "=".repeat(60));
  console.log(`  ID:          ${proc.id}`);
  console.log(`  Status:      ${statusLabel}`);

  if (proc.description) {
    console.log(`  Description: ${proc.description}`);
  }

  console.log(`  Created:     ${new Date(proc.createdAt).toLocaleString()}`);
  console.log(`  Updated:     ${new Date(proc.updatedAt).toLocaleString()}`);
  console.log("");
}
