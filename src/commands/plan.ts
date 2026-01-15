/**
 * Plan Commands
 *
 * Commands for the plan approval workflow:
 * - husky plan submit - Submit a plan for supervisor review
 * - husky plan list - List pending plans (supervisor)
 * - husky plan get - Get plan details
 * - husky plan approve - Approve a plan (supervisor)
 * - husky plan reject - Reject a plan (supervisor)
 */

import { Command } from "commander";
import chalk from "chalk";
import { apiClient } from "../lib/api-client.js";

const program = new Command();

program
  .name("plan")
  .description("Plan approval workflow commands");

/**
 * Submit a plan for supervisor review
 */
program
  .command("submit")
  .description("Submit a plan for supervisor review")
  .requiredOption("--task-id <id>", "Task ID this plan is for")
  .requiredOption("--plan <text>", "The implementation plan")
  .option("--title <title>", "Task title (if not fetching from task)")
  .option("--steps <n>", "Estimated number of steps", parseInt)
  .option("--files <files>", "Comma-separated list of files to modify")
  .option("--questions <questions>", "Questions for supervisor (comma-separated)")
  .action(async (options) => {
    try {
      // First get the task to get title if not provided
      let taskTitle = options.title;
      let taskDescription: string | undefined;

      if (!taskTitle) {
        const taskResult = await apiClient.get<{ id: string; title: string; description?: string }>(`/api/tasks/${options.taskId}`);
        if (taskResult.success && taskResult.data) {
          taskTitle = taskResult.data.title;
          taskDescription = taskResult.data.description;
        } else {
          taskTitle = `Task ${options.taskId}`;
        }
      }

      const result = await apiClient.post<{ success: boolean; planId: string; message: string }>("/api/plans", {
        taskId: options.taskId,
        taskTitle,
        taskDescription,
        plan: options.plan,
        estimatedSteps: options.steps,
        estimatedFiles: options.files ? options.files.split(",").map((f: string) => f.trim()) : undefined,
        questions: options.questions ? options.questions.split(",").map((q: string) => q.trim()) : undefined,
      });

      if (result.success && result.data) {
        console.log(chalk.green("✓ Plan submitted for supervisor review"));
        console.log(`  Plan ID: ${chalk.cyan(result.data.planId)}`);
        console.log(`  Task: ${taskTitle}`);
        console.log(chalk.yellow("\n⏳ Waiting for supervisor approval..."));
        console.log(chalk.dim("   You will be notified when the plan is reviewed."));
      } else {
        console.error(chalk.red("✗ Failed to submit plan:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("✗ Error:"), error);
      process.exit(1);
    }
  });

/**
 * List pending plans (supervisor only)
 */
program
  .command("list")
  .description("List pending plans awaiting review (supervisor)")
  .action(async () => {
    try {
      const result = await apiClient.get<{ plans: Array<{
        id: string;
        taskId: string;
        taskTitle: string;
        workerId: string;
        workerName?: string;
        plan: string;
        status: string;
        createdAt: string;
      }> }>("/api/plans");

      if (result.success && result.data) {
        const { plans } = result.data;

        if (plans.length === 0) {
          console.log(chalk.yellow("No pending plans"));
          return;
        }

        console.log(chalk.bold(`\n📋 Pending Plans (${plans.length}):\n`));

        for (const plan of plans) {
          console.log(chalk.cyan(`  ${plan.id.substring(0, 8)}`), chalk.white(plan.taskTitle));
          console.log(`    Worker: ${plan.workerName || plan.workerId}`);
          console.log(`    Preview: ${plan.plan.substring(0, 100)}...`);
          console.log("");
        }

        console.log(chalk.dim("Use: husky plan get <id> to see full plan"));
        console.log(chalk.dim("Use: husky plan approve <id> or husky plan reject <id>"));
      } else {
        console.error(chalk.red("✗ Failed to list plans:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("✗ Error:"), error);
      process.exit(1);
    }
  });

/**
 * Get plan details
 */
program
  .command("get")
  .description("Get plan details")
  .argument("<id>", "Plan ID")
  .action(async (id) => {
    try {
      const result = await apiClient.get<{ plan: {
        id: string;
        taskId: string;
        taskTitle: string;
        taskDescription?: string;
        workerId: string;
        workerName?: string;
        plan: string;
        estimatedSteps?: number;
        estimatedFiles?: string[];
        questions?: string[];
        status: string;
        supervisorNotes?: string;
        createdAt: string;
        approvedAt?: string;
        rejectedAt?: string;
      } }>(`/api/plans/${id}`);

      if (result.success && result.data) {
        const { plan } = result.data;

        console.log(chalk.bold(`\n📋 Plan: ${plan.taskTitle}\n`));
        console.log(`  Plan ID: ${chalk.cyan(plan.id)}`);
        console.log(`  Task ID: ${plan.taskId}`);
        console.log(`  Worker: ${plan.workerName || plan.workerId}`);
        console.log(`  Status: ${plan.status === "pending" ? chalk.yellow(plan.status) : plan.status === "approved" ? chalk.green(plan.status) : chalk.red(plan.status)}`);

        if (plan.taskDescription) {
          console.log(`\n  ${chalk.dim("Task Description:")}`);
          console.log(`  ${plan.taskDescription}`);
        }

        console.log(`\n  ${chalk.bold("Implementation Plan:")}`);
        console.log(`  ${plan.plan}`);

        if (plan.estimatedSteps) {
          console.log(`\n  Estimated Steps: ${plan.estimatedSteps}`);
        }

        if (plan.estimatedFiles && plan.estimatedFiles.length > 0) {
          console.log(`\n  Files to modify:`);
          for (const file of plan.estimatedFiles) {
            console.log(`    - ${file}`);
          }
        }

        if (plan.questions && plan.questions.length > 0) {
          console.log(chalk.yellow(`\n  Questions for Supervisor:`));
          for (const q of plan.questions) {
            console.log(`    • ${q}`);
          }
        }

        if (plan.supervisorNotes) {
          console.log(chalk.blue(`\n  Supervisor Notes:`));
          console.log(`  ${plan.supervisorNotes}`);
        }

        if (plan.status === "pending") {
          console.log(chalk.dim("\nCommands:"));
          console.log(chalk.dim(`  husky plan approve ${plan.id} --notes "LGTM"`));
          console.log(chalk.dim(`  husky plan reject ${plan.id} --notes "Needs more detail"`));
        }
      } else {
        console.error(chalk.red("✗ Plan not found:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("✗ Error:"), error);
      process.exit(1);
    }
  });

/**
 * Approve a plan (supervisor only)
 */
program
  .command("approve")
  .description("Approve a plan (supervisor)")
  .argument("<id>", "Plan ID")
  .option("--notes <notes>", "Approval notes for the worker")
  .action(async (id, options) => {
    try {
      const result = await apiClient.patch<{ success: boolean; message: string }>(`/api/plans/${id}`, {
        status: "approved",
        supervisorNotes: options.notes,
      });

      if (result.success) {
        console.log(chalk.green("✓ Plan approved"));
        console.log(chalk.dim("  Worker has been notified and can proceed with implementation."));
      } else {
        console.error(chalk.red("✗ Failed to approve plan:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("✗ Error:"), error);
      process.exit(1);
    }
  });

/**
 * Reject a plan (supervisor only)
 */
program
  .command("reject")
  .description("Reject a plan (supervisor)")
  .argument("<id>", "Plan ID")
  .requiredOption("--notes <notes>", "Rejection reason (required)")
  .action(async (id, options) => {
    try {
      const result = await apiClient.patch<{ success: boolean; message: string }>(`/api/plans/${id}`, {
        status: "rejected",
        supervisorNotes: options.notes,
      });

      if (result.success) {
        console.log(chalk.yellow("✓ Plan rejected"));
        console.log(chalk.dim("  Worker has been notified to revise the plan."));
      } else {
        console.error(chalk.red("✗ Failed to reject plan:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("✗ Error:"), error);
      process.exit(1);
    }
  });

/**
 * Request revision on a plan (supervisor only)
 */
program
  .command("revise")
  .description("Request revision on a plan (supervisor)")
  .argument("<id>", "Plan ID")
  .requiredOption("--notes <notes>", "Revision feedback (required)")
  .action(async (id, options) => {
    try {
      const result = await apiClient.patch<{ success: boolean; message: string }>(`/api/plans/${id}`, {
        status: "revision_requested",
        supervisorNotes: options.notes,
      });

      if (result.success) {
        console.log(chalk.blue("✓ Revision requested"));
        console.log(chalk.dim("  Worker has been notified to address the feedback."));
      } else {
        console.error(chalk.red("✗ Failed to request revision:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("✗ Error:"), error);
      process.exit(1);
    }
  });

export const planCommand = program;
export default program;
