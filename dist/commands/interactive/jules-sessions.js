import { select, input, confirm } from "@inquirer/prompts";
import { ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";
const STATUS_LABELS = {
    pending: "Pending",
    planning: "Planning",
    awaiting_approval: "Awaiting Approval",
    executing: "Executing",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
};
export async function julesSessionsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all sessions", value: "list" },
        { name: "View session details", value: "view" },
        { name: "Create new session", value: "create" },
        { name: "Send message", value: "message" },
        { name: "Approve/Reject plan", value: "approve" },
        { name: "View activities", value: "activities" },
        { name: "View sources", value: "sources" },
        { name: "Delete session", value: "delete" },
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
        case "view":
            await viewJulesSession(config);
            break;
        case "create":
            await createJulesSession(config);
            break;
        case "message":
            await sendMessage(config);
            break;
        case "approve":
            await approvePlan(config);
            break;
        case "activities":
            await viewActivities(config);
            break;
        case "sources":
            await viewSources(config);
            break;
        case "delete":
            await deleteJulesSession(config);
            break;
        case "back":
            return;
    }
}
async function fetchJulesSessions(config) {
    const res = await fetch(`${config.apiUrl}/api/jules-sessions`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok)
        throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    return data.sessions || [];
}
async function fetchJulesSources(config) {
    const res = await fetch(`${config.apiUrl}/api/jules-sessions/sources`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok)
        throw new Error(`API returned ${res.status}`);
    return res.json();
}
async function selectJulesSession(config, message) {
    const sessions = await fetchJulesSessions(config);
    if (sessions.length === 0) {
        console.log("\n  No Jules sessions found.\n");
        await pressEnterToContinue();
        return null;
    }
    const choices = sessions.map((s) => ({
        name: `[${STATUS_LABELS[s.status]}] ${truncate(s.name, 30)} (${s.sourceName || s.sourceId})`,
        value: s.id,
    }));
    choices.push({ name: "Cancel", value: "__cancel__" });
    const sessionId = await select({ message, choices });
    if (sessionId === "__cancel__")
        return null;
    return sessions.find((s) => s.id === sessionId) || null;
}
async function listJulesSessions(config) {
    try {
        const sessions = await fetchJulesSessions(config);
        console.log("\n  JULES SESSIONS");
        console.log("  " + "-".repeat(80));
        if (sessions.length === 0) {
            console.log("  No Jules sessions found.");
        }
        else {
            for (const session of sessions) {
                const status = STATUS_LABELS[session.status] || session.status;
                console.log(`  [${status}] ${truncate(session.name, 40)}`);
                console.log(`      ID: ${session.id}`);
                console.log(`      Source: ${session.sourceName || session.sourceId}`);
                if (session.prUrl) {
                    console.log(`      PR: ${session.prUrl}`);
                }
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
async function viewJulesSession(config) {
    try {
        const session = await selectJulesSession(config, "Select session to view:");
        if (!session)
            return;
        const res = await fetch(`${config.apiUrl}/api/jules-sessions/${session.id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const full = await res.json();
        console.log(`\n  Jules Session: ${full.name}`);
        console.log("  " + "-".repeat(60));
        console.log(`  ID:               ${full.id}`);
        console.log(`  Jules Session ID: ${full.julesSessionId}`);
        console.log(`  Status:           ${STATUS_LABELS[full.status] || full.status}`);
        console.log(`  Source:           ${full.sourceName || full.sourceId}`);
        if (full.branch) {
            console.log(`  Branch:           ${full.branch}`);
        }
        console.log(`  Plan Approval:    ${full.requirePlanApproval ? "Required" : "Auto"}`);
        console.log(`\n  Prompt:`);
        const promptLines = (full.prompt || "").split("\n").slice(0, 3);
        for (const line of promptLines) {
            console.log(`    ${truncate(line, 70)}`);
        }
        if (full.planSummary) {
            console.log(`\n  Plan Summary:`);
            console.log(`    ${truncate(full.planSummary, 150)}`);
        }
        if (full.prUrl) {
            console.log(`\n  Pull Request: ${full.prUrl}`);
            if (full.prNumber)
                console.log(`    Number: #${full.prNumber}`);
        }
        if (full.taskId) {
            console.log(`\n  Linked Task: ${full.taskId}`);
        }
        console.log(`\n  Created: ${formatDate(full.createdAt)}`);
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error viewing session:", error);
        await pressEnterToContinue();
    }
}
async function createJulesSession(config) {
    try {
        // First check if Jules is configured and get sources
        const sourceData = await fetchJulesSources(config);
        if (!sourceData.configured) {
            console.log("\n  Error: Jules API is not configured.");
            console.log("  Add JULES_API_KEY to Secret Manager.\n");
            await pressEnterToContinue();
            return;
        }
        if (!sourceData.sources || sourceData.sources.length === 0) {
            console.log("\n  Error: No Jules sources available.");
            console.log("  Connect a GitHub repository in the Jules dashboard.\n");
            await pressEnterToContinue();
            return;
        }
        // Select source
        const sourceChoices = sourceData.sources.map((s) => ({
            name: `${s.fullName} (${s.defaultBranch})`,
            value: s.id,
            description: s.connected ? "Connected" : "Not connected",
        }));
        sourceChoices.push({ name: "Cancel", value: "__cancel__", description: "" });
        const sourceId = await select({ message: "Select source repository:", choices: sourceChoices });
        if (sourceId === "__cancel__")
            return;
        const selectedSource = sourceData.sources.find((s) => s.id === sourceId);
        const name = await input({
            message: "Session name:",
            validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        const prompt = await input({
            message: "Task prompt (what should Jules do?):",
            validate: (v) => (v.length > 10 ? true : "Please provide more detail"),
        });
        const branch = await input({
            message: `Branch (default: ${selectedSource?.defaultBranch || "main"}):`,
            default: selectedSource?.defaultBranch || "main",
        });
        const requireApproval = await confirm({
            message: "Require plan approval before execution?",
            default: true,
        });
        console.log("\n  Creating Jules session...\n");
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
                sourceName: selectedSource?.fullName,
                branch,
                requirePlanApproval: requireApproval,
            }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const session = await res.json();
        console.log(`  ✓ Jules session created!`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Name: ${session.name}`);
        console.log(`  Status: ${STATUS_LABELS[session.status] || session.status}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating session:", error);
        await pressEnterToContinue();
    }
}
async function sendMessage(config) {
    try {
        const session = await selectJulesSession(config, "Select session to message:");
        if (!session)
            return;
        // Check if session can receive messages
        if (session.status === "completed" || session.status === "failed" || session.status === "cancelled") {
            console.log(`\n  Cannot send message to session with status: ${session.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const message = await input({
            message: "Enter your message:",
            validate: (v) => (v.length > 0 ? true : "Message required"),
        });
        console.log("\n  Sending message...\n");
        const res = await fetch(`${config.apiUrl}/api/jules-sessions/${session.id}/message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ prompt: message }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const updated = await res.json();
        console.log(`  ✓ Message sent!`);
        console.log(`  Status: ${STATUS_LABELS[updated.status] || updated.status}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error sending message:", error);
        await pressEnterToContinue();
    }
}
async function approvePlan(config) {
    try {
        // Filter to sessions awaiting approval
        const allSessions = await fetchJulesSessions(config);
        const awaitingSessions = allSessions.filter((s) => s.status === "awaiting_approval");
        if (awaitingSessions.length === 0) {
            console.log("\n  No sessions awaiting approval.\n");
            await pressEnterToContinue();
            return;
        }
        const choices = awaitingSessions.map((s) => ({
            name: `${truncate(s.name, 35)} (${s.sourceName || s.sourceId})`,
            value: s.id,
        }));
        choices.push({ name: "Cancel", value: "__cancel__" });
        const sessionId = await select({ message: "Select session to approve:", choices });
        if (sessionId === "__cancel__")
            return;
        const session = awaitingSessions.find((s) => s.id === sessionId);
        if (!session)
            return;
        // Show plan summary if available
        const detailRes = await fetch(`${config.apiUrl}/api/jules-sessions/${session.id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (detailRes.ok) {
            const detail = await detailRes.json();
            if (detail.planSummary) {
                console.log(`\n  Plan Summary:`);
                console.log(`  ${detail.planSummary}\n`);
            }
        }
        const action = await select({
            message: "Action:",
            choices: [
                { name: "Approve plan", value: "approve" },
                { name: "Reject plan", value: "reject" },
                { name: "Cancel", value: "cancel" },
            ],
        });
        if (action === "cancel")
            return;
        const feedback = await input({
            message: "Feedback (optional):",
        });
        const res = await fetch(`${config.apiUrl}/api/jules-sessions/${session.id}/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                approved: action === "approve",
                feedback: feedback || undefined,
            }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const updated = await res.json();
        console.log(`\n  ✓ Plan ${action === "approve" ? "approved" : "rejected"}!`);
        console.log(`  Status: ${STATUS_LABELS[updated.status] || updated.status}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error processing approval:", error);
        await pressEnterToContinue();
    }
}
async function viewActivities(config) {
    try {
        const session = await selectJulesSession(config, "Select session to view activities:");
        if (!session)
            return;
        const res = await fetch(`${config.apiUrl}/api/jules-sessions/${session.id}/activities`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const data = await res.json();
        const activities = data.activities || [];
        console.log(`\n  Activities for: ${session.name}`);
        console.log("  " + "-".repeat(60));
        if (activities.length === 0) {
            console.log("  No activities yet.");
        }
        else {
            const typeLabels = {
                plan: "[PLAN]",
                message: "[MSG]",
                code_change: "[CODE]",
                pr_created: "[PR]",
                error: "[ERR]",
            };
            for (const act of activities.slice(-15)) {
                const label = typeLabels[act.type] || `[${act.type.toUpperCase()}]`;
                const time = formatDate(act.timestamp);
                console.log(`  ${time} ${label} ${truncate(act.content, 50)}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching activities:", error);
        await pressEnterToContinue();
    }
}
async function viewSources(config) {
    try {
        const data = await fetchJulesSources(config);
        if (!data.configured) {
            console.log("\n  Jules API is not configured.");
            console.log("  Add JULES_API_KEY to Secret Manager.\n");
            await pressEnterToContinue();
            return;
        }
        console.log("\n  JULES SOURCES (GitHub Repositories)");
        console.log("  " + "-".repeat(70));
        if (!data.sources || data.sources.length === 0) {
            console.log("  No sources configured.");
        }
        else {
            for (const source of data.sources) {
                const connected = source.connected ? "[Connected]" : "[Disconnected]";
                console.log(`  ${connected} ${source.fullName}`);
                console.log(`      ID: ${source.id}`);
                console.log(`      Default Branch: ${source.defaultBranch}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching sources:", error);
        await pressEnterToContinue();
    }
}
async function deleteJulesSession(config) {
    try {
        const session = await selectJulesSession(config, "Select session to delete:");
        if (!session)
            return;
        const confirmed = await confirm({
            message: `Delete "${session.name}"? This cannot be undone.`,
            default: false,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/jules-sessions/${session.id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Jules session deleted.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error deleting session:", error);
        await pressEnterToContinue();
    }
}
