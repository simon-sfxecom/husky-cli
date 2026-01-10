/**
 * Infrastructure commands for DevOps agent
 *
 * Commands for monitoring and managing GCP infrastructure:
 * - husky infra status - Show all services status
 * - husky infra vms - List VMs with status
 * - husky infra logs <service> - View recent logs
 * - husky infra scale <pool> --count <n> - Scale VM pool
 */

import { Command } from "commander";
import { spawnSync } from "child_process";
import { requireAnyPermission } from "../lib/permissions.js";

const DEFAULT_ZONE = "europe-west1-b";

export const infraCommand = new Command("infra")
  .description("Infrastructure monitoring and management (DevOps)");

// Helper: Run gcloud command and return output
function runGcloud(args: string[]): { stdout: string; stderr: string; success: boolean } {
  const result = spawnSync("gcloud", args, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    success: result.status === 0,
  };
}

// Helper: Get project ID
function getProjectId(): string {
  const result = runGcloud(["config", "get-value", "project"]);
  return result.stdout.trim() || "tigerv0";
}

// husky infra status
infraCommand
  .command("status")
  .description("Show status of all GCP services")
  .action(async () => {
    requireAnyPermission(["infra:monitor", "infra:*", "vm:*"]);

    const projectId = getProjectId();
    console.log(`\n  Infrastructure Status (${projectId})\n`);
    console.log("  ════════════════════════════════════════\n");

    // Compute Engine VMs
    console.log("  Compute Engine VMs:");
    const vmsResult = runGcloud([
      "compute", "instances", "list",
      "--format=table[no-heading](name,zone.basename(),status,networkInterfaces[0].accessConfigs[0].natIP)",
      "--filter=name~husky",
    ]);

    if (vmsResult.success && vmsResult.stdout.trim()) {
      const lines = vmsResult.stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const [name, zone, status, ip] = parts;
        const icon = status === "RUNNING" ? "✓" : "○";
        const ipStr = ip && ip !== "" ? ` (${ip})` : "";
        console.log(`    ${icon} ${name.padEnd(25)} ${status.padEnd(12)} ${zone}${ipStr}`);
      }
    } else {
      console.log("    (no VMs found or error fetching)");
    }

    console.log("");

    // Cloud Run Services
    console.log("  Cloud Run Services:");
    const runResult = runGcloud([
      "run", "services", "list",
      "--platform=managed",
      "--region=europe-west1",
      "--format=table[no-heading](metadata.name,status.url)",
    ]);

    if (runResult.success && runResult.stdout.trim()) {
      const lines = runResult.stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const [name] = parts;
        if (name.includes("husky") || name.includes("huskyv0")) {
          console.log(`    ✓ ${name}`);
        }
      }
    } else {
      console.log("    (no services found or error fetching)");
    }

    console.log("");
  });

// husky infra vms
infraCommand
  .command("vms")
  .description("List all Husky VMs with detailed status")
  .option("--all", "Show all VMs, not just husky-*")
  .action(async (options) => {
    requireAnyPermission(["infra:monitor", "infra:*", "vm:*"]);

    const filter = options.all ? "" : "--filter=name~husky";
    const args = [
      "compute", "instances", "list",
      "--format=table(name,zone.basename(),machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP:label=EXTERNAL_IP)",
    ];
    if (filter) args.push(filter);

    const result = runGcloud(args);

    if (result.success) {
      console.log(result.stdout);
    } else {
      console.error("Error listing VMs:", result.stderr);
    }
  });

// husky infra logs <service>
infraCommand
  .command("logs <service>")
  .description("View recent logs for a service")
  .option("--errors", "Show only error logs")
  .option("--since <duration>", "Time range (e.g., 1h, 30m)", "1h")
  .option("-n, --lines <count>", "Number of lines", "50")
  .action(async (service, options) => {
    requireAnyPermission(["infra:monitor", "infra:*"]);

    // Validate lines option to prevent command injection
    const lines = parseInt(options.lines, 10);
    if (isNaN(lines) || lines < 1 || lines > 10000) {
      console.error("Error: --lines must be a number between 1 and 10000");
      process.exit(1);
    }

    // Determine if it's a Cloud Run service or VM
    if (service.startsWith("husky-") && !service.includes("dashboard") && !service.includes("api") && !service.includes("terminal")) {
      // VM logs via serial port or SSH
      console.log(`Fetching logs from VM: ${service}`);
      const result = runGcloud([
        "compute", "ssh", service,
        `--zone=${DEFAULT_ZONE}`,
        `--command=journalctl --no-pager -n ${lines} ${options.errors ? "-p err" : ""}`,
      ]);

      if (result.success) {
        console.log(result.stdout);
      } else {
        console.error("Error fetching VM logs:", result.stderr);
      }
    } else {
      // Cloud Run logs
      console.log(`Fetching logs from Cloud Run: ${service}`);
      const args = [
        "logging", "read",
        `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}"`,
        "--limit=" + lines,
        "--format=table(timestamp,textPayload)",
      ];

      if (options.errors) {
        args[1] += " AND severity>=ERROR";
      }

      const result = runGcloud(args);

      if (result.success) {
        console.log(result.stdout);
      } else {
        console.error("Error fetching logs:", result.stderr);
      }
    }
  });

// husky infra start <vm>
infraCommand
  .command("start <vm>")
  .description("Start a VM")
  .action(async (vm) => {
    requireAnyPermission(["infra:update", "infra:*", "vm:*"]);

    console.log(`Starting VM: ${vm}...`);
    const result = runGcloud([
      "compute", "instances", "start", vm,
      `--zone=${DEFAULT_ZONE}`,
    ]);

    if (result.success) {
      console.log(`✓ VM ${vm} started`);
    } else {
      console.error("Error starting VM:", result.stderr);
    }
  });

// husky infra stop <vm>
infraCommand
  .command("stop <vm>")
  .description("Stop a VM")
  .action(async (vm) => {
    requireAnyPermission(["infra:update", "infra:*", "vm:*"]);

    console.log(`Stopping VM: ${vm}...`);
    const result = runGcloud([
      "compute", "instances", "stop", vm,
      `--zone=${DEFAULT_ZONE}`,
    ]);

    if (result.success) {
      console.log(`✓ VM ${vm} stopped`);
    } else {
      console.error("Error stopping VM:", result.stderr);
    }
  });

// husky infra ssh <vm>
infraCommand
  .command("ssh <vm>")
  .description("SSH into a VM")
  .option("-c, --command <cmd>", "Run command instead of interactive shell")
  .action(async (vm, options) => {
    requireAnyPermission(["infra:update", "infra:*", "vm:*"]);

    const args = ["compute", "ssh", vm, `--zone=${DEFAULT_ZONE}`];
    if (options.command) {
      args.push(`--command=${options.command}`);
    }

    // For interactive SSH, use inherit stdio
    const result = spawnSync("gcloud", args, {
      stdio: options.command ? "pipe" : "inherit",
      encoding: "utf-8",
    });

    if (options.command && result.stdout) {
      console.log(result.stdout);
    }
  });

// husky infra scale <pool> --count <n>
infraCommand
  .command("scale <pool>")
  .description("Scale a VM pool (e.g., workers)")
  .requiredOption("-c, --count <n>", "Target number of VMs")
  .action(async (pool, options) => {
    requireAnyPermission(["infra:update", "infra:*", "vm:*"]);

    const count = parseInt(options.count, 10);
    if (isNaN(count) || count < 0) {
      console.error("Error: --count must be a non-negative number");
      process.exit(1);
    }

    console.log(`Scaling ${pool} pool to ${count} VMs...`);

    // Get current VMs in pool
    const listResult = runGcloud([
      "compute", "instances", "list",
      `--filter=name~husky-${pool}`,
      "--format=value(name)",
    ]);

    const currentVMs = listResult.stdout.trim().split("\n").filter(Boolean);
    const currentCount = currentVMs.length;

    console.log(`  Current: ${currentCount} VMs`);
    console.log(`  Target:  ${count} VMs`);

    if (count === currentCount) {
      console.log("  No scaling needed.");
      return;
    }

    if (count > currentCount) {
      // Scale up - start terminated VMs or create new ones
      const terminatedResult = runGcloud([
        "compute", "instances", "list",
        `--filter=name~husky-${pool} AND status=TERMINATED`,
        "--format=value(name)",
      ]);

      const terminated = terminatedResult.stdout.trim().split("\n").filter(Boolean);
      const toStart = terminated.slice(0, count - currentCount);

      for (const vm of toStart) {
        console.log(`  Starting ${vm}...`);
        runGcloud(["compute", "instances", "start", vm, `--zone=${DEFAULT_ZONE}`]);
      }

      console.log(`✓ Scaled up ${pool} pool`);
    } else {
      // Scale down - stop VMs
      const runningResult = runGcloud([
        "compute", "instances", "list",
        `--filter=name~husky-${pool} AND status=RUNNING`,
        "--format=value(name)",
      ]);

      const running = runningResult.stdout.trim().split("\n").filter(Boolean);
      const toStop = running.slice(count);

      for (const vm of toStop) {
        console.log(`  Stopping ${vm}...`);
        runGcloud(["compute", "instances", "stop", vm, `--zone=${DEFAULT_ZONE}`]);
      }

      console.log(`✓ Scaled down ${pool} pool`);
    }
  });
