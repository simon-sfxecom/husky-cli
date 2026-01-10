/**
 * PR Agent commands for creating and managing pull requests
 *
 * Commands for PR agent operations using GitHub CLI:
 * - husky pr create <task-id> - Create a PR from task's worktree branch
 * - husky pr check <pr-number> - Check PR status (checks, reviews, conflicts)
 * - husky pr merge <pr-number> - Merge a PR
 * - husky pr list - List open PRs
 */

import { Command } from "commander";
import { spawnSync } from "child_process";
import { requireAnyPermission } from "../lib/permissions.js";
import { getConfig } from "./config.js";

export const prCommand = new Command("pr")
  .description("Pull request management (PR Agent)");

// Helper: Run gh CLI command and return output
function runGh(args: string[]): { stdout: string; stderr: string; success: boolean } {
  const result = spawnSync("gh", args, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    success: result.status === 0,
  };
}

// Helper: Run git command and return output
function runGit(args: string[]): { stdout: string; stderr: string; success: boolean } {
  const result = spawnSync("git", args, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    success: result.status === 0,
  };
}

// Helper: Get repository info from git remote
function getRepoInfo(): { owner: string; repo: string } | null {
  const result = runGit(["remote", "get-url", "origin"]);
  if (!result.success) return null;

  const url = result.stdout.trim();

  // Handle SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Handle HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

// Helper: Get task details from API
async function getTaskDetails(taskId: string): Promise<{
  worktreeBranch?: string;
  worktreePath?: string;
  title?: string;
  description?: string;
} | null> {
  const config = getConfig();
  if (!config.apiUrl) return null;

  try {
    const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}`, {
      headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Helper: Update task with PR URL
async function updateTaskWithPR(taskId: string, prUrl: string): Promise<boolean> {
  const config = getConfig();
  if (!config.apiUrl) return false;

  try {
    const res = await fetch(`${config.apiUrl}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        result: {
          prUrl,
          completedAt: new Date().toISOString(),
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// husky pr create <task-id>
prCommand
  .command("create <task-id>")
  .description("Create a PR from task's worktree branch")
  .option("-t, --title <title>", "PR title (defaults to task title)")
  .option("-b, --body <body>", "PR body/description")
  .option("--draft", "Create as draft PR")
  .option("--base <branch>", "Base branch for PR", "main")
  .option("--push", "Push branch before creating PR")
  .option("--json", "Output as JSON")
  .action(async (taskId, options) => {
    requireAnyPermission(["pr:create", "pr:*"]);

    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    // Get task details
    const task = await getTaskDetails(taskId);
    if (!task) {
      console.error(`Error: Task ${taskId} not found or API error`);
      process.exit(1);
    }

    if (!task.worktreeBranch) {
      console.error(`Error: Task ${taskId} has no associated worktree branch`);
      console.error("Create a worktree first with: husky worktree create <name> --task-id " + taskId);
      process.exit(1);
    }

    const branch = task.worktreeBranch;
    const title = options.title || task.title || `Task ${taskId}`;
    const body = options.body || task.description || "";

    console.log(`Creating PR for task ${taskId}...`);
    console.log(`  Branch: ${branch}`);
    console.log(`  Title:  ${title}`);

    // Push branch if requested
    if (options.push) {
      console.log(`  Pushing branch...`);
      const pushResult = runGit(["push", "-u", "origin", branch]);
      if (!pushResult.success) {
        console.error(`Error pushing branch: ${pushResult.stderr}`);
        process.exit(1);
      }
    }

    // Create PR using gh CLI
    const ghArgs = [
      "pr", "create",
      "--head", branch,
      "--base", options.base,
      "--title", title,
    ];

    if (body) {
      ghArgs.push("--body", body);
    } else {
      ghArgs.push("--body", `Created from Husky task ${taskId}`);
    }

    if (options.draft) {
      ghArgs.push("--draft");
    }

    const result = runGh(ghArgs);

    if (!result.success) {
      console.error(`Error creating PR: ${result.stderr}`);
      process.exit(1);
    }

    const prUrl = result.stdout.trim();

    // Update task with PR URL
    const updated = await updateTaskWithPR(taskId, prUrl);

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        taskId,
        branch,
        prUrl,
        taskUpdated: updated,
      }, null, 2));
    } else {
      console.log(`\n  PR created: ${prUrl}`);
      if (updated) {
        console.log(`  Task ${taskId} updated with PR URL`);
      } else {
        console.warn(`  Warning: Could not update task with PR URL`);
      }
    }
  });

// husky pr check <pr-number>
prCommand
  .command("check <pr-number>")
  .description("Check PR status (checks, reviews, conflicts)")
  .option("--json", "Output as JSON")
  .action(async (prNumber, options) => {
    requireAnyPermission(["pr:create", "pr:merge", "pr:*"]);

    const repoInfo = getRepoInfo();
    if (!repoInfo) {
      console.error("Error: Could not determine repository from git remote");
      process.exit(1);
    }

    // Get PR status using gh CLI
    const statusResult = runGh([
      "pr", "view", prNumber,
      "--json", "number,title,state,mergeable,mergeStateStatus,statusCheckRollup,reviews,headRefName,baseRefName,isDraft,url",
    ]);

    if (!statusResult.success) {
      console.error(`Error fetching PR: ${statusResult.stderr}`);
      process.exit(1);
    }

    interface Review {
      state: string;
      author: { login: string };
    }

    interface CheckRun {
      conclusion: string;
      name: string;
    }

    interface PRData {
      number: number;
      title: string;
      state: string;
      mergeable: string;
      mergeStateStatus: string;
      statusCheckRollup: CheckRun[];
      reviews: Review[];
      headRefName: string;
      baseRefName: string;
      isDraft: boolean;
      url: string;
    }

    const prData: PRData = JSON.parse(statusResult.stdout);

    if (options.json) {
      console.log(JSON.stringify(prData, null, 2));
      return;
    }

    console.log(`\n  PR #${prData.number}: ${prData.title}`);
    console.log("  " + "-".repeat(60));
    console.log(`  State:       ${prData.state}${prData.isDraft ? " (Draft)" : ""}`);
    console.log(`  Branch:      ${prData.headRefName} -> ${prData.baseRefName}`);
    console.log(`  Mergeable:   ${prData.mergeable}`);
    console.log(`  Merge State: ${prData.mergeStateStatus}`);

    // Check status checks
    const checks = prData.statusCheckRollup || [];
    if (checks.length > 0) {
      console.log(`\n  Status Checks:`);
      const passed = checks.filter((c: CheckRun) => c.conclusion === "SUCCESS").length;
      const failed = checks.filter((c: CheckRun) => c.conclusion === "FAILURE").length;
      const pending = checks.filter((c: CheckRun) => !c.conclusion).length;

      console.log(`    Passed:  ${passed}`);
      console.log(`    Failed:  ${failed}`);
      console.log(`    Pending: ${pending}`);

      if (failed > 0) {
        console.log(`\n  Failed checks:`);
        for (const check of checks.filter((c: CheckRun) => c.conclusion === "FAILURE")) {
          console.log(`    - ${check.name}`);
        }
      }
    }

    // Check reviews
    const reviews = prData.reviews || [];
    if (reviews.length > 0) {
      console.log(`\n  Reviews:`);
      const approved = reviews.filter((r: Review) => r.state === "APPROVED").length;
      const changesRequested = reviews.filter((r: Review) => r.state === "CHANGES_REQUESTED").length;

      console.log(`    Approved:          ${approved}`);
      console.log(`    Changes Requested: ${changesRequested}`);
    }

    // Merge readiness summary
    console.log(`\n  Merge Readiness:`);
    const canMerge = prData.mergeable === "MERGEABLE" &&
                     prData.state === "OPEN" &&
                     !prData.isDraft &&
                     prData.mergeStateStatus !== "BLOCKED";

    if (canMerge) {
      console.log(`    Ready to merge`);
    } else {
      if (prData.isDraft) console.log(`    - PR is still a draft`);
      if (prData.mergeable === "CONFLICTING") console.log(`    - Has merge conflicts`);
      if (prData.mergeStateStatus === "BLOCKED") console.log(`    - Merge is blocked (check required reviews/checks)`);
      if (prData.state !== "OPEN") console.log(`    - PR is not open`);
    }

    console.log(`\n  URL: ${prData.url}`);
    console.log("");
  });

// husky pr merge <pr-number>
prCommand
  .command("merge <pr-number>")
  .description("Merge a PR")
  .option("--squash", "Squash and merge")
  .option("--rebase", "Rebase and merge")
  .option("--delete-branch", "Delete branch after merge")
  .option("--admin", "Use admin privileges to merge (bypass checks)")
  .option("--json", "Output as JSON")
  .action(async (prNumber, options) => {
    requireAnyPermission(["pr:merge", "pr:*"]);

    console.log(`Merging PR #${prNumber}...`);

    // Build gh merge command
    const ghArgs = ["pr", "merge", prNumber];

    if (options.squash) {
      ghArgs.push("--squash");
    } else if (options.rebase) {
      ghArgs.push("--rebase");
    } else {
      ghArgs.push("--merge");
    }

    if (options.deleteBranch) {
      ghArgs.push("--delete-branch");
    }

    if (options.admin) {
      ghArgs.push("--admin");
    }

    const result = runGh(ghArgs);

    if (!result.success) {
      console.error(`Error merging PR: ${result.stderr}`);
      if (result.stderr.includes("BLOCKED")) {
        console.error("\nTip: Use --admin to bypass required checks (requires admin permissions)");
      }
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        prNumber,
        merged: true,
        branchDeleted: !!options.deleteBranch,
      }, null, 2));
    } else {
      console.log(`  PR #${prNumber} merged successfully`);
      if (options.deleteBranch) {
        console.log(`  Branch deleted`);
      }
    }
  });

// husky pr list
prCommand
  .command("list")
  .description("List open PRs")
  .option("--state <state>", "Filter by state (open, closed, merged, all)", "open")
  .option("--author <author>", "Filter by author")
  .option("--label <label>", "Filter by label")
  .option("-n, --limit <n>", "Number of PRs to show", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    requireAnyPermission(["pr:create", "pr:merge", "pr:*"]);

    // Build gh pr list command
    const ghArgs = [
      "pr", "list",
      "--state", options.state,
      "--limit", options.limit,
    ];

    if (options.author) {
      ghArgs.push("--author", options.author);
    }

    if (options.label) {
      ghArgs.push("--label", options.label);
    }

    if (options.json) {
      ghArgs.push("--json", "number,title,state,headRefName,author,createdAt,url,isDraft");
    }

    const result = runGh(ghArgs);

    if (!result.success) {
      console.error(`Error listing PRs: ${result.stderr}`);
      process.exit(1);
    }

    if (options.json) {
      console.log(result.stdout);
      return;
    }

    // Default table output from gh
    if (result.stdout.trim()) {
      console.log("\n  PULL REQUESTS");
      console.log("  " + "-".repeat(80));
      console.log(result.stdout);
    } else {
      console.log("\n  No pull requests found.");
      console.log("");
    }
  });

// husky pr close <pr-number>
prCommand
  .command("close <pr-number>")
  .description("Close a PR without merging")
  .option("--delete-branch", "Delete branch after closing")
  .option("-c, --comment <comment>", "Add a comment before closing")
  .option("--json", "Output as JSON")
  .action(async (prNumber, options) => {
    requireAnyPermission(["pr:merge", "pr:*"]);

    // Add comment if provided
    if (options.comment) {
      const commentResult = runGh(["pr", "comment", prNumber, "--body", options.comment]);
      if (!commentResult.success) {
        console.warn(`Warning: Could not add comment: ${commentResult.stderr}`);
      }
    }

    // Close the PR
    const ghArgs = ["pr", "close", prNumber];
    if (options.deleteBranch) {
      ghArgs.push("--delete-branch");
    }

    const result = runGh(ghArgs);

    if (!result.success) {
      console.error(`Error closing PR: ${result.stderr}`);
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        prNumber,
        closed: true,
        branchDeleted: !!options.deleteBranch,
      }, null, 2));
    } else {
      console.log(`  PR #${prNumber} closed`);
      if (options.deleteBranch) {
        console.log(`  Branch deleted`);
      }
    }
  });

// husky pr review <pr-number>
prCommand
  .command("review <pr-number>")
  .description("Submit a review on a PR")
  .option("-a, --approve", "Approve the PR")
  .option("-r, --request-changes", "Request changes")
  .option("-c, --comment", "Comment without approval")
  .option("-b, --body <body>", "Review body/comment")
  .option("--json", "Output as JSON")
  .action(async (prNumber, options) => {
    requireAnyPermission(["pr:create", "pr:merge", "pr:*"]);

    if (!options.approve && !options.requestChanges && !options.comment) {
      console.error("Error: Must specify --approve, --request-changes, or --comment");
      process.exit(1);
    }

    const ghArgs = ["pr", "review", prNumber];

    if (options.approve) {
      ghArgs.push("--approve");
    } else if (options.requestChanges) {
      ghArgs.push("--request-changes");
    } else if (options.comment) {
      ghArgs.push("--comment");
    }

    if (options.body) {
      ghArgs.push("--body", options.body);
    }

    const result = runGh(ghArgs);

    if (!result.success) {
      console.error(`Error submitting review: ${result.stderr}`);
      process.exit(1);
    }

    const reviewType = options.approve ? "approved" :
                       options.requestChanges ? "requested changes" : "commented";

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        prNumber,
        reviewType,
      }, null, 2));
    } else {
      console.log(`  Review submitted: ${reviewType} on PR #${prNumber}`);
    }
  });
