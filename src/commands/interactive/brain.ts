/**
 * Interactive Mode: Brain Module
 *
 * Provides menu-based agent memory and learning management.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { getAuthHeaders } from "../config.js";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";

interface Memory {
  id: string;
  content: string;
  agentId: string;
  tags: string[];
  qualityScore?: number;
  createdAt: string;
  archived?: boolean;
}

export async function brainMenu(): Promise<void> {
  const config = ensureConfig();

  console.log("\n  BRAIN");
  console.log("  " + "-".repeat(50));
  console.log("  Agent memory and learning management");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "📋 List Memories", value: "list" },
    { name: "🔍 Recall (Search)", value: "recall" },
    { name: "💡 Remember (Add)", value: "remember" },
    { name: "📤 Publish Memory", value: "publish" },
    { name: "👥 Shared Memories", value: "shared" },
    { name: "👍 Boost Memory", value: "boost" },
    { name: "📦 Archive", value: "archive" },
    { name: "🗑️  Delete", value: "delete" },
    { name: "🧹 Cleanup Old", value: "cleanup" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Brain Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listMemories(config);
      break;
    case "recall":
      await recallMemory(config);
      break;
    case "remember":
      await rememberContent(config);
      break;
    case "publish":
      await publishMemory(config);
      break;
    case "shared":
      await sharedMemories(config);
      break;
    case "boost":
      await boostMemory(config);
      break;
    case "archive":
      await archiveMemory(config);
      break;
    case "delete":
      await deleteMemory(config);
      break;
    case "cleanup":
      await cleanupMemories(config);
      break;
    case "back":
      return;
  }
}

async function listMemories(config: ValidConfig): Promise<void> {
  try {
    const limit = await input({
      message: "Number of memories to show (default 20):",
      default: "20",
    });

    const res = await fetch(`${config.apiUrl}/api/brain/memories?limit=${limit}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const memories: Memory[] = await res.json();

    console.log("\n  MEMORIES");
    console.log("  " + "-".repeat(70));

    if (memories.length === 0) {
      console.log("  No memories found.");
    } else {
      console.log(`  ${"ID".padEnd(12)} ${"SCORE".padEnd(8)} ${"TAGS".padEnd(20)} ${"CONTENT"}`);
      console.log("  " + "-".repeat(70));

      for (const mem of memories) {
        const score = mem.qualityScore !== undefined ? String(mem.qualityScore) : "-";
        const tags = mem.tags.slice(0, 2).join(", ");
        console.log(
          `  ${mem.id.substring(0, 10).padEnd(12)} ${score.padEnd(8)} ${truncate(tags, 18).padEnd(20)} ${truncate(mem.content, 30)}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching memories:", error);
    await pressEnterToContinue();
  }
}

async function recallMemory(config: ValidConfig): Promise<void> {
  try {
    const query = await input({
      message: "Search query:",
      validate: (v) => (v.length > 0 ? true : "Query is required"),
    });

    const res = await fetch(`${config.apiUrl}/api/brain/recall?query=${encodeURIComponent(query)}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const memories: Memory[] = await res.json();

    console.log("\n  SEARCH RESULTS");
    console.log("  " + "-".repeat(70));

    if (memories.length === 0) {
      console.log("  No matching memories found.");
    } else {
      for (const mem of memories) {
        console.log(`  ID: ${mem.id}`);
        console.log(`  Tags: ${mem.tags.join(", ")}`);
        console.log(`  Content: ${mem.content.substring(0, 100)}...`);
        console.log("  " + "-".repeat(40));
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error searching memories:", error);
    await pressEnterToContinue();
  }
}

async function rememberContent(config: ValidConfig): Promise<void> {
  try {
    const content = await input({
      message: "Content to remember:",
      validate: (v) => (v.length > 0 ? true : "Content is required"),
    });

    const tagsInput = await input({
      message: "Tags (comma-separated):",
      default: "",
    });

    const tags = tagsInput.split(",").map(t => t.trim()).filter(t => t.length > 0);

    const res = await fetch(`${config.apiUrl}/api/brain/remember`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({ content, tags }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();
      console.log(`\n  Memory saved! ID: ${data.id || "created"}\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error saving memory:", error);
    await pressEnterToContinue();
  }
}

async function publishMemory(config: ValidConfig): Promise<void> {
  try {
    const id = await input({
      message: "Memory ID to publish:",
      validate: (v) => (v.length > 0 ? true : "ID is required"),
    });

    const visibility = await select({
      message: "Visibility:",
      choices: [
        { name: "Team", value: "team" },
        { name: "Public", value: "public" },
      ],
    });

    const res = await fetch(`${config.apiUrl}/api/brain/publish/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders()),
      },
      body: JSON.stringify({ visibility }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log(`\n  Memory published with visibility: ${visibility}\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error publishing memory:", error);
    await pressEnterToContinue();
  }
}

async function sharedMemories(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/brain/shared`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const memories: Memory[] = await res.json();

    console.log("\n  SHARED MEMORIES");
    console.log("  " + "-".repeat(70));

    if (memories.length === 0) {
      console.log("  No shared memories found.");
    } else {
      for (const mem of memories) {
        console.log(`  ID: ${mem.id}`);
        console.log(`  From: ${mem.agentId}`);
        console.log(`  Score: ${mem.qualityScore || "-"}`);
        console.log(`  Content: ${truncate(mem.content, 60)}`);
        console.log("  " + "-".repeat(40));
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching shared memories:", error);
    await pressEnterToContinue();
  }
}

async function boostMemory(config: ValidConfig): Promise<void> {
  try {
    const id = await input({
      message: "Memory ID to boost:",
      validate: (v) => (v.length > 0 ? true : "ID is required"),
    });

    const res = await fetch(`${config.apiUrl}/api/brain/boost/${id}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log(`\n  Memory boosted!\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error boosting memory:", error);
    await pressEnterToContinue();
  }
}

async function archiveMemory(config: ValidConfig): Promise<void> {
  try {
    const id = await input({
      message: "Memory ID to archive:",
      validate: (v) => (v.length > 0 ? true : "ID is required"),
    });

    const confirmed = await confirm({
      message: "Are you sure you want to archive this memory?",
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/brain/archive/${id}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log(`\n  Memory archived!\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error archiving memory:", error);
    await pressEnterToContinue();
  }
}

async function deleteMemory(config: ValidConfig): Promise<void> {
  try {
    const id = await input({
      message: "Memory ID to delete:",
      validate: (v) => (v.length > 0 ? true : "ID is required"),
    });

    const confirmed = await confirm({
      message: "Are you sure you want to DELETE this memory? This cannot be undone.",
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/brain/memories/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log(`\n  Memory deleted!\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting memory:", error);
    await pressEnterToContinue();
  }
}

async function cleanupMemories(config: ValidConfig): Promise<void> {
  try {
    const confirmed = await confirm({
      message: "Clean up old/low-quality memories?",
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/brain/cleanup`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      const data = await res.json();
      console.log(`\n  Cleanup complete! Removed: ${data.removed || 0} memories\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error cleaning up:", error);
    await pressEnterToContinue();
  }
}
