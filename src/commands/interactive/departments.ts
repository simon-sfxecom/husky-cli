import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, ValidConfig, ensureConfig, pressEnterToContinue, truncate } from "./utils.js";

interface Department {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export async function departmentsMenu(): Promise<void> {
  const config = ensureConfig();

  const menuItems: MenuItem[] = [
    { name: "List all departments", value: "list" },
    { name: "View department details", value: "view" },
    { name: "Create new department", value: "create" },
    { name: "Update department", value: "update" },
    { name: "Delete department", value: "delete" },
    { name: "Back to main menu", value: "back" },
  ];

  const choice = await select({
    message: "Departments:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listDepartments(config);
      break;
    case "view":
      await viewDepartment(config);
      break;
    case "create":
      await createDepartment(config);
      break;
    case "update":
      await updateDepartment(config);
      break;
    case "delete":
      await deleteDepartment(config);
      break;
    case "back":
      return;
  }
}

async function fetchDepartments(config: ValidConfig): Promise<Department[]> {
  const res = await fetch(`${config.apiUrl}/api/departments`, {
    headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
  });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
}

async function selectDepartment(config: ValidConfig, message: string): Promise<Department | null> {
  const departments = await fetchDepartments(config);
  if (departments.length === 0) {
    console.log("\n  No departments found.\n");
    await pressEnterToContinue();
    return null;
  }

  const choices = departments.map((d) => ({
    name: `${d.icon || "📁"} ${truncate(d.name, 40)}`,
    value: d.id,
  }));
  choices.push({ name: "Cancel", value: "__cancel__" });

  const deptId = await select({ message, choices });
  if (deptId === "__cancel__") return null;

  return departments.find((d) => d.id === deptId) || null;
}

async function listDepartments(config: ValidConfig): Promise<void> {
  try {
    const departments = await fetchDepartments(config);

    console.log("\n  DEPARTMENTS");
    console.log("  " + "-".repeat(70));

    if (departments.length === 0) {
      console.log("  No departments found.");
    } else {
      for (const dept of departments) {
        console.log(`  ${dept.icon || "📁"} ${truncate(dept.name, 50)}`);
        console.log(`      ID: ${dept.id}`);
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error fetching departments:", error);
    await pressEnterToContinue();
  }
}

async function viewDepartment(config: ValidConfig): Promise<void> {
  try {
    const dept = await selectDepartment(config, "Select department to view:");
    if (!dept) return;

    const res = await fetch(`${config.apiUrl}/api/departments/${dept.id}`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const fullDept = await res.json();

    console.log(`\n  Department: ${fullDept.name}`);
    console.log("  " + "-".repeat(50));
    console.log(`  ID:    ${fullDept.id}`);
    console.log(`  Icon:  ${fullDept.icon || "(none)"}`);
    console.log(`  Color: ${fullDept.color || "(none)"}`);
    if (fullDept.description) {
      console.log(`  Description: ${fullDept.description}`);
    }
    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing department:", error);
    await pressEnterToContinue();
  }
}

async function createDepartment(config: ValidConfig): Promise<void> {
  try {
    const name = await input({
      message: "Department name:",
      validate: (value) => (value.length > 0 ? true : "Name is required"),
    });

    const description = await input({
      message: "Description (optional):",
    });

    const icon = await input({
      message: "Icon emoji (optional, e.g. 🏢):",
      default: "🏢",
    });

    const res = await fetch(`${config.apiUrl}/api/departments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        name,
        description: description || undefined,
        icon: icon || undefined,
      }),
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    const dept = await res.json();
    console.log(`\n  ✓ Department created!`);
    console.log(`  ID: ${dept.id}`);
    console.log(`  Name: ${dept.name}\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating department:", error);
    await pressEnterToContinue();
  }
}

async function updateDepartment(config: ValidConfig): Promise<void> {
  try {
    const dept = await selectDepartment(config, "Select department to update:");
    if (!dept) return;

    const updateChoices: MenuItem[] = [
      { name: "Name", value: "name" },
      { name: "Description", value: "description" },
      { name: "Icon", value: "icon" },
      { name: "Cancel", value: "cancel" },
    ];

    const field = await select({ message: "What to update?", choices: updateChoices });
    if (field === "cancel") return;

    let updateData: Record<string, string> = {};

    switch (field) {
      case "name":
        updateData.name = await input({
          message: "New name:",
          default: dept.name,
          validate: (v) => (v.length > 0 ? true : "Name required"),
        });
        break;
      case "description":
        updateData.description = await input({
          message: "New description:",
          default: dept.description || "",
        });
        break;
      case "icon":
        updateData.icon = await input({
          message: "New icon emoji:",
          default: dept.icon || "🏢",
        });
        break;
    }

    const res = await fetch(`${config.apiUrl}/api/departments/${dept.id}`, {
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

    console.log(`\n  ✓ Department updated!\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error updating department:", error);
    await pressEnterToContinue();
  }
}

async function deleteDepartment(config: ValidConfig): Promise<void> {
  try {
    const dept = await selectDepartment(config, "Select department to delete:");
    if (!dept) return;

    const confirmed = await confirm({
      message: `Delete "${dept.name}"? This cannot be undone.`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    const res = await fetch(`${config.apiUrl}/api/departments/${dept.id}`, {
      method: "DELETE",
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });

    if (!res.ok) {
      console.error(`\n  Error: API returned ${res.status}\n`);
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  ✓ Department deleted.\n`);
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error deleting department:", error);
    await pressEnterToContinue();
  }
}
