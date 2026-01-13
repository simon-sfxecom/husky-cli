/**
 * Interactive Mode: Worker Module
 *
 * Provides menu-based worker registration and management.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { getConfig, setConfig, getAuthHeaders } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";

interface Worker {
  id: string;
  name: string;
  status: string;
  currentTask?: string;
  lastHeartbeat?: string;
  createdAt: string;
}

export async function workerMenu(): Promise<void> {
  const config = ensureConfig();

  console.log("\n  WORKER");
  console.log("  " + "-".repeat(50));
  console.log("  Worker registration and management");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "👤 Who Am I", value: "whoami" },
    { name: "📝 Register Worker", value: "register" },
    { name: "📋 List Workers", value: "list" },
    { name: "📊 Activity", value: "activity" },
    { name: "💓 Send Heartbeat", value: "heartbeat" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Worker Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "whoami":
      await whoAmI();
      break;
    case "register":
      await registerWorker(config);
      break;
    case "list":
      await listWorkers(config);
      break;
    case "activity":
      await showActivity(config);
      break;
    case "heartbeat":
      await sendHeartbeat(config);
      break;
    case "back":
      return;
  }
}

async function whoAmI(): Promise<void> {
  const config = getConfig();

  console.log("\n  WORKER IDENTITY");
  console.log("  " + "-".repeat(50));

  console.log(`  Worker ID: ${config.workerId || "(not registered)"}`);
  console.log(`  Worker Name: ${config.workerName || "(not set)"}`);
  console.log(`  Role: ${config.role || "(not set)"}`);
  console.log(`  API URL: ${config.apiUrl || "(not configured)"}`);

  if (config.permissions) {
    console.log(`  Permissions: ${JSON.stringify(config.permissions)}`);
  }

  console.log("");
  await pressEnterToContinue();
}

async function registerWorker(config: ValidConfig): Promise<void> {
  try {
    const name = await input({
      message: "Worker name:",
      default: `worker-${Date.now()}`,
      validate: (v) => (v.length > 0 ? true : "Name is required"),
    });

    console.log("\n  Registering worker...");

    const res = await fetch(`${config.apiUrl}/api/workers/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();

      // Save worker info
      setConfig("workerId", data.id);
      setConfig("workerName", name);

      console.log("\n  Worker registered!");
      console.log(`  ID: ${data.id}`);
      console.log(`  Name: ${name}`);
      if (data.role) {
        console.log(`  Role: ${data.role}`);
      }
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error registering worker:", error);
    await pressEnterToContinue();
  }
}

async function listWorkers(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/workers`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const workers: Worker[] = await res.json();

    console.log("\n  WORKERS");
    console.log("  " + "-".repeat(70));

    if (workers.length === 0) {
      console.log("  No workers registered.");
    } else {
      console.log(`  ${"ID".padEnd(12)} ${"NAME".padEnd(20)} ${"STATUS".padEnd(12)} ${"LAST HEARTBEAT"}`);
      console.log("  " + "-".repeat(70));

      for (const worker of workers) {
        const heartbeat = worker.lastHeartbeat ? formatDate(worker.lastHeartbeat) : "-";
        console.log(
          `  ${worker.id.substring(0, 10).padEnd(12)} ${truncate(worker.name, 18).padEnd(20)} ${worker.status.padEnd(12)} ${heartbeat}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching workers:", error);
    await pressEnterToContinue();
  }
}

async function showActivity(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/workers/activity`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const workers: Worker[] = await res.json();

    console.log("\n  WORKER ACTIVITY");
    console.log("  " + "-".repeat(70));

    if (workers.length === 0) {
      console.log("  No active workers.");
    } else {
      for (const worker of workers) {
        console.log(`  Worker: ${worker.name} (${worker.id.substring(0, 8)})`);
        console.log(`  Status: ${worker.status}`);
        console.log(`  Current Task: ${worker.currentTask || "none"}`);
        console.log(`  Last Heartbeat: ${worker.lastHeartbeat ? new Date(worker.lastHeartbeat).toLocaleString() : "-"}`);
        console.log("  " + "-".repeat(40));
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching activity:", error);
    await pressEnterToContinue();
  }
}

async function sendHeartbeat(config: ValidConfig): Promise<void> {
  try {
    const localConfig = getConfig();

    if (!localConfig.workerId) {
      console.error("\n  Error: Worker not registered. Register first.\n");
      await pressEnterToContinue();
      return;
    }

    console.log("\n  Sending heartbeat...");

    const res = await fetch(`${config.apiUrl}/api/workers/${localConfig.workerId}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({ status: "active" }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log("\n  Heartbeat sent successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error sending heartbeat:", error);
    await pressEnterToContinue();
  }
}
