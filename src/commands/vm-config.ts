import { Command } from "commander";
import { getConfig } from "./config.js";
import * as readline from "readline";

export const vmConfigCommand = new Command("vm-config")
  .description("Manage VM configurations");

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
interface VMConfig {
  id: string;
  name: string;
  zone: string;
  machineType: string;
  diskSizeGb: number;
  autoStartEnabled: boolean;
  maxConcurrentVMs: number;
  maxRuntimeMinutes: number;
  dailyBudgetUsd: number;
  aiReviewEnabled: boolean;
  humanReviewRequired: boolean;
  autoApproveThreshold: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

// husky vm-config list
vmConfigCommand
  .command("list")
  .description("List all VM configurations")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-configs`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const configs: VMConfig[] = await res.json();

      if (options.json) {
        console.log(JSON.stringify(configs, null, 2));
      } else {
        printVMConfigs(configs);
      }
    } catch (error) {
      console.error("Error fetching VM configs:", error);
      process.exit(1);
    }
  });

// husky vm-config get <id>
vmConfigCommand
  .command("get <id>")
  .description("Get VM configuration details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-configs/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM config ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const vmConfig: VMConfig = await res.json();

      if (options.json) {
        console.log(JSON.stringify(vmConfig, null, 2));
      } else {
        printVMConfigDetail(vmConfig);
      }
    } catch (error) {
      console.error("Error fetching VM config:", error);
      process.exit(1);
    }
  });

// husky vm-config create <name>
vmConfigCommand
  .command("create <name>")
  .description("Create a new VM configuration")
  .option("--machine-type <type>", "GCP machine type (e.g., e2-medium)", "e2-medium")
  .option("--zone <zone>", "GCP zone", "europe-west1-b")
  .option("--disk-size <size>", "Disk size in GB", "20")
  .option("--image <image>", "Base image")
  .option("--max-runtime <minutes>", "Max runtime in minutes", "60")
  .option("--max-concurrent <n>", "Max concurrent VMs", "3")
  .option("--daily-budget <usd>", "Daily budget in USD", "10")
  .option("--json", "Output as JSON")
  .action(async (name, options) => {
    const config = ensureConfig();

    try {
      const createPayload: Record<string, unknown> = {
        name,
        machineType: options.machineType,
        zone: options.zone,
        diskSizeGb: parseInt(options.diskSize, 10),
        maxRuntimeMinutes: parseInt(options.maxRuntime, 10),
        maxConcurrentVMs: parseInt(options.maxConcurrent, 10),
        dailyBudgetUsd: parseFloat(options.dailyBudget),
      };

      if (options.image) {
        createPayload.baseImage = options.image;
      }

      const res = await fetch(`${config.apiUrl}/api/vm-configs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(createPayload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${res.status}`);
      }

      const vmConfig: VMConfig = await res.json();

      if (options.json) {
        console.log(JSON.stringify(vmConfig, null, 2));
      } else {
        console.log(`Created VM config: ${vmConfig.name}`);
        console.log(`  ID:           ${vmConfig.id}`);
        console.log(`  Machine Type: ${vmConfig.machineType}`);
        console.log(`  Zone:         ${vmConfig.zone}`);
        console.log(`  Disk Size:    ${vmConfig.diskSizeGb} GB`);
      }
    } catch (error) {
      console.error("Error creating VM config:", error);
      process.exit(1);
    }
  });

// husky vm-config update <id>
vmConfigCommand
  .command("update <id>")
  .description("Update a VM configuration")
  .option("-n, --name <name>", "New name")
  .option("--machine-type <type>", "GCP machine type (e.g., e2-medium)")
  .option("--zone <zone>", "GCP zone")
  .option("--disk-size <size>", "Disk size in GB")
  .option("--image <image>", "Base image")
  .option("--max-runtime <minutes>", "Max runtime in minutes")
  .option("--max-concurrent <n>", "Max concurrent VMs")
  .option("--daily-budget <usd>", "Daily budget in USD")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (options.name) updateData.name = options.name;
    if (options.machineType) updateData.machineType = options.machineType;
    if (options.zone) updateData.zone = options.zone;
    if (options.diskSize) updateData.diskSizeGb = parseInt(options.diskSize, 10);
    if (options.image) updateData.baseImage = options.image;
    if (options.maxRuntime) updateData.maxRuntimeMinutes = parseInt(options.maxRuntime, 10);
    if (options.maxConcurrent) updateData.maxConcurrentVMs = parseInt(options.maxConcurrent, 10);
    if (options.dailyBudget) updateData.dailyBudgetUsd = parseFloat(options.dailyBudget);

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided. Use --help for available options.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-configs/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM config ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const vmConfig: VMConfig = await res.json();

      if (options.json) {
        console.log(JSON.stringify(vmConfig, null, 2));
      } else {
        console.log(`VM config updated successfully`);
        console.log(`  Name:         ${vmConfig.name}`);
        console.log(`  Machine Type: ${vmConfig.machineType}`);
        console.log(`  Zone:         ${vmConfig.zone}`);
      }
    } catch (error) {
      console.error("Error updating VM config:", error);
      process.exit(1);
    }
  });

// husky vm-config delete <id>
vmConfigCommand
  .command("delete <id>")
  .description("Delete a VM configuration")
  .option("--force", "Skip confirmation")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Prevent deletion of default config
    if (id === "default") {
      console.error("Error: Cannot delete the default VM config");
      process.exit(1);
    }

    // Confirm deletion unless --force is provided
    if (!options.force) {
      try {
        const getRes = await fetch(`${config.apiUrl}/api/vm-configs/${id}`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });

        if (!getRes.ok) {
          if (getRes.status === 404) {
            console.error(`Error: VM config ${id} not found`);
          } else {
            console.error(`Error: API returned ${getRes.status}`);
          }
          process.exit(1);
        }

        const vmConfig: VMConfig = await getRes.json();
        const confirmed = await confirm(`Delete VM config "${vmConfig.name}" (${id})?`);

        if (!confirmed) {
          console.log("Deletion cancelled.");
          process.exit(0);
        }
      } catch (error) {
        console.error("Error fetching VM config:", error);
        process.exit(1);
      }
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/vm-configs/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: VM config ${id} not found`);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      console.log(`VM config deleted`);
    } catch (error) {
      console.error("Error deleting VM config:", error);
      process.exit(1);
    }
  });

// Print helpers
function printVMConfigs(configs: VMConfig[]) {
  if (configs.length === 0) {
    console.log("\n  No VM configs found.");
    console.log("  Create one with: husky vm-config create <name>\n");
    return;
  }

  console.log("\n  VM CONFIGURATIONS");
  console.log("  " + "-".repeat(90));
  console.log(
    `  ${"ID".padEnd(24)} ${"NAME".padEnd(20)} ${"MACHINE TYPE".padEnd(14)} ${"ZONE".padEnd(18)} DISK`
  );
  console.log("  " + "-".repeat(90));

  for (const cfg of configs) {
    const truncatedName = cfg.name.length > 18 ? cfg.name.substring(0, 15) + "..." : cfg.name;

    console.log(
      `  ${cfg.id.padEnd(24)} ${truncatedName.padEnd(20)} ${cfg.machineType.padEnd(14)} ${cfg.zone.padEnd(18)} ${cfg.diskSizeGb}GB`
    );
  }

  console.log("");
}

function printVMConfigDetail(vmConfig: VMConfig) {
  console.log(`\n  VM Config: ${vmConfig.name}`);
  console.log("  " + "-".repeat(60));
  console.log(`  ID:              ${vmConfig.id}`);
  console.log(`  Name:            ${vmConfig.name}`);

  console.log("\n  GCP Settings:");
  console.log(`    Machine Type:  ${vmConfig.machineType}`);
  console.log(`    Zone:          ${vmConfig.zone}`);
  console.log(`    Disk Size:     ${vmConfig.diskSizeGb} GB`);

  console.log("\n  Limits:");
  console.log(`    Max Runtime:   ${vmConfig.maxRuntimeMinutes} minutes`);
  console.log(`    Max Concurrent: ${vmConfig.maxConcurrentVMs}`);
  console.log(`    Daily Budget:  $${vmConfig.dailyBudgetUsd.toFixed(2)}`);

  console.log("\n  Auto-Start:");
  console.log(`    Enabled:       ${vmConfig.autoStartEnabled ? "Yes" : "No"}`);

  console.log("\n  Review Settings:");
  console.log(`    AI Review:     ${vmConfig.aiReviewEnabled ? "Enabled" : "Disabled"}`);
  console.log(`    Human Review:  ${vmConfig.humanReviewRequired ? "Required" : "Optional"}`);
  console.log(`    Auto-Approve:  ${vmConfig.autoApproveThreshold}% confidence threshold`);

  console.log("\n  Retry Settings:");
  console.log(`    Max Retries:   ${vmConfig.maxRetries}`);

  console.log(`\n  Created:  ${new Date(vmConfig.createdAt).toLocaleString()}`);
  console.log(`  Updated:  ${new Date(vmConfig.updatedAt).toLocaleString()}`);

  console.log("");
}
