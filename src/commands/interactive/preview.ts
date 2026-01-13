/**
 * Interactive Mode: Preview Module
 *
 * Provides menu-based PR preview deployment management.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { getAuthHeaders } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";

interface PreviewDeployment {
  id: string;
  prNumber: number;
  url: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function previewMenu(): Promise<void> {
  const config = ensureConfig();

  console.log("\n  PREVIEW DEPLOYMENTS");
  console.log("  " + "-".repeat(50));
  console.log("  PR preview deployment management");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "📋 List Previews", value: "list" },
    { name: "🔍 Preview Status", value: "status" },
    { name: "🚀 Deploy Preview", value: "deploy" },
    { name: "🗑️  Delete Preview", value: "delete" },
    { name: "🧹 Cleanup Old", value: "cleanup" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Preview Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listPreviews(config);
      break;
    case "status":
      await previewStatus(config);
      break;
    case "deploy":
      await deployPreview(config);
      break;
    case "delete":
      await deletePreview(config);
      break;
    case "cleanup":
      await cleanupPreviews(config);
      break;
    case "back":
      return;
  }
}

async function listPreviews(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/previews`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const previews: PreviewDeployment[] = await res.json();

    console.log("\n  PREVIEW DEPLOYMENTS");
    console.log("  " + "-".repeat(80));

    if (previews.length === 0) {
      console.log("  No preview deployments found.");
    } else {
      console.log(`  ${"PR #".padEnd(8)} ${"STATUS".padEnd(12)} ${"URL".padEnd(45)} ${"UPDATED"}`);
      console.log("  " + "-".repeat(80));

      for (const preview of previews) {
        const statusIcon = preview.status === "active" ? "🟢" : preview.status === "building" ? "🔄" : "🔴";
        console.log(
          `  ${String(preview.prNumber).padEnd(8)} ${statusIcon} ${preview.status.padEnd(9)} ${truncate(preview.url, 43).padEnd(45)} ${formatDate(preview.updatedAt)}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching previews:", error);
    await pressEnterToContinue();
  }
}

async function previewStatus(config: ValidConfig): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    const res = await fetch(`${config.apiUrl}/api/previews/pr/${prNumber}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.log(`\n  No preview found for PR #${prNumber}\n`);
      } else {
        console.error(`\n  Error: API returned ${res.status}\n`);
      }
      await pressEnterToContinue();
      return;
    }

    const preview: PreviewDeployment = await res.json();

    console.log("\n  PREVIEW STATUS");
    console.log("  " + "-".repeat(50));
    console.log(`  PR: #${preview.prNumber}`);
    console.log(`  Status: ${preview.status}`);
    console.log(`  URL: ${preview.url}`);
    console.log(`  Created: ${formatDate(preview.createdAt)}`);
    console.log(`  Updated: ${formatDate(preview.updatedAt)}`);
    console.log("");

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching preview status:", error);
    await pressEnterToContinue();
  }
}

async function deployPreview(config: ValidConfig): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number to deploy:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    const confirmed = await confirm({
      message: `Deploy preview for PR #${prNumber}?`,
      default: true,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  Deploying preview for PR #${prNumber}...\n`);

    const res = await fetch(`${config.apiUrl}/api/previews/deploy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({ prNumber: parseInt(prNumber) }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();
      console.log("  Preview deployment started!");
      if (data.url) {
        console.log(`  URL: ${data.url}`);
      }
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deploying preview:", error);
    await pressEnterToContinue();
  }
}

async function deletePreview(config: ValidConfig): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number to delete preview for:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    const confirmed = await confirm({
      message: `Delete preview for PR #${prNumber}?`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  Deleting preview for PR #${prNumber}...\n`);

    const res = await fetch(`${config.apiUrl}/api/previews/pr/${prNumber}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log("  Preview deleted successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting preview:", error);
    await pressEnterToContinue();
  }
}

async function cleanupPreviews(config: ValidConfig): Promise<void> {
  try {
    const confirmed = await confirm({
      message: "Clean up old preview deployments?",
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    console.log("\n  Cleaning up old previews...\n");

    const res = await fetch(`${config.apiUrl}/api/previews/cleanup`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();
      console.log(`  Cleanup complete! Removed: ${data.removed || 0} previews\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error cleaning up:", error);
    await pressEnterToContinue();
  }
}
