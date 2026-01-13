import { select, input, confirm } from "@inquirer/prompts";
import { getAuthHeaders } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate } from "./utils.js";

interface VMSession {
  id: string;
  name: string;
  vmStatus: string;
  agentType: string;
  prompt?: string;
}

export async function vmSessionsMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all VM sessions", value: "list" },
    { name: "View session details", value: "view" },
    { name: "Create new session", value: "create" },
    { name: "Start VM", value: "start" },
    { name: "Stop VM", value: "stop" },
    { name: "View logs", value: "logs" },
    { name: "Approve plan", value: "approve" },
    { name: "Delete session", value: "delete" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "VM Sessions:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listVMSessions(config);
      break;
    case "view":
      await viewVMSession(config);
      break;
    case "create":
      await createVMSession(config);
      break;
    case "start":
      await startVM(config);
      break;
    case "stop":
      await stopVM(config);
      break;
    case "logs":
      await viewLogs(config);
      break;
    case "approve":
      await approvePlan(config);
      break;
    case "delete":
      await deleteVMSession(config);
      break;
    case "back":
      return;
  }
}

async function fetchVMSessions(config: ValidConfig): Promise<VMSession[]> {
  const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data = await res.json();
  return data.sessions || [];
}

async function selectVMSession(config: ValidConfig, message: string): Promise<VMSession | null> {
  const sessions = await fetchVMSessions(config);
  if (sessions.length === 0) {
    console.log("\n  No VM sessions found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = sessions.map((s) => ({
    name: `[${s.vmStatus}] ${truncate(s.name, 35)} (${s.agentType})`,
    value: s.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const sessionId = await select({ message, choices });
  if (sessionId === "__cancel__") return null;

  return sessions.find((s) => s.id === sessionId) || null;
}

async function listVMSessions(config: ValidConfig): Promise<void> {
  try {
    const sessions = await fetchVMSessions(config);

    console.log("\n  VM SESSIONS");
    console.log("  " + "-".repeat(70));

    if (sessions.length === 0) {
      console.log("  No VM sessions found.");
    } else {
      for (const session of sessions) {
        const statusLabel = session.vmStatus.replace(/_/g, " ").toUpperCase();
        console.log(`  [${statusLabel}] ${truncate(session.name, 40)} (${session.agentType})`);
        console.log(`      ID: ${session.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching VM sessions:", error);
    await pressEnterToContinue();
  }
}

async function viewVMSession(config: ValidConfig): Promise<void> {
  try {
    const session = await selectVMSession(config, "Select session to view:");
    if (!session) return;

    const res = await fetch(`${config.apiUrl}/api/vm-sessions/${session.id}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const full = await res.json();

    console.log(`\n  VM Session: ${full.name}`);
    console.log("  " + "-".repeat(50));
    console.log(`  ID:        ${full.id}`);
    console.log(`  Status:    ${full.vmStatus}`);
    console.log(`  Agent:     ${full.agentType}`);
    if (full.prompt) {
      console.log(`  Prompt:    ${truncate(full.prompt, 50)}`);
    }
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing session:", error);
    await pressEnterToContinue();
  }
}

async function createVMSession(config: ValidConfig): Promise<void> {
  try {
    const name = await input({
      message: "Session name:",
      validate: (v) => (v.length > 0 ? true : "Name required"),
    });

    const prompt = await input({
      message: "Prompt (task description):",
      validate: (v) => (v.length > 0 ? true : "Prompt required"),
    });

    const agentType = await select({
      message: "Agent type:",
      choices: [
        { name: "OpenCode", value: "opencode" },
        { name: "Claude Code", value: "claude-code" },
        { name: "Gemini CLI", value: "gemini-cli" },
        { name: "Custom", value: "custom" },
      ],
      default: "opencode",
    });

    const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({
        name,
        prompt,
        agentType,
        machineType: "e2-medium",
        zone: "us-central1-a",
        startTrigger: "manual",
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
      await pressEnterToContinue();
      return;
    }

    const session = await res.json();
    console.log(`\n  ✓ VM session created!`);
    console.log(`  ID: ${session.id}`);
    console.log(`  Name: ${session.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating session:", error);
    await pressEnterToContinue();
  }
}

async function startVM(config: ValidConfig): Promise<void> {
  try {
    const session = await selectVMSession(config, "Select session to start:");
    if (!session) return;

    console.log("\n  Starting VM... This may take a moment.\n");

    const res = await fetch(`${config.apiUrl}/api/vm-sessions/${session.id}/start`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`  ✓ VM started: ${session.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error starting VM:", error);
    await pressEnterToContinue();
  }
}

async function stopVM(config: ValidConfig): Promise<void> {
  try {
    const session = await selectVMSession(config, "Select session to stop:");
    if (!session) return;

    const res = await fetch(`${config.apiUrl}/api/vm-sessions/${session.id}/stop`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ VM stopped: ${session.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error stopping VM:", error);
    await pressEnterToContinue();
  }
}

async function viewLogs(config: ValidConfig): Promise<void> {
  try {
    const session = await selectVMSession(config, "Select session to view logs:");
    if (!session) return;

    const res = await fetch(`${config.apiUrl}/api/vm-sessions/${session.id}/logs?tail=30`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const data = await res.json();
    const logs = data.logs || [];

    console.log(`\n  Logs for: ${session.name}`);
    console.log("  " + "-".repeat(50));

    if (logs.length === 0) {
      console.log("  No logs available.");
    } else {
      for (const log of logs) {
        console.log(`  ${log.timestamp || ""} ${log.message || log}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching logs:", error);
    await pressEnterToContinue();
  }
}

async function approvePlan(config: ValidConfig): Promise<void> {
  try {
    const session = await selectVMSession(config, "Select session to approve:");
    if (!session) return;

    const confirmed = await confirm({
      message: `Approve plan for "${session.name}"?`,
      default: true,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/vm-sessions/${session.id}/approve`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Plan approved!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error approving plan:", error);
    await pressEnterToContinue();
  }
}

async function deleteVMSession(config: ValidConfig): Promise<void> {
  try {
    const session = await selectVMSession(config, "Select session to delete:");
    if (!session) return;

    const confirmed = await confirm({
      message: `Delete "${session.name}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/vm-sessions/${session.id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Session deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting session:", error);
    await pressEnterToContinue();
  }
}
