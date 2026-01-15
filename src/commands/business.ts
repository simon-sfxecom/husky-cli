import { Command } from "commander";
import { getConfig } from "./config.js";
import Table from "cli-table3";
import chalk from "chalk";

export const businessCommand = new Command("business")
  .description("Manage business agents (ecommerce, finance, etc.)");

// husky business list - List all business agents
businessCommand
  .command("list")
  .description("List all business agents")
  .option("--type <type>", "Filter by agent type (ecommerce-manager, finance-controller, etc.)")
  .option("--status <status>", "Filter by status (running, stopped, error, paused)")
  .option("--enabled", "Show only enabled agents")
  .option("--disabled", "Show only disabled agents")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const params = new URLSearchParams();
      if (options.type) params.set("type", options.type);
      if (options.status) params.set("status", options.status);
      if (options.enabled) params.set("enabled", "true");
      if (options.disabled) params.set("enabled", "false");

      const queryString = params.toString();
      const url = `${config.apiUrl}/api/business-agents${queryString ? `?${queryString}` : ""}`;

      const res = await fetch(url, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const data = await res.json();
      const agents = data.agents || [];

      if (options.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }

      if (agents.length === 0) {
        console.log("\n  No business agents found.");
        console.log("  Create one with: husky business create <id> --type <type>\n");
        return;
      }

      console.log("\n  Business Agents");
      console.log("  " + "═".repeat(80));

      const table = new Table({
        head: ["ID", "Type", "Status", "Enabled", "Last Run", "Actions Today"],
        style: { head: ["cyan"] },
      });

      for (const agent of agents) {
        const statusIcon = getStatusIcon(agent.status);
        const enabledIcon = agent.enabled ? chalk.green("Yes") : chalk.red("No");
        const lastRun = agent.lastRun ? formatTimeAgo(agent.lastRun) : "Never";
        const actions = agent.metrics?.actionsToday || 0;

        table.push([
          agent.id,
          agent.type,
          `${statusIcon} ${agent.status}`,
          enabledIcon,
          lastRun,
          actions.toString(),
        ]);
      }

      console.log(table.toString());
      console.log("");
    } catch (error) {
      console.error("Error fetching business agents:", error);
      process.exit(1);
    }
  });

// husky business get <id> - Get agent details
businessCommand
  .command("get <id>")
  .description("Get business agent details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const agent = await res.json();

      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }

      console.log("\n  Business Agent Details");
      console.log("  " + "═".repeat(50));
      console.log(`  ID:       ${agent.id}`);
      console.log(`  Type:     ${agent.type}`);
      console.log(`  Status:   ${getStatusIcon(agent.status)} ${agent.status}`);
      console.log(`  Enabled:  ${agent.enabled ? chalk.green("Yes") : chalk.red("No")}`);
      console.log(`  Created:  ${agent.createdAt ? new Date(agent.createdAt).toLocaleString() : "—"}`);
      console.log(`  Updated:  ${agent.updatedAt ? new Date(agent.updatedAt).toLocaleString() : "—"}`);
      console.log(`  Last Run: ${agent.lastRun ? new Date(agent.lastRun).toLocaleString() : "Never"}`);

      if (agent.metrics) {
        console.log("\n  Metrics (Today)");
        console.log("  " + "─".repeat(30));
        console.log(`  Runs:     ${agent.metrics.runsToday || 0}`);
        console.log(`  Actions:  ${agent.metrics.actionsToday || 0}`);
        console.log(`  Errors:   ${agent.metrics.errorsToday || 0}`);
      }

      if (agent.settings && Object.keys(agent.settings).length > 0) {
        console.log("\n  Settings");
        console.log("  " + "─".repeat(30));
        for (const [key, value] of Object.entries(agent.settings)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }

      if (agent.integrations) {
        console.log("\n  Integrations");
        console.log("  " + "─".repeat(30));
        if (agent.integrations.shopify) {
          console.log(`  Shopify: ${agent.integrations.shopify.shopDomain}`);
        }
        if (agent.integrations.banking) {
          console.log(`  Banking: ${agent.integrations.banking.provider}`);
        }
      }

      console.log("");
    } catch (error) {
      console.error("Error fetching business agent:", error);
      process.exit(1);
    }
  });

// husky business create <id> - Create a new business agent
businessCommand
  .command("create <id>")
  .description("Create a new business agent")
  .requiredOption("--type <type>", "Agent type (ecommerce-manager, finance-controller, credit-analyst, inventory-agent, support-agent, research-agent, cost-optimizer)")
  .option("--shopify-domain <domain>", "Shopify shop domain (for ecommerce-manager)")
  .option("--shopify-token-secret <secret>", "GCP secret name for Shopify access token")
  .option("--disabled", "Create in disabled state")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    const validTypes = [
      "ecommerce-manager",
      "finance-controller",
      "credit-analyst",
      "inventory-agent",
      "support-agent",
      "research-agent",
      "cost-optimizer",
    ];

    if (!validTypes.includes(options.type)) {
      console.error(`Error: Invalid agent type '${options.type}'.`);
      console.error(`Valid types: ${validTypes.join(", ")}`);
      process.exit(1);
    }

    try {
      const body: Record<string, unknown> = {
        id,
        type: options.type,
        enabled: !options.disabled,
      };

      if (options.shopifyDomain || options.shopifyTokenSecret) {
        body.integrations = {
          shopify: {
            shopDomain: options.shopifyDomain,
            accessTokenSecret: options.shopifyTokenSecret,
          },
        };
      }

      const res = await fetch(`${config.apiUrl}/api/business-agents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const agent = await res.json();

      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Business agent '${agent.id}' created successfully.`);
      console.log(`  Type: ${agent.type}`);
      console.log(`  Status: ${agent.status}`);
      console.log(`\n  Run with: husky business run ${agent.id}\n`);
    } catch (error) {
      console.error("Error creating business agent:", error);
      process.exit(1);
    }
  });

// husky business run <id> - Trigger agent run
businessCommand
  .command("run <id>")
  .description("Trigger a business agent run")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}/run`, {
        method: "POST",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        if (res.status === 409) {
          console.error(`Error: Agent '${id}' is already running.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent '${id}' run triggered.`);
      console.log(`  Status: ${result.status}`);
      console.log(`\n  Check logs with: husky business logs ${id}\n`);
    } catch (error) {
      console.error("Error triggering agent run:", error);
      process.exit(1);
    }
  });

// husky business stop <id> - Stop a running agent
businessCommand
  .command("stop <id>")
  .description("Stop a running business agent")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}/stop`, {
        method: "POST",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent '${id}' stopped.`);
      console.log(`  Status: ${result.status}\n`);
    } catch (error) {
      console.error("Error stopping agent:", error);
      process.exit(1);
    }
  });

// husky business logs <id> - View agent logs
businessCommand
  .command("logs <id>")
  .description("View business agent logs")
  .option("--limit <number>", "Number of logs to show", "50")
  .option("--level <level>", "Filter by log level (debug, info, warn, error)")
  .option("--since <datetime>", "Show logs since (ISO 8601 format)")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const params = new URLSearchParams();
      params.set("limit", options.limit);
      if (options.level) params.set("level", options.level);
      if (options.since) params.set("since", options.since);

      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}/logs?${params}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const data = await res.json();
      const logs = data.logs || [];

      if (options.json) {
        console.log(JSON.stringify(logs, null, 2));
        return;
      }

      if (logs.length === 0) {
        console.log(`\n  No logs found for agent '${id}'.\n`);
        return;
      }

      console.log(`\n  Logs for '${id}' (${logs.length} entries)`);
      console.log("  " + "═".repeat(80));

      for (const log of logs.reverse()) {
        const levelColor = getLevelColor(log.level);
        const timestamp = new Date(log.timestamp).toLocaleString();
        console.log(`  ${chalk.gray(timestamp)} ${levelColor(`[${log.level.toUpperCase()}]`)} ${log.message}`);
        if (log.metadata && Object.keys(log.metadata).length > 0) {
          console.log(`    ${chalk.gray(JSON.stringify(log.metadata))}`);
        }
      }
      console.log("");
    } catch (error) {
      console.error("Error fetching logs:", error);
      process.exit(1);
    }
  });

// husky business actions <id> - View agent actions
businessCommand
  .command("actions <id>")
  .description("View business agent actions (audit trail)")
  .option("--limit <number>", "Number of actions to show", "50")
  .option("--since <datetime>", "Show actions since (ISO 8601 format)")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const params = new URLSearchParams();
      params.set("limit", options.limit);
      if (options.since) params.set("since", options.since);

      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}/actions?${params}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const data = await res.json();
      const actions = data.actions || [];

      if (options.json) {
        console.log(JSON.stringify(actions, null, 2));
        return;
      }

      if (actions.length === 0) {
        console.log(`\n  No actions found for agent '${id}'.\n`);
        return;
      }

      console.log(`\n  Actions for '${id}' (${actions.length} entries)`);
      console.log("  " + "═".repeat(80));

      const table = new Table({
        head: ["Time", "Type", "Target", "Approval", "Details"],
        style: { head: ["cyan"] },
        colWidths: [20, 20, 20, 12, 30],
      });

      for (const action of actions) {
        const timestamp = new Date(action.timestamp).toLocaleString();
        const approval = action.requiredApproval
          ? action.approved
            ? chalk.green("Approved")
            : chalk.yellow("Pending")
          : chalk.gray("N/A");
        const details = action.details
          ? JSON.stringify(action.details).slice(0, 27) + "..."
          : "—";

        table.push([
          timestamp,
          action.type,
          action.target?.slice(0, 17) || "—",
          approval,
          details,
        ]);
      }

      console.log(table.toString());
      console.log("");
    } catch (error) {
      console.error("Error fetching actions:", error);
      process.exit(1);
    }
  });

// husky business enable <id> - Enable an agent
businessCommand
  .command("enable <id>")
  .description("Enable a business agent")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ enabled: true }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const agent = await res.json();

      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent '${id}' enabled.\n`);
    } catch (error) {
      console.error("Error enabling agent:", error);
      process.exit(1);
    }
  });

// husky business disable <id> - Disable an agent
businessCommand
  .command("disable <id>")
  .description("Disable a business agent")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ enabled: false }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const agent = await res.json();

      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent '${id}' disabled.\n`);
    } catch (error) {
      console.error("Error disabling agent:", error);
      process.exit(1);
    }
  });

// husky business delete <id> - Delete an agent
businessCommand
  .command("delete <id>")
  .description("Delete a business agent")
  .option("--force", "Skip confirmation")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    if (!options.force) {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`  Are you sure you want to delete agent '${id}'? (y/N) `, resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        console.log("  Cancelled.\n");
        return;
      }
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Business agent '${id}' not found.`);
          process.exit(1);
        }
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent '${id}' deleted.\n`);
    } catch (error) {
      console.error("Error deleting agent:", error);
      process.exit(1);
    }
  });

// husky business types - List available agent types
businessCommand
  .command("types")
  .description("List available business agent types")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const types = [
      {
        type: "ecommerce-manager",
        description: "E-commerce operations: Trustpilot invites, analytics, inventory alerts",
        integrations: ["Shopify"],
        priority: "P0 (MVP)",
      },
      {
        type: "finance-controller",
        description: "Financial monitoring: BWA analysis, cashflow forecasting, anomaly detection",
        integrations: ["Banking API"],
        priority: "P0",
      },
      {
        type: "credit-analyst",
        description: "Credit analysis: Capital calculation, offer comparison, term optimization",
        integrations: ["Banking API"],
        priority: "P1",
      },
      {
        type: "inventory-agent",
        description: "Inventory optimization: Stock analysis, reorder automation, demand forecasting",
        integrations: ["Shopify", "ERP"],
        priority: "P1",
      },
      {
        type: "support-agent",
        description: "Customer support automation: Ticket categorization, response drafts",
        integrations: ["Zendesk", "Shopify"],
        priority: "P1",
      },
      {
        type: "research-agent",
        description: "Market research: Competitor monitoring, price tracking, trend analysis",
        integrations: ["Web Scraping"],
        priority: "P2",
      },
      {
        type: "cost-optimizer",
        description: "Cost optimization: Expense analysis, subscription audit, savings recommendations",
        integrations: ["Accounting"],
        priority: "P2",
      },
    ];

    if (options.json) {
      console.log(JSON.stringify(types, null, 2));
      return;
    }

    console.log("\n  Available Business Agent Types");
    console.log("  " + "═".repeat(80));

    for (const t of types) {
      const priorityColor = t.priority.startsWith("P0") ? chalk.green : t.priority.startsWith("P1") ? chalk.yellow : chalk.gray;
      console.log(`\n  ${chalk.cyan(t.type)} ${priorityColor(`[${t.priority}]`)}`);
      console.log(`    ${t.description}`);
      console.log(`    Integrations: ${t.integrations.join(", ")}`);
    }
    console.log("");
  });

const agentCommand = new Command("agent")
  .description("Manage business agent sessions on VM");

agentCommand
  .command("ps")
  .description("List running agent sessions")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/sessions`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const data = await res.json();
      const sessions = data.sessions || [];

      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      if (sessions.length === 0) {
        console.log("\n  No active agent sessions.\n");
        return;
      }

      console.log("\n  Business Agent Sessions");
      console.log("  " + "═".repeat(70));

      const table = new Table({
        head: ["Agent Type", "Session", "Status", "VM", "Last Heartbeat"],
        style: { head: ["cyan"] },
      });

      for (const s of sessions) {
        const statusIcon = s.status === "running" ? chalk.green("●") : chalk.gray("○");
        table.push([
          s.agentType,
          s.session,
          `${statusIcon} ${s.status}`,
          s.vmHostname || "—",
          s.lastHeartbeat ? formatTimeAgo(s.lastHeartbeat) : "—",
        ]);
      }

      console.log(table.toString());
      console.log("");
    } catch (error) {
      console.error("Error fetching sessions:", error);
      process.exit(1);
    }
  });

agentCommand
  .command("start <agentType>")
  .description("Start an agent session on the VM")
  .option("--vm <vm>", "Target VM (default: husky-business)")
  .option("--json", "Output as JSON")
  .action(async (agentType, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/sessions/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          agentType,
          vm: options.vm || "husky-business",
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent session '${agentType}' start requested.`);
      console.log(`  VM: ${options.vm || "husky-business"}`);
      console.log(`\n  Check status with: husky business agent ps\n`);
    } catch (error) {
      console.error("Error starting agent session:", error);
      process.exit(1);
    }
  });

agentCommand
  .command("stop <agentType>")
  .description("Stop an agent session on the VM")
  .option("--json", "Output as JSON")
  .action(async (agentType, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/sessions/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({ agentType }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Agent session '${agentType}' stop requested.\n`);
    } catch (error) {
      console.error("Error stopping agent session:", error);
      process.exit(1);
    }
  });

agentCommand
  .command("exec <agentType> <command>")
  .description("Execute a command in an agent session")
  .option("--json", "Output as JSON")
  .action(async (agentType, command, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/business-agents/inbox`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          agentType,
          action: "exec",
          payload: { command },
          priority: "normal",
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`API error ${res.status}: ${error}`);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n  ${chalk.green("✓")} Command queued for '${agentType}'.`);
      console.log(`  Action ID: ${result.id || "unknown"}`);
      console.log(`  Command: ${command}\n`);
    } catch (error) {
      console.error("Error executing command:", error);
      process.exit(1);
    }
  });

agentCommand
  .command("attach <agentType>")
  .description("SSH into VM and attach to agent tmux session")
  .option("--vm <vm>", "Target VM (default: husky-business)")
  .action(async (agentType, options) => {
    const vm = options.vm || "husky-business";
    const sessionMap: Record<string, string> = {
      "ecommerce-manager": "ecommerce",
      "finance-controller": "finance",
      "support-agent": "support",
      "inventory-agent": "inventory",
    };

    const session = sessionMap[agentType];
    if (!session) {
      console.error(`Unknown agent type: ${agentType}`);
      console.error(`Valid types: ${Object.keys(sessionMap).join(", ")}`);
      process.exit(1);
    }

    console.log(`\n  Attaching to ${agentType} session on ${vm}...`);
    console.log(`  Press Ctrl+B then D to detach from tmux\n`);

    const { spawn } = await import("child_process");
    const child = spawn(
      "gcloud",
      ["compute", "ssh", vm, "--zone=europe-west1-b", "--", "-t", `tmux attach -t ${session}`],
      { stdio: "inherit" }
    );

    child.on("exit", (code) => {
      process.exit(code || 0);
    });
  });

businessCommand.addCommand(agentCommand);

function getStatusIcon(status: string): string {
  switch (status) {
    case "running":
      return chalk.green("●");
    case "stopped":
      return chalk.gray("○");
    case "error":
      return chalk.red("●");
    case "paused":
      return chalk.yellow("●");
    case "initializing":
      return chalk.blue("◐");
    default:
      return chalk.gray("?");
  }
}

function getLevelColor(level: string): (text: string) => string {
  switch (level) {
    case "error":
      return chalk.red;
    case "warn":
      return chalk.yellow;
    case "info":
      return chalk.blue;
    case "debug":
      return chalk.gray;
    default:
      return chalk.white;
  }
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
