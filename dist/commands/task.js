import { Command } from "commander";
import { getConfig } from "./config.js";
import * as fs from "fs";
import * as readline from "readline";
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
// Helper: Prompt for confirmation
async function confirm(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(`${message} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
        });
    });
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
// husky task update <id>
taskCommand
    .command("update <id>")
    .description("Update task properties")
    .option("-t, --title <title>", "New title")
    .option("-d, --description <desc>", "New description")
    .option("--status <status>", "New status (backlog, in_progress, review, done)")
    .option("--priority <priority>", "New priority (low, medium, high, urgent)")
    .option("--assignee <assignee>", "New assignee (human, llm, unassigned)")
    .option("--project <projectId>", "Link to project")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload with only changed fields
    const updates = {};
    if (options.title)
        updates.title = options.title;
    if (options.description)
        updates.description = options.description;
    if (options.status)
        updates.status = options.status;
    if (options.priority)
        updates.priority = options.priority;
    if (options.assignee)
        updates.assignee = options.assignee;
    if (options.project)
        updates.projectId = options.project;
    if (Object.keys(updates).length === 0) {
        console.error("Error: No update options provided. Use --help for available options.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updates),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Task ${id} not found`);
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
            console.log(`✓ Updated: ${task.title}`);
            const changedFields = Object.keys(updates).join(", ");
            console.log(`  Changed: ${changedFields}`);
        }
    }
    catch (error) {
        console.error("Error updating task:", error);
        process.exit(1);
    }
});
// husky task delete <id>
taskCommand
    .command("delete <id>")
    .description("Delete a task")
    .option("--force", "Skip confirmation prompt")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Confirm deletion unless --force is provided
    if (!options.force) {
        // First fetch task details to show what will be deleted
        try {
            const getRes = await fetch(`${config.apiUrl}/api/tasks/${id}`, {
                headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
            });
            if (!getRes.ok) {
                if (getRes.status === 404) {
                    console.error(`Error: Task ${id} not found`);
                }
                else {
                    console.error(`Error: API returned ${getRes.status}`);
                }
                process.exit(1);
            }
            const task = await getRes.json();
            const confirmed = await confirm(`Delete task "${task.title}" (${id})?`);
            if (!confirmed) {
                console.log("Deletion cancelled.");
                process.exit(0);
            }
        }
        catch (error) {
            console.error("Error fetching task:", error);
            process.exit(1);
        }
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Task ${id} not found`);
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
            console.log(`✓ Deleted task ${id}`);
        }
    }
    catch (error) {
        console.error("Error deleting task:", error);
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
// ============================================
// QA VALIDATION COMMANDS
// ============================================
// husky task qa-start [--id <id>] [--max-iterations <n>]
taskCommand
    .command("qa-start")
    .description("Start QA validation for a task")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--max-iterations <n>", "Max QA iterations", "5")
    .option("--no-auto-fix", "Disable automatic fix attempts")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/qa/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                maxIterations: parseInt(options.maxIterations, 10),
                autoFix: options.autoFix !== false,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        console.log(`✓ QA validation started for task ${taskId}`);
        console.log(`  Max iterations: ${data.maxIterations}`);
        console.log(`  Status: ${data.qaStatus}`);
    }
    catch (error) {
        console.error("Error starting QA:", error);
        process.exit(1);
    }
});
// husky task qa-status [--id <id>] [--json]
taskCommand
    .command("qa-status")
    .description("Get QA validation status for a task")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/qa/status`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            console.log(`\n  QA Status: ${data.taskTitle}`);
            console.log("  " + "─".repeat(50));
            console.log(`  Status:        ${data.qaStatus}`);
            console.log(`  Iterations:    ${data.iterations.total}/${data.qaMaxIterations}`);
            console.log(`  Approved:      ${data.iterations.approved}`);
            console.log(`  Rejected:      ${data.iterations.rejected}`);
            console.log(`  Errors:        ${data.iterations.errors}`);
            if (data.latestIssues && data.latestIssues.length > 0) {
                console.log(`\n  Latest Issues:`);
                for (const issue of data.latestIssues.slice(0, 5)) {
                    const icon = issue.type === "critical" ? "🔴" : issue.type === "major" ? "🟠" : "🟡";
                    console.log(`    ${icon} [${issue.type}] ${issue.title}`);
                }
            }
            if (data.isComplete) {
                console.log(`\n  ✓ QA Complete: ${data.qaStatus}`);
            }
            else if (data.requiresHumanReview) {
                console.log(`\n  ⚠ Human review required`);
            }
            console.log("");
        }
    }
    catch (error) {
        console.error("Error getting QA status:", error);
        process.exit(1);
    }
});
// husky task qa-approve [--id <id>] [--notes <text>]
taskCommand
    .command("qa-approve")
    .description("Manually approve QA for a task")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--notes <text>", "Approval notes")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/qa/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                approved: true,
                notes: options.notes,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        console.log(`✓ QA manually approved for task ${taskId}`);
    }
    catch (error) {
        console.error("Error approving QA:", error);
        process.exit(1);
    }
});
// husky task qa-reject [--id <id>] [--notes <text>]
taskCommand
    .command("qa-reject")
    .description("Manually reject QA for a task")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .option("--notes <text>", "Rejection notes")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/qa/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                approved: false,
                notes: options.notes,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        console.log(`✗ QA manually rejected for task ${taskId}`);
    }
    catch (error) {
        console.error("Error rejecting QA:", error);
        process.exit(1);
    }
});
// husky task qa-iteration [--id <id>] --iteration <n> --status <status> [--issues <json>] [--duration <seconds>]
taskCommand
    .command("qa-iteration")
    .description("Add a QA iteration result (for agents)")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .requiredOption("--iteration <n>", "Iteration number")
    .requiredOption("--status <status>", "Status (approved, rejected, error)")
    .option("--issues <json>", "Issues as JSON array")
    .option("--duration <seconds>", "Duration in seconds", "0")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    // Parse issues
    let issues = [];
    if (options.issues) {
        try {
            issues = JSON.parse(options.issues);
        }
        catch {
            console.error("Error: --issues must be valid JSON");
            process.exit(1);
        }
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/qa/iteration`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                iteration: parseInt(options.iteration, 10),
                status: options.status,
                issues,
                duration: parseFloat(options.duration),
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        console.log(`✓ QA iteration ${options.iteration} recorded`);
        console.log(`  Status: ${data.qaStatus}`);
        console.log(`  Issues: ${data.issuesCount}`);
        console.log(`  ${data.message}`);
    }
    catch (error) {
        console.error("Error adding QA iteration:", error);
        process.exit(1);
    }
});
// husky task qa-escalate [--id <id>]
taskCommand
    .command("qa-escalate")
    .description("Escalate QA to human review")
    .option("--id <id>", "Task ID (or set HUSKY_TASK_ID)")
    .action(async (options) => {
    const config = ensureConfig();
    const taskId = getTaskId(options);
    try {
        const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}/qa/approve`, {
            method: "PUT", // PUT for escalation
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        console.log(`⚠ QA escalated to human review for task ${taskId}`);
    }
    catch (error) {
        console.error("Error escalating QA:", error);
        process.exit(1);
    }
});
// ============================================
// MERGE CONFLICT RESOLUTION
// ============================================
// husky task merge-conflict --file <path> --ours <content> --theirs <content> [--base <content>] [--context <text>]
taskCommand
    .command("merge-conflict")
    .description("Resolve a Git merge conflict using AI")
    .requiredOption("--file <path>", "Path to the conflicted file")
    .requiredOption("--ours <content>", "Content from current branch (ours)")
    .requiredOption("--theirs <content>", "Content from incoming branch (theirs)")
    .option("--base <content>", "Content from common ancestor (for 3-way merge)")
    .option("--context <text>", "Additional context about the merge")
    .option("--json", "Output as JSON")
    .option("--ours-file <path>", "Read ours content from file")
    .option("--theirs-file <path>", "Read theirs content from file")
    .option("--base-file <path>", "Read base content from file")
    .action(async (options) => {
    const config = ensureConfig();
    // Read content from files if specified
    let oursContent = options.ours;
    let theirsContent = options.theirs;
    let baseContent = options.base;
    if (options.oursFile) {
        try {
            oursContent = fs.readFileSync(options.oursFile, "utf-8");
        }
        catch (error) {
            console.error(`Error reading ours file ${options.oursFile}:`, error);
            process.exit(1);
        }
    }
    if (options.theirsFile) {
        try {
            theirsContent = fs.readFileSync(options.theirsFile, "utf-8");
        }
        catch (error) {
            console.error(`Error reading theirs file ${options.theirsFile}:`, error);
            process.exit(1);
        }
    }
    if (options.baseFile) {
        try {
            baseContent = fs.readFileSync(options.baseFile, "utf-8");
        }
        catch (error) {
            console.error(`Error reading base file ${options.baseFile}:`, error);
            process.exit(1);
        }
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/merge-conflict/resolve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                filePath: options.file,
                oursContent,
                theirsContent,
                baseContent,
                context: options.context,
            }),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `API error: ${res.status}` }));
            throw new Error(errorData.error || `API error: ${res.status}`);
        }
        const result = await res.json();
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            console.log(`\n  Merge Conflict Resolution: ${options.file}`);
            console.log("  " + "=".repeat(50));
            console.log(`\n  Confidence: ${result.confidence}%`);
            // Confidence indicator
            if (result.confidence >= 90) {
                console.log("  Status:     High confidence - safe to use");
            }
            else if (result.confidence >= 70) {
                console.log("  Status:     Good confidence - review recommended");
            }
            else if (result.confidence >= 50) {
                console.log("  Status:     Medium confidence - careful review needed");
            }
            else {
                console.log("  Status:     Low confidence - manual resolution recommended");
            }
            console.log(`\n  Explanation:`);
            console.log(`  ${result.explanation}`);
            console.log("\n  " + "-".repeat(50));
            console.log("  Resolved Content:");
            console.log("  " + "-".repeat(50));
            console.log(result.resolvedContent);
            console.log("");
        }
    }
    catch (error) {
        console.error("Error resolving merge conflict:", error);
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
            console.log(`  ${task.id}  ${task.title.slice(0, 30).padEnd(30)}  ${task.priority}${agentStr}${doneStr}`);
        }
    }
    console.log("");
}
