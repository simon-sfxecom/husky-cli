import { select, input } from "@inquirer/prompts";
import { getConfig, setConfig } from "./config.js";

// Import modular menus
import { tasksMenu } from "./interactive/tasks.js";
import { projectsMenu } from "./interactive/projects.js";
import { ideasMenu } from "./interactive/ideas.js";
import { departmentsMenu } from "./interactive/departments.js";
import { processesMenu } from "./interactive/processes.js";
import { workflowsMenu } from "./interactive/workflows.js";
import { vmSessionsMenu } from "./interactive/vm-sessions.js";

import { roadmapsMenu } from "./interactive/roadmaps.js";
import { strategyMenu } from "./interactive/strategy.js";
import { changelogMenu } from "./interactive/changelog.js";
import { worktreesMenu } from "./interactive/worktrees.js";
import { businessMenu } from "./interactive/business.js";

// New menus (v1.15.0)
import { chatMenu } from "./interactive/chat.js";
import { brainMenu } from "./interactive/brain.js";
import { authMenu } from "./interactive/auth.js";
import { workerMenu } from "./interactive/worker.js";
import { infraMenu } from "./interactive/infra.js";
import { prMenu } from "./interactive/pr.js";
import { previewMenu } from "./interactive/preview.js";
import { toolsMenu } from "./interactive/tools.js";

import { clearScreen, printHeader, pressEnterToContinue, ValidConfig } from "./interactive/utils.js";

// Menu item type
interface MenuItem {
  name: string;
  value: string;
  description?: string;
}

// ============================================
// MAIN MENU
// ============================================

export async function runInteractiveMode(): Promise<void> {
  let running = true;

  while (running) {
    clearScreen();
    printHeader();

    const mainMenuItems: MenuItem[] = [
      { name: "📋 Tasks", value: "tasks", description: "Manage tasks" },
      { name: "📁 Projects", value: "projects", description: "Manage projects" },
      { name: "💡 Ideas", value: "ideas", description: "Manage ideas" },
      { name: "---", value: "separator1", description: "" },
      { name: "🗺️  Roadmaps", value: "roadmaps", description: "Manage roadmaps" },
      { name: "⚡ Workflows", value: "workflows", description: "Manage workflows" },
      { name: "🏢 Departments", value: "departments", description: "Manage departments" },
      { name: "🔄 Processes", value: "processes", description: "Manage processes" },
      { name: "---", value: "separator2", description: "" },
      { name: "💬 Chat", value: "chat", description: "Google Chat & messaging" },
      { name: "🧠 Brain", value: "brain", description: "Agent memory & learnings" },
      { name: "---", value: "separator3", description: "" },
      { name: "💻 VM Sessions", value: "vm", description: "Manage VM sessions" },
      { name: "🌳 Worktrees", value: "worktrees", description: "Git worktrees for agent isolation" },
      { name: "👷 Workers", value: "worker", description: "Worker registration" },
      { name: "🔐 Auth", value: "auth", description: "API keys & sessions" },
      { name: "---", value: "separator4", description: "" },
      { name: "🏗️  Infrastructure", value: "infra", description: "Monitoring & health" },
      { name: "🔀 Pull Requests", value: "pr", description: "PR management" },
      { name: "👁️  Previews", value: "preview", description: "PR preview deployments" },
      { name: "---", value: "separator5", description: "" },
      { name: "💼 Business Operations", value: "business", description: "Billbee, Zendesk, SeaTable, Qdrant" },
      { name: "📈 Business Strategy", value: "strategy", description: "Manage business strategy" },
      { name: "📝 Changelog", value: "changelog", description: "Generate and manage changelogs" },
      { name: "🛠️  Tools", value: "tools", description: "YouTube, Image, Mermaid, E2E" },
      { name: "---", value: "separator6", description: "" },
      { name: "⚙️  Dashboard Settings", value: "settings", description: "Manage dashboard settings" },
      { name: "🔧 CLI Config", value: "config", description: "Configure CLI (API URL, API Key)" },
      { name: "---", value: "separator7", description: "" },
      { name: "🚪 Exit", value: "exit", description: "Exit interactive mode" },
    ];

    try {
      const choice = await select({
        message: "Select an option:",
        choices: mainMenuItems.filter((item) => !item.value.startsWith("separator")),
      });

      switch (choice) {
        case "tasks":
          await tasksMenu();
          break;
        case "projects":
          await projectsMenu();
          break;
        case "ideas":
          await ideasMenu();
          break;
        case "roadmaps":
          await roadmapsMenu();
          break;
        case "workflows":
          await workflowsMenu();
          break;
        case "departments":
          await departmentsMenu();
          break;
        case "processes":
          await processesMenu();
          break;
        case "chat":
          await chatMenu();
          break;
        case "brain":
          await brainMenu();
          break;
        case "vm":
          await vmSessionsMenu();
          break;
        case "worktrees":
          await worktreesMenu();
          break;
        case "worker":
          await workerMenu();
          break;
        case "auth":
          await authMenu();
          break;
        case "infra":
          await infraMenu();
          break;
        case "pr":
          await prMenu();
          break;
        case "preview":
          await previewMenu();
          break;
        case "strategy":
          await strategyMenu();
          break;
        case "business":
          await businessMenu();
          break;
        case "changelog":
          await changelogMenu();
          break;
        case "tools":
          await toolsMenu();
          break;
        case "settings":
          await settingsMenu();
          break;
        case "config":
          await cliConfigMenu();
          break;
        case "exit":
          running = false;
          console.log("\n  Goodbye!\n");
          break;
      }
    } catch (error) {
      // User pressed Ctrl+C or escaped
      if ((error as Error).name === "ExitPromptError") {
        running = false;
        console.log("\n  Goodbye!\n");
      } else {
        throw error;
      }
    }
  }
}

// ============================================
// SETTINGS MENU (kept in main file - small)
// ============================================

async function settingsMenu(): Promise<void> {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    await pressEnterToContinue();
    return;
  }

  const menuItems: MenuItem[] = [
    { name: "Show all settings", value: "show" },
    { name: "Update a setting", value: "update" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Settings:",
    choices: menuItems,
  });

  switch (choice) {
    case "show":
      await showSettings(config as ValidConfig);
      break;
    case "update":
      await updateSetting(config as ValidConfig);
      break;
    case "back":
      return;
  }
}

async function showSettings(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/settings`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const data = await res.json();

    console.log("\n  SETTINGS");
    console.log("  " + "-".repeat(70));

    const entries = Object.entries(data);
    if (entries.length === 0) {
      console.log("  No settings found.");
    } else {
      for (const [key, value] of entries) {
        const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value);
        console.log(`  ${key.padEnd(30)} ${valueStr.substring(0, 36)}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching settings:", error);
    await pressEnterToContinue();
  }
}

async function updateSetting(config: ValidConfig): Promise<void> {
  try {
    const key = await input({
      message: "Setting key:",
      validate: (value) => (value.length > 0 ? true : "Key is required"),
    });

    const value = await input({
      message: "New value:",
      validate: (v) => (v.length > 0 ? true : "Value is required"),
    });

    // Try to parse as JSON
    let parsedValue: unknown = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Keep as string
    }

    const res = await fetch(`${config.apiUrl}/api/settings/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ value: parsedValue }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  Setting updated successfully!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating setting:", error);
    await pressEnterToContinue();
  }
}

// ============================================
// CLI CONFIG MENU (kept in main file - small)
// ============================================

async function cliConfigMenu(): Promise<void> {
  const menuItems: MenuItem[] = [
    { name: "Show current config", value: "show" },
    { name: "Set API URL", value: "api-url" },
    { name: "Set API Key", value: "api-key" },
    { name: "Test connection", value: "test" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "CLI Config:",
    choices: menuItems,
  });

  switch (choice) {
    case "show":
      await showCliConfig();
      break;
    case "api-url":
      await setApiUrl();
      break;
    case "api-key":
      await setApiKey();
      break;
    case "test":
      await testConnection();
      break;
    case "back":
      return;
  }
}

async function showCliConfig(): Promise<void> {
  const config = getConfig();

  console.log("\n  CLI CONFIGURATION (local)");
  console.log("  " + "-".repeat(50));
  console.log(`  API URL:  ${config.apiUrl || "(not set)"}`);
  console.log(`  API Key:  ${config.apiKey ? config.apiKey.substring(0, 8) + "..." : "(not set)"}`);
  console.log("");

  await pressEnterToContinue();
}

async function setApiUrl(): Promise<void> {
  const url = await input({
    message: "API URL (e.g., https://your-dashboard.run.app):",
    validate: (value) => {
      if (!value) return "URL is required";
      if (!value.startsWith("http")) return "URL must start with http:// or https://";
      return true;
    },
  });

  setConfig("apiUrl", url);
  console.log("\n  API URL saved!\n");
  await pressEnterToContinue();
}

async function setApiKey(): Promise<void> {
  const key = await input({
    message: "API Key:",
    validate: (value) => (value.length > 0 ? true : "API Key is required"),
  });

  setConfig("apiKey", key);
  console.log("\n  API Key saved!\n");
  await pressEnterToContinue();
}

async function testConnection(): Promise<void> {
  const config = getConfig();

  if (!config.apiUrl) {
    console.log("\n  API URL not configured. Set it first.\n");
    await pressEnterToContinue();
    return;
  }

  console.log("\n  Testing connection...\n");

  try {
    const res = await fetch(`${config.apiUrl}/api/tasks`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (res.ok) {
      console.log("  Connection successful!");
      console.log(`  Status: ${res.status}`);
    } else if (res.status === 401) {
      console.log("  Connection works but authentication failed.");
      console.log("  Check your API Key.");
    } else {
      console.log(`  Connection failed with status: ${res.status}`);
    }
  } catch (error) {
    console.log("  Connection failed!");
    console.log(`  Error: ${(error as Error).message}`);
  }

  console.log("");
  await pressEnterToContinue();
}
