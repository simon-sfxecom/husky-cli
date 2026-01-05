import { Command } from "commander";
import { getConfig } from "./config.js";
import * as fs from "fs";
export const taskCommand = new Command("task")
    .description("Manage tasks");
// Helper: Get task ID from --id flag or HUSKY_TASK_ID env var
function getTaskId(options) {
    const id = options.id || process.env.HUSKY_TASK_ID;
    if (!id) {
        console.error("Error: Task ID required. Use --id or set HUSKY_TASK_ID environment variable.");
        process.exit(1);
    }
    return id;
}
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// husky task list
taskCommand
    .command("list")
    .description("List all tasks")
    .option("-s, --status <status>", "Filter by status")
    .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    try {
        const url = new URL("/api/tasks", config.apiUrl);
        if (options.status) {
            url.searchParams.set("status", options.status);
        }
        const res = await fetch(url.toString(), {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const tasks = await res.json();
        printTasks(tasks);
    }
    catch (error) {
        console.error("Error fetching tasks:", error);
        process.exit(1);
    }
});
// husky task start <id>
taskCommand
    .command("start <id>")
    .description("Start working on a task")
    .action(async (id) => {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${id}/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ agent: "claude-code" }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const task = await res.json();
        console.log(`✓ Started: ${task.title}`);
    }
    catch (error) {
        console.error("Error starting task:", error);
        process.exit(1);
    }
});
// husky task done <id>
taskCommand
    .command("done <id>")
    .description("Mark task as done")
    .option("--pr <url>", "Link to PR")
    .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${id}/done`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ prUrl: options.pr }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const task = await res.json();
        console.log(`✓ Completed: ${task.title}`);
    }
    catch (error) {
        console.error("Error completing task:", error);
        process.exit(1);
    }
});
// husky task create <title>
taskCommand
    .command("create <title>")
    .description("Create a new task")
    .option("-d, --description <desc>", "Task description")
    .option("--project <projectId>", "Project ID")
    .option("--path <path>", "Path in project")
    .option("-p, --priority <priority>", "Priority (low, medium, high)", "medium")
    .action(async (title, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                title,
                description: options.description,
                projectId: options.project,
                linkedPath: options.path,
                priority: options.priority,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const task = await res.json();
        console.log(`✓ Created: #${task.id} ${task.title}`);
    }
    catch (error) {
        console.error("Error creating task:", error);
        process.exit(1);
    }
});
// husky task get [--id <id>] [--json]
taskCommand
    .command("get")
    .description("Get task details")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Task ${taskId} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        const task = await res.json();
        if (options.json) {
            console.log(JSON.stringify(task, null, 2));
        }
        else {
            console.log(`\n  Task: ${task.title}`);
            console.log("  " + "─".repeat(50));
            console.log(`  ID:          ${task.id}`);
            console.log(`  Status:      ${task.status}`);
            console.log(`  Priority:    ${task.priority}`);
            if (task.description)
                console.log(`  Description: ${task.description}`);
            if (task.agent)
                console.log(`  Agent:       ${task.agent}`);
            if (task.projectId)
                console.log(`  Project:     ${task.projectId}`);
            console.log("");
        }
    }
    catch (error) {
        console.error("Error fetching task:", error);
        process.exit(1);
    }
});
// husky task status <message> [--id <id>]
taskCommand
    .command("status <message>")
    .description("Report task progress status")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .action(async (message, options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/status`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                message,
                timestamp: new Date().toISOString(),
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        console.log(`✓ Status updated: ${message}`);
    }
    catch (error) {
        console.error("Error updating status:", error);
        process.exit(1);
    }
});
// husky task plan [--summary <text>] [--file <path>] [--stdin] [--id <id>]
taskCommand
    .command("plan")
    .description("Submit execution plan for approval")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--summary <text>", "Plan summary")
    .option("--file <path>", "Read plan from file")
    .option("--stdin", "Read plan from stdin")
    .option("--steps <steps>", "Comma-separated steps")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    let content;
    let summary = options.summary;
    // Read content from file or stdin
    if (options.file) {
        try {
            content = fs.readFileSync(options.file, "utf-8");
            if (!summary) {
                // Use first line as summary if not provided
                summary = content.split("\n")[0].replace(/^#\s*/, "").slice(0, 100);
            }
        }
        catch (error) {
            console.error(`Error reading file ${options.file}:`, error);
            process.exit(1);
        }
    }
    else if (options.stdin) {
        content = fs.readFileSync(0, "utf-8"); // Read from stdin
        if (!summary) {
            summary = content.split("\n")[0].replace(/^#\s*/, "").slice(0, 100);
        }
    }
    if (!summary && !content) {
        console.error("Error: Provide --summary, --file, or --stdin");
        process.exit(1);
    }
    const steps = options.steps ? options.steps.split(",").map((s) => s.trim()) : undefined;
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/plan`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                summary: summary || "Execution plan",
                steps,
                content,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        console.log(`✓ Plan submitted for task ${taskId}`);
        console.log("  Waiting for approval...");
    }
    catch (error) {
        console.error("Error submitting plan:", error);
        process.exit(1);
    }
});
// husky task wait-approval [--timeout <seconds>] [--id <id>]
taskCommand
    .command("wait-approval")
    .description("Wait for plan approval")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--timeout <seconds>", "Timeout in seconds", "1800")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    const timeout = parseInt(options.timeout, 10) * 1000;
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    console.log(`Waiting for approval on task ${taskId}...`);
    while (Date.now() - startTime < timeout) {
        try {
            const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/approval`, {
                headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
            });
            if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
            }
            const data = await res.json();
            if (data.status === "approved") {
                console.log("✓ Plan approved!");
                process.exit(0);
            }
            else if (data.status === "rejected") {
                console.log("✗ Plan rejected");
                process.exit(1);
            }
            // Still pending, wait and poll again
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            process.stdout.write(".");
        }
        catch (error) {
            console.error("\nError checking approval:", error);
            process.exit(1);
        }
    }
    console.log("\n✗ Timeout waiting for approval");
    process.exit(2);
});
// husky task complete [--output <text>] [--pr <url>] [--error <text>] [--id <id>]
taskCommand
    .command("complete")
    .description("Mark task as complete with result")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--output <text>", "Completion output/summary")
    .option("--pr <url>", "Pull request URL")
    .option("--error <text>", "Error message (marks task as failed)")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/complete`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                output: options.output,
                prUrl: options.pr,
                error: options.error,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        if (options.error) {
            console.log(`✗ Task ${taskId} marked as failed`);
        }
        else {
            console.log(`✓ Task ${taskId} completed`);
            if (options.pr) {
                console.log(`  PR: ${options.pr}`);
            }
        }
    }
    catch (error) {
        console.error("Error completing task:", error);
        process.exit(1);
    }
});
function printTasks(tasks) {
    const byStatus = {
        backlog: [],
        in_progress: [],
        review: [],
        done: [],
    };
    for (const task of tasks) {
        if (byStatus[task.status]) {
            byStatus[task.status].push(task);
        }
    }
    const statusLabels = {
        backlog: "BACKLOG",
        in_progress: "IN PROGRESS",
        review: "REVIEW",
        done: "DONE",
    };
    for (const [status, label] of Object.entries(statusLabels)) {
        const statusTasks = byStatus[status];
        if (statusTasks.length === 0)
            continue;
        console.log(`\n  ${label}`);
        console.log("  " + "─".repeat(50));
        for (const task of statusTasks) {
            const agentStr = task.agent ? ` (${task.agent})` : "";
            const doneStr = status === "done" ? " ✓" : "";
            console.log(`  #${task.id.slice(0, 6)}  ${task.title.padEnd(30)}  ${task.priority}${agentStr}${doneStr}`);
        }
    }
    console.log("");
}
