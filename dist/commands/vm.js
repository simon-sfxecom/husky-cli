import { Command } from "commander";
import { getConfig } from "./config.js";
import * as readline from "readline";
export const vmCommand = new Command("vm")
    .description("Manage VM sessions");
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
function formatStatus(status) {
    return status.replace(/_/g, " ").toUpperCase();
}
// husky vm list
vmCommand
    .command("list")
    .description("List all VM sessions")
    .option("--json", "Output as JSON")
    .option("--status <status>", "Filter by status (pending, starting, running, completed, failed, terminated)")
    .option("--agent <agent>", "Filter by agent type (claude-code, gemini-cli, aider, custom)")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const url = new URL("/api/vm-sessions", config.apiUrl);
        if (options.status) {
            url.searchParams.set("vmStatus", options.status);
        }
        const res = await fetch(url.toString(), {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        let sessions = data.sessions || [];
        // Filter by agent type if specified
        if (options.agent) {
            sessions = sessions.filter((s) => s.agentType === options.agent);
        }
        if (options.json) {
            console.log(JSON.stringify({ sessions, stats: data.stats }, null, 2));
        }
        else {
            printVMSessions(sessions, data.stats);
        }
    }
    catch (error) {
        console.error("Error fetching VM sessions:", error);
        process.exit(1);
    }
});
// husky vm create <name>
vmCommand
    .command("create <name>")
    .description("Create a new VM session")
    .option("-p, --prompt <prompt>", "Initial prompt for the agent")
    .option("--agent <agent>", "Agent type (claude-code, gemini-cli, aider, custom)", "claude-code")
    .option("--config <configId>", "VM config to use")
    .option("--project <projectId>", "Link to project")
    .option("--task <taskId>", "Link to task")
    .option("--repo <repoUrl>", "Git repository URL")
    .option("--branch <branch>", "Git branch to use")
    .option("--machine-type <machineType>", "GCP machine type", "e2-medium")
    .option("--zone <zone>", "GCP zone", "us-central1-a")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
    const config = ensureConfig();
    if (!options.prompt) {
        console.error("Error: --prompt is required");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                prompt: options.prompt,
                agentType: options.agent,
                taskId: options.task,
                workflowId: options.project,
                repoUrl: options.repo,
                branch: options.branch,
                machineType: options.machineType,
                zone: options.zone,
                startTrigger: "manual",
            }),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `API error: ${res.status}`);
        }
        const session = await res.json();
        if (options.json) {
            console.log(JSON.stringify(session, null, 2));
        }
        else {
            console.log(`Created VM session: ${session.name}`);
            console.log(`  ID:       ${session.id}`);
            console.log(`  Agent:    ${session.agentType}`);
            console.log(`  Status:   ${formatStatus(session.vmStatus)}`);
            console.log(`  VM Name:  ${session.vmName}`);
            console.log(`\nTo start the VM, run: husky vm start ${session.id}`);
        }
    }
    catch (error) {
        console.error("Error creating VM session:", error);
        process.exit(1);
    }
});
// husky vm get <id>
vmCommand
    .command("get <id>")
    .description("Get VM session details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        const session = await res.json();
        if (options.json) {
            console.log(JSON.stringify(session, null, 2));
        }
        else {
            printVMSessionDetail(session);
        }
    }
    catch (error) {
        console.error("Error fetching VM session:", error);
        process.exit(1);
    }
});
// husky vm update <id>
vmCommand
    .command("update <id>")
    .description("Update VM session")
    .option("-n, --name <name>", "New name")
    .option("-p, --prompt <prompt>", "New prompt")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload
    const updateData = {};
    if (options.name)
        updateData.name = options.name;
    if (options.prompt)
        updateData.prompt = options.prompt;
    if (Object.keys(updateData).length === 0) {
        console.error("Error: No update options provided. Use -n/--name or -p/--prompt");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updateData),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
            }
            else {
                const errorData = await res.json().catch(() => ({}));
                console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const session = await res.json();
        if (options.json) {
            console.log(JSON.stringify(session, null, 2));
        }
        else {
            console.log(`VM session updated successfully`);
            console.log(`  Name:   ${session.name}`);
            console.log(`  Status: ${formatStatus(session.vmStatus)}`);
        }
    }
    catch (error) {
        console.error("Error updating VM session:", error);
        process.exit(1);
    }
});
// husky vm delete <id>
vmCommand
    .command("delete <id>")
    .description("Delete VM session")
    .option("--force", "Skip confirmation")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Confirm deletion unless --force is provided
    if (!options.force) {
        try {
            const getRes = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
                headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
            });
            if (!getRes.ok) {
                if (getRes.status === 404) {
                    console.error(`Error: VM session ${id} not found`);
                }
                else {
                    console.error(`Error: API returned ${getRes.status}`);
                }
                process.exit(1);
            }
            const session = await getRes.json();
            const confirmed = await confirm(`Delete VM session "${session.name}" (${id})?`);
            if (!confirmed) {
                console.log("Deletion cancelled.");
                process.exit(0);
            }
        }
        catch (error) {
            console.error("Error fetching VM session:", error);
            process.exit(1);
        }
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
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
            console.log(`VM session deleted`);
        }
    }
    catch (error) {
        console.error("Error deleting VM session:", error);
        process.exit(1);
    }
});
// husky vm start <id>
vmCommand
    .command("start <id>")
    .description("Start/provision the VM")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    console.log("Starting VM provisioning...");
    console.log("This may take a few minutes...\n");
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
            }
            else {
                const errorData = await res.json().catch(() => ({}));
                console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            const session = data.session;
            console.log(`VM started successfully!`);
            console.log(`  Name:   ${session.name}`);
            console.log(`  Status: ${formatStatus(session.vmStatus)}`);
            if (session.vmIpAddress) {
                console.log(`  IP:     ${session.vmIpAddress}`);
            }
            console.log(`\nTo view logs, run: husky vm logs ${id}`);
        }
    }
    catch (error) {
        console.error("Error starting VM session:", error);
        process.exit(1);
    }
});
// husky vm stop <id>
vmCommand
    .command("stop <id>")
    .description("Stop the VM")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    console.log("Stopping VM...\n");
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/stop`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
            }
            else {
                const errorData = await res.json().catch(() => ({}));
                console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            const session = data.session;
            console.log(`VM stopped successfully`);
            console.log(`  Name:   ${session.name}`);
            console.log(`  Status: ${formatStatus(session.vmStatus)}`);
        }
    }
    catch (error) {
        console.error("Error stopping VM session:", error);
        process.exit(1);
    }
});
// husky vm logs <id>
vmCommand
    .command("logs <id>")
    .description("Get VM logs")
    .option("--follow", "Stream logs (poll for updates)")
    .option("--tail <n>", "Last n log entries", "50")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    const limit = parseInt(options.tail, 10);
    const fetchLogs = async () => {
        const url = new URL(`/api/vm-sessions/${id}/logs`, config.apiUrl);
        url.searchParams.set("limit", limit.toString());
        const res = await fetch(url.toString(), {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
                process.exit(1);
            }
            throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        return data.logs || [];
    };
    try {
        const logs = await fetchLogs();
        if (options.json) {
            console.log(JSON.stringify(logs, null, 2));
            if (options.follow) {
                console.error("Note: --json mode does not support --follow streaming");
            }
            return;
        }
        // Print initial logs
        for (const log of logs) {
            printLog(log);
        }
        if (options.follow) {
            console.log("\n--- Following logs (Ctrl+C to stop) ---\n");
            let lastLogCount = logs.length;
            const pollInterval = 3000; // 3 seconds
            // Poll for new logs
            const interval = setInterval(async () => {
                try {
                    const newLogs = await fetchLogs();
                    if (newLogs.length > lastLogCount) {
                        // Print only new logs
                        for (const log of newLogs.slice(lastLogCount)) {
                            printLog(log);
                        }
                        lastLogCount = newLogs.length;
                    }
                }
                catch (error) {
                    console.error("Error fetching logs:", error);
                }
            }, pollInterval);
            // Handle graceful shutdown
            process.on("SIGINT", () => {
                clearInterval(interval);
                console.log("\nStopped following logs.");
                process.exit(0);
            });
            // Keep process alive
            await new Promise(() => { });
        }
    }
    catch (error) {
        console.error("Error fetching logs:", error);
        process.exit(1);
    }
});
// husky vm approve <id>
vmCommand
    .command("approve <id>")
    .description("Approve VM session plan")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
            }
            else {
                const errorData = await res.json().catch(() => ({}));
                console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            console.log(`Plan approved`);
            console.log(`  ${data.message}`);
        }
    }
    catch (error) {
        console.error("Error approving plan:", error);
        process.exit(1);
    }
});
// husky vm reject <id>
vmCommand
    .command("reject <id>")
    .description("Reject VM session plan")
    .option("-r, --reason <reason>", "Rejection reason")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/vm-sessions/${id}/reject`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                reason: options.reason,
            }),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: VM session ${id} not found`);
            }
            else {
                const errorData = await res.json().catch(() => ({}));
                console.error(`Error: ${errorData.error || `API returned ${res.status}`}`);
            }
            process.exit(1);
        }
        const data = await res.json();
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
        }
        else {
            console.log(`Plan rejected`);
            console.log(`  ${data.message}`);
            if (options.reason) {
                console.log(`  Reason: ${options.reason}`);
            }
        }
    }
    catch (error) {
        console.error("Error rejecting plan:", error);
        process.exit(1);
    }
});
// Print helpers
function printVMSessions(sessions, stats) {
    if (sessions.length === 0) {
        console.log("\n  No VM sessions found.");
        console.log("  Create one with: husky vm create <name> --prompt <prompt>\n");
        return;
    }
    if (stats) {
        console.log(`\n  Running VMs: ${stats.runningCount} | Today's Cost: $${stats.todayCost.toFixed(2)}`);
    }
    console.log("\n  VM SESSIONS");
    console.log("  " + "-".repeat(90));
    console.log(`  ${"ID".padEnd(24)} ${"NAME".padEnd(20)} ${"STATUS".padEnd(16)} ${"AGENT".padEnd(14)} CREATED`);
    console.log("  " + "-".repeat(90));
    for (const session of sessions) {
        const truncatedName = session.name.length > 18 ? session.name.substring(0, 15) + "..." : session.name;
        const status = formatStatus(session.vmStatus).padEnd(16);
        const createdAt = new Date(session.createdAt).toLocaleDateString();
        console.log(`  ${session.id.padEnd(24)} ${truncatedName.padEnd(20)} ${status} ${session.agentType.padEnd(14)} ${createdAt}`);
    }
    console.log("");
}
function printVMSessionDetail(session) {
    console.log(`\n  VM Session: ${session.name}`);
    console.log("  " + "-".repeat(60));
    console.log(`  ID:           ${session.id}`);
    console.log(`  Status:       ${formatStatus(session.vmStatus)}`);
    console.log(`  Agent:        ${session.agentType}`);
    console.log(`  VM Name:      ${session.vmName}`);
    console.log(`  Zone:         ${session.vmZone}`);
    console.log(`  Machine Type: ${session.machineType}`);
    if (session.vmIpAddress) {
        console.log(`  IP Address:   ${session.vmIpAddress}`);
    }
    if (session.repoUrl) {
        console.log(`  Repository:   ${session.repoUrl}`);
        if (session.branch) {
            console.log(`  Branch:       ${session.branch}`);
        }
    }
    if (session.taskId) {
        console.log(`  Task ID:      ${session.taskId}`);
    }
    if (session.workflowId) {
        console.log(`  Workflow ID:  ${session.workflowId}`);
    }
    console.log(`\n  Prompt:`);
    console.log(`    ${session.prompt}`);
    if (session.costEstimate !== undefined) {
        console.log(`\n  Cost Estimate: $${session.costEstimate.toFixed(4)}`);
    }
    if (session.runtimeMinutes !== undefined) {
        console.log(`  Runtime:       ${session.runtimeMinutes} minutes`);
    }
    if (session.prUrl) {
        console.log(`\n  Pull Request: ${session.prUrl}`);
    }
    if (session.output) {
        console.log(`\n  Output:`);
        const outputLines = session.output.split("\n").slice(0, 10);
        for (const line of outputLines) {
            console.log(`    ${line}`);
        }
        if (session.output.split("\n").length > 10) {
            console.log(`    ... (truncated)`);
        }
    }
    if (session.lastError) {
        console.log(`\n  Last Error: ${session.lastError}`);
    }
    console.log(`\n  Created:  ${new Date(session.createdAt).toLocaleString()}`);
    if (session.startedAt) {
        console.log(`  Started:  ${new Date(session.startedAt).toLocaleString()}`);
    }
    if (session.completedAt) {
        console.log(`  Completed: ${new Date(session.completedAt).toLocaleString()}`);
    }
    console.log("");
}
function printLog(log) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const level = log.level.toUpperCase().padEnd(5);
    const source = `[${log.source}]`.padEnd(10);
    // Color based on level
    let prefix = "";
    if (log.level === "error") {
        prefix = "x ";
    }
    else if (log.level === "warn") {
        prefix = "! ";
    }
    else {
        prefix = "  ";
    }
    console.log(`${prefix}${timestamp} ${level} ${source} ${log.message}`);
}
