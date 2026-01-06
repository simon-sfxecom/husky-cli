import { Command } from "commander";
import { getConfig } from "./config.js";
export const departmentCommand = new Command("department")
    .description("Manage departments");
// Helper: Ensure API is configured
function ensureConfig() {
    const config = getConfig();
    if (!config.apiUrl) {
        console.error("Error: API URL not configured. Run: husky config set api-url <url>");
        process.exit(1);
    }
    return config;
}
// husky department list
departmentCommand
    .command("list")
    .description("List all departments")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/departments`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const departments = await res.json();
        if (options.json) {
            console.log(JSON.stringify(departments, null, 2));
        }
        else {
            printDepartments(departments);
        }
    }
    catch (error) {
        console.error("Error fetching departments:", error);
        process.exit(1);
    }
});
// husky department create <name>
departmentCommand
    .command("create <name>")
    .description("Create a new department")
    .option("-d, --description <description>", "Department description")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/departments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                description: options.description,
            }),
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        const department = await res.json();
        if (options.json) {
            console.log(JSON.stringify(department, null, 2));
        }
        else {
            console.log(`✓ Created department: ${department.name}`);
            console.log(`  ID: ${department.id}`);
        }
    }
    catch (error) {
        console.error("Error creating department:", error);
        process.exit(1);
    }
});
// husky department get <id>
departmentCommand
    .command("get <id>")
    .description("Get department details")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    try {
        const res = await fetch(`${config.apiUrl}/api/departments/${id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Department ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        const department = await res.json();
        if (options.json) {
            console.log(JSON.stringify(department, null, 2));
        }
        else {
            printDepartmentDetail(department);
        }
    }
    catch (error) {
        console.error("Error fetching department:", error);
        process.exit(1);
    }
});
// husky department update <id>
departmentCommand
    .command("update <id>")
    .description("Update a department")
    .option("-n, --name <name>", "New name")
    .option("-d, --description <description>", "New description")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    // Build update payload
    const updateData = {};
    if (options.name) {
        updateData.name = options.name;
    }
    if (options.description) {
        updateData.description = options.description;
    }
    if (Object.keys(updateData).length === 0) {
        console.error("Error: No update options provided. Use -n or -d");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/departments/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify(updateData),
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Department ${id} not found`);
            }
            else {
                const errorBody = await res.json().catch(() => ({}));
                console.error(`Error: API returned ${res.status}`, errorBody.error || "");
            }
            process.exit(1);
        }
        const department = await res.json();
        if (options.json) {
            console.log(JSON.stringify(department, null, 2));
        }
        else {
            console.log(`✓ Department updated successfully`);
            console.log(`  Name:        ${department.name}`);
            if (department.description) {
                console.log(`  Description: ${department.description}`);
            }
        }
    }
    catch (error) {
        console.error("Error updating department:", error);
        process.exit(1);
    }
});
// husky department delete <id>
departmentCommand
    .command("delete <id>")
    .description("Delete a department")
    .option("--force", "Skip confirmation")
    .option("--json", "Output as JSON")
    .action(async (id, options) => {
    const config = ensureConfig();
    if (!options.force) {
        console.log("Warning: This will permanently delete the department.");
        console.log("Use --force to confirm deletion.");
        process.exit(1);
    }
    try {
        const res = await fetch(`${config.apiUrl}/api/departments/${id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            if (res.status === 404) {
                console.error(`Error: Department ${id} not found`);
            }
            else {
                console.error(`Error: API returned ${res.status}`);
            }
            process.exit(1);
        }
        if (options.json) {
            console.log(JSON.stringify({ deleted: true, id }, null, 2));
        }
        else {
            console.log(`✓ Department deleted`);
        }
    }
    catch (error) {
        console.error("Error deleting department:", error);
        process.exit(1);
    }
});
function printDepartments(departments) {
    if (departments.length === 0) {
        console.log("\n  No departments found.");
        console.log("  Create one with: husky department create <name>\n");
        return;
    }
    console.log("\n  DEPARTMENTS");
    console.log("  " + "─".repeat(70));
    console.log(`  ${"ID".padEnd(24)} ${"NAME".padEnd(25)} DESCRIPTION`);
    console.log("  " + "─".repeat(70));
    for (const dept of departments) {
        const truncatedName = dept.name.length > 23 ? dept.name.substring(0, 20) + "..." : dept.name;
        const description = dept.description
            ? (dept.description.length > 30 ? dept.description.substring(0, 27) + "..." : dept.description)
            : "-";
        console.log(`  ${dept.id.padEnd(24)} ${truncatedName.padEnd(25)} ${description}`);
    }
    console.log("  " + "─".repeat(70));
    console.log(`\n  Total: ${departments.length} departments`);
    console.log("");
}
function printDepartmentDetail(department) {
    console.log(`\n  Department: ${department.name}`);
    console.log("  " + "─".repeat(50));
    console.log(`  ID:          ${department.id}`);
    console.log(`  Name:        ${department.name}`);
    if (department.description) {
        console.log(`  Description:`);
        console.log(`    ${department.description}`);
    }
    console.log(`  Created:     ${new Date(department.createdAt).toLocaleString()}`);
    console.log(`  Updated:     ${new Date(department.updatedAt).toLocaleString()}`);
    console.log("");
}
