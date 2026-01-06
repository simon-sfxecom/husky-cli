import { Command } from "commander";
import { getConfig } from "./config.js";
export const strategyCommand = new Command("strategy")
    .description("Manage business strategy");
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// husky strategy show
strategyCommand
    .command("show")
    .description("Show current business strategy")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const strategy = await res.json();
        if (options.json) {
            console.log(JSON.stringify(strategy, null, 2));
        }
        else {
            printStrategy(strategy);
        }
    }
    catch (error) {
        console.error("Error fetching business strategy:", error);
        process.exit(1);
    }
});
// husky strategy set-vision
strategyCommand
    .command("set-vision")
    .description("Set/update the company vision")
    .requiredOption("-v, --vision <text>", "Vision text")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ vision: options.vision }),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `API error: ${res.status}`);
        }
        const strategy = await res.json();
        if (options.json) {
            console.log(JSON.stringify(strategy, null, 2));
        }
        else {
            console.log("Vision updated successfully");
            console.log(`  Vision: ${strategy.vision}`);
        }
    }
    catch (error) {
        console.error("Error updating vision:", error);
        process.exit(1);
    }
});
// husky strategy set-mission
strategyCommand
    .command("set-mission")
    .description("Set/update the company mission")
    .requiredOption("-m, --mission <text>", "Mission text")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ mission: options.mission }),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `API error: ${res.status}`);
        }
        const strategy = await res.json();
        if (options.json) {
            console.log(JSON.stringify(strategy, null, 2));
        }
        else {
            console.log("Mission updated successfully");
            console.log(`  Mission: ${strategy.mission}`);
        }
    }
    catch (error) {
        console.error("Error updating mission:", error);
        process.exit(1);
    }
});
// husky strategy add-value
strategyCommand
    .command("add-value")
    .description("Add a company value")
    .requiredOption("-n, --name <name>", "Value name")
    .option("-d, --description <desc>", "Value description")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                type: "value",
                name: options.name,
                description: options.description || "",
            }),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `API error: ${res.status}`);
        }
        const strategy = await res.json();
        const newValue = strategy.values[strategy.values.length - 1];
        if (options.json) {
            console.log(JSON.stringify(newValue, null, 2));
        }
        else {
            console.log("Value added successfully");
            console.log(`  ID:   ${newValue.id}`);
            console.log(`  Name: ${newValue.name}`);
            if (newValue.description) {
                console.log(`  Description: ${newValue.description}`);
            }
        }
    }
    catch (error) {
        console.error("Error adding value:", error);
        process.exit(1);
    }
});
// husky strategy update-value <id>
strategyCommand
    .command("update-value <id>")
    .description("Update a company value")
    .option("-n, --name <name>", "New name")
    .option("-d, --description <desc>", "New description")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload
    const updateData = {};
    if (options.name) {
        updateData.name = options.name;
    }
    if (options.description !== undefined) {
        updateData.description = options.description;
    }
    if (Object.keys(updateData).length === 0) {
        console.error("Error: No update options provided. Use -n or -d");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy/values/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updateData),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Value ${id} not found`);
            }
            else {
                const errorBody = await res.json().catch(() => ({}));
                console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const strategy = await res.json();
        const updatedValue = strategy.values.find((v) => v.id === id);
        if (options.json) {
            console.log(JSON.stringify(updatedValue, null, 2));
        }
        else {
            console.log("Value updated successfully");
            if (updatedValue) {
                console.log(`  Name: ${updatedValue.name}`);
                if (updatedValue.description) {
                    console.log(`  Description: ${updatedValue.description}`);
                }
            }
        }
    }
    catch (error) {
        console.error("Error updating value:", error);
        process.exit(1);
    }
});
// husky strategy delete-value <id>
strategyCommand
    .command("delete-value <id>")
    .description("Delete a company value")
    .option("--force", "Skip confirmation")
    .action(async (id, options) => {
    const config = ensureConfig();
    if (!options.force) {
        console.log("Warning: This will permanently delete the value.");
        console.log("Use --force to confirm deletion.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy/values/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Value ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        console.log("Value deleted successfully");
    }
    catch (error) {
        console.error("Error deleting value:", error);
        process.exit(1);
    }
});
// husky strategy add-goal
strategyCommand
    .command("add-goal")
    .description("Add a strategic goal")
    .requiredOption("-t, --title <title>", "Goal title")
    .option("-d, --description <desc>", "Goal description")
    .option("--status <status>", "Status (not_started, in_progress, at_risk, completed)", "not_started")
    .option("--progress <n>", "Progress percentage (0-100)", "0")
    .option("--due <date>", "Due date (ISO format)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    // Validate status
    const validStatuses = ["not_started", "in_progress", "at_risk", "completed"];
    if (!validStatuses.includes(options.status)) {
        console.error(`Error: Invalid status "${options.status}". Must be one of: ${validStatuses.join(", ")}`);
        process.exit(1);
    }
    // Validate progress
    const progress = parseInt(options.progress, 10);
    if (isNaN(progress) || progress < 0 || progress > 100) {
        console.error("Error: Progress must be a number between 0 and 100");
        process.exit(1);
    }
    try {
        const body = {
            type: "goal",
            title: options.title,
            description: options.description || "",
            status: options.status,
            progress,
        };
        if (options.due) {
            body.dueDate = options.due;
        }
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `API error: ${res.status}`);
        }
        const strategy = await res.json();
        const newGoal = strategy.goals[strategy.goals.length - 1];
        if (options.json) {
            console.log(JSON.stringify(newGoal, null, 2));
        }
        else {
            console.log("Goal added successfully");
            console.log(`  ID:       ${newGoal.id}`);
            console.log(`  Title:    ${newGoal.title}`);
            console.log(`  Status:   ${newGoal.status}`);
            console.log(`  Progress: ${newGoal.progress}%`);
            if (newGoal.dueDate) {
                console.log(`  Due:      ${new Date(newGoal.dueDate).toLocaleDateString()}`);
            }
        }
    }
    catch (error) {
        console.error("Error adding goal:", error);
        process.exit(1);
    }
});
// husky strategy update-goal <id>
strategyCommand
    .command("update-goal <id>")
    .description("Update a strategic goal")
    .option("-t, --title <title>", "New title")
    .option("-d, --description <desc>", "New description")
    .option("--status <status>", "New status (not_started, in_progress, at_risk, completed)")
    .option("--progress <n>", "New progress percentage (0-100)")
    .option("--due <date>", "New due date (ISO format)")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload
    const updateData = {};
    if (options.title) {
        updateData.title = options.title;
    }
    if (options.description !== undefined) {
        updateData.description = options.description;
    }
    if (options.status) {
        const validStatuses = ["not_started", "in_progress", "at_risk", "completed"];
        if (!validStatuses.includes(options.status)) {
            console.error(`Error: Invalid status "${options.status}". Must be one of: ${validStatuses.join(", ")}`);
            process.exit(1);
        }
        updateData.status = options.status;
    }
    if (options.progress !== undefined) {
        const progress = parseInt(options.progress, 10);
        if (isNaN(progress) || progress < 0 || progress > 100) {
            console.error("Error: Progress must be a number between 0 and 100");
            process.exit(1);
        }
        updateData.progress = progress;
    }
    if (options.due) {
        updateData.dueDate = options.due;
    }
    if (Object.keys(updateData).length === 0) {
        console.error("Error: No update options provided. Use -t, -d, --status, --progress, or --due");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy/goals/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updateData),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Goal ${id} not found`);
            }
            else {
                const errorBody = await res.json().catch(() => ({}));
                console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const strategy = await res.json();
        const updatedGoal = strategy.goals.find((g) => g.id === id);
        if (options.json) {
            console.log(JSON.stringify(updatedGoal, null, 2));
        }
        else {
            console.log("Goal updated successfully");
            if (updatedGoal) {
                console.log(`  Title:    ${updatedGoal.title}`);
                console.log(`  Status:   ${updatedGoal.status}`);
                console.log(`  Progress: ${updatedGoal.progress}%`);
                if (updatedGoal.dueDate) {
                    console.log(`  Due:      ${new Date(updatedGoal.dueDate).toLocaleDateString()}`);
                }
            }
        }
    }
    catch (error) {
        console.error("Error updating goal:", error);
        process.exit(1);
    }
});
// husky strategy delete-goal <id>
strategyCommand
    .command("delete-goal <id>")
    .description("Delete a strategic goal")
    .option("--force", "Skip confirmation")
    .action(async (id, options) => {
    const config = ensureConfig();
    if (!options.force) {
        console.log("Warning: This will permanently delete the goal.");
        console.log("Use --force to confirm deletion.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy/goals/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Goal ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        console.log("Goal deleted successfully");
    }
    catch (error) {
        console.error("Error deleting goal:", error);
        process.exit(1);
    }
});
// husky strategy add-persona
strategyCommand
    .command("add-persona")
    .description("Add a target audience persona")
    .requiredOption("-n, --name <name>", "Persona name")
    .option("-d, --description <desc>", "Persona description")
    .option("--characteristics <list>", "Comma-separated characteristics")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    // Parse characteristics
    const characteristics = options.characteristics
        ? options.characteristics.split(",").map((c) => c.trim()).filter((c) => c)
        : [];
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                type: "persona",
                name: options.name,
                description: options.description || "",
                characteristics,
            }),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `API error: ${res.status}`);
        }
        const strategy = await res.json();
        const newPersona = strategy.targetAudience[strategy.targetAudience.length - 1];
        if (options.json) {
            console.log(JSON.stringify(newPersona, null, 2));
        }
        else {
            console.log("Persona added successfully");
            console.log(`  ID:   ${newPersona.id}`);
            console.log(`  Name: ${newPersona.name}`);
            if (newPersona.description) {
                console.log(`  Description: ${newPersona.description}`);
            }
            if (newPersona.characteristics.length > 0) {
                console.log(`  Characteristics:`);
                for (const c of newPersona.characteristics) {
                    console.log(`    - ${c}`);
                }
            }
        }
    }
    catch (error) {
        console.error("Error adding persona:", error);
        process.exit(1);
    }
});
// husky strategy update-persona <id>
strategyCommand
    .command("update-persona <id>")
    .description("Update a target audience persona")
    .option("-n, --name <name>", "New name")
    .option("-d, --description <desc>", "New description")
    .option("--characteristics <list>", "Comma-separated characteristics")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload
    const updateData = {};
    if (options.name) {
        updateData.name = options.name;
    }
    if (options.description !== undefined) {
        updateData.description = options.description;
    }
    if (options.characteristics !== undefined) {
        updateData.characteristics = options.characteristics
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c);
    }
    if (Object.keys(updateData).length === 0) {
        console.error("Error: No update options provided. Use -n, -d, or --characteristics");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy/personas/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updateData),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Persona ${id} not found`);
            }
            else {
                const errorBody = await res.json().catch(() => ({}));
                console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const strategy = await res.json();
        const updatedPersona = strategy.targetAudience.find((p) => p.id === id);
        if (options.json) {
            console.log(JSON.stringify(updatedPersona, null, 2));
        }
        else {
            console.log("Persona updated successfully");
            if (updatedPersona) {
                console.log(`  Name: ${updatedPersona.name}`);
                if (updatedPersona.description) {
                    console.log(`  Description: ${updatedPersona.description}`);
                }
                if (updatedPersona.characteristics.length > 0) {
                    console.log(`  Characteristics:`);
                    for (const c of updatedPersona.characteristics) {
                        console.log(`    - ${c}`);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error("Error updating persona:", error);
        process.exit(1);
    }
});
// husky strategy delete-persona <id>
strategyCommand
    .command("delete-persona <id>")
    .description("Delete a target audience persona")
    .option("--force", "Skip confirmation")
    .action(async (id, options) => {
    const config = ensureConfig();
    if (!options.force) {
        console.log("Warning: This will permanently delete the persona.");
        console.log("Use --force to confirm deletion.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy/personas/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Persona ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        console.log("Persona deleted successfully");
    }
    catch (error) {
        console.error("Error deleting persona:", error);
        process.exit(1);
    }
});
// Print functions
function printStrategy(strategy) {
    console.log("\n  BUSINESS STRATEGY");
    console.log("  " + "=".repeat(60));
    // Vision & Mission
    console.log("\n  VISION");
    console.log("  " + "-".repeat(40));
    if (strategy.vision) {
        console.log(`  ${strategy.vision}`);
    }
    else {
        console.log("  (not set)");
    }
    console.log("\n  MISSION");
    console.log("  " + "-".repeat(40));
    if (strategy.mission) {
        console.log(`  ${strategy.mission}`);
    }
    else {
        console.log("  (not set)");
    }
    // Values
    console.log("\n  VALUES (" + strategy.values.length + ")");
    console.log("  " + "-".repeat(40));
    if (strategy.values.length === 0) {
        console.log("  (none)");
    }
    else {
        for (const value of strategy.values) {
            console.log(`  - ${value.name}`);
            if (value.description) {
                console.log(`    ${value.description}`);
            }
            console.log(`    ID: ${value.id}`);
        }
    }
    // Goals
    console.log("\n  STRATEGIC GOALS (" + strategy.goals.length + ")");
    console.log("  " + "-".repeat(40));
    if (strategy.goals.length === 0) {
        console.log("  (none)");
    }
    else {
        for (const goal of strategy.goals) {
            const statusIcon = getGoalStatusIcon(goal.status);
            const progressBar = getProgressBar(goal.progress);
            console.log(`  ${statusIcon} ${goal.title}`);
            console.log(`    Progress: ${progressBar} ${goal.progress}%`);
            console.log(`    Status:   ${formatGoalStatus(goal.status)}`);
            if (goal.dueDate) {
                console.log(`    Due:      ${new Date(goal.dueDate).toLocaleDateString()}`);
            }
            console.log(`    ID: ${goal.id}`);
        }
    }
    // Target Audience Personas
    console.log("\n  TARGET AUDIENCE PERSONAS (" + strategy.targetAudience.length + ")");
    console.log("  " + "-".repeat(40));
    if (strategy.targetAudience.length === 0) {
        console.log("  (none)");
    }
    else {
        for (const persona of strategy.targetAudience) {
            console.log(`  - ${persona.name}`);
            if (persona.description) {
                console.log(`    ${persona.description}`);
            }
            if (persona.characteristics.length > 0) {
                console.log(`    Characteristics: ${persona.characteristics.join(", ")}`);
            }
            console.log(`    ID: ${persona.id}`);
        }
    }
    console.log("\n  " + "-".repeat(40));
    console.log(`  Last updated: ${new Date(strategy.updatedAt).toLocaleString()}`);
    console.log("");
}
function getGoalStatusIcon(status) {
    switch (status) {
        case "not_started":
            return "[ ]";
        case "in_progress":
            return "[>]";
        case "at_risk":
            return "[!]";
        case "completed":
            return "[x]";
        default:
            return "[ ]";
    }
}
function formatGoalStatus(status) {
    switch (status) {
        case "not_started":
            return "Not Started";
        case "in_progress":
            return "In Progress";
        case "at_risk":
            return "At Risk";
        case "completed":
            return "Completed";
        default:
            return status;
    }
}
function getProgressBar(progress) {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return "[" + "#".repeat(filled) + "-".repeat(empty) + "]";
}
