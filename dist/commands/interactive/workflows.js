import { select, input, confirm } from "@inquirer/prompts";
import { ensureConfig, pressEnterToContinue, truncate } from "./utils.js";
export async function workflowsMenu() {
    const config = ensureConfig();
    const menuItems = [
        { name: "List all workflows", value: "list" },
        { name: "View workflow details", value: "view" },
        { name: "Create new workflow", value: "create" },
        { name: "Update workflow", value: "update" },
        { name: "Delete workflow", value: "delete" },
        { name: "Manage steps", value: "steps" },
        { name: "Generate steps with AI", value: "generate" },
        { name: "Back to main menu", value: "back" },
    ];
    const choice = await select({
        message: "Workflows:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listWorkflows(config);
            break;
        case "view":
            await viewWorkflow(config);
            break;
        case "create":
            await createWorkflow(config);
            break;
        case "update":
            await updateWorkflow(config);
            break;
        case "delete":
            await deleteWorkflow(config);
            break;
        case "steps":
            await manageSteps(config);
            break;
        case "generate":
            await generateSteps(config);
            break;
        case "back":
            return;
    }
}
async function fetchWorkflows(config) {
    const res = await fetch(`${config.apiUrl}/api/workflows`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok)
        throw new Error(`API returned ${res.status}`);
    return res.json();
}
async function selectWorkflow(config, message) {
    const workflows = await fetchWorkflows(config);
    if (workflows.length === 0) {
        console.log("\n  No workflows found.\n");
        await pressEnterToContinue();
        return null;
    }
    const choices = workflows.map((w) => ({
        name: `[${w.status}] ${truncate(w.name, 35)} (${w.valueStream.replace(/_/g, " ")})`,
        value: w.id,
    }));
    choices.push({ name: "Cancel", value: "__cancel__" });
    const workflowId = await select({ message, choices });
    if (workflowId === "__cancel__")
        return null;
    return workflows.find((w) => w.id === workflowId) || null;
}
async function listWorkflows(config) {
    try {
        const workflows = await fetchWorkflows(config);
        console.log("\n  WORKFLOWS");
        console.log("  " + "-".repeat(70));
        if (workflows.length === 0) {
            console.log("  No workflows found.");
        }
        else {
            for (const wf of workflows) {
                console.log(`  [${wf.status}] ${truncate(wf.name, 40).padEnd(40)} ${wf.action}`);
                console.log(`      ID: ${wf.id}`);
                console.log(`      Value Stream: ${wf.valueStream.replace(/_/g, " ")}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error fetching workflows:", error);
        await pressEnterToContinue();
    }
}
async function viewWorkflow(config) {
    try {
        const wf = await selectWorkflow(config, "Select workflow to view:");
        if (!wf)
            return;
        const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}`, {
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const fullWf = await res.json();
        console.log(`\n  Workflow: ${fullWf.name}`);
        console.log("  " + "-".repeat(50));
        console.log(`  ID:           ${fullWf.id}`);
        console.log(`  Status:       ${fullWf.status}`);
        console.log(`  Action:       ${fullWf.action}`);
        console.log(`  Value Stream: ${fullWf.valueStream.replace(/_/g, " ")}`);
        if (fullWf.description) {
            console.log(`  Description:  ${fullWf.description}`);
        }
        if (fullWf.steps && fullWf.steps.length > 0) {
            console.log(`\n  Steps (${fullWf.steps.length}):`);
            for (const step of fullWf.steps) {
                console.log(`    ${step.order + 1}. ${step.name}`);
            }
        }
        console.log("");
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error viewing workflow:", error);
        await pressEnterToContinue();
    }
}
async function createWorkflow(config) {
    try {
        const name = await input({
            message: "Workflow name:",
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
        const action = await select({
            message: "Action:",
            choices: [
                { name: "Document", value: "document" },
                { name: "Automate", value: "automate" },
                { name: "Hire", value: "hire" },
                { name: "Fix", value: "fix" },
                { name: "OK", value: "ok" },
            ],
            default: "document",
        });
        const res = await fetch(`${config.apiUrl}/api/workflows`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
                name,
                description: description || "",
                valueStream,
                status,
                action,
            }),
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        const wf = await res.json();
        console.log(`\n  ✓ Workflow created!`);
        console.log(`  ID: ${wf.id}`);
        console.log(`  Name: ${wf.name}\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error creating workflow:", error);
        await pressEnterToContinue();
    }
}
async function updateWorkflow(config) {
    try {
        const wf = await selectWorkflow(config, "Select workflow to update:");
        if (!wf)
            return;
        const updateChoices = [
            { name: "Name", value: "name" },
            { name: "Description", value: "description" },
            { name: "Status", value: "status" },
            { name: "Action", value: "action" },
            { name: "Cancel", value: "cancel" },
        ];
        const field = await select({ message: "What to update?", choices: updateChoices });
        if (field === "cancel")
            return;
        let updateData = {};
        switch (field) {
            case "name":
                updateData.name = await input({
                    message: "New name:",
                    default: wf.name,
                    validate: (v) => (v.length > 0 ? true : "Name required"),
                });
                break;
            case "description":
                updateData.description = await input({
                    message: "New description:",
                    default: wf.description || "",
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
                    default: wf.status,
                });
                break;
            case "action":
                updateData.action = await select({
                    message: "New action:",
                    choices: [
                        { name: "Document", value: "document" },
                        { name: "Automate", value: "automate" },
                        { name: "Hire", value: "hire" },
                        { name: "Fix", value: "fix" },
                        { name: "OK", value: "ok" },
                    ],
                    default: wf.action,
                });
                break;
        }
        const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}`, {
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
        console.log(`\n  ✓ Workflow updated!\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error updating workflow:", error);
        await pressEnterToContinue();
    }
}
async function deleteWorkflow(config) {
    try {
        const wf = await selectWorkflow(config, "Select workflow to delete:");
        if (!wf)
            return;
        const confirmed = await confirm({
            message: `Delete "${wf.name}"? This cannot be undone.`,
            default: false,
        });
        if (!confirmed) {
            console.log("\n  Cancelled.\n");
            await pressEnterToContinue();
            return;
        }
        const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}`, {
            method: "DELETE",
            headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
        });
        if (!res.ok) {
            console.error(`\n  Error: API returned ${res.status}\n`);
            await pressEnterToContinue();
            return;
        }
        console.log(`\n  ✓ Workflow deleted.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error deleting workflow:", error);
        await pressEnterToContinue();
    }
}
async function manageSteps(config) {
    try {
        const wf = await selectWorkflow(config, "Select workflow:");
        if (!wf)
            return;
        const stepChoices = [
            { name: "List steps", value: "list" },
            { name: "Add step", value: "add" },
            { name: "Delete step", value: "delete" },
            { name: "Back", value: "back" },
        ];
        const action = await select({ message: "Step action:", choices: stepChoices });
        if (action === "back")
            return;
        if (action === "list") {
            const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}`, {
                headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
            });
            const fullWf = await res.json();
            console.log(`\n  Steps for: ${fullWf.name}`);
            console.log("  " + "-".repeat(50));
            if (!fullWf.steps || fullWf.steps.length === 0) {
                console.log("  No steps defined.");
            }
            else {
                for (const step of fullWf.steps) {
                    console.log(`  ${step.order + 1}. ${step.name}`);
                    if (step.description) {
                        console.log(`     ${step.description}`);
                    }
                }
            }
            console.log("");
            await pressEnterToContinue();
        }
        else if (action === "add") {
            const name = await input({
                message: "Step name:",
                validate: (v) => (v.length > 0 ? true : "Name required"),
            });
            const description = await input({
                message: "Step description (optional):",
            });
            const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}/steps`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
                },
                body: JSON.stringify({ name, description: description || undefined }),
            });
            if (!res.ok) {
                console.error(`\n  Error: API returned ${res.status}\n`);
            }
            else {
                console.log(`\n  ✓ Step added!\n`);
            }
            await pressEnterToContinue();
        }
        else if (action === "delete") {
            const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}`, {
                headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
            });
            const fullWf = await res.json();
            if (!fullWf.steps || fullWf.steps.length === 0) {
                console.log("\n  No steps to delete.\n");
                await pressEnterToContinue();
                return;
            }
            const stepChoices = fullWf.steps.map((s) => ({
                name: `${s.order + 1}. ${s.name}`,
                value: s.id,
            }));
            stepChoices.push({ name: "Cancel", value: "__cancel__" });
            const stepId = await select({ message: "Select step to delete:", choices: stepChoices });
            if (stepId === "__cancel__")
                return;
            const delRes = await fetch(`${config.apiUrl}/api/workflows/${wf.id}/steps/${stepId}`, {
                method: "DELETE",
                headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
            });
            if (!delRes.ok) {
                console.error(`\n  Error: API returned ${delRes.status}\n`);
            }
            else {
                console.log(`\n  ✓ Step deleted.\n`);
            }
            await pressEnterToContinue();
        }
    }
    catch (error) {
        console.error("\n  Error managing steps:", error);
        await pressEnterToContinue();
    }
}
async function generateSteps(config) {
    try {
        const wf = await selectWorkflow(config, "Select workflow:");
        if (!wf)
            return;
        console.log("\n  Enter the SOP (Standard Operating Procedure) document.");
        console.log("  This will be used to generate workflow steps with AI.\n");
        const sop = await input({
            message: "SOP document text:",
            validate: (v) => (v.length > 10 ? true : "Please provide more detail"),
        });
        console.log("\n  Generating steps with AI... This may take a moment.\n");
        const res = await fetch(`${config.apiUrl}/api/workflows/${wf.id}/generate-steps`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({ sop }),
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error(`\n  Error: ${error.error || `API returned ${res.status}`}\n`);
            await pressEnterToContinue();
            return;
        }
        const result = await res.json();
        console.log(`  ✓ Steps generated!`);
        console.log(`  Created ${result.stepsCreated || "?"} steps.\n`);
        await pressEnterToContinue();
    }
    catch (error) {
        console.error("\n  Error generating steps:", error);
        await pressEnterToContinue();
    }
}
