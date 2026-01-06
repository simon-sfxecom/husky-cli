import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate } from "./utils.js";

interface Process {
  id: string;
  name: string;
  description?: string;
  status: string;
  valueStream?: string;
}

export async function processesMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all processes", value: "list" },
    { name: "View process details", value: "view" },
    { name: "Create new process", value: "create" },
    { name: "Update process", value: "update" },
    { name: "Delete process", value: "delete" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Processes:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listProcesses(config);
      break;
    case "view":
      await viewProcess(config);
      break;
    case "create":
      await createProcess(config);
      break;
    case "update":
      await updateProcess(config);
      break;
    case "delete":
      await deleteProcess(config);
      break;
    case "back":
      return;
  }
}

async function fetchProcesses(config: ValidConfig): Promise<Process[]> {
  const res = await fetch(`${config.apiUrl}/api/processes`, {
    headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

async function selectProcess(config: ValidConfig, message: string): Promise<Process | null> {
  const processes = await fetchProcesses(config);
  if (processes.length === 0) {
    console.log("\n  No processes found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = processes.map((p) => ({
    name: `[${p.status}] ${truncate(p.name, 40)}`,
    value: p.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const processId = await select({ message, choices });
  if (processId === "__cancel__") return null;

  return processes.find((p) => p.id === processId) || null;
}

async function listProcesses(config: ValidConfig): Promise<void> {
  try {
    const processes = await fetchProcesses(config);

    console.log("\n  PROCESSES");
    console.log("  " + "-".repeat(70));

    if (processes.length === 0) {
      console.log("  No processes found.");
    } else {
      for (const proc of processes) {
        console.log(`  [${proc.status}] ${truncate(proc.name, 50)}`);
        console.log(`      ID: ${proc.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching processes:", error);
    await pressEnterToContinue();
  }
}

async function viewProcess(config: ValidConfig): Promise<void> {
  try {
    const proc = await selectProcess(config, "Select process to view:");
    if (!proc) return;

    const res = await fetch(`${config.apiUrl}/api/processes/${proc.id}`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const fullProc = await res.json();

    console.log(`\n  Process: ${fullProc.name}`);
    console.log("  " + "-".repeat(50));
    console.log(`  ID:          ${fullProc.id}`);
    console.log(`  Status:      ${fullProc.status}`);
    if (fullProc.valueStream) {
      console.log(`  Value Stream: ${fullProc.valueStream.replace(/_/g, " ")}`);
    }
    if (fullProc.description) {
      console.log(`  Description: ${fullProc.description}`);
    }
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing process:", error);
    await pressEnterToContinue();
  }
}

async function createProcess(config: ValidConfig): Promise<void> {
  try {
    const name = await input({
      message: "Process name:",
      validate: (value) => (value.length > 0 ? true : "Name is required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const valueStream = await select({
      message: "Value stream:",
      choices: [
        { name: "Order to Delivery", value: "order_to_delivery" },
        { name: "Procure to Pay", value: "procure_to_pay" },
        { name: "Returns Management", value: "returns_management" },
        { name: "Product Lifecycle", value: "product_lifecycle" },
        { name: "Customer Service", value: "customer_service" },
        { name: "Finance Admin", value: "finance_admin" },
      ],
      default: "customer_service",
    });

    const status = await select({
      message: "Status:",
      choices: [
        { name: "Owner Only", value: "owner_only" },
        { name: "Approval Needed", value: "approval_needed" },
        { name: "Supervised", value: "supervised" },
        { name: "Delegated", value: "delegated" },
        { name: "Automated", value: "automated" },
      ],
      default: "owner_only",
    });

    const res = await fetch(`${config.apiUrl}/api/processes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        name,
        description: description || undefined,
        valueStream,
        status,
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const proc = await res.json();
    console.log(`\n  ✓ Process created!`);
    console.log(`  ID: ${proc.id}`);
    console.log(`  Name: ${proc.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating process:", error);
    await pressEnterToContinue();
  }
}

async function updateProcess(config: ValidConfig): Promise<void> {
  try {
    const proc = await selectProcess(config, "Select process to update:");
    if (!proc) return;

    const updateChoices: MenuItem[] = [
      { name: "Name", value: "name" },
      { name: "Description", value: "description" },
      { name: "Status", value: "status" },
      { name: "Cancel", value: "cancel" },
    ];

    const field = await select({ message: "What to update?", choices: updateChoices });
    if (field === "cancel") return;

    let updateData: Record<string, string> = {};

    switch (field) {
      case "name":
        updateData.name = await input({
          message: "New name:",
          default: proc.name,
          validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        break;
      case "description":
        updateData.description = await input({
          message: "New description:",
          default: proc.description || "",
        });
        break;
      case "status":
        updateData.status = await select({
          message: "New status:",
          choices: [
            { name: "Owner Only", value: "owner_only" },
            { name: "Approval Needed", value: "approval_needed" },
            { name: "Supervised", value: "supervised" },
            { name: "Delegated", value: "delegated" },
            { name: "Automated", value: "automated" },
          ],
          default: proc.status,
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/processes/${proc.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Process updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating process:", error);
    await pressEnterToContinue();
  }
}

async function deleteProcess(config: ValidConfig): Promise<void> {
  try {
    const proc = await selectProcess(config, "Select process to delete:");
    if (!proc) return;

    const confirmed = await confirm({
      message: `Delete "${proc.name}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/processes/${proc.id}`, {
      method: "DELETE",
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Process deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting process:", error);
    await pressEnterToContinue();
  }
}
