import { Command } from "commander";
import { getConfig } from "./config.js";
export const ideaCommand = new Command("idea")
    .description("Manage ideas");
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// husky idea list
ideaCommand
    .command("list")
    .description("List all ideas")
    .option("--status <status>", "Filter by status (draft, active, archived, converted)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const url = new URL("/api/ideas", config.apiUrl);
        if (options.status) {
            url.searchParams.set("status", options.status);
        }
        const res = await fetch(url.toString(), {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const ideas = await res.json();
        if (options.json) {
            console.log(JSON.stringify(ideas, null, 2));
        }
        else {
            printIdeas(ideas);
        }
    }
    catch (error) {
        console.error("Error fetching ideas:", error);
        process.exit(1);
    }
});
// husky idea create <title>
ideaCommand
    .command("create <title>")
    .description("Create a new idea")
    .option("-d, --description <description>", "Idea description")
    .option("--category <category>", "Idea category")
    .option("--json", "Output as JSON")
    .action(async (title, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/ideas`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                title,
                description: options.description,
                category: options.category,
                status: "draft",
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const idea = await res.json();
        if (options.json) {
            console.log(JSON.stringify(idea, null, 2));
        }
        else {
            console.log(`✓ Created idea: ${idea.title}`);
            console.log(`  ID: ${idea.id}`);
        }
    }
    catch (error) {
        console.error("Error creating idea:", error);
        process.exit(1);
    }
});
// husky idea get <id>
ideaCommand
    .command("get <id>")
    .description("Get idea details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/ideas/${id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Idea ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        const idea = await res.json();
        if (options.json) {
            console.log(JSON.stringify(idea, null, 2));
        }
        else {
            printIdeaDetail(idea);
        }
    }
    catch (error) {
        console.error("Error fetching idea:", error);
        process.exit(1);
    }
});
// husky idea update <id>
ideaCommand
    .command("update <id>")
    .description("Update an idea")
    .option("-t, --title <title>", "New title")
    .option("-d, --description <description>", "New description")
    .option("--status <status>", "New status (draft, active, archived, converted)")
    .option("--category <category>", "New category")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload
    const updateData = {};
    if (options.title) {
        updateData.title = options.title;
    }
    if (options.description) {
        updateData.description = options.description;
    }
    if (options.status) {
        const validStatuses = ["draft", "active", "archived", "converted"];
        if (!validStatuses.includes(options.status)) {
            console.error(`Error: Invalid status "${options.status}". Must be one of: ${validStatuses.join(", ")}`);
            process.exit(1);
        }
        updateData.status = options.status;
    }
    if (options.category) {
        updateData.category = options.category;
    }
    if (Object.keys(updateData).length === 0) {
        console.error("Error: No update options provided. Use -t, -d, --status, or --category");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/ideas/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updateData),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Idea ${id} not found`);
            }
            else {
                const errorBody = await res.json().catch(() => ({}));
                console.error(`Error: API returned ${res.status}`, errorBody.error || "");
            }
            process.exit(1);
        }
        const idea = await res.json();
        if (options.json) {
            console.log(JSON.stringify(idea, null, 2));
        }
        else {
            console.log(`✓ Idea updated successfully`);
            console.log(`  Title:    ${idea.title}`);
            console.log(`  Status:   ${idea.status}`);
            if (idea.category) {
                console.log(`  Category: ${idea.category}`);
            }
        }
    }
    catch (error) {
        console.error("Error updating idea:", error);
        process.exit(1);
    }
});
// husky idea delete <id>
ideaCommand
    .command("delete <id>")
    .description("Delete an idea")
    .option("--force", "Skip confirmation")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    if (!options.force) {
        console.log("Warning: This will permanently delete the idea.");
        console.log("Use --force to confirm deletion.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/ideas/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Idea ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        if (options.json) {
            console.log(JSON.stringify({ deleted: true, id }, null, 2));
        }
        else {
            console.log(`✓ Idea deleted`);
        }
    }
    catch (error) {
        console.error("Error deleting idea:", error);
        process.exit(1);
    }
});
// husky idea convert <id>
ideaCommand
    .command("convert <id>")
    .description("Convert an idea to a task")
    .option("--priority <priority>", "Task priority (low, medium, high)", "medium")
    .option("--assignee <assignee>", "Assign to agent or user")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Validate priority
    const validPriorities = ["low", "medium", "high"];
    if (!validPriorities.includes(options.priority)) {
        console.error(`Error: Invalid priority "${options.priority}". Must be one of: ${validPriorities.join(", ")}`);
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/ideas/${id}/convert`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                priority: options.priority,
                assignee: options.assignee,
            }),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Idea ${id} not found`);
            }
            else {
                const errorBody = await res.json().catch(() => ({}));
                console.error(`Error: API returned ${res.status}`, errorBody.error || "");
            }
            process.exit(1);
        }
        const result = await res.json();
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            console.log(`✓ Idea converted to task`);
            console.log(`  Task ID:   ${result.taskId}`);
            console.log(`  Title:     ${result.title}`);
            console.log(`  Priority:  ${result.priority}`);
            if (result.assignee) {
                console.log(`  Assignee:  ${result.assignee}`);
            }
        }
    }
    catch (error) {
        console.error("Error converting idea:", error);
        process.exit(1);
    }
});
function printIdeas(ideas) {
    if (ideas.length === 0) {
        console.log("\n  No ideas found.");
        console.log("  Create one with: husky idea create <title>\n");
        return;
    }
    console.log("\n  IDEAS");
    console.log("  " + "─".repeat(70));
    console.log(`  ${"ID".padEnd(24)} ${"TITLE".padEnd(30)} ${"STATUS".padEnd(12)} CATEGORY`);
    console.log("  " + "─".repeat(70));
    for (const idea of ideas) {
        const statusIcon = getStatusIcon(idea.status);
        const truncatedTitle = idea.title.length > 28 ? idea.title.substring(0, 25) + "..." : idea.title;
        const category = idea.category || "-";
        console.log(`  ${idea.id.padEnd(24)} ${truncatedTitle.padEnd(30)} ${statusIcon} ${idea.status.padEnd(10)} ${category}`);
    }
    // Summary by status
    const draftCount = ideas.filter((i) => i.status === "draft").length;
    const activeCount = ideas.filter((i) => i.status === "active").length;
    const archivedCount = ideas.filter((i) => i.status === "archived").length;
    const convertedCount = ideas.filter((i) => i.status === "converted").length;
    console.log("  " + "─".repeat(70));
    console.log(`\n  Summary: ${ideas.length} total`);
    console.log(`    · Draft: ${draftCount}  ○ Active: ${activeCount}  ▷ Converted: ${convertedCount}  ✗ Archived: ${archivedCount}`);
    console.log("");
}
function printIdeaDetail(idea) {
    console.log(`\n  Idea: ${idea.title}`);
    console.log("  " + "─".repeat(50));
    console.log(`  ID:         ${idea.id}`);
    console.log(`  Status:     ${idea.status}`);
    if (idea.category) {
        console.log(`  Category:   ${idea.category}`);
    }
    if (idea.description) {
        console.log(`  Description:`);
        console.log(`    ${idea.description}`);
    }
    console.log(`  Created:    ${new Date(idea.createdAt).toLocaleString()}`);
    console.log(`  Updated:    ${new Date(idea.updatedAt).toLocaleString()}`);
    console.log("");
}
function getStatusIcon(status) {
    switch (status) {
        case "draft":
            return "·";
        case "active":
            return "○";
        case "converted":
            return "▷";
        case "archived":
            return "✗";
        default:
            return " ";
    }
}
