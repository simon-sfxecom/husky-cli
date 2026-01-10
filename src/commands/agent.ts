import { Command } from "commander";
import { spawn } from "child_process";
import {
  StreamClient,
  updateSessionStatus,
  submitPlan,
  waitForApproval,
} from "../lib/streaming.js";
import { getConfig } from "./config.js";

interface AgentOptions {
  sessionId: string;
  prompt?: string;
  apiUrl: string;
  apiKey: string;
  anthropicKey: string;
  workdir?: string;
  githubToken?: string;
  timeout?: number;
  maxBudget?: number;
}

// Agent registration and messaging types
type AgentRole = "supervisor" | "worker" | "reviewer" | "support";
type AgentStatus = "online" | "offline" | "busy";

interface RegisteredAgent {
  id: string;
  name: string;
  role: AgentRole;
  emoji: string;
  tmuxSession?: string;
  vmName?: string;
  status: AgentStatus;
  lastHeartbeat?: string;
  createdAt: string;
  updatedAt: string;
}

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

function showDeprecationWarning(command: string) {
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

export const agentCommand = new Command("agent").description(
  "[DEPRECATED] Run Claude Agent for automated code tasks. Use 'husky task' commands instead."
);

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

    const streamClient = new StreamClient(
      options.apiUrl,
      options.sessionId,
      options.apiKey
    );

    try {
      await streamClient.system("Starting plan generation...");
      await updateSessionStatus(
        options.apiUrl,
        options.sessionId,
        options.apiKey,
        "planning"
      );

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
      const result = await runClaudeCode(
        planPrompt,
        options.workdir,
        options.anthropicKey,
        streamClient,
        parseFloat(options.maxBudget)
      );

      // Parse the plan from Claude's output
      const plan = parsePlanFromOutput(result.output);

      // Submit plan to Husky
      await submitPlan(options.apiUrl, options.sessionId, options.apiKey, plan);

      await updateSessionStatus(
        options.apiUrl,
        options.sessionId,
        options.apiKey,
        "awaiting_approval"
      );

      await streamClient.system("Plan submitted. Waiting for approval...");

      console.log("Plan generated successfully");
      process.exit(0);
    } catch (error) {
      await streamClient.stderr(`Plan generation failed: ${error}`);
      await updateSessionStatus(
        options.apiUrl,
        options.sessionId,
        options.apiKey,
        "failed",
        { lastError: String(error) }
      );
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

    const streamClient = new StreamClient(
      options.apiUrl,
      options.sessionId,
      options.apiKey
    );

    try {
      await streamClient.system("Starting execution...");
      await updateSessionStatus(
        options.apiUrl,
        options.sessionId,
        options.apiKey,
        "running"
      );

      // Set GitHub token if provided
      if (options.githubToken) {
        process.env.GITHUB_TOKEN = options.githubToken;
      }

      // Fetch the original prompt from the session
      const sessionResponse = await fetch(
        `${options.apiUrl}/api/vm-sessions/${options.sessionId}`,
        {
          headers: { "X-API-Key": options.apiKey },
        }
      );

      if (!sessionResponse.ok) {
        throw new Error("Failed to fetch session details");
      }

      const session = await sessionResponse.json();
      const prompt = session.prompt;

      await streamClient.system(`Executing task: ${prompt}`);

      // Run Claude Code to execute the task
      const result = await runClaudeCode(
        prompt,
        options.workdir,
        options.anthropicKey,
        streamClient,
        parseFloat(options.maxBudget)
      );

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
    } catch (error) {
      await streamClient.stderr(`Execution failed: ${error}`);
      await updateSessionStatus(
        options.apiUrl,
        options.sessionId,
        options.apiKey,
        "failed",
        { lastError: String(error) }
      );
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

    const result = await waitForApproval(
      options.apiUrl,
      options.sessionId,
      options.apiKey,
      timeoutMs
    );

    // Output result to stdout for shell script to capture
    console.log(result);
    process.exit(result === "approved" ? 0 : 1);
  });

/**
 * Run Claude Code CLI and stream output
 */
async function runClaudeCode(
  prompt: string,
  workdir: string,
  anthropicKey: string,
  streamClient: StreamClient,
  maxBudgetUsd: number
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const outputLines: string[] = [];

    // Spawn Claude Code process
    const claude = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--max-turns",
        "50",
      ],
      {
        cwd: workdir,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: anthropicKey,
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

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
              } else if (block.type === "tool_use") {
                await streamClient.system(
                  `Using tool: ${block.name}`
                );
              }
            }
          } else if (msg.type === "result") {
            await streamClient.system(
              `Cost: $${msg.cost_usd?.toFixed(4) || "unknown"}`
            );
          }
        } catch {
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
function parsePlanFromOutput(output: string): {
  steps: Array<{
    order: number;
    description: string;
    files: string[];
    risk: "low" | "medium" | "high";
  }>;
  estimatedCost: number;
  estimatedRuntime: number;
} {
  // Simple parsing - extract numbered steps
  const steps: Array<{
    order: number;
    description: string;
    files: string[];
    risk: "low" | "medium" | "high";
  }> = [];

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
      let risk: "low" | "medium" | "high" = "low";
      if (/delete|remove|drop|danger/i.test(description)) {
        risk = "high";
      } else if (/modify|change|update|refactor/i.test(description)) {
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

// ============================================
// AGENT-TO-AGENT MESSAGING COMMANDS
// ============================================

// Role to emoji mapping for formatted messages
const ROLE_EMOJI: Record<AgentRole, string> = {
  supervisor: "\uD83D\uDC15", // Dog emoji for supervisor
  worker: "\uD83D\uDD27",     // Wrench emoji for worker
  reviewer: "\uD83D\uDCDD",   // Memo emoji for reviewer
  support: "\uD83C\uDFA7",    // Headphones emoji for support
};

// husky agent message
agentCommand
  .command("message")
  .alias("msg")
  .description("Send message to another agent")
  .requiredOption("--to <agent>", "Target agent ID (supervisor, worker-1, reviewer, etc.)")
  .option("--from <agent>", "Sender agent ID (default: from HUSKY_AGENT_ID env)")
  .argument("<message>", "Message to send")
  .action(async (message: string, options: { to: string; from?: string }) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    const senderId = options.from || process.env.HUSKY_AGENT_ID;
    if (!senderId) {
      console.error("Error: Sender agent ID not specified.");
      console.error("  Either use --from <agent-id> or set HUSKY_AGENT_ID environment variable.");
      process.exit(1);
    }

    const targetId = options.to;

    try {
      // 1. Lookup sender agent
      const senderRes = await fetch(`${config.apiUrl}/api/agents/${senderId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!senderRes.ok) {
        if (senderRes.status === 404) {
          console.error(`Error: Sender agent '${senderId}' not found.`);
          console.error("  Register first with: husky agent register --id <id> --name <name> --role <role>");
        } else {
          console.error(`Error fetching sender agent: ${senderRes.status}`);
        }
        process.exit(1);
      }

      const sender = (await senderRes.json()) as RegisteredAgent;

      // 2. Lookup target agent
      const targetRes = await fetch(`${config.apiUrl}/api/agents/${targetId}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!targetRes.ok) {
        if (targetRes.status === 404) {
          console.error(`Error: Target agent '${targetId}' not found.`);
          console.error("  Available agents: husky agent list");
        } else {
          console.error(`Error fetching target agent: ${targetRes.status}`);
        }
        process.exit(1);
      }

      const target = (await targetRes.json()) as RegisteredAgent;

      // 3. Format the message with emojis
      const senderEmoji = sender.emoji || ROLE_EMOJI[sender.role] || "\uD83E\uDD16";
      const targetEmoji = target.emoji || ROLE_EMOJI[target.role] || "\uD83E\uDD16";
      const formattedMessage = `[${senderEmoji} ${sender.name} -> ${targetEmoji} ${target.name}]\n${message}`;

      // 4. Send the message via API
      const sendRes = await fetch(`${config.apiUrl}/api/agents/${targetId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          from: senderId,
          message,
          formatted: formattedMessage,
        }),
      });

      if (!sendRes.ok) {
        const error = await sendRes.text();
        console.error(`Error sending message: ${sendRes.status} - ${error}`);
        process.exit(1);
      }

      const result = (await sendRes.json()) as {
        ok: boolean;
        messageId: string;
        deliveredTo: string;
        queuedAt: string;
      };

      if (result.ok) {
        console.log(`Message queued for ${target.name} (id: ${result.messageId})`);
        console.log(`  Delivery via supervisor-bridge to tmux session: ${target.tmuxSession || targetId}`);
      } else {
        console.log(`Message delivery uncertain for ${target.name}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      process.exit(1);
    }
  });

// husky agent register
agentCommand
  .command("register")
  .description("Register this agent with the platform")
  .requiredOption("--id <id>", "Agent ID")
  .requiredOption("--name <name>", "Agent display name")
  .requiredOption("--role <role>", "Agent role (supervisor, worker, reviewer, support)")
  .option("--emoji <emoji>", "Agent emoji", "\uD83E\uDD16")
  .option("--tmux <session>", "tmux session name")
  .option("--vm <vmName>", "VM name")
  .action(async (options: {
    id: string;
    name: string;
    role: string;
    emoji: string;
    tmux?: string;
    vm?: string;
  }) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    // Validate role
    const validRoles: AgentRole[] = ["supervisor", "worker", "reviewer", "support"];
    if (!validRoles.includes(options.role as AgentRole)) {
      console.error(`Error: Invalid role '${options.role}'.`);
      console.error(`  Valid roles: ${validRoles.join(", ")}`);
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/agents/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          id: options.id,
          name: options.name,
          role: options.role,
          emoji: options.emoji,
          tmuxSession: options.tmux,
          vmName: options.vm,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        console.error(`Error registering agent: ${res.status} - ${error}`);
        process.exit(1);
      }

      const agent = (await res.json()) as RegisteredAgent;

      console.log("\n  Agent Registered");
      console.log("  " + "-".repeat(40));
      console.log(`  ID:     ${agent.id}`);
      console.log(`  Name:   ${agent.emoji} ${agent.name}`);
      console.log(`  Role:   ${agent.role}`);
      if (agent.tmuxSession) {
        console.log(`  Tmux:   ${agent.tmuxSession}`);
      }
      if (agent.vmName) {
        console.log(`  VM:     ${agent.vmName}`);
      }
      console.log("");
      console.log("  Set HUSKY_AGENT_ID to use this agent:");
      console.log(`  export HUSKY_AGENT_ID="${agent.id}"`);
      console.log("");
    } catch (error) {
      console.error("Error registering agent:", error);
      process.exit(1);
    }
  });

// husky agent list
agentCommand
  .command("list")
  .description("List all registered agents")
  .option("--status <status>", "Filter by status (online, offline, busy)")
  .option("--role <role>", "Filter by role (supervisor, worker, reviewer, support)")
  .option("--json", "Output as JSON")
  .action(async (options: { status?: string; role?: string; json?: boolean }) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const params = new URLSearchParams();
      if (options.status) params.set("status", options.status);
      if (options.role) params.set("role", options.role);

      const res = await fetch(`${config.apiUrl}/api/agents?${params}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = (await res.json()) as { agents: RegisteredAgent[] };
      const agents = data.agents || [];

      if (options.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }

      if (agents.length === 0) {
        console.log("No agents registered.");
        console.log("\nRegister an agent with:");
        console.log("  husky agent register --id <id> --name <name> --role <role>");
        return;
      }

      console.log("\n  Registered Agents");
      console.log("  " + "-".repeat(60));

      for (const agent of agents) {
        const statusIcon = agent.status === "online" ? "\u2714" :
                          agent.status === "busy" ? "\u231B" : "\u2717";
        const lastSeen = agent.lastHeartbeat
          ? new Date(agent.lastHeartbeat).toLocaleString()
          : "never";

        console.log(`  ${statusIcon} ${agent.emoji} ${agent.name} (${agent.id})`);
        console.log(`      Role: ${agent.role} | Status: ${agent.status} | Last seen: ${lastSeen}`);
        if (agent.tmuxSession) {
          console.log(`      Tmux: ${agent.tmuxSession}`);
        }
        if (agent.vmName) {
          console.log(`      VM: ${agent.vmName}`);
        }
        console.log("");
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      process.exit(1);
    }
  });

// husky agent heartbeat
agentCommand
  .command("heartbeat")
  .description("Send heartbeat to mark agent as online")
  .option("--id <id>", "Agent ID (default: from HUSKY_AGENT_ID env)")
  .action(async (options: { id?: string }) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    const agentId = options.id || process.env.HUSKY_AGENT_ID;
    if (!agentId) {
      console.error("Error: Agent ID not specified.");
      console.error("  Either use --id <agent-id> or set HUSKY_AGENT_ID environment variable.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/agents/${agentId}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Agent '${agentId}' not found.`);
          console.error("  Register first with: husky agent register --id <id> --name <name> --role <role>");
        } else {
          const error = await res.text();
          console.error(`Error sending heartbeat: ${res.status} - ${error}`);
        }
        process.exit(1);
      }

      const result = (await res.json()) as { status: AgentStatus; lastHeartbeat: string };
      console.log(`Heartbeat sent. Agent '${agentId}' is now ${result.status}.`);
    } catch (error) {
      console.error("Error sending heartbeat:", error);
      process.exit(1);
    }
  });
