import { select, input, confirm } from "@inquirer/prompts";
import { ensureConfig, pressEnterToContinue, truncate } from "./utils.js";
const STATUS_LABELS = {
    not_started: "Not Started",
    in_progress: "In Progress",
    at_risk: "At Risk",
    completed: "Completed",
};
export async function strategyMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "Show current strategy", value: "show" },
        { name: "Set vision", value: "vision" },
        { name: "Set mission", value: "mission" },
        { name: "Manage values", value: "values" },
        { name: "Manage goals", value: "goals" },
        { name: "Manage personas", value: "personas" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Business Strategy:",
        choices: menuItems,
    });
    switch (choice) {
        case "show":
            await showStrategy(config);
            break;
        case "vision":
            await setVision(config);
            break;
        case "mission":
            await setMission(config);
            break;
        case "values":
            await valuesSubMenu(config);
            break;
        case "goals":
            await goalsSubMenu(config);
            break;
        case "personas":
            await personasSubMenu(config);
            break;
        case "back":
            return;
    }
}
async function fetchStrategy(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok)
            return null;
        return res.json();
    }
    catch {
        return null;
    }
}
async function showStrategy(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy) {
            console.log("\n  Could not fetch business strategy.\n");
            await pressEnterToContinue();
            return;
        }
        console.log("\n  BUSINESS STRATEGY");
        console.log("  " + "=".repeat(60));
        console.log("\n  VISION");
        console.log("  " + "-".repeat(40));
        console.log(`  ${strategy.vision || "(not set)"}`);
        console.log("\n  MISSION");
        console.log("  " + "-".repeat(40));
        console.log(`  ${strategy.mission || "(not set)"}`);
        console.log(`\n  VALUES (${strategy.values.length})`);
        console.log("  " + "-".repeat(40));
        if (strategy.values.length === 0) {
            console.log("  (none)");
        }
        else {
            for (const v of strategy.values) {
                console.log(`  - ${v.name}`);
                if (v.description)
                    console.log(`    ${truncate(v.description, 50)}`);
            }
        }
        console.log(`\n  STRATEGIC GOALS (${strategy.goals.length})`);
        console.log("  " + "-".repeat(40));
        if (strategy.goals.length === 0) {
            console.log("  (none)");
        }
        else {
            for (const g of strategy.goals) {
                const bar = getProgressBar(g.progress);
                const statusIcon = g.status === "completed" ? "[OK]" : g.status === "at_risk" ? "[!!]" : "[..]";
                console.log(`  ${statusIcon} ${g.title}`);
                console.log(`      ${bar} ${g.progress}% - ${STATUS_LABELS[g.status]}`);
            }
        }
        console.log(`\n  TARGET PERSONAS (${strategy.targetAudience.length})`);
        console.log("  " + "-".repeat(40));
        if (strategy.targetAudience.length === 0) {
            console.log("  (none)");
        }
        else {
            for (const p of strategy.targetAudience) {
                console.log(`  - ${p.name}`);
                if (p.description)
                    console.log(`    ${truncate(p.description, 50)}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching strategy:", error);
        await pressEnterToContinue();
    }
}
async function setVision(config) {
    try {
        const strategy = await fetchStrategy(config);
        const vision = await input({
            message: "Enter vision:",
            default: strategy?.vision || "",
            validate: (v) => (v.length > 0 ? true : "Vision required"),
        });
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ vision }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Vision updated!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating vision:", error);
        await pressEnterToContinue();
    }
}
async function setMission(config) {
    try {
        const strategy = await fetchStrategy(config);
        const mission = await input({
            message: "Enter mission:",
            default: strategy?.mission || "",
            validate: (v) => (v.length > 0 ? true : "Mission required"),
        });
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ mission }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Mission updated!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating mission:", error);
        await pressEnterToContinue();
    }
}
// VALUES SUB-MENU
async function valuesSubMenu(config) {
    const menuItems = [
        { name: "List values", value: "list" },
        { name: "Add value", value: "add" },
        { name: "Update value", value: "update" },
        { name: "Delete value", value: "delete" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({ message: "Values:", choices: menuItems });
    switch (choice) {
        case "list":
            await listValues(config);
            break;
        case "add":
            await addValue(config);
            break;
        case "update":
            await updateValue(config);
            break;
        case "delete":
            await deleteValue(config);
            break;
        case "back":
            return;
    }
}
async function listValues(config) {
    const strategy = await fetchStrategy(config);
    if (!strategy) {
        console.log("\n  Could not fetch strategy.\n");
        await pressEnterToContinue();
        return;
    }
    console.log("\n  COMPANY VALUES");
    console.log("  " + "-".repeat(50));
    if (strategy.values.length === 0) {
        console.log("  No values defined.");
    }
    else {
        for (const v of strategy.values) {
            console.log(`  - ${v.name}`);
            if (v.description)
                console.log(`    ${truncate(v.description, 50)}`);
            console.log(`    ID: ${v.id}`);
        }
    }
    console.log("");
    await pressEnterToContinue();
}
async function addValue(config) {
    try {
        const name = await input({
            message: "Value name:",
            validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        const description = await input({
            message: "Description (optional):",
        });
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                type: "value",
                name,
                description: description || "",
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Value added!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error adding value:", error);
        await pressEnterToContinue();
    }
}
async function updateValue(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy || strategy.values.length === 0) {
            console.log("\n  No values to update.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = strategy.values.map((v) => ({
            name: v.name,
            value: v.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const valueId = await select({ message: "Select value:", choices });
        if (valueId === "__cancel__")
            return;
        const value = strategy.values.find((v) => v.id === valueId);
        if (!value)
            return;
        const name = await input({
            message: "New name:",
            default: value.name,
            validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        const description = await input({
            message: "New description:",
            default: value.description || "",
        });
        const res = await fetch(`${config.apiUrl}/api/business-strategy/values/${valueId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ name, description }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Value updated!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating value:", error);
        await pressEnterToContinue();
    }
}
async function deleteValue(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy || strategy.values.length === 0) {
            console.log("\n  No values to delete.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = strategy.values.map((v) => ({
            name: v.name,
            value: v.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const valueId = await select({ message: "Select value to delete:", choices });
        if (valueId === "__cancel__")
            return;
        const value = strategy.values.find((v) => v.id === valueId);
        const confirmed = await confirm({
            message: `Delete "${value?.name}"? This cannot be undone.`,
            default: false,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/business-strategy/values/${valueId}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Value deleted.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error deleting value:", error);
        await pressEnterToContinue();
    }
}
// GOALS SUB-MENU
async function goalsSubMenu(config) {
    const menuItems = [
        { name: "List goals", value: "list" },
        { name: "Add goal", value: "add" },
        { name: "Update goal", value: "update" },
        { name: "Delete goal", value: "delete" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({ message: "Goals:", choices: menuItems });
    switch (choice) {
        case "list":
            await listGoals(config);
            break;
        case "add":
            await addGoal(config);
            break;
        case "update":
            await updateGoal(config);
            break;
        case "delete":
            await deleteGoal(config);
            break;
        case "back":
            return;
    }
}
async function listGoals(config) {
    const strategy = await fetchStrategy(config);
    if (!strategy) {
        console.log("\n  Could not fetch strategy.\n");
        await pressEnterToContinue();
        return;
    }
    console.log("\n  STRATEGIC GOALS");
    console.log("  " + "-".repeat(60));
    if (strategy.goals.length === 0) {
        console.log("  No goals defined.");
    }
    else {
        for (const g of strategy.goals) {
            const bar = getProgressBar(g.progress);
            console.log(`  [${STATUS_LABELS[g.status]}] ${g.title}`);
            console.log(`    ${bar} ${g.progress}%`);
            if (g.dueDate)
                console.log(`    Due: ${new Date(g.dueDate).toLocaleDateString()}`);
            console.log(`    ID: ${g.id}`);
        }
    }
    console.log("");
    await pressEnterToContinue();
}
async function addGoal(config) {
    try {
        const title = await input({
            message: "Goal title:",
            validate: (v) => (v.length > 0 ? true : "Title required"),
        });
        const description = await input({
            message: "Description (optional):",
        });
        const status = await select({
            message: "Status:",
            choices: [
                { name: "Not Started", value: "not_started" },
                { name: "In Progress", value: "in_progress" },
                { name: "At Risk", value: "at_risk" },
                { name: "Completed", value: "completed" },
            ],
            default: "not_started",
        });
        const progressStr = await input({
            message: "Progress (0-100):",
            default: "0",
            validate: (v) => {
                const n = parseInt(v, 10);
                return !isNaN(n) && n >= 0 && n <= 100 ? true : "Must be 0-100";
            },
        });
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                type: "goal",
                title,
                description: description || "",
                status,
                progress: parseInt(progressStr, 10),
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Goal added!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error adding goal:", error);
        await pressEnterToContinue();
    }
}
async function updateGoal(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy || strategy.goals.length === 0) {
            console.log("\n  No goals to update.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = strategy.goals.map((g) => ({
            name: `[${STATUS_LABELS[g.status]}] ${truncate(g.title, 40)}`,
            value: g.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const goalId = await select({ message: "Select goal:", choices });
        if (goalId === "__cancel__")
            return;
        const goal = strategy.goals.find((g) => g.id === goalId);
        if (!goal)
            return;
        const updateChoices = [
            { name: "Status", value: "status" },
            { name: "Progress", value: "progress" },
            { name: "Title", value: "title" },
            { name: "Description", value: "description" },
            { name: "Cancel", value: "cancel" },
        ];
        const field = await select({ message: "What to update?", choices: updateChoices });
        if (field === "cancel")
            return;
        let updateData = {};
        switch (field) {
            case "status":
                updateData.status = await select({
                    message: "New status:",
                    choices: [
                        { name: "Not Started", value: "not_started" },
                        { name: "In Progress", value: "in_progress" },
                        { name: "At Risk", value: "at_risk" },
                        { name: "Completed", value: "completed" },
                    ],
                    default: goal.status,
                });
                break;
            case "progress":
                const progressStr = await input({
                    message: "New progress (0-100):",
                    default: String(goal.progress),
                    validate: (v) => {
                        const n = parseInt(v, 10);
                        return !isNaN(n) && n >= 0 && n <= 100 ? true : "Must be 0-100";
                    },
                });
                updateData.progress = parseInt(progressStr, 10);
                break;
            case "title":
                updateData.title = await input({
                    message: "New title:",
                    default: goal.title,
                    validate: (v) => (v.length > 0 ? true : "Title required"),
                });
                break;
            case "description":
                updateData.description = await input({
                    message: "New description:",
                    default: goal.description || "",
                });
                break;
        }
        const res = await fetch(`${config.apiUrl}/api/business-strategy/goals/${goalId}`, {
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
        console.log(`\n  ✓ Goal updated!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating goal:", error);
        await pressEnterToContinue();
    }
}
async function deleteGoal(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy || strategy.goals.length === 0) {
            console.log("\n  No goals to delete.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = strategy.goals.map((g) => ({
            name: `[${STATUS_LABELS[g.status]}] ${truncate(g.title, 40)}`,
            value: g.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const goalId = await select({ message: "Select goal to delete:", choices });
        if (goalId === "__cancel__")
            return;
        const goal = strategy.goals.find((g) => g.id === goalId);
        const confirmed = await confirm({
            message: `Delete "${goal?.title}"? This cannot be undone.`,
            default: false,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/business-strategy/goals/${goalId}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Goal deleted.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error deleting goal:", error);
        await pressEnterToContinue();
    }
}
// PERSONAS SUB-MENU
async function personasSubMenu(config) {
    const menuItems = [
        { name: "List personas", value: "list" },
        { name: "Add persona", value: "add" },
        { name: "Update persona", value: "update" },
        { name: "Delete persona", value: "delete" },
        { name: "Back", value: "back" },
    ];
    const choice = await select({ message: "Personas:", choices: menuItems });
    switch (choice) {
        case "list":
            await listPersonas(config);
            break;
        case "add":
            await addPersona(config);
            break;
        case "update":
            await updatePersona(config);
            break;
        case "delete":
            await deletePersona(config);
            break;
        case "back":
            return;
    }
}
async function listPersonas(config) {
    const strategy = await fetchStrategy(config);
    if (!strategy) {
        console.log("\n  Could not fetch strategy.\n");
        await pressEnterToContinue();
        return;
    }
    console.log("\n  TARGET AUDIENCE PERSONAS");
    console.log("  " + "-".repeat(50));
    if (strategy.targetAudience.length === 0) {
        console.log("  No personas defined.");
    }
    else {
        for (const p of strategy.targetAudience) {
            console.log(`  - ${p.name}`);
            if (p.description)
                console.log(`    ${truncate(p.description, 50)}`);
            if (p.characteristics.length > 0) {
                console.log(`    Characteristics: ${p.characteristics.join(", ")}`);
            }
            console.log(`    ID: ${p.id}`);
        }
    }
    console.log("");
    await pressEnterToContinue();
}
async function addPersona(config) {
    try {
        const name = await input({
            message: "Persona name:",
            validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        const description = await input({
            message: "Description (optional):",
        });
        const characteristicsStr = await input({
            message: "Characteristics (comma-separated, optional):",
        });
        const characteristics = characteristicsStr
            ? characteristicsStr.split(",").map((c) => c.trim()).filter((c) => c)
            : [];
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                type: "persona",
                name,
                description: description || "",
                characteristics,
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Persona added!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error adding persona:", error);
        await pressEnterToContinue();
    }
}
async function updatePersona(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy || strategy.targetAudience.length === 0) {
            console.log("\n  No personas to update.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = strategy.targetAudience.map((p) => ({
            name: p.name,
            value: p.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const personaId = await select({ message: "Select persona:", choices });
        if (personaId === "__cancel__")
            return;
        const persona = strategy.targetAudience.find((p) => p.id === personaId);
        if (!persona)
            return;
        const name = await input({
            message: "New name:",
            default: persona.name,
            validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        const description = await input({
            message: "New description:",
            default: persona.description || "",
        });
        const characteristicsStr = await input({
            message: "Characteristics (comma-separated):",
            default: persona.characteristics.join(", "),
        });
        const characteristics = characteristicsStr
            ? characteristicsStr.split(",").map((c) => c.trim()).filter((c) => c)
            : [];
        const res = await fetch(`${config.apiUrl}/api/business-strategy/personas/${personaId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ name, description, characteristics }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Persona updated!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating persona:", error);
        await pressEnterToContinue();
    }
}
async function deletePersona(config) {
    try {
        const strategy = await fetchStrategy(config);
        if (!strategy || strategy.targetAudience.length === 0) {
            console.log("\n  No personas to delete.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = strategy.targetAudience.map((p) => ({
            name: p.name,
            value: p.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const personaId = await select({ message: "Select persona to delete:", choices });
        if (personaId === "__cancel__")
            return;
        const persona = strategy.targetAudience.find((p) => p.id === personaId);
        const confirmed = await confirm({
            message: `Delete "${persona?.name}"? This cannot be undone.`,
            default: false,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/business-strategy/personas/${personaId}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Persona deleted.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error deleting persona:", error);
        await pressEnterToContinue();
    }
}
function getProgressBar(progress) {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return "[" + "#".repeat(filled) + "-".repeat(empty) + "]";
}
