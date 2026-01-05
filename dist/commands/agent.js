import { Command } from "commander";
import { spawn } from "child_process";
import { StreamClient, updateSessionStatus, submitPlan, waitForApproval, } from "../lib/streaming.js";
// ============================================
// DEPRECATION NOTICE
// ============================================
// The 'husky agent' commands are DEPRECATED and will be removed in a future version.
//
// The new architecture has Claude Code (or any AI agent) as the main process,
// and uses 'husky task' commands as Bash tools for communication.
//
// Migration Guide:
// ----------------
// OLD (deprecated):
//   husky agent plan --session-id xyz --prompt "..."
//   husky agent wait-approval --session-id xyz
//   husky agent execute --session-id xyz
//
// NEW (recommended):
//   export HUSKY_TASK_ID="xyz"
//   husky task status "Working on task..."
//   husky task plan --summary "Plan description" --steps "step1,step2"
//   husky task wait-approval --timeout 1800
//   husky task complete --output "Done" --pr "https://..."
//
// The new approach is agent-agnostic - works with Claude Code, Gemini, Codex, etc.
// ============================================
function showDeprecationWarning(command) {
    console.warn("\n" + "=".repeat(60));
    console.warn("DEPRECATION WARNING");
    console.warn("=".repeat(60));
    console.warn(`The 'husky agent ${command}' command is deprecated.`);
    console.warn("");
    console.warn("Please migrate to the new 'husky task' commands:");
    console.warn("  husky task status <message>    - Report progress");
    console.warn("  husky task plan --summary ...  - Submit plan");
    console.warn("  husky task wait-approval       - Wait for approval");
    console.warn("  husky task complete --output   - Mark complete");
    console.warn("");
    console.warn("Set HUSKY_TASK_ID environment variable instead of --session-id");
    console.warn("=".repeat(60) + "\n");
}
export const agentCommand = new Command("agent").description("[DEPRECATED] Run Claude Agent for automated code tasks. Use 'husky task' commands instead.");
// husky agent plan
agentCommand
    .command("plan")
    .description("Generate an execution plan using Claude")
    .requiredOption("--session-id <id>", "VM Session ID")
    .requiredOption("--prompt <prompt>", "Task prompt")
    .requiredOption("--api-url <url>", "Husky API URL")
    .requiredOption("--api-key <key>", "Husky API Key")
    .requiredOption("--anthropic-key <key>", "Anthropic API Key")
    .option("--workdir <path>", "Working directory", process.cwd())
    .option("--max-budget <usd>", "Max budget in USD", "2.0")
    .action(async (options) => {
    showDeprecationWarning("plan");
    const streamClient = new StreamClient(options.apiUrl, options.sessionId, options.apiKey);
    try {
        await streamClient.system("Starting plan generation...");
        await updateSessionStatus(options.apiUrl, options.sessionId, options.apiKey, "planning");
        // Use Claude Code CLI in plan mode
        const planPrompt = `You are in PLAN MODE. Analyze the following task and create a detailed execution plan. Do NOT execute any changes yet.

TASK: ${options.prompt}

Create a structured plan with:
1. Step-by-step actions needed
2. Files that will be modified
3. Risk assessment (low/medium/high) for each step
4. Estimated time for execution

Output your plan in a clear, numbered format. After planning, use the ExitPlanMode tool to indicate completion.`;
        await streamClient.system("Invoking Claude for planning...");
        // Run Claude Code in print mode for planning
        const result = await runClaudeCode(planPrompt, options.workdir, options.anthropicKey, streamClient, parseFloat(options.maxBudget));
        // Parse the plan from Claude's output
        const plan = parsePlanFromOutput(result.output);
        // Submit plan to Husky
        await submitPlan(options.apiUrl, options.sessionId, options.apiKey, plan);
        await updateSessionStatus(options.apiUrl, options.sessionId, options.apiKey, "awaiting_approval");
        await streamClient.system("Plan submitted. Waiting for approval...");
        console.log("Plan generated successfully");
        process.exit(0);
    }
    catch (error) {
        await streamClient.stderr(`Plan generation failed: ${error}`);
        await updateSessionStatus(options.apiUrl, options.sessionId, options.apiKey, "failed", { lastError: String(error) });
        console.error("Plan generation failed:", error);
        process.exit(1);
    }
});
// husky agent execute
agentCommand
    .command("execute")
    .description("Execute the approved plan")
    .requiredOption("--session-id <id>", "VM Session ID")
    .requiredOption("--api-url <url>", "Husky API URL")
    .requiredOption("--api-key <key>", "Husky API Key")
    .requiredOption("--anthropic-key <key>", "Anthropic API Key")
    .option("--workdir <path>", "Working directory", process.cwd())
    .option("--github-token <token>", "GitHub token for commits")
    .option("--max-budget <usd>", "Max budget in USD", "5.0")
    .action(async (options) => {
    showDeprecationWarning("execute");
    const streamClient = new StreamClient(options.apiUrl, options.sessionId, options.apiKey);
    try {
        await streamClient.system("Starting execution...");
        await updateSessionStatus(options.apiUrl, options.sessionId, options.apiKey, "running");
        // Set GitHub token if provided
        if (options.githubToken) {
            process.env.GITHUB_TOKEN = options.githubToken;
        }
        // Fetch the original prompt from the session
        const sessionResponse = await fetch(`${options.apiUrl}/api/vm-sessions/${options.sessionId}`, {
            headers: { "X-API-Key": options.apiKey },
        });
        if (!sessionResponse.ok) {
            throw new Error("Failed to fetch session details");
        }
        const session = await sessionResponse.json();
        const prompt = session.prompt;
        await streamClient.system(`Executing task: ${prompt}`);
        // Run Claude Code to execute the task
        const result = await runClaudeCode(prompt, options.workdir, options.anthropicKey, streamClient, parseFloat(options.maxBudget));
        await streamClient.system(`Execution completed with exit code: ${result.exitCode}`);
        // Report completion
        await fetch(`${options.apiUrl}/api/webhooks/vm/completion`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": options.apiKey,
            },
            body: JSON.stringify({
                sessionId: options.sessionId,
                exitCode: result.exitCode,
                output: result.output,
            }),
        });
        console.log("Execution completed");
        process.exit(result.exitCode);
    }
    catch (error) {
        await streamClient.stderr(`Execution failed: ${error}`);
        await updateSessionStatus(options.apiUrl, options.sessionId, options.apiKey, "failed", { lastError: String(error) });
        console.error("Execution failed:", error);
        process.exit(1);
    }
});
// husky agent wait-approval
agentCommand
    .command("wait-approval")
    .description("Wait for plan approval")
    .requiredOption("--session-id <id>", "VM Session ID")
    .requiredOption("--api-url <url>", "Husky API URL")
    .requiredOption("--api-key <key>", "Husky API Key")
    .option("--timeout <seconds>", "Timeout in seconds", "1800")
    .action(async (options) => {
    showDeprecationWarning("wait-approval");
    const timeoutMs = parseInt(options.timeout) * 1000;
    console.error(`Waiting for approval (timeout: ${options.timeout}s)...`);
    const result = await waitForApproval(options.apiUrl, options.sessionId, options.apiKey, timeoutMs);
    // Output result to stdout for shell script to capture
    console.log(result);
    process.exit(result === "approved" ? 0 : 1);
});
/**
 * Run Claude Code CLI and stream output
 */
async function runClaudeCode(prompt, workdir, anthropicKey, streamClient, maxBudgetUsd) {
    return new Promise((resolve, reject) => {
        const outputLines = [];
        // Spawn Claude Code process
        const claude = spawn("claude", [
            "-p",
            prompt,
            "--output-format",
            "stream-json",
            "--max-turns",
            "50",
        ], {
            cwd: workdir,
            env: {
                ...process.env,
                ANTHROPIC_API_KEY: anthropicKey,
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        claude.stdout.on("data", async (data) => {
            const text = data.toString();
            outputLines.push(text);
            // Try to parse JSON messages
            const lines = text.split("\n").filter(Boolean);
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === "assistant" && msg.message?.content) {
                        for (const block of msg.message.content) {
                            if (block.type === "text") {
                                await streamClient.stdout(block.text);
                            }
                            else if (block.type === "tool_use") {
                                await streamClient.system(`Using tool: ${block.name}`);
                            }
                        }
                    }
                    else if (msg.type === "result") {
                        await streamClient.system(`Cost: $${msg.cost_usd?.toFixed(4) || "unknown"}`);
                    }
                }
                catch {
                    // Not JSON, send as plain text
                    await streamClient.stdout(line);
                }
            }
        });
        claude.stderr.on("data", async (data) => {
            const text = data.toString();
            outputLines.push(text);
            await streamClient.stderr(text);
        });
        claude.on("error", (error) => {
            reject(error);
        });
        claude.on("close", (code) => {
            resolve({
                exitCode: code ?? 1,
                output: outputLines.join("\n").slice(0, 500000), // Limit to 500KB
            });
        });
    });
}
/**
 * Parse plan from Claude's output
 */
function parsePlanFromOutput(output) {
    // Simple parsing - extract numbered steps
    const steps = [];
    const lines = output.split("\n");
    let currentStep = 0;
    for (const line of lines) {
        // Match numbered steps like "1." or "Step 1:"
        const stepMatch = line.match(/^(?:Step\s+)?(\d+)[.):]\s*(.+)/i);
        if (stepMatch) {
            currentStep = parseInt(stepMatch[1]);
            const description = stepMatch[2].trim();
            // Extract file paths mentioned
            const fileMatches = description.match(/`([^`]+\.[a-z]+)`/g) || [];
            const files = fileMatches.map((f) => f.replace(/`/g, ""));
            // Determine risk level based on keywords
            let risk = "low";
            if (/delete|remove|drop|danger/i.test(description)) {
                risk = "high";
            }
            else if (/modify|change|update|refactor/i.test(description)) {
                risk = "medium";
            }
            steps.push({
                order: currentStep,
                description,
                files,
                risk,
            });
        }
    }
    // If no steps found, create a generic one
    if (steps.length === 0) {
        steps.push({
            order: 1,
            description: "Execute task as specified",
            files: [],
            risk: "medium",
        });
    }
    return {
        steps,
        estimatedCost: 0.5, // Placeholder
        estimatedRuntime: 5, // 5 minutes placeholder
    };
}
