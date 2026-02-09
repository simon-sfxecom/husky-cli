/**
 * Interactive Mode: Auth Module
 *
 * Provides menu-based authentication and API key management.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { getConfig, setConfig, setSessionConfig, clearSessionConfig } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue } from "./utils.js";

interface SessionInfo {
  agent: string;
  createdAt: string;
  expiresAt: string;
  isValid: boolean;
}

export async function authMenu(): Promise<void> {
  console.log("\n  AUTH");
  console.log("  " + "-".repeat(50));
  console.log("  API keys and session management");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "🔑 Login (Create Session)", value: "login" },
    { name: "📊 Session Status", value: "session" },
    { name: "🔄 Refresh Token", value: "refresh" },
    { name: "🚪 Logout", value: "logout" },
    { name: "🔐 Show API Key", value: "show-key" },
    { name: "✏️  Set API Key", value: "set-key" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Auth Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "login":
      await login();
      break;
    case "session":
      await sessionStatus();
      break;
    case "refresh":
      await refreshToken();
      break;
    case "logout":
      await logout();
      break;
    case "show-key":
      await showApiKey();
      break;
    case "set-key":
      await setApiKey();
      break;
    case "back":
      return;
  }
}

async function login(): Promise<void> {
  try {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("\n  Error: API URL not configured. Run 'husky config set api-url <url>' first.\n");
      await pressEnterToContinue();
      return;
    }
    if (!config.apiKey) {
      console.error("\n  Error: API key not configured. Run 'husky config set api-key <key>' first.\n");
      await pressEnterToContinue();
      return;
    }

    const agentName = await input({
      message: "Agent name:",
      default: "interactive-cli",
      validate: (v) => (v.length > 0 ? true : "Agent name is required"),
    });

    console.log("\n  Creating session...");

    const res = await fetch(`${config.apiUrl}/api/auth/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({ agent: agentName }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();

      // Save session token
      setSessionConfig({
        token: data.token,
        expiresAt: data.expiresAt,
        agent: agentName,
        role: data.role || "",
      });

      console.log("\n  Session created!");
      console.log(`  Agent: ${agentName}`);
      console.log(`  Expires: ${new Date(data.expiresAt).toLocaleString()}`);
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating session:", error);
    await pressEnterToContinue();
  }
}

async function sessionStatus(): Promise<void> {
  try {
    const config = getConfig();

    console.log("\n  SESSION STATUS");
    console.log("  " + "-".repeat(50));

    if (!config.sessionToken) {
      console.log("  No active session.");
      console.log("  Use 'Login' to create a new session.");
    } else {
      const expiresAt = config.sessionExpiresAt ? new Date(config.sessionExpiresAt) : null;
      const isExpired = expiresAt ? expiresAt < new Date() : true;

      console.log(`  Agent: ${config.sessionAgent || "unknown"}`);
      console.log(`  Token: ${config.sessionToken.substring(0, 20)}...`);
      console.log(`  Expires: ${expiresAt ? expiresAt.toLocaleString() : "unknown"}`);
      console.log(`  Status: ${isExpired ? "❌ EXPIRED" : "✅ VALID"}`);
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error checking session:", error);
    await pressEnterToContinue();
  }
}

async function refreshToken(): Promise<void> {
  try {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("\n  Error: API URL not configured.\n");
      await pressEnterToContinue();
      return;
    }

    if (!config.sessionToken) {
      console.error("\n  Error: No active session to refresh.\n");
      await pressEnterToContinue();
      return;
    }

    console.log("\n  Refreshing token...");

    const res = await fetch(`${config.apiUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.sessionToken}`,
      },
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();

      const currentConfig = getConfig();
      setSessionConfig({
        token: data.token,
        expiresAt: data.expiresAt,
        agent: currentConfig.sessionAgent || "",
        role: data.role || currentConfig.sessionRole || "",
      });

      console.log("\n  Token refreshed!");
      console.log(`  New expiry: ${new Date(data.expiresAt).toLocaleString()}`);
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error refreshing token:", error);
    await pressEnterToContinue();
  }
}

async function logout(): Promise<void> {
  try {
    const config = getConfig();

    if (!config.sessionToken) {
      console.log("\n  No active session.\n");
      await pressEnterToContinue();
      return;
    }

    const confirmed = await confirm({
      message: "Are you sure you want to logout?",
      default: true,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    // Clear session from config
    clearSessionConfig();

    console.log("\n  Logged out successfully!\n");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error logging out:", error);
    await pressEnterToContinue();
  }
}

async function showApiKey(): Promise<void> {
  const config = getConfig();

  console.log("\n  API KEY");
  console.log("  " + "-".repeat(50));

  if (!config.apiKey) {
    console.log("  No API key configured.");
  } else {
    const masked = config.apiKey.substring(0, 8) + "..." + config.apiKey.substring(config.apiKey.length - 4);
    console.log(`  API Key: ${masked}`);
    console.log(`  Length: ${config.apiKey.length} characters`);
  }

  console.log("");
  await pressEnterToContinue();
}

async function setApiKey(): Promise<void> {
  try {
    const key = await input({
      message: "New API Key:",
      validate: (v) => {
        if (v.length < 16) return "API key must be at least 16 characters";
        return true;
      },
    });

    setConfig("apiKey", key);
    console.log("\n  API Key saved!\n");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error setting API key:", error);
    await pressEnterToContinue();
  }
}
