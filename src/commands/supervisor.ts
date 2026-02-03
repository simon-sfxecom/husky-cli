import { Command } from "commander";
import { getConfig } from "./config.js";
import { spawn, execSync } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export const supervisorCommand = new Command("supervisor")
  .description("Manage Husky Supervisor Agent");

// supervisor start
supervisorCommand
  .command("start")
  .description("Start the supervisor agent")
  .option("--session <name>", "Tmux session name", "supervisor")
  .option("--id <id>", "Agent ID", "supervisor")
  .option("--name <name>", "Agent display name", "Husky Supervisor")
  .option("--vm <name>", "VM name (auto-detected if not provided)")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    console.log("🐕 Starting Husky Supervisor Agent...");
    
    // Set environment variables
    const env = {
      ...process.env,
      HUSKY_API_URL: config.apiUrl,
      HUSKY_API_KEY: config.apiKey,
      HUSKY_AGENT_ID: options.id,
      HUSKY_SUPERVISOR_SESSION: options.session,
    };

    // Get the supervisor script path
    const scriptPath = new URL("../scripts/supervisor-start.sh", import.meta.url).pathname;

    try {
      // Run the supervisor script
      const child = spawn(scriptPath, [], {
        env,
        stdio: "inherit",
      });

      child.on("close", (code) => {
        if (code !== 0) {
          console.error(`Supervisor script exited with code ${code}`);
          process.exit(code);
        }
      });

    } catch (error) {
      console.error("Error starting supervisor:", error);
      process.exit(1);
    }
  });

// supervisor status
supervisorCommand
  .command("status")
  .description("Check supervisor status")
  .option("--session <name>", "Tmux session name", "supervisor")
  .action(async (options) => {
    try {
      const { stdout } = await execAsync(`tmux has-session -t "${options.session}"`);
      console.log("✅ Supervisor is running");
      console.log(`Session: ${options.session}`);
      
      // List windows
      const { stdout: windows } = await execAsync(`tmux list-windows -t "${options.session}"`);
      console.log("\nActive windows:");
      console.log(windows);
      
    } catch (error) {
      console.log("❌ Supervisor is not running");
      process.exit(1);
    }
  });

// supervisor stop
supervisorCommand
  .command("stop")
  .description("Stop the supervisor agent")
  .option("--session <name>", "Tmux session name", "supervisor")
  .action(async (options) => {
    try {
      await execAsync(`tmux kill-session -t "${options.session}"`);
      console.log("✅ Supervisor stopped successfully");
    } catch (error) {
      console.log("❌ Supervisor is not running or failed to stop");
      process.exit(1);
    }
  });

// supervisor restart
supervisorCommand
  .command("restart")
  .description("Restart the supervisor agent")
  .option("--session <name>", "Tmux session name", "supervisor")
  .action(async (options) => {
    try {
      console.log("🔄 Restarting supervisor...");
      await execAsync(`tmux kill-session -t "${options.session}"`);
      console.log("✅ Old supervisor stopped");
      
      // Start new supervisor
      const scriptPath = new URL("../scripts/supervisor-start.sh", import.meta.url).pathname;
      const config = getConfig();
      
      const child = spawn(scriptPath, [], {
        env: {
          ...process.env,
          HUSKY_API_URL: config.apiUrl,
          HUSKY_API_KEY: config.apiKey,
        },
        stdio: "inherit",
      });

      child.on("close", (code) => {
        if (code !== 0) {
          console.error(`Supervisor restart failed with code ${code}`);
          process.exit(code);
        }
      });
      
    } catch (error) {
      console.error("Error restarting supervisor:", error);
      process.exit(1);
    }
  });

// supervisor attach
supervisorCommand
  .command("attach")
  .description("Attach to the supervisor tmux session")
  .option("--session <name>", "Tmux session name", "supervisor")
  .option("--window <name>", "Window name or number (default: supervisor)", "supervisor")
  .action(async (options) => {
    try {
      const { stdout } = await execAsync(`tmux has-session -t "${options.session}"`);
      
      // Attach to specific window
      spawn("tmux", ["attach", "-t", `${options.session}:${options.window}`], {
        stdio: "inherit",
      });
      
    } catch (error) {
      console.error("❌ Supervisor is not running");
      console.log("Start it with: husky supervisor start");
      process.exit(1);
    }
  });

// supervisor logs
supervisorCommand
  .command("logs")
  .description("Show logs from supervisor windows")
  .option("--session <name>", "Tmux session name", "supervisor")
  .option("--window <name>", "Window name (supervisor, messages, tasks, vms, heartbeat)")
  .option("--lines <n>", "Number of lines to show", "50")
  .action(async (options) => {
    try {
      await execAsync(`tmux has-session -t "${options.session}"`);
      
      const window = options.window || "supervisor";
      const lines = options.lines;
      
      console.log(`📋 Showing last ${lines} lines from '${window}' window:\n`);
      
      // Capture output from tmux pane
      const { stdout } = await execAsync(
        `tmux capture-pane -t "${options.session}:${window}" -p | tail -n ${lines}`
      );
      
      console.log(stdout);
      
    } catch (error) {
      console.error("❌ Failed to get logs");
      if (error instanceof Error && error.message.includes("session")) {
        console.error("Supervisor is not running");
      }
      process.exit(1);
    }
  });

// supervisor message
supervisorCommand
  .command("message")
  .description("Send a message to the supervisor interface")
  .argument("<message>", "Message to send")
  .option("--session <name>", "Tmux session name", "supervisor")
  .action(async (message, options) => {
    try {
      await execAsync(`tmux has-session -t "${options.session}"`);
      
      // Send message to supervisor window
      const escapedMessage = message
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\$/g, "\\$");
      
      await execAsync(
        `tmux send-keys -t "${options.session}:supervisor" "${escapedMessage}" Enter`
      );
      
      console.log("✅ Message sent to supervisor");
      
    } catch (error) {
      console.error("❌ Failed to send message");
      if (error instanceof Error && error.message.includes("session")) {
        console.error("Supervisor is not running");
      }
      process.exit(1);
    }
  });

// supervisor execute
supervisorCommand
  .command("execute")
  .description("Execute a command in the supervisor interface")
  .argument("<command>", "Command to execute")
  .option("--session <name>", "Tmux session name", "supervisor")
  .option("--window <name>", "Window to execute in", "supervisor")
  .action(async (command, options) => {
    try {
      await execAsync(`tmux has-session -t "${options.session}"`);
      
      // Send command to specified window
      const escapedCommand = command
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\$/g, "\\$");
      
      await execAsync(
        `tmux send-keys -t "${options.session}:${options.window}" "${escapedCommand}" Enter`
      );
      
      console.log(`✅ Command sent to ${options.window} window`);
      
    } catch (error) {
      console.error("❌ Failed to execute command");
      if (error instanceof Error && error.message.includes("session")) {
        console.error("Supervisor is not running");
      }
      process.exit(1);
    }
  });

// supervisor workflow
supervisorCommand
  .command("workflow")
  .description("Show supervisor workflow status and next actions")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      // Get task backlog
      const tasksRes = await fetch(`${config.apiUrl}/api/tasks?status=backlog&assignee=llm&limit=10`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });
      
      // Get VM status (read-only)
      const vmCommand = "gcloud compute instances list --filter='name~husky-' --format='json(name,status,zone,machineType)'";
      const { stdout: vmOutput } = await execAsync(vmCommand);
      const vms = JSON.parse(vmOutput || "[]");
      
      // Get registered agents
      const agentsRes = await fetch(`${config.apiUrl}/api/agents`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });
      
      const tasks = tasksRes.ok ? await tasksRes.json() : { tasks: [] };
      const agents = agentsRes.ok ? await agentsRes.json() : { agents: [] };

      if (options.json) {
        console.log(JSON.stringify({
          tasks: tasks.tasks || [],
          vms,
          agents: agents.agents || [],
          timestamp: new Date().toISOString(),
        }, null, 2));
        return;
      }

      console.log("\n🐕 Husky Supervisor Workflow Status");
      console.log("=" .repeat(50));
      
      // Task status
      console.log("\n📋 Task Backlog:");
      const backlogTasks = tasks.tasks || [];
      if (backlogTasks.length === 0) {
        console.log("  No tasks in backlog");
      } else {
        backlogTasks.forEach((task: any, i: number) => {
          console.log(`  ${i + 1}. ${task.title} (${task.id})`);
          console.log(`     Priority: ${task.priority} | Assignee: ${task.assignee}`);
        });
      }
      
      // VM status
      console.log("\n🖥️  VM Fleet Status:");
      const runningWorkers = vms.filter((vm: any) => vm.name.includes("worker") && vm.status === "RUNNING");
      const suspendedWorkers = vms.filter((vm: any) => vm.name.includes("worker") && vm.status === "SUSPENDED");
      const terminatedWorkers = vms.filter((vm: any) => vm.name.includes("worker") && vm.status === "TERMINATED");
      
      console.log(`  Running workers: ${runningWorkers.length}`);
      console.log(`  Suspended workers: ${suspendedWorkers.length}`);
      console.log(`  Terminated workers: ${terminatedWorkers.length}`);
      
      if (vms.find((vm: any) => vm.name.includes("supervisor"))) {
        const supervisorVm = vms.find((vm: any) => vm.name.includes("supervisor"));
        console.log(`  Supervisor VM: ${supervisorVm.status}`);
      }
      
      // Agent status
      console.log("\n🤖 Registered Agents:");
      const agentList = agents.agents || [];
      const onlineAgents = agentList.filter((agent: any) => agent.status === "online");
      const busyAgents = agentList.filter((agent: any) => agent.status === "busy");
      const offlineAgents = agentList.filter((agent: any) => agent.status === "offline");
      
      console.log(`  Online: ${onlineAgents.length}, Busy: ${busyAgents.length}, Offline: ${offlineAgents.length}`);
      
      // Next actions
      console.log("\n🎯 Suggested Actions:");
      if (backlogTasks.length > 0) {
        console.log("  • Create tasks only; autoscaling will provision workers");
      }
      if (offlineAgents.length > 0) {
        console.log("  • Check on offline agents");
      }
      if (backlogTasks.length === 0 && runningWorkers.length > 0) {
        console.log("  • Autoscaling will handle idle workers");
      }
      
      console.log("\nQuick commands:");
      console.log("  husky supervisor start    - Start supervisor");
      console.log("  husky supervisor attach   - Attach to supervisor");
      console.log("  husk supervisor status   - Check status");
      console.log("");
      
    } catch (error) {
      console.error("Error getting workflow status:", error);
      process.exit(1);
    }
  });

// supervisor cycle
supervisorCommand
  .command("cycle")
  .description("Run the main supervisor loop (for automation)")
  .option("--interval <seconds>", "Loop interval in seconds", "300") // 5 minutes default
  .option("--once", "Run once and exit")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    const interval = parseInt(options.interval) * 1000;
    
    console.log(`🐕 Starting supervisor cycle${options.once ? ' (once)' : ` (every ${options.interval}s)`}...`);
    
    const runCycle = async () => {
      try {
        console.log(`\n[${new Date().toLocaleTimeString()}] Running supervisor cycle...`);
        
        // Step 1: Check for new tasks
        const tasksRes = await fetch(`${config.apiUrl}/api/tasks?status=backlog&assignee=llm&limit=5`, {
          headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const tasks = tasksData.tasks || [];
          
          if (tasks.length > 0) {
            console.log(`  Found ${tasks.length} tasks in backlog`);
            console.log("  Autoscaling will provision workers via API");

            tasks.forEach((task: any) => {
              console.log(`  Task ${task.id}: ${task.title}`);
            });
          } else {
            console.log("  No tasks in backlog");
          }
        }
        
        console.log(`[${new Date().toLocaleTimeString()}] Cycle completed`);
        
      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Cycle error:`, error);
      }
    };
    
    if (options.once) {
      await runCycle();
    } else {
      await runCycle();
      setInterval(runCycle, interval);
      console.log(`\nSupervisor cycle running. Press Ctrl+C to stop.`);
      
      // Keep process alive
      process.on("SIGINT", () => {
        console.log("\n👋 Stopping supervisor cycle...");
        process.exit(0);
      });
      
      await new Promise(() => {});
    }
  });

interface Task {
  id: string;
  title: string;
  status: string;
  worktreeBranch?: string;
  prUrl?: string;
  updatedAt: string;
}

interface PRStatus {
  exists: boolean;
  merged: boolean;
  url?: string;
  state?: string;
}

function checkGitHubPR(branch: string): PRStatus {
  try {
    const result = execSync(
      `gh pr view "${branch}" --json url,mergedAt,state -q '{"url":.url,"mergedAt":.mergedAt,"state":.state}'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const data = JSON.parse(result.trim());
    return {
      exists: true,
      merged: data.mergedAt !== null && data.mergedAt !== "",
      url: data.url,
      state: data.state,
    };
  } catch {
    return { exists: false, merged: false };
  }
}

supervisorCommand
  .command("auto-track")
  .description("Automatic task status tracking based on GitHub PR state")
  .option("--interval <minutes>", "Check interval in minutes", "5")
  .option("--dry-run", "Show what would be updated without making changes")
  .option("--once", "Run once and exit")
  .option("--stale-hours <hours>", "Hours before task is considered stale", "24")
  .option("--alert", "Send alerts for stale tasks to Google Chat")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    const intervalMs = parseInt(options.interval) * 60 * 1000;
    const staleMs = parseInt(options.staleHours) * 60 * 60 * 1000;
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["x-api-key"] = config.apiKey;

    console.log(`🔄 Starting auto-tracking loop (interval: ${options.interval}m, stale: ${options.staleHours}h)`);
    if (options.dryRun) console.log("   DRY RUN MODE - no changes will be made\n");

    async function checkAndUpdate() {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n[${timestamp}] Checking task statuses...`);

      try {
        const res = await fetch(`${config.apiUrl}/api/tasks?status=in_progress,review&limit=50`, { headers });
        if (!res.ok) {
          console.error(`  ❌ Failed to fetch tasks: ${res.status}`);
          return;
        }

        const data = await res.json();
        const tasks: Task[] = data.tasks || [];
        
        if (tasks.length === 0) {
          console.log("  No in_progress or review tasks found");
          return;
        }

        console.log(`  Found ${tasks.length} active tasks`);

        const staleTasks: Task[] = [];
        const now = Date.now();

        for (const task of tasks) {
          const taskAge = now - new Date(task.updatedAt).getTime();
          const isStale = taskAge > staleMs;
          
          if (isStale) {
            staleTasks.push(task);
          }

          if (!task.worktreeBranch) {
            console.log(`  📌 ${task.id}: No branch linked (${task.status})${isStale ? " ⚠️ STALE" : ""}`);
            continue;
          }

          const prStatus = checkGitHubPR(task.worktreeBranch);

          if (prStatus.merged && task.status !== "done") {
            console.log(`  ✅ ${task.id}: PR merged → marking done`);
            if (!options.dryRun) {
              const updateRes = await fetch(`${config.apiUrl}/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: "done",
                  statusMessage: "PR merged - auto-tracked by supervisor",
                }),
              });
              if (!updateRes.ok) {
                console.error(`     ❌ Failed to update task: ${updateRes.status}`);
              }
            }
          } else if (prStatus.exists && task.status === "in_progress") {
            console.log(`  📝 ${task.id}: PR exists (${prStatus.state}) → marking review`);
            if (!options.dryRun) {
              const updateRes = await fetch(`${config.apiUrl}/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: "review",
                  prUrl: prStatus.url,
                  statusMessage: "PR opened - auto-tracked by supervisor",
                }),
              });
              if (!updateRes.ok) {
                console.error(`     ❌ Failed to update task: ${updateRes.status}`);
              }
            }
          } else if (!prStatus.exists && task.status === "in_progress") {
            console.log(`  🔨 ${task.id}: In progress, no PR yet${isStale ? " ⚠️ STALE" : ""}`);
          } else {
            console.log(`  ℹ️  ${task.id}: ${task.status} (PR: ${prStatus.exists ? prStatus.state : "none"})${isStale ? " ⚠️ STALE" : ""}`);
          }
        }

        if (staleTasks.length > 0) {
          console.log(`\n  ⚠️  Found ${staleTasks.length} stale tasks (>${options.staleHours}h inactive):`);
          staleTasks.forEach((t) => {
            const hours = Math.round((now - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60));
            console.log(`     - ${t.title} (${t.id}) - ${hours}h inactive`);
          });

          if (options.alert && !options.dryRun) {
            const alertMessage = `⚠️ **Stale Task Alert**\n\n${staleTasks.length} tasks inactive for >${options.staleHours}h:\n\n${staleTasks.map((t) => `- ${t.title} (${t.id})`).join("\n")}\n\nPlease review and update status.`;
            
            try {
              const chatRes = await fetch(`${config.apiUrl}/api/google-chat/send`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: alertMessage,
                  spaceName: process.env.GOOGLE_CHAT_DM_SPACE,
                }),
              });
              if (chatRes.ok) {
                console.log("  📣 Stale task alert sent to Google Chat");
              }
            } catch (error) {
              console.error("  ❌ Failed to send alert:", error);
            }
          }
        }

        console.log(`[${new Date().toLocaleTimeString()}] Check completed`);
      } catch (error) {
        console.error(`[${timestamp}] Error:`, error);
      }
    }

    if (options.once) {
      await checkAndUpdate();
    } else {
      await checkAndUpdate();
      setInterval(checkAndUpdate, intervalMs);
      console.log(`\nAuto-tracking running. Press Ctrl+C to stop.`);

      process.on("SIGINT", () => {
        console.log("\n👋 Stopping auto-tracking...");
        process.exit(0);
      });

      await new Promise(() => {});
    }
  });
