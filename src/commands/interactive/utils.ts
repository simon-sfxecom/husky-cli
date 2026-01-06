import { input } from "@inquirer/prompts";
import { getConfig } from "../config.js";

// Menu item type
export interface MenuItem {
  name: string;
  value: string;
  description?: string;
}

// Config type with required apiUrl
export interface ValidConfig {
  apiUrl: string;
  apiKey?: string;
}

// Helper: Ensure API is configured
export function ensureConfig(): ValidConfig {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return config as ValidConfig;
}

// Clear screen helper
export function clearScreen() {
  console.clear();
}

// Print header
export function printHeader() {
  const config = getConfig();
  console.log("\n");
  console.log("  🐕 Husky CLI - Interactive Mode");
  console.log("  " + "─".repeat(35));

  if (!config.apiUrl) {
    console.log("");
    console.log("  ⚠️  Getting Started:");
    console.log("  Go to 'CLI Config' to set up your API URL and Key");
  } else {
    console.log(`  Connected to: ${config.apiUrl.substring(0, 40)}`);
  }
  console.log("");
}

// Press Enter to continue
export async function pressEnterToContinue(): Promise<void> {
  await input({
    message: "Press Enter to continue...",
  });
}

// Format date for display
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return "-";
  }
}

// Truncate string with ellipsis
export function truncate(str: string, length: number): string {
  if (!str) return "";
  return str.length > length ? str.substring(0, length - 3) + "..." : str;
}
