import { Command } from "commander";
import { getConfig } from "./config.js";

// Helper: Ensure API is configured
function ensureConfig(): { apiUrl: string; apiKey: string | undefined } {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return { apiUrl: config.apiUrl, apiKey: config.apiKey };
}

// Helper: Make API request
async function fetchAPI(
  apiUrl: string,
  apiKey: string | undefined,
  path: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

interface AgentService {
  id: string;
  name: string;
  type: string;
  status: string;
  description?: string;
  schedule?: string;
  cloudRunUrl?: string;
  dockerImage?: string;
  runCount: number;
  successCount: number;
  failureCount: number;
  avgDurationMs?: number;
  lastError?: string;
  healthStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export const servicesCommand = new Command("services")
  .description("Manage Agent Services (Agentic Workflow Platform)");

// husky services list
servicesCommand
  .command("list")
  .description("List all agent services")
  .option("--project <id>", "Filter by project ID")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const params = new URLSearchParams();
      if (options.project) params.set("projectId", options.project);

      const queryString = params.toString();
      const path = queryString ? `/api/services?${queryString}` : "/api/services";
      const services: AgentService[] = await fetchAPI(config.apiUrl, config.apiKey, path);

      if (options.json) {
        console.log(JSON.stringify(services, null, 2));
        return;
      }

      if (services.length === 0) {
        console.log("No services found.");
        return;
      }

      console.log("\n  Agent Services");
      console.log("  " + "─".repeat(80));

      for (const s of services) {
        const statusIcon: Record<string, string> = {
          building: "🔨",
          deployed: "📦",
          running: "✅",
          failed: "❌",
          disabled: "⏸️",
        };

        console.log(`  ${statusIcon[s.status] || "❓"} ${s.name} (${s.type})`);
        console.log(`     ID: ${s.id}`);
        console.log(`     Status: ${s.status}`);
        if (s.schedule) console.log(`     Schedule: ${s.schedule}`);
        if (s.cloudRunUrl) console.log(`     URL: ${s.cloudRunUrl}`);
        console.log(`     Runs: ${s.runCount} (${s.successCount} success, ${s.failureCount} failed)`);
        console.log("");
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services get <id>
servicesCommand
  .command("get <id>")
  .description("Get service details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const service: AgentService = await fetchAPI(config.apiUrl, config.apiKey, `/api/services/${id}`);

      if (options.json) {
        console.log(JSON.stringify(service, null, 2));
        return;
      }

      console.log(`\n  Service: ${service.name}`);
      console.log("  " + "─".repeat(50));
      console.log(`  ID:          ${service.id}`);
      console.log(`  Type:        ${service.type}`);
      console.log(`  Status:      ${service.status}`);
      if (service.description) console.log(`  Description: ${service.description}`);
      if (service.schedule) console.log(`  Schedule:    ${service.schedule}`);
      if (service.cloudRunUrl) console.log(`  URL:         ${service.cloudRunUrl}`);
      if (service.dockerImage) console.log(`  Image:       ${service.dockerImage}`);
      console.log(`  Runs:        ${service.runCount} total`);
      console.log(`  Success:     ${service.successCount}`);
      console.log(`  Failures:    ${service.failureCount}`);
      if (service.avgDurationMs) console.log(`  Avg Duration: ${service.avgDurationMs}ms`);
      if (service.lastError) console.log(`  Last Error:  ${service.lastError}`);
      console.log(`  Created:     ${new Date(service.createdAt).toLocaleString()}`);
      console.log(`  Updated:     ${new Date(service.updatedAt).toLocaleString()}`);
      console.log("");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services create <name>
servicesCommand
  .command("create <name>")
  .description("Create a new agent service")
  .option("-t, --type <type>", "Service type (cloud-run, cloud-function, scheduled-job)", "cloud-run")
  .option("-d, --description <desc>", "Service description")
  .option("-s, --schedule <cron>", 'Cron schedule (e.g., "0 6 * * *")')
  .option("--project <id>", "Link to project")
  .option("--repo <url>", "Source repository URL")
  .option("--path <path>", "Source path in repository")
  .action(async (name, options) => {
    const config = ensureConfig();

    try {
      const service: AgentService = await fetchAPI(config.apiUrl, config.apiKey, "/api/services", {
        method: "POST",
        body: JSON.stringify({
          name,
          type: options.type,
          description: options.description,
          schedule: options.schedule,
          projectId: options.project,
          sourceRepo: options.repo,
          sourcePath: options.path,
        }),
      });

      console.log(`✓ Created service: ${service.name} (${service.id})`);
      console.log(`  Type: ${service.type}`);
      console.log(`  Status: ${service.status}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services update <id>
servicesCommand
  .command("update <id>")
  .description("Update a service")
  .option("-d, --description <desc>", "Update description")
  .option("-s, --schedule <cron>", "Update schedule")
  .option("--status <status>", "Update status")
  .option("--url <url>", "Set Cloud Run URL")
  .option("--image <image>", "Set Docker image")
  .action(async (id, options) => {
    const config = ensureConfig();

    const updates: Record<string, string> = {};
    if (options.description) updates.description = options.description;
    if (options.schedule) updates.schedule = options.schedule;
    if (options.status) updates.status = options.status;
    if (options.url) updates.cloudRunUrl = options.url;
    if (options.image) updates.dockerImage = options.image;

    if (Object.keys(updates).length === 0) {
      console.log("No updates specified. Use --help for available options.");
      return;
    }

    try {
      const service: AgentService = await fetchAPI(config.apiUrl, config.apiKey, `/api/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });

      console.log(`✓ Updated service: ${service.name}`);
      const changedFields = Object.keys(updates).join(", ");
      console.log(`  Changed: ${changedFields}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services delete <id>
servicesCommand
  .command("delete <id>")
  .description("Delete a service")
  .option("-f, --force", "Skip confirmation")
  .action(async (id, options) => {
    const config = ensureConfig();

    if (!options.force) {
      console.log("Use --force to confirm deletion.");
      return;
    }

    try {
      await fetchAPI(config.apiUrl, config.apiKey, `/api/services/${id}`, { method: "DELETE" });
      console.log(`✓ Deleted service: ${id}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services health
servicesCommand
  .command("health")
  .description("Check health of all services")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const services: AgentService[] = await fetchAPI(config.apiUrl, config.apiKey, "/api/services");

      if (options.json) {
        const healthData = services
          .filter((s) => s.status !== "disabled")
          .map((s) => ({
            id: s.id,
            name: s.name,
            healthStatus: s.healthStatus || "unknown",
            status: s.status,
            lastError: s.lastError,
          }));
        console.log(JSON.stringify(healthData, null, 2));
        return;
      }

      console.log("\n  Service Health");
      console.log("  " + "─".repeat(50));

      let healthy = 0;
      let unhealthy = 0;
      let unknown = 0;

      for (const s of services) {
        if (s.status === "disabled") continue;

        const icon =
          s.healthStatus === "healthy"
            ? "✅"
            : s.healthStatus === "unhealthy"
              ? "❌"
              : "❓";

        console.log(`  ${icon} ${s.name}: ${s.healthStatus || "unknown"}`);
        if (s.lastError && s.healthStatus === "unhealthy") {
          console.log(`     Last Error: ${s.lastError}`);
        }

        if (s.healthStatus === "healthy") healthy++;
        else if (s.healthStatus === "unhealthy") unhealthy++;
        else unknown++;
      }

      console.log("");
      console.log(`  Summary: ${healthy} healthy, ${unhealthy} unhealthy, ${unknown} unknown`);
      console.log("");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services run <id>
servicesCommand
  .command("run <id>")
  .description("Trigger a service run")
  .option("--input <json>", "Input data as JSON")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    let inputData = {};
    if (options.input) {
      try {
        inputData = JSON.parse(options.input);
      } catch {
        console.error("Error: --input must be valid JSON");
        process.exit(1);
      }
    }

    try {
      const result = await fetchAPI(config.apiUrl, config.apiKey, `/api/services/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ input: inputData }),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`✓ Service run triggered: ${id}`);
      if (result.runId) console.log(`  Run ID: ${result.runId}`);
      if (result.status) console.log(`  Status: ${result.status}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services logs <id>
servicesCommand
  .command("logs <id>")
  .description("View service logs")
  .option("-n, --lines <num>", "Number of log lines", "50")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const logs = await fetchAPI(
        config.apiUrl,
        config.apiKey,
        `/api/services/${id}/logs?limit=${options.lines}`
      );

      if (options.json) {
        console.log(JSON.stringify(logs, null, 2));
        return;
      }

      if (!logs.entries || logs.entries.length === 0) {
        console.log(`No logs found for service ${id}`);
        return;
      }

      console.log(`\n  Logs for service: ${id}`);
      console.log("  " + "─".repeat(70));

      for (const entry of logs.entries) {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        const level = entry.level?.toUpperCase() || "INFO";
        console.log(`  [${timestamp}] ${level}: ${entry.message}`);
      }
      console.log("");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky services runs <id>
servicesCommand
  .command("runs <id>")
  .description("List recent runs for a service")
  .option("-n, --limit <num>", "Number of runs to show", "10")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      const runs = await fetchAPI(
        config.apiUrl,
        config.apiKey,
        `/api/services/${id}/runs?limit=${options.limit}`
      );

      if (options.json) {
        console.log(JSON.stringify(runs, null, 2));
        return;
      }

      if (!runs || runs.length === 0) {
        console.log(`No runs found for service ${id}`);
        return;
      }

      console.log(`\n  Recent Runs for service: ${id}`);
      console.log("  " + "─".repeat(70));

      for (const run of runs) {
        const statusIcon =
          run.status === "success"
            ? "✅"
            : run.status === "failed"
              ? "❌"
              : run.status === "running"
                ? "▶"
                : "⏸️";
        const timestamp = new Date(run.startedAt).toLocaleString();
        const duration = run.durationMs ? `${run.durationMs}ms` : "—";
        console.log(`  ${statusIcon} ${run.id.slice(0, 12)} │ ${timestamp} │ ${duration} │ ${run.status}`);
        if (run.error) {
          console.log(`     Error: ${run.error}`);
        }
      }
      console.log("");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
