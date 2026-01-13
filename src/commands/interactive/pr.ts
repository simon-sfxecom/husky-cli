/**
 * Interactive Mode: Pull Request Module
 *
 * Provides menu-based PR management and automation.
 */

import { select, input, confirm } from "@inquirer/prompts";
import { MenuItem, pressEnterToContinue, truncate } from "./utils.js";
import { spawnSync } from "child_process";

interface PullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  createdAt: string;
  url: string;
  draft: boolean;
  mergeable?: boolean;
}

/**
 * Safe command execution using spawnSync
 */
function runGh(args: string[]): { success: boolean; stdout: string; stderr: string } {
  const result = spawnSync("gh", args, {
    encoding: "utf-8",
    timeout: 60000,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export async function prMenu(): Promise<void> {
  console.log("\n  PULL REQUESTS");
  console.log("  " + "-".repeat(50));
  console.log("  PR management and automation");
  console.log("");

  const menuItems: MenuItem[] = [
    { name: "📋 List PRs", value: "list" },
    { name: "🔍 View PR", value: "view" },
    { name: "✅ Check PR Status", value: "status" },
    { name: "📝 Create PR", value: "create" },
    { name: "🔀 Merge PR", value: "merge" },
    { name: "💬 Add Comment", value: "comment" },
    { name: "👀 Review PR", value: "review" },
    { name: "← Back", value: "back" },
  ];

  const choice = await select({
    message: "PR Action:",
    choices: menuItems,
  });

  switch (choice) {
    case "list":
      await listPRs();
      break;
    case "view":
      await viewPR();
      break;
    case "status":
      await checkStatus();
      break;
    case "create":
      await createPR();
      break;
    case "merge":
      await mergePR();
      break;
    case "comment":
      await addComment();
      break;
    case "review":
      await reviewPR();
      break;
    case "back":
      return;
  }
}

async function listPRs(): Promise<void> {
  try {
    console.log("\n  Fetching PRs...\n");

    const result = runGh(["pr", "list", "--json", "number,title,state,author,createdAt,url,isDraft", "--limit", "20"]);

    if (!result.success) {
      console.error("\n  Error listing PRs. Is 'gh' CLI installed and authenticated?");
      console.error(`  ${result.stderr}\n`);
      await pressEnterToContinue();
      return;
    }

    const prs: PullRequest[] = JSON.parse(result.stdout).map((pr: { isDraft?: boolean } & PullRequest) => ({
      ...pr,
      draft: pr.isDraft,
      author: typeof pr.author === "object" ? (pr.author as { login: string }).login : pr.author,
    }));

    console.log("  PULL REQUESTS");
    console.log("  " + "-".repeat(80));

    if (prs.length === 0) {
      console.log("  No open PRs found.");
    } else {
      console.log(`  ${"#".padEnd(6)} ${"TITLE".padEnd(40)} ${"AUTHOR".padEnd(15)} ${"STATE"}`);
      console.log("  " + "-".repeat(80));

      for (const pr of prs) {
        const draftIcon = pr.draft ? "📝" : "";
        console.log(
          `  ${String(pr.number).padEnd(6)} ${truncate(pr.title, 38).padEnd(40)} ${truncate(pr.author, 13).padEnd(15)} ${pr.state} ${draftIcon}`
        );
      }
    }

    console.log("");
    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error listing PRs:", (error as Error).message);
    await pressEnterToContinue();
  }
}

async function viewPR(): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    console.log(`\n  Fetching PR #${prNumber}...\n`);

    const result = runGh(["pr", "view", prNumber]);

    if (!result.success) {
      console.error("\n  Error viewing PR:", result.stderr);
    } else {
      console.log(result.stdout);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error viewing PR:", (error as Error).message);
    await pressEnterToContinue();
  }
}

async function checkStatus(): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    console.log(`\n  Checking status of PR #${prNumber}...\n`);

    const result = runGh(["pr", "checks", prNumber]);

    console.log("  PR CHECKS");
    console.log("  " + "-".repeat(60));

    if (!result.success) {
      console.error("  Error:", result.stderr);
    } else {
      console.log(result.stdout);
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error checking PR status:", (error as Error).message);
    await pressEnterToContinue();
  }
}

async function createPR(): Promise<void> {
  try {
    const title = await input({
      message: "PR title:",
      validate: (v) => (v.length > 0 ? true : "Title is required"),
    });

    const body = await input({
      message: "PR description (optional):",
      default: "",
    });

    const draft = await confirm({
      message: "Create as draft?",
      default: false,
    });

    console.log("\n  Creating PR...\n");

    const args = ["pr", "create", "--title", title];
    if (body) {
      args.push("--body", body);
    }
    if (draft) {
      args.push("--draft");
    }

    const result = runGh(args);

    if (!result.success) {
      console.error("\n  Error creating PR:", result.stderr);
    } else {
      console.log("  PR created successfully!");
      console.log(`  ${result.stdout.trim()}`);
      console.log("");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error creating PR:", (error as Error).message);
    await pressEnterToContinue();
  }
}

async function mergePR(): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number to merge:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    const mergeMethod = await select({
      message: "Merge method:",
      choices: [
        { name: "Squash and merge", value: "squash" },
        { name: "Create merge commit", value: "merge" },
        { name: "Rebase and merge", value: "rebase" },
      ],
    });

    const deleteBranch = await confirm({
      message: "Delete branch after merge?",
      default: true,
    });

    const confirmed = await confirm({
      message: `Are you sure you want to merge PR #${prNumber}?`,
      default: false,
    });

    if (!confirmed) {
      console.log("\n  Cancelled.\n");
      await pressEnterToContinue();
      return;
    }

    console.log(`\n  Merging PR #${prNumber}...\n`);

    const args = ["pr", "merge", prNumber, `--${mergeMethod}`];
    if (deleteBranch) {
      args.push("--delete-branch");
    }

    const result = runGh(args);

    if (!result.success) {
      console.error("\n  Error merging PR:", result.stderr);
    } else {
      console.log("  PR merged successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error merging PR:", (error as Error).message);
    await pressEnterToContinue();
  }
}

async function addComment(): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    const comment = await input({
      message: "Comment:",
      validate: (v) => (v.length > 0 ? true : "Comment is required"),
    });

    console.log("\n  Adding comment...\n");

    const result = runGh(["pr", "comment", prNumber, "--body", comment]);

    if (!result.success) {
      console.error("\n  Error adding comment:", result.stderr);
    } else {
      console.log("  Comment added successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error adding comment:", (error as Error).message);
    await pressEnterToContinue();
  }
}

async function reviewPR(): Promise<void> {
  try {
    const prNumber = await input({
      message: "PR number to review:",
      validate: (v) => {
        if (!v) return "PR number is required";
        if (isNaN(parseInt(v))) return "Must be a number";
        return true;
      },
    });

    const reviewType = await select({
      message: "Review type:",
      choices: [
        { name: "✅ Approve", value: "approve" },
        { name: "💬 Comment", value: "comment" },
        { name: "🔄 Request changes", value: "request-changes" },
      ],
    });

    const body = await input({
      message: "Review message (optional):",
      default: "",
    });

    console.log("\n  Submitting review...\n");

    const args = ["pr", "review", prNumber, `--${reviewType}`];
    if (body) {
      args.push("--body", body);
    }

    const result = runGh(args);

    if (!result.success) {
      console.error("\n  Error submitting review:", result.stderr);
    } else {
      console.log("  Review submitted successfully!\n");
    }

    await pressEnterToContinue();
  } catch (error) {
    console.error("\n  Error submitting review:", (error as Error).message);
    await pressEnterToContinue();
  }
}
