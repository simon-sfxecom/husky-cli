/**
 * Interactive Mode: Infrastructure Module
 *
 * Provides menu-based infrastructure monitoring and management.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate, formatDate } from "./utils.js";

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latency?: number;
  lastCheck: string;
  error?: string;
}

interface VMStatus {
  name: string;
  status: string;
  zone: string;
  machineType: string;
  createdAt: string;
}

export async function infraMenu(): Promise<void> {
  const config = ensureConfig();

  console.log("\n  INFRASTRUCTURE");
  console.log("  " + "-".repeat(50));
  console.log("  Monitoring and management");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "❤️  Health Check", value: "health" },
    { name: "📊 Service Status", value: "services" },
    { name: "💻 VM Status", value: "vms" },
    { name: "📈 Metrics", value: "metrics" },
    { name: "⚠️  Alerts", value: "alerts" },
    { name: "🔄 Restart Service", value: "restart" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "Infra Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "health":
      await healthCheck(config);
      break;
    case "services":
      await serviceStatus(config);
      break;
    case "vms":
      await vmStatus(config);
      break;
    case "metrics":
      await showMetrics(config);
      break;
    case "alerts":
      await showAlerts(config);
      break;
    case "restart":
      await restartService(config);
      break;
    case "back":
      return;
  }
}

async function healthCheck(config: ValidConfig): Promise<void> {
  try {
    console.log("\n  Running health checks...\n");

    const res = await fetch(`${config.apiUrl}/api/infra/health`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const health: ServiceHealth[] = await res.json();

    console.log("  HEALTH STATUS");
    console.log("  " + "-".repeat(70));

    if (health.length === 0) {
      console.log("  No services configured.");
    } else {
      console.log(`  ${"SERVICE".padEnd(25)} ${"STATUS".padEnd(12)} ${"LATENCY".padEnd(12)} ${"LAST CHECK"}`);
      console.log("  " + "-".repeat(70));

      for (const svc of health) {
        const statusIcon = svc.status === "healthy" ? "✅" : svc.status === "degraded" ? "⚠️" : "❌";
        const latency = svc.latency ? `${svc.latency}ms` : "-";
        console.log(
          `  ${truncate(svc.name, 23).padEnd(25)} ${statusIcon} ${svc.status.padEnd(9)} ${latency.padEnd(12)} ${formatDate(svc.lastCheck)}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error running health check:", error);
    await pressEnterToContinue();
  }
}

async function serviceStatus(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/infra/services`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const services = await res.json();

    console.log("\n  CLOUD RUN SERVICES");
    console.log("  " + "-".repeat(70));

    if (!services || services.length === 0) {
      console.log("  No services found.");
    } else {
      for (const svc of services) {
        console.log(`  ${svc.name}`);
        console.log(`    URL: ${svc.url || "-"}`);
        console.log(`    Region: ${svc.region || "-"}`);
        console.log(`    Status: ${svc.status || "-"}`);
        console.log("");
      }
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching services:", error);
    await pressEnterToContinue();
  }
}

async function vmStatus(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/vm-sessions`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const vms: VMStatus[] = await res.json();

    console.log("\n  VM STATUS");
    console.log("  " + "-".repeat(70));

    if (vms.length === 0) {
      console.log("  No VMs found.");
    } else {
      console.log(`  ${"NAME".padEnd(25)} ${"STATUS".padEnd(12)} ${"ZONE".padEnd(20)} ${"TYPE"}`);
      console.log("  " + "-".repeat(70));

      for (const vm of vms) {
        const statusIcon = vm.status === "running" ? "🟢" : vm.status === "stopped" ? "🔴" : "🟡";
        console.log(
          `  ${truncate(vm.name, 23).padEnd(25)} ${statusIcon} ${vm.status.padEnd(9)} ${vm.zone.padEnd(20)} ${vm.machineType || "-"}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching VMs:", error);
    await pressEnterToContinue();
  }
}

async function showMetrics(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/infra/metrics`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const metrics = await res.json();

    console.log("\n  METRICS");
    console.log("  " + "-".repeat(50));

    if (!metrics || Object.keys(metrics).length === 0) {
      console.log("  No metrics available.");
    } else {
      for (const [key, value] of Object.entries(metrics)) {
        console.log(`  ${key}: ${value}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching metrics:", error);
    await pressEnterToContinue();
  }
}

async function showAlerts(config: ValidConfig): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/infra/alerts`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const alerts = await res.json();

    console.log("\n  ALERTS");
    console.log("  " + "-".repeat(70));

    if (!alerts || alerts.length === 0) {
      console.log("  ✅ No active alerts.");
    } else {
      for (const alert of alerts) {
        const icon = alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟡" : "🔵";
        console.log(`  ${icon} ${alert.title || alert.name}`);
        console.log(`    Severity: ${alert.severity}`);
        console.log(`    Message: ${alert.message || "-"}`);
        console.log(`    Time: ${formatDate(alert.createdAt)}`);
        console.log("");
      }
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching alerts:", error);
    await pressEnterToContinue();
  }
}

async function restartService(config: ValidConfig): Promise<void> {
  try {
    const serviceName = await input({
      message: "Service name to restart:",
      validate: (v) => (v.length > 0 ? true : "Service name is required"),
    });

    const confirmed = await confirm({
      message: `Are you sure you want to restart ${serviceName}?`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  Restarting ${serviceName}...`);

    const res = await fetch(`${config.apiUrl}/api/infra/services/${encodeURIComponent(serviceName)}/restart`, {
      method: "POST",
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`\n  Error: ${error}\n`);
    } else {
      console.log(`\n  Service ${serviceName} restarted successfully!\n`);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error restarting service:", error);
    await pressEnterToContinue();
  }
}
