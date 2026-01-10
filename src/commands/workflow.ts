import { Command } from "commander";
import { getConfig } from "./config.js";

export const workflowCommand = new Command("workflow")
  .description("Manage workflows and workflow steps");

// Helper: Ensure API is configured
function ensureConfig() {
  const config = getConfig();
  if (!config.apiUrl) {
    console.error("Error: API URL not configured. Run: husky config set api-url <url>");
    process.exit(1);
  }
  return config;
}

// Type definitions
type ValueStream =
  | "order_to_delivery"
  | "procure_to_pay"
  | "returns_management"
  | "product_lifecycle"
  | "customer_service"
  | "marketing_sales"
  | "finance_accounting"
  | "hr_operations"
  | "it_operations"
  | "general";

type WorkflowStatus = "draft" | "active" | "paused" | "archived";
type WorkflowAction = "manual" | "semi_automated" | "fully_automated";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  valueStream: ValueStream;
  departmentIds: string[];
  projectId?: string;
  status: WorkflowStatus;
  action: WorkflowAction;
  autonomyWeight: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStep {
  id: string;
  workflowId: string;
  order: number;
  name: string;
  description?: string;
  sopDescription?: string;
  mermaidCode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowWithSteps extends Workflow {
  steps?: WorkflowStep[];
}

workflowCommand
  .command("list")
  .description("List all workflows")
  .option("--value-stream <valueStream>", "Filter by value stream")
  .option("-l, --limit <num>", "Max results")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = ensureConfig();

    try {
      const url = new URL("/api/workflows", config.apiUrl);
      if (options.valueStream) {
        url.searchParams.set("valueStream", options.valueStream);
      }

      const res = await fetch(url.toString(), {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      let workflows: Workflow[] = await res.json();

      if (options.limit) {
        workflows = workflows.slice(0, parseInt(options.limit, 10));
      }

      if (options.json) {
        console.log(JSON.stringify(workflows, null, 2));
      } else {
        printWorkflows(workflows);
      }
    } catch (error) {
      console.error("Error fetching workflows:", error);
      process.exit(1);
    }
  });

// husky workflow get <id>
workflowCommand
  .command("get <id>")
  .description("Get workflow details with steps")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    try {
      // Fetch workflow
      const workflowRes = await fetch(`${config.apiUrl}/api/workflows/${id}`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!workflowRes.ok) {
        if (workflowRes.status === 404) {
          console.error(`Error: Workflow ${id} not found`);
        } else {
          console.error(`Error: API returned ${workflowRes.status}`);
        }
        process.exit(1);
      }

      const workflow: Workflow = await workflowRes.json();

      // Fetch steps
      const stepsRes = await fetch(`${config.apiUrl}/api/workflows/${id}/steps`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      let steps: WorkflowStep[] = [];
      if (stepsRes.ok) {
        steps = await stepsRes.json();
      }

      const workflowWithSteps: WorkflowWithSteps = { ...workflow, steps };

      if (options.json) {
        console.log(JSON.stringify(workflowWithSteps, null, 2));
      } else {
        printWorkflowDetail(workflowWithSteps);
      }
    } catch (error) {
      console.error("Error fetching workflow:", error);
      process.exit(1);
    }
  });

// husky workflow create <name>
workflowCommand
  .command("create <name>")
  .description("Create a new workflow")
  .option("-d, --description <description>", "Workflow description")
  .option("--value-stream <valueStream>", "Value stream (order_to_delivery, procure_to_pay, returns_management, product_lifecycle, customer_service, finance_admin)", "customer_service")
  .option("--status <status>", "Workflow status (owner_only, approval_needed, supervised, delegated, automated)", "owner_only")
  .option("--action <action>", "Action type (automate, hire, document, fix, ok)", "document")
  .option("--json", "Output as JSON")
  .action(async (name, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name,
          description: options.description || "",
          valueStream: options.valueStream,
          status: options.status,
          action: options.action,
          departmentIds: [],
          autonomyWeight: 0,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || `API error: ${res.status}`);
      }

      const workflow: Workflow = await res.json();

      if (options.json) {
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        console.log(`Created workflow: ${workflow.name}`);
        console.log(`  ID: ${workflow.id}`);
        console.log(`  Value Stream: ${workflow.valueStream}`);
        console.log(`  Status: ${workflow.status}`);
      }
    } catch (error) {
      console.error("Error creating workflow:", error);
      process.exit(1);
    }
  });

// husky workflow update <id>
workflowCommand
  .command("update <id>")
  .description("Update a workflow")
  .option("-n, --name <name>", "New name")
  .option("-d, --description <description>", "New description")
  .option("--value-stream <valueStream>", "New value stream")
  .option("--status <status>", "New status (draft, active, paused, archived)")
  .option("--action <action>", "New action type (manual, semi_automated, fully_automated)")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string> = {};
    if (options.name) updateData.name = options.name;
    if (options.description) updateData.description = options.description;
    if (options.valueStream) updateData.valueStream = options.valueStream;
    if (options.status) {
      const validStatuses = ["draft", "active", "paused", "archived"];
      if (!validStatuses.includes(options.status)) {
        console.error(`Error: Invalid status "${options.status}". Must be one of: ${validStatuses.join(", ")}`);
        process.exit(1);
      }
      updateData.status = options.status;
    }
    if (options.action) {
      const validActions = ["manual", "semi_automated", "fully_automated"];
      if (!validActions.includes(options.action)) {
        console.error(`Error: Invalid action "${options.action}". Must be one of: ${validActions.join(", ")}`);
        process.exit(1);
      }
      updateData.action = options.action;
    }

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided. Use -n, -d, --value-stream, --status, or --action");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Workflow ${id} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      const workflow: Workflow = await res.json();

      if (options.json) {
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        console.log(`Workflow updated successfully`);
        console.log(`  Name: ${workflow.name}`);
        console.log(`  Status: ${workflow.status}`);
        console.log(`  Action: ${workflow.action}`);
      }
    } catch (error) {
      console.error("Error updating workflow:", error);
      process.exit(1);
    }
  });

// husky workflow delete <id>
workflowCommand
  .command("delete <id>")
  .description("Delete a workflow")
  .option("--force", "Skip confirmation")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const config = ensureConfig();

    if (!options.force) {
      console.log("Warning: This will permanently delete the workflow and all its steps.");
      console.log("Use --force to confirm deletion.");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${id}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Workflow ${id} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, id }, null, 2));
      } else {
        console.log(`Workflow deleted`);
      }
    } catch (error) {
      console.error("Error deleting workflow:", error);
      process.exit(1);
    }
  });

// husky workflow add-step <workflowId>
workflowCommand
  .command("add-step <workflowId>")
  .description("Add a step to a workflow")
  .requiredOption("--name <name>", "Step name")
  .option("--description <description>", "Step description")
  .option("--order <order>", "Step order (0-based)", parseInt)
  .option("--json", "Output as JSON")
  .action(async (workflowId, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${workflowId}/steps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          name: options.name,
          description: options.description || "",
          order: options.order ?? 0,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Workflow ${workflowId} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      const step: WorkflowStep = await res.json();

      if (options.json) {
        console.log(JSON.stringify(step, null, 2));
      } else {
        console.log(`Added step to workflow`);
        console.log(`  Step ID: ${step.id}`);
        console.log(`  Name: ${step.name}`);
        console.log(`  Order: ${step.order}`);
      }
    } catch (error) {
      console.error("Error adding step:", error);
      process.exit(1);
    }
  });

// husky workflow update-step <workflowId> <stepId>
workflowCommand
  .command("update-step <workflowId> <stepId>")
  .description("Update a workflow step")
  .option("--name <name>", "New step name")
  .option("--description <description>", "New step description")
  .option("--order <order>", "New step order", parseInt)
  .option("--json", "Output as JSON")
  .action(async (workflowId, stepId, options) => {
    const config = ensureConfig();

    // Build update payload
    const updateData: Record<string, string | number> = {};
    if (options.name) updateData.name = options.name;
    if (options.description) updateData.description = options.description;
    if (options.order !== undefined) updateData.order = options.order;

    if (Object.keys(updateData).length === 0) {
      console.error("Error: No update options provided. Use --name, --description, or --order");
      process.exit(1);
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${workflowId}/steps/${stepId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Step ${stepId} not found`);
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: API returned ${res.status}`, errorBody.error || "");
        }
        process.exit(1);
      }

      const step: WorkflowStep = await res.json();

      if (options.json) {
        console.log(JSON.stringify(step, null, 2));
      } else {
        console.log(`Step updated successfully`);
        console.log(`  Name: ${step.name}`);
        console.log(`  Order: ${step.order}`);
      }
    } catch (error) {
      console.error("Error updating step:", error);
      process.exit(1);
    }
  });

// husky workflow delete-step <workflowId> <stepId>
workflowCommand
  .command("delete-step <workflowId> <stepId>")
  .description("Delete a workflow step")
  .option("--json", "Output as JSON")
  .action(async (workflowId, stepId, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${workflowId}/steps/${stepId}`, {
        method: "DELETE",
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Step ${stepId} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, id: stepId }, null, 2));
      } else {
        console.log(`Step deleted`);
      }
    } catch (error) {
      console.error("Error deleting step:", error);
      process.exit(1);
    }
  });

// husky workflow generate-steps <workflowId>
workflowCommand
  .command("generate-steps <workflowId>")
  .description("AI-generate steps from an SOP document")
  .requiredOption("--sop <document>", "SOP document text")
  .option("--json", "Output as JSON")
  .action(async (workflowId, options) => {
    const config = ensureConfig();

    console.log("Generating workflow steps with AI...");
    console.log("This may take a moment...\n");

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${workflowId}/generate-steps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          sopDocument: options.sop,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Workflow ${workflowId} not found`);
        } else if (res.status === 503) {
          console.error("Error: AI generation not available - ANTHROPIC_API_KEY not configured on server");
        } else {
          const errorBody = await res.json().catch(() => ({}));
          console.error(`Error: ${errorBody.error || `API returned ${res.status}`}`);
        }
        process.exit(1);
      }

      const result = await res.json();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Steps generated successfully!`);
        console.log(`  Workflow: ${result.workflowName}`);
        console.log(`  Steps Created: ${result.stepsGenerated}`);
        console.log("");

        if (result.steps && result.steps.length > 0) {
          console.log("  GENERATED STEPS");
          console.log("  " + "-".repeat(50));
          for (const step of result.steps) {
            console.log(`  ${step.order + 1}. ${step.name}`);
            if (step.description) {
              console.log(`     ${step.description}`);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error generating steps:", error);
      process.exit(1);
    }
  });

// husky workflow list-steps <workflowId>
workflowCommand
  .command("list-steps <workflowId>")
  .description("List all steps in a workflow")
  .option("--json", "Output as JSON")
  .action(async (workflowId, options) => {
    const config = ensureConfig();

    try {
      const res = await fetch(`${config.apiUrl}/api/workflows/${workflowId}/steps`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.error(`Error: Workflow ${workflowId} not found`);
        } else {
          console.error(`Error: API returned ${res.status}`);
        }
        process.exit(1);
      }

      const steps: WorkflowStep[] = await res.json();

      if (options.json) {
        console.log(JSON.stringify(steps, null, 2));
      } else {
        printSteps(steps);
      }
    } catch (error) {
      console.error("Error fetching steps:", error);
      process.exit(1);
    }
  });

// Print helpers
function printWorkflows(workflows: Workflow[]) {
  if (workflows.length === 0) {
    console.log("\n  No workflows found.");
    console.log("  Create one with: husky workflow create <name>\n");
    return;
  }

  console.log("\n  WORKFLOWS");
  console.log("  " + "-".repeat(80));
  console.log(
    `  ${"ID".padEnd(24)} ${"NAME".padEnd(25)} ${"VALUE STREAM".padEnd(18)} ${"STATUS".padEnd(10)} ACTION`
  );
  console.log("  " + "-".repeat(80));

  for (const workflow of workflows) {
    const truncatedName = workflow.name.length > 23 ? workflow.name.substring(0, 20) + "..." : workflow.name;
    const valueStream = workflow.valueStream.replace(/_/g, " ");
    const truncatedStream = valueStream.length > 16 ? valueStream.substring(0, 13) + "..." : valueStream;

    console.log(
      `  ${workflow.id.padEnd(24)} ${truncatedName.padEnd(25)} ${truncatedStream.padEnd(18)} ${workflow.status.padEnd(10)} ${workflow.action}`
    );
  }

  console.log("");
}

function printWorkflowDetail(workflow: WorkflowWithSteps) {
  console.log(`\n  Workflow: ${workflow.name}`);
  console.log("  " + "-".repeat(60));
  console.log(`  ID:           ${workflow.id}`);
  console.log(`  Description:  ${workflow.description || "(none)"}`);
  console.log(`  Value Stream: ${workflow.valueStream.replace(/_/g, " ")}`);
  console.log(`  Status:       ${workflow.status}`);
  console.log(`  Action:       ${workflow.action}`);
  console.log(`  Autonomy:     ${workflow.autonomyWeight}%`);

  const steps = workflow.steps || [];
  console.log(`\n  Steps: ${steps.length}`);

  if (steps.length > 0) {
    console.log("  " + "-".repeat(50));
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    for (const step of sortedSteps) {
      console.log(`  ${step.order + 1}. ${step.name}`);
      if (step.description) {
        console.log(`     ${step.description}`);
      }
      console.log(`     ID: ${step.id}`);
    }
  }

  console.log("");
}

function printSteps(steps: WorkflowStep[]) {
  if (steps.length === 0) {
    console.log("\n  No steps found.");
    console.log("  Add one with: husky workflow add-step <workflowId> --name <name>\n");
    return;
  }

  console.log("\n  WORKFLOW STEPS");
  console.log("  " + "-".repeat(70));
  console.log(
    `  ${"#".padEnd(4)} ${"ID".padEnd(24)} ${"NAME".padEnd(35)}`
  );
  console.log("  " + "-".repeat(70));

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  for (const step of sortedSteps) {
    const truncatedName = step.name.length > 33 ? step.name.substring(0, 30) + "..." : step.name;
    console.log(
      `  ${String(step.order + 1).padEnd(4)} ${step.id.padEnd(24)} ${truncatedName.padEnd(35)}`
    );
    if (step.description) {
      const truncatedDesc = step.description.length > 60 ? step.description.substring(0, 57) + "..." : step.description;
      console.log(`       ${truncatedDesc}`);
    }
  }

  console.log("");
}
