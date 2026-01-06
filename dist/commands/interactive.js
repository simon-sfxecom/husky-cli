import { select, input, confirm } from "@inquirer/prompts";
import { getConfig } from "./config.js";
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// Clear screen helper
function clearScreen() {
    console.clear();
}
// Print header
function printHeader() {
    const config = getConfig();
    console.log("\n");
    console.log("  🐕 Husky CLI - Interactive Mode");
    console.log("  " + "─".repeat(35));
    if (!config.apiUrl) {
        console.log("");
        console.log("  ⚠️  Getting Started:");
        console.log("  Go to 'CLI Config' to set up your API URL and Key");
    }
    else {
        console.log(`  Connected to: ${config.apiUrl.substring(0, 40)}`);
    }
    console.log("");
}
// ============================================
// MAIN MENU
// ============================================
export async function runInteractiveMode() {
    let running = true;
    while (running) {
        clearScreen();
        printHeader();
        const mainMenuItems = [
            { name: "Tasks", value: "tasks", description: "Manage tasks" },
            { name: "Projects", value: "projects", description: "Manage projects" },
            { name: "Roadmaps", value: "roadmaps", description: "Manage roadmaps" },
            { name: "Workflows", value: "workflows", description: "Manage workflows" },
            { name: "Ideas", value: "ideas", description: "Manage ideas" },
            { name: "VM Sessions", value: "vm", description: "Manage VM sessions" },
            { name: "Jules Sessions", value: "jules", description: "Manage Jules AI sessions" },
            { name: "Business Strategy", value: "strategy", description: "Manage business strategy" },
            { name: "Dashboard Settings", value: "settings", description: "Manage dashboard settings" },
            { name: "CLI Config", value: "config", description: "Configure CLI (API URL, API Key)" },
            { name: "---", value: "separator", description: "" },
            { name: "Exit", value: "exit", description: "Exit interactive mode" },
        ];
        try {
            const choice = await select({
                message: "Select an option:",
                choices: mainMenuItems.filter((item) => item.value !== "separator"),
            });
            switch (choice) {
                case "tasks":
                    await tasksMenu();
                    break;
                case "projects":
                    await projectsMenu();
                    break;
                case "roadmaps":
                    await roadmapsMenu();
                    break;
                case "workflows":
                    await workflowsMenu();
                    break;
                case "ideas":
                    await ideasMenu();
                    break;
                case "vm":
                    await vmSessionsMenu();
                    break;
                case "jules":
                    await julesSessionsMenu();
                    break;
                case "strategy":
                    await strategyMenu();
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
        }
        catch (error) {
            // User pressed Ctrl+C or escaped
            if (error.name === "ExitPromptError") {
                running = false;
                console.log("\n  Goodbye!\n");
            }
            else {
                throw error;
            }
        }
    }
}
// ============================================
// TASKS MENU
// ============================================
async function tasksMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all tasks", value: "list" },
        { name: "Create new task", value: "create" },
        { name: "Search tasks by status", value: "search" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Tasks:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listTasks(config);
            break;
        case "create":
            await createTask(config);
            break;
        case "search":
            await searchTasks(config);
            break;
        case "back":
            return;
    }
}
async function listTasks(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const tasks = await res.json();
        console.log("\n  TASKS");
        console.log("  " + "-".repeat(70));
        if (tasks.length === 0) {
            console.log("  No tasks found.");
        }
        else {
            for (const task of tasks) {
                const statusIcon = task.status === "done" ? "[x]" : task.status === "in_progress" ? "[>]" : "[ ]";
                console.log(`  ${statusIcon} ${task.title.substring(0, 50).padEnd(50)} [${task.priority}]`);
                console.log(`      ID: ${task.id}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching tasks:", error);
        await pressEnterToContinue();
    }
}
async function createTask(config) {
    try {
        const title = await input({
            message: "Task title:",
            validate: (value) => (value.length > 0 ? true : "Title is required"),
        });
        const description = await input({
            message: "Description (optional):",
        });
        const priority = await select({
            message: "Priority:",
            choices: [
                { name: "Low", value: "low" },
                { name: "Medium", value: "medium" },
                { name: "High", value: "high" },
            ],
            default: "medium",
        });
        const res = await fetch(`${config.apiUrl}/api/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                title,
                description: description || undefined,
                priority,
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const task = await res.json();
        console.log(`\n  Task created successfully!`);
        console.log(`  ID: ${task.id}`);
        console.log(`  Title: ${task.title}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating task:", error);
        await pressEnterToContinue();
    }
}
async function searchTasks(config) {
    try {
        const status = await select({
            message: "Filter by status:",
            choices: [
                { name: "Backlog", value: "backlog" },
                { name: "In Progress", value: "in_progress" },
                { name: "Review", value: "review" },
                { name: "Done", value: "done" },
            ],
        });
        const url = new URL("/api/tasks", config.apiUrl);
        url.searchParams.set("status", status);
        const res = await fetch(url.toString(), {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const tasks = await res.json();
        console.log(`\n  TASKS (${status.replace("_", " ").toUpperCase()})`);
        console.log("  " + "-".repeat(70));
        if (tasks.length === 0) {
            console.log("  No tasks found with this status.");
        }
        else {
            for (const task of tasks) {
                console.log(`  - ${task.title.substring(0, 50)} [${task.priority}]`);
                console.log(`    ID: ${task.id}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error searching tasks:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// PROJECTS MENU
// ============================================
async function projectsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all projects", value: "list" },
        { name: "Create new project", value: "create" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Projects:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listProjects(config);
            break;
        case "create":
            await createProject(config);
            break;
        case "back":
            return;
    }
}
async function listProjects(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/projects`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const projects = await res.json();
        console.log("\n  PROJECTS");
        console.log("  " + "-".repeat(70));
        if (projects.length === 0) {
            console.log("  No projects found.");
        }
        else {
            for (const project of projects) {
                const statusIcon = project.status === "active" ? "[+]" : "[-]";
                console.log(`  ${statusIcon} ${project.name.substring(0, 40).padEnd(40)} [${project.workStatus}]`);
                console.log(`      ID: ${project.id}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching projects:", error);
        await pressEnterToContinue();
    }
}
async function createProject(config) {
    try {
        const name = await input({
            message: "Project name:",
            validate: (value) => (value.length > 0 ? true : "Name is required"),
        });
        const description = await input({
            message: "Description (optional):",
        });
        const res = await fetch(`${config.apiUrl}/api/projects`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                description: description || undefined,
                status: "active",
                workStatus: "planning",
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const project = await res.json();
        console.log(`\n  Project created successfully!`);
        console.log(`  ID: ${project.id}`);
        console.log(`  Name: ${project.name}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating project:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// ROADMAPS MENU
// ============================================
async function roadmapsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all roadmaps", value: "list" },
        { name: "Create new roadmap", value: "create" },
        { name: "Generate with AI", value: "generate" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Roadmaps:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listRoadmaps(config);
            break;
        case "create":
            await createRoadmap(config);
            break;
        case "generate":
            await generateRoadmap(config);
            break;
        case "back":
            return;
    }
}
async function listRoadmaps(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/roadmaps`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const roadmaps = await res.json();
        console.log("\n  ROADMAPS");
        console.log("  " + "-".repeat(70));
        if (roadmaps.length === 0) {
            console.log("  No roadmaps found.");
        }
        else {
            for (const roadmap of roadmaps) {
                const typeLabel = roadmap.type === "global" ? "[Global]" : "[Project]";
                console.log(`  ${typeLabel.padEnd(10)} ${roadmap.name.substring(0, 40)}`);
                console.log(`             ID: ${roadmap.id}`);
                console.log(`             ${roadmap.phases?.length || 0} phases, ${roadmap.features?.length || 0} features`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching roadmaps:", error);
        await pressEnterToContinue();
    }
}
async function createRoadmap(config) {
    try {
        const name = await input({
            message: "Roadmap name:",
            validate: (value) => (value.length > 0 ? true : "Name is required"),
        });
        const type = await select({
            message: "Type:",
            choices: [
                { name: "Global", value: "global" },
                { name: "Project", value: "project" },
            ],
            default: "global",
        });
        const vision = await input({
            message: "Vision (optional):",
        });
        const res = await fetch(`${config.apiUrl}/api/roadmaps`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                type,
                vision: vision || undefined,
                targetAudience: {
                    primary: "All users",
                    secondary: [],
                },
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const roadmap = await res.json();
        console.log(`\n  Roadmap created successfully!`);
        console.log(`  ID: ${roadmap.id}`);
        console.log(`  Name: ${roadmap.name}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating roadmap:", error);
        await pressEnterToContinue();
    }
}
async function generateRoadmap(config) {
    try {
        const roadmapId = await input({
            message: "Roadmap ID to generate for:",
            validate: (value) => (value.length > 0 ? true : "Roadmap ID is required"),
        });
        const context = await input({
            message: "Additional context (optional):",
        });
        console.log("\n  Generating roadmap with AI... This may take a moment.\n");
        const res = await fetch(`${config.apiUrl}/api/roadmaps/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                roadmapId,
                additionalContext: context || undefined,
            }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const result = await res.json();
        console.log(`  Roadmap generated successfully!`);
        console.log(`  Phases created: ${result.phasesGenerated}`);
        console.log(`  Features created: ${result.featuresGenerated}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error generating roadmap:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// WORKFLOWS MENU
// ============================================
async function workflowsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all workflows", value: "list" },
        { name: "Create new workflow", value: "create" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Workflows:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listWorkflows(config);
            break;
        case "create":
            await createWorkflow(config);
            break;
        case "back":
            return;
    }
}
async function listWorkflows(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/workflows`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const workflows = await res.json();
        console.log("\n  WORKFLOWS");
        console.log("  " + "-".repeat(70));
        if (workflows.length === 0) {
            console.log("  No workflows found.");
        }
        else {
            for (const workflow of workflows) {
                console.log(`  - ${workflow.name.substring(0, 40).padEnd(40)} [${workflow.status}]`);
                console.log(`    ID: ${workflow.id}`);
                console.log(`    Value Stream: ${workflow.valueStream.replace(/_/g, " ")}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching workflows:", error);
        await pressEnterToContinue();
    }
}
async function createWorkflow(config) {
    try {
        const name = await input({
            message: "Workflow name:",
            validate: (value) => (value.length > 0 ? true : "Name is required"),
        });
        const description = await input({
            message: "Description (optional):",
        });
        const valueStream = await select({
            message: "Value stream:",
            choices: [
                { name: "Order to Delivery", value: "order_to_delivery" },
                { name: "Procure to Pay", value: "procure_to_pay" },
                { name: "Returns Management", value: "returns_management" },
                { name: "Product Lifecycle", value: "product_lifecycle" },
                { name: "Customer Service", value: "customer_service" },
                { name: "Marketing & Sales", value: "marketing_sales" },
                { name: "Finance & Accounting", value: "finance_accounting" },
                { name: "HR Operations", value: "hr_operations" },
                { name: "IT Operations", value: "it_operations" },
                { name: "General", value: "general" },
            ],
            default: "general",
        });
        const res = await fetch(`${config.apiUrl}/api/workflows`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                description: description || "",
                valueStream,
                status: "draft",
                action: "manual",
                departmentIds: [],
                autonomyWeight: 0,
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const workflow = await res.json();
        console.log(`\n  Workflow created successfully!`);
        console.log(`  ID: ${workflow.id}`);
        console.log(`  Name: ${workflow.name}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating workflow:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// IDEAS MENU
// ============================================
async function ideasMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all ideas", value: "list" },
        { name: "Create new idea", value: "create" },
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
        case "create":
            await createIdea(config);
            break;
        case "back":
            return;
    }
}
async function listIdeas(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/ideas`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const ideas = await res.json();
        console.log("\n  IDEAS");
        console.log("  " + "-".repeat(70));
        if (ideas.length === 0) {
            console.log("  No ideas found.");
        }
        else {
            for (const idea of ideas) {
                const statusIcon = idea.status === "active" ? "[o]" : idea.status === "converted" ? "[>]" : "[.]";
                console.log(`  ${statusIcon} ${idea.title.substring(0, 50).padEnd(50)} [${idea.status}]`);
                console.log(`      ID: ${idea.id}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching ideas:", error);
        await pressEnterToContinue();
    }
}
async function createIdea(config) {
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
        console.log(`\n  Idea created successfully!`);
        console.log(`  ID: ${idea.id}`);
        console.log(`  Title: ${idea.title}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating idea:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// VM SESSIONS MENU
// ============================================
async function vmSessionsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all VM sessions", value: "list" },
        { name: "Create new VM session", value: "create" },
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
        case "create":
            await createVMSession(config);
            break;
        case "back":
            return;
    }
}
async function listVMSessions(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const data = await res.json();
        const sessions = data.sessions || [];
        console.log("\n  VM SESSIONS");
        console.log("  " + "-".repeat(70));
        if (sessions.length === 0) {
            console.log("  No VM sessions found.");
        }
        else {
            for (const session of sessions) {
                const statusLabel = session.vmStatus.replace(/_/g, " ").toUpperCase();
                console.log(`  - ${session.name.substring(0, 40).padEnd(40)} [${statusLabel}]`);
                console.log(`    ID: ${session.id}`);
                console.log(`    Agent: ${session.agentType}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching VM sessions:", error);
        await pressEnterToContinue();
    }
}
async function createVMSession(config) {
    try {
        const name = await input({
            message: "Session name:",
            validate: (value) => (value.length > 0 ? true : "Name is required"),
        });
        const prompt = await input({
            message: "Prompt (task description):",
            validate: (value) => (value.length > 0 ? true : "Prompt is required"),
        });
        const agentType = await select({
            message: "Agent type:",
            choices: [
                { name: "Claude Code", value: "claude-code" },
                { name: "Gemini CLI", value: "gemini-cli" },
                { name: "Aider", value: "aider" },
                { name: "Custom", value: "custom" },
            ],
            default: "claude-code",
        });
        const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
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
            const errorData = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${errorData.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const session = await res.json();
        console.log(`\n  VM session created successfully!`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Name: ${session.name}`);
        console.log(`  VM Name: ${session.vmName}`);
        console.log(`\n  To start the VM, run: husky vm start ${session.id}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating VM session:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// JULES SESSIONS MENU
// ============================================
async function julesSessionsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all Jules sessions", value: "list" },
        { name: "Create new Jules session", value: "create" },
        { name: "List available sources", value: "sources" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Jules Sessions:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listJulesSessions(config);
            break;
        case "create":
            await createJulesSession(config);
            break;
        case "sources":
            await listJulesSources(config);
            break;
        case "back":
            return;
    }
}
async function listJulesSessions(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/jules-sessions`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const data = await res.json();
        const sessions = data.sessions || [];
        console.log("\n  JULES SESSIONS");
        console.log("  " + "-".repeat(70));
        if (sessions.length === 0) {
            console.log("  No Jules sessions found.");
        }
        else {
            for (const session of sessions) {
                const statusLabel = session.status.replace(/_/g, " ");
                console.log(`  - ${session.name.substring(0, 40).padEnd(40)} [${statusLabel}]`);
                console.log(`    ID: ${session.id}`);
                console.log(`    Source: ${session.sourceName || session.sourceId}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching Jules sessions:", error);
        await pressEnterToContinue();
    }
}
async function createJulesSession(config) {
    try {
        const name = await input({
            message: "Session name:",
            validate: (value) => (value.length > 0 ? true : "Name is required"),
        });
        const sourceId = await input({
            message: "Source ID (run 'jules sources' to see available):",
            validate: (value) => (value.length > 0 ? true : "Source ID is required"),
        });
        const prompt = await input({
            message: "Prompt (what should Jules do):",
            validate: (value) => (value.length > 0 ? true : "Prompt is required"),
        });
        const requireApproval = await confirm({
            message: "Require plan approval?",
            default: true,
        });
        const res = await fetch(`${config.apiUrl}/api/jules-sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                prompt,
                sourceId,
                requirePlanApproval: requireApproval,
            }),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${errorData.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const session = await res.json();
        console.log(`\n  Jules session created successfully!`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Name: ${session.name}`);
        console.log(`  Jules Session ID: ${session.julesSessionId}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating Jules session:", error);
        await pressEnterToContinue();
    }
}
async function listJulesSources(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/jules-sessions/sources`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const data = await res.json();
        if (!data.configured) {
            console.log("\n  Jules API is not configured. Add JULES_API_KEY to Secret Manager.\n");
            await pressEnterToContinue();
            return;
        }
        const sources = data.sources || [];
        console.log("\n  JULES SOURCES (GitHub Repositories)");
        console.log("  " + "-".repeat(70));
        if (sources.length === 0) {
            console.log("  No sources configured.");
        }
        else {
            for (const source of sources) {
                const connected = source.connected ? "Yes" : "No";
                console.log(`  - ${source.fullName.substring(0, 40).padEnd(40)} [${source.defaultBranch}]`);
                console.log(`    ID: ${source.id}`);
                console.log(`    Connected: ${connected}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching Jules sources:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// BUSINESS STRATEGY MENU
// ============================================
async function strategyMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "Show current strategy", value: "show" },
        { name: "Update vision", value: "vision" },
        { name: "Update mission", value: "mission" },
        { name: "Add company value", value: "add-value" },
        { name: "Add strategic goal", value: "add-goal" },
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
            await updateVision(config);
            break;
        case "mission":
            await updateMission(config);
            break;
        case "add-value":
            await addValue(config);
            break;
        case "add-goal":
            await addGoal(config);
            break;
        case "back":
            return;
    }
}
async function showStrategy(config) {
    try {
        const res = await fetch(`${config.apiUrl}/api/business-strategy`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const strategy = await res.json();
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
            for (const value of strategy.values) {
                console.log(`  - ${value.name}`);
            }
        }
        console.log(`\n  GOALS (${strategy.goals.length})`);
        console.log("  " + "-".repeat(40));
        if (strategy.goals.length === 0) {
            console.log("  (none)");
        }
        else {
            for (const goal of strategy.goals) {
                const statusIcon = goal.status === "completed" ? "[x]" : goal.status === "in_progress" ? "[>]" : "[ ]";
                console.log(`  ${statusIcon} ${goal.title} (${goal.progress}%)`);
            }
        }
        console.log(`\n  TARGET AUDIENCE (${strategy.targetAudience.length})`);
        console.log("  " + "-".repeat(40));
        if (strategy.targetAudience.length === 0) {
            console.log("  (none)");
        }
        else {
            for (const persona of strategy.targetAudience) {
                console.log(`  - ${persona.name}`);
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
async function updateVision(config) {
    try {
        const vision = await input({
            message: "New vision statement:",
            validate: (value) => (value.length > 0 ? true : "Vision is required"),
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
        console.log(`\n  Vision updated successfully!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating vision:", error);
        await pressEnterToContinue();
    }
}
async function updateMission(config) {
    try {
        const mission = await input({
            message: "New mission statement:",
            validate: (value) => (value.length > 0 ? true : "Mission is required"),
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
        console.log(`\n  Mission updated successfully!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating mission:", error);
        await pressEnterToContinue();
    }
}
async function addValue(config) {
    try {
        const name = await input({
            message: "Value name:",
            validate: (value) => (value.length > 0 ? true : "Name is required"),
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
        console.log(`\n  Value added successfully!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error adding value:", error);
        await pressEnterToContinue();
    }
}
async function addGoal(config) {
    try {
        const title = await input({
            message: "Goal title:",
            validate: (value) => (value.length > 0 ? true : "Title is required"),
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
                progress: 0,
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  Goal added successfully!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error adding goal:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// SETTINGS MENU
// ============================================
async function settingsMenu() {
    const config = ensureConfig();
    const menuItems = [
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
            await showSettings(config);
            break;
        case "update":
            await updateSetting(config);
            break;
        case "back":
            return;
    }
}
async function showSettings(config) {
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
        }
        else {
            for (const [key, value] of entries) {
                const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value);
                console.log(`  ${key.padEnd(30)} ${valueStr.substring(0, 36)}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching settings:", error);
        await pressEnterToContinue();
    }
}
async function updateSetting(config) {
    try {
        const key = await input({
            message: "Setting key:",
            validate: (value) => (value.length > 0 ? true : "Key is required"),
        });
        const value = await input({
            message: "New value:",
            validate: (value) => (value.length > 0 ? true : "Value is required"),
        });
        // Try to parse as JSON
        let parsedValue = value;
        try {
            parsedValue = JSON.parse(value);
        }
        catch {
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
    }
    catch (error) {
        console.error("\n  Error updating setting:", error);
        await pressEnterToContinue();
    }
}
// ============================================
// CLI CONFIG MENU
// ============================================
async function cliConfigMenu() {
    const menuItems = [
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
async function showCliConfig() {
    const config = getConfig();
    console.log("\n  CLI CONFIGURATION (local)");
    console.log("  " + "-".repeat(50));
    console.log(`  API URL:  ${config.apiUrl || "(not set)"}`);
    console.log(`  API Key:  ${config.apiKey ? config.apiKey.substring(0, 8) + "..." : "(not set)"}`);
    console.log("");
    await pressEnterToContinue();
}
async function setApiUrl() {
    const { setConfig } = await import("./config.js");
    const url = await input({
        message: "API URL (e.g., https://your-dashboard.run.app):",
        validate: (value) => {
            if (!value)
                return "URL is required";
            if (!value.startsWith("http"))
                return "URL must start with http:// or https://";
            return true;
        },
    });
    setConfig("apiUrl", url);
    console.log("\n  ✅ API URL saved!\n");
    await pressEnterToContinue();
}
async function setApiKey() {
    const { setConfig } = await import("./config.js");
    const key = await input({
        message: "API Key:",
        validate: (value) => (value.length > 0 ? true : "API Key is required"),
    });
    setConfig("apiKey", key);
    console.log("\n  ✅ API Key saved!\n");
    await pressEnterToContinue();
}
async function testConnection() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.log("\n  ❌ API URL not configured. Set it first.\n");
        await pressEnterToContinue();
        return;
    }
    console.log("\n  Testing connection...\n");
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (res.ok) {
            console.log("  ✅ Connection successful!");
            console.log(`  Status: ${res.status}`);
        }
        else if (res.status === 401) {
            console.log("  ⚠️  Connection works but authentication failed.");
            console.log("  Check your API Key.");
        }
        else {
            console.log(`  ❌ Connection failed with status: ${res.status}`);
        }
    }
    catch (error) {
        console.log("  ❌ Connection failed!");
        console.log(`  Error: ${error.message}`);
    }
    console.log("");
    await pressEnterToContinue();
}
// ============================================
// UTILITY FUNCTIONS
// ============================================
async function pressEnterToContinue() {
    await input({
        message: "Press Enter to continue...",
    });
}
