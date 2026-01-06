import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";

interface Idea {
  id: string;
  title: string;
  description?: string;
  status: string;
  category?: string;
  createdAt?: string;
}

export async function ideasMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all ideas", value: "list" },
    { name: "View idea details", value: "view" },
    { name: "Create new idea", value: "create" },
    { name: "Update idea", value: "update" },
    { name: "Convert to task", value: "convert" },
    { name: "Delete idea", value: "delete" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Ideas:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listIdeas(config);
      break;
    case "view":
      await viewIdea(config);
      break;
    case "create":
      await createIdea(config);
      break;
    case "update":
      await updateIdea(config);
      break;
    case "convert":
      await convertIdea(config);
      break;
    case "delete":
      await deleteIdea(config);
      break;
    case "back":
      return;
  }
}

async function fetchIdeas(config: ValidConfig): Promise<Idea[]> {
  const res = await fetch(`${config.apiUrl}/api/ideas`, {
    headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

async function selectIdea(config: ValidConfig, message: string): Promise<Idea | null> {
  const ideas = await fetchIdeas(config);
  if (ideas.length === 0) {
    console.log("\n  No ideas found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = ideas.map((i) => ({
    name: `[${i.status || "draft"}] ${truncate(i.title || "(untitled)", 40)}`,
    value: i.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const ideaId = await select({ message, choices });
  if (ideaId === "__cancel__") return null;

  return ideas.find((i) => i.id === ideaId) || null;
}

async function listIdeas(config: ValidConfig): Promise<void> {
  try {
    const ideas = await fetchIdeas(config);

    console.log("\n  IDEAS");
    console.log("  " + "-".repeat(70));

    if (ideas.length === 0) {
      console.log("  No ideas found.");
    } else {
      for (const idea of ideas) {
        const statusIcon = idea.status === "active" ? "[o]" : idea.status === "converted" ? "[>]" : "[.]";
        const title = idea.title || "(untitled)";
        console.log(`  ${statusIcon} ${truncate(title, 50).padEnd(50)} [${idea.status || "draft"}]`);
        console.log(`      ID: ${idea.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching ideas:", error);
    await pressEnterToContinue();
  }
}

async function viewIdea(config: ValidConfig): Promise<void> {
  try {
    const idea = await selectIdea(config, "Select idea to view:");
    if (!idea) return;

    const res = await fetch(`${config.apiUrl}/api/ideas/${idea.id}`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const fullIdea = await res.json();

    console.log(`\n  Idea: ${fullIdea.title || "(untitled)"}`);
    console.log("  " + "-".repeat(50));
    console.log(`  ID:       ${fullIdea.id}`);
    console.log(`  Status:   ${fullIdea.status || "draft"}`);
    if (fullIdea.category) {
      console.log(`  Category: ${fullIdea.category}`);
    }
    if (fullIdea.description) {
      console.log(`  Description:`);
      console.log(`    ${fullIdea.description}`);
    }
    console.log(`  Created:  ${formatDate(fullIdea.createdAt)}`);
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing idea:", error);
    await pressEnterToContinue();
  }
}

async function createIdea(config: ValidConfig): Promise<void> {
  try {
    const title = await input({
      message: "Idea title:",
      validate: (value) => (value.length > 0 ? true : "Title is required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const category = await input({
      message: "Category (optional):",
    });

    const res = await fetch(`${config.apiUrl}/api/ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        title,
        description: description || undefined,
        category: category || undefined,
        status: "draft",
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const idea = await res.json();
    console.log(`\n  ✓ Idea created!`);
    console.log(`  ID: ${idea.id}`);
    console.log(`  Title: ${idea.title}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating idea:", error);
    await pressEnterToContinue();
  }
}

async function updateIdea(config: ValidConfig): Promise<void> {
  try {
    const idea = await selectIdea(config, "Select idea to update:");
    if (!idea) return;

    const updateChoices: MenuItem[] = [
      { name: "Title", value: "title" },
      { name: "Description", value: "description" },
      { name: "Status", value: "status" },
      { name: "Category", value: "category" },
      { name: "Cancel", value: "cancel" },
    ];

    const field = await select({ message: "What to update?", choices: updateChoices });
    if (field === "cancel") return;

    let updateData: Record<string, string> = {};

    switch (field) {
      case "title":
        updateData.title = await input({
          message: "New title:",
          default: idea.title,
          validate: (v) => (v.length > 0 ? true : "Title required"),
        });
        break;
      case "description":
        updateData.description = await input({
          message: "New description:",
          default: idea.description || "",
        });
        break;
      case "status":
        updateData.status = await select({
          message: "New status:",
          choices: [
            { name: "Draft", value: "draft" },
            { name: "Active", value: "active" },
            { name: "Archived", value: "archived" },
          ],
          default: idea.status || "draft",
        });
        break;
      case "category":
        updateData.category = await input({
          message: "New category:",
          default: idea.category || "",
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/ideas/${idea.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Idea updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating idea:", error);
    await pressEnterToContinue();
  }
}

async function convertIdea(config: ValidConfig): Promise<void> {
  try {
    const idea = await selectIdea(config, "Select idea to convert to task:");
    if (!idea) return;

    const priority = await select({
      message: "Task priority:",
      choices: [
        { name: "Low", value: "low" },
        { name: "Medium", value: "medium" },
        { name: "High", value: "high" },
      ],
      default: "medium",
    });

    const assignee = await select({
      message: "Assign to:",
      choices: [
        { name: "Human", value: "human" },
        { name: "LLM Agent", value: "llm" },
        { name: "Unassigned", value: "unassigned" },
      ],
      default: "unassigned",
    });

    const res = await fetch(`${config.apiUrl}/api/ideas/${idea.id}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({ priority, assignee }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const result = await res.json();
    console.log(`\n  ✓ Idea converted to task!`);
    console.log(`  Task ID: ${result.taskId}`);
    console.log(`  Title: ${result.title}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error converting idea:", error);
    await pressEnterToContinue();
  }
}

async function deleteIdea(config: ValidConfig): Promise<void> {
  try {
    const idea = await selectIdea(config, "Select idea to delete:");
    if (!idea) return;

    const confirmed = await confirm({
      message: `Delete "${idea.title}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/ideas/${idea.id}`, {
      method: "DELETE",
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Idea deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting idea:", error);
    await pressEnterToContinue();
  }
}
