import { Command } from "commander";
import * as path from "path";
import { WorktreeManager, WorktreeInfo } from "../lib/worktree.js";
import { MergeLock, withMergeLock } from "../lib/merge-lock.js";

export const worktreeCommand = new Command("worktree")
  .description("Manage Git worktrees for isolated agent workspaces");

/**
 * Get the project directory (current working directory or specified).
 */
function getProjectDir(options: { project?: string }): string {
  return options.project ? path.resolve(options.project) : process.cwd();
}

/**
 * Get a WorktreeManager instance.
 */
function getManager(options: { project?: string; baseBranch?: string }): WorktreeManager {
  const projectDir = getProjectDir(options);
  return new WorktreeManager(projectDir, options.baseBranch);
}

// husky worktree create <session-name>
worktreeCommand
  .command("create <session-name>")
  .description("Create a new worktree for a session")
  .option("-b, --base-branch <branch>", "Base branch to create from (default: main/master)")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      const manager = getManager(options);
      const info = manager.createWorktree(sessionName);

      if (options.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(`\nWorktree created successfully!`);
        console.log(`  Session:  ${info.sessionName}`);
        console.log(`  Branch:   ${info.branch}`);
        console.log(`  Path:     ${info.path}`);
        console.log(`\nTo work in this worktree:`);
        console.log(`  cd ${info.path}`);
      }
    } catch (error) {
      console.error("Error creating worktree:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree list
worktreeCommand
  .command("list")
  .description("List all worktrees")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const manager = getManager(options);
      const worktrees = manager.listWorktrees();

      if (options.json) {
        console.log(JSON.stringify({ worktrees, baseBranch: manager.getBaseBranch() }, null, 2));
      } else {
        printWorktreeList(worktrees, manager.getBaseBranch());
      }
    } catch (error) {
      console.error("Error listing worktrees:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree info <session-name>
worktreeCommand
  .command("info <session-name>")
  .description("Get detailed info about a worktree")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      const changedFiles = manager.getChangedFiles(sessionName);
      const hasUncommitted = manager.hasUncommittedChanges(sessionName);

      if (options.json) {
        console.log(JSON.stringify({ ...info, changedFiles, hasUncommittedChanges: hasUncommitted }, null, 2));
      } else {
        printWorktreeDetail(info, changedFiles, hasUncommitted);
      }
    } catch (error) {
      console.error("Error getting worktree info:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree cd <session-name>
worktreeCommand
  .command("cd <session-name>")
  .description("Print the path to a worktree (use with: cd $(husky worktree cd <name>))")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .action(async (sessionName, options) => {
    try {
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      // Just print the path so it can be used with cd
      console.log(info.path);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree status [session-name]
worktreeCommand
  .command("status [session-name]")
  .description("Show status of worktree(s)")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      const manager = getManager(options);

      if (sessionName) {
        // Single worktree status
        const info = manager.getWorktree(sessionName);
        if (!info) {
          console.error(`Error: No worktree found for session: ${sessionName}`);
          process.exit(1);
        }

        const changedFiles = manager.getChangedFiles(sessionName);
        const hasUncommitted = manager.hasUncommittedChanges(sessionName);

        if (options.json) {
          console.log(JSON.stringify({ sessionName, changedFiles, hasUncommittedChanges: hasUncommitted, stats: info.stats }, null, 2));
        } else {
          printWorktreeStatus(info, changedFiles, hasUncommitted);
        }
      } else {
        // All worktrees status
        const worktrees = manager.listWorktrees();
        const statuses = worktrees.map((wt) => ({
          ...wt,
          changedFiles: manager.getChangedFiles(wt.sessionName),
          hasUncommittedChanges: manager.hasUncommittedChanges(wt.sessionName),
        }));

        if (options.json) {
          console.log(JSON.stringify({ worktrees: statuses }, null, 2));
        } else {
          for (const status of statuses) {
            printWorktreeStatus(status, status.changedFiles, status.hasUncommittedChanges);
            console.log("");
          }
          if (statuses.length === 0) {
            console.log("No worktrees found.");
          }
        }
      }
    } catch (error) {
      console.error("Error getting status:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree remove <session-name> (alias: delete)
worktreeCommand
  .command("remove <session-name>")
  .alias("delete")
  .description("Remove a worktree (alias: delete)")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--delete-branch", "Also delete the associated branch")
  .option("--force", "Force removal even with uncommitted changes")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      // Check for uncommitted changes unless --force
      if (!options.force && manager.hasUncommittedChanges(sessionName)) {
        console.error(`Error: Worktree has uncommitted changes.`);
        console.error(`Use --force to remove anyway, or commit/stash changes first.`);
        process.exit(1);
      }

      manager.removeWorktree(sessionName, options.deleteBranch);

      if (options.json) {
        console.log(JSON.stringify({ removed: true, sessionName, branchDeleted: !!options.deleteBranch }, null, 2));
      } else {
        console.log(`Worktree removed: ${sessionName}`);
        if (options.deleteBranch) {
          console.log(`Branch deleted: ${info.branch}`);
        }
      }
    } catch (error) {
      console.error("Error removing worktree:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree merge <session-name>
worktreeCommand
  .command("merge <session-name>")
  .description("Merge a worktree branch back to base")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--no-commit", "Stage changes but don't commit")
  .option("--delete-after", "Remove worktree and branch after successful merge")
  .option("-m, --message <message>", "Custom merge commit message")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      const projectDir = getProjectDir(options);
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      // Use merge lock
      const success = await withMergeLock(
        projectDir,
        sessionName,
        async () => {
          return manager.mergeWorktree(sessionName, {
            noCommit: options.noCommit,
            deleteAfter: options.deleteAfter,
            message: options.message,
          });
        }
      );

      if (options.json) {
        console.log(JSON.stringify({ success, sessionName, branch: info.branch, baseBranch: info.baseBranch }, null, 2));
      }

      if (!success) {
        process.exit(1);
      }
    } catch (error) {
      console.error("Error merging worktree:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree cleanup
worktreeCommand
  .command("cleanup")
  .description("Clean up stale worktrees and locks")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--all", "Remove ALL worktrees (with confirmation)")
  .option("--force", "Skip confirmation for --all")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const projectDir = getProjectDir(options);
      const manager = getManager(options);

      if (options.all) {
        const worktrees = manager.listWorktrees();

        if (worktrees.length === 0) {
          console.log("No worktrees to clean up.");
          return;
        }

        if (!options.force) {
          console.log(`This will remove ${worktrees.length} worktree(s) and their branches:`);
          for (const wt of worktrees) {
            console.log(`  - ${wt.sessionName} (${wt.branch})`);
          }
          console.log("\nUse --force to confirm, or remove worktrees individually.");
          process.exit(1);
        }

        manager.cleanupAll();

        if (options.json) {
          console.log(JSON.stringify({ cleaned: worktrees.length, type: "all" }, null, 2));
        } else {
          console.log(`Removed ${worktrees.length} worktree(s)`);
        }
      } else {
        // Just cleanup stale
        manager.cleanupStale();
        const staleLocks = MergeLock.cleanupStale(projectDir);

        if (options.json) {
          console.log(JSON.stringify({ staleLocksRemoved: staleLocks, type: "stale" }, null, 2));
        } else {
          console.log("Cleaned up stale worktrees and locks");
          if (staleLocks > 0) {
            console.log(`  Removed ${staleLocks} stale lock(s)`);
          }
        }
      }
    } catch (error) {
      console.error("Error during cleanup:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree branches
worktreeCommand
  .command("branches")
  .description("List all husky/* branches")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const manager = getManager(options);
      const branches = manager.listBranches();
      const worktrees = manager.listWorktrees();
      const worktreeSessionNames = new Set(worktrees.map((w) => w.sessionName));

      if (options.json) {
        console.log(JSON.stringify({
          branches: branches.map((b) => ({
            name: b,
            hasWorktree: worktreeSessionNames.has(b.replace("husky/", "")),
          })),
        }, null, 2));
      } else {
        console.log("\n  HUSKY BRANCHES");
        console.log("  " + "-".repeat(50));

        if (branches.length === 0) {
          console.log("  No husky/* branches found.");
        } else {
          for (const branch of branches) {
            const sessionName = branch.replace("husky/", "");
            const hasWorktree = worktreeSessionNames.has(sessionName);
            const marker = hasWorktree ? " [worktree]" : "";
            console.log(`  ${branch}${marker}`);
          }
        }

        console.log("");
      }
    } catch (error) {
      console.error("Error listing branches:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Print helpers
function printWorktreeList(worktrees: WorktreeInfo[], baseBranch: string) {
  console.log(`\n  Base branch: ${baseBranch}`);
  console.log("  " + "-".repeat(80));

  if (worktrees.length === 0) {
    console.log("  No worktrees found.");
    console.log("  Create one with: husky worktree create <session-name>");
  } else {
    console.log(
      `  ${"SESSION".padEnd(20)} ${"BRANCH".padEnd(25)} ${"COMMITS".padEnd(8)} ${"CHANGES"}`
    );
    console.log("  " + "-".repeat(80));

    for (const wt of worktrees) {
      const changes = `+${wt.stats.additions}/-${wt.stats.deletions} (${wt.stats.filesChanged} files)`;
      console.log(
        `  ${wt.sessionName.padEnd(20)} ${wt.branch.padEnd(25)} ${String(wt.stats.commitCount).padEnd(8)} ${changes}`
      );
    }
  }

  console.log("");
}

function printWorktreeDetail(
  info: WorktreeInfo,
  changedFiles: Array<{ status: string; file: string }>,
  hasUncommitted: boolean
) {
  console.log(`\n  Worktree: ${info.sessionName}`);
  console.log("  " + "-".repeat(60));
  console.log(`  Path:       ${info.path}`);
  console.log(`  Branch:     ${info.branch}`);
  console.log(`  Base:       ${info.baseBranch}`);
  console.log(`  Active:     ${info.isActive ? "Yes" : "No"}`);

  console.log(`\n  Statistics:`);
  console.log(`    Commits:  ${info.stats.commitCount}`);
  console.log(`    Files:    ${info.stats.filesChanged}`);
  console.log(`    Added:    +${info.stats.additions}`);
  console.log(`    Removed:  -${info.stats.deletions}`);

  if (hasUncommitted) {
    console.log(`\n  ⚠ Has uncommitted changes`);
  }

  if (changedFiles.length > 0) {
    console.log(`\n  Changed files:`);
    const maxFiles = 10;
    for (const file of changedFiles.slice(0, maxFiles)) {
      const statusLabel = file.status === "A" ? "[new]" : file.status === "D" ? "[del]" : "[mod]";
      console.log(`    ${statusLabel.padEnd(6)} ${file.file}`);
    }
    if (changedFiles.length > maxFiles) {
      console.log(`    ... and ${changedFiles.length - maxFiles} more`);
    }
  }

  console.log("");
}

function printWorktreeStatus(
  info: WorktreeInfo,
  changedFiles: Array<{ status: string; file: string }>,
  hasUncommitted: boolean
) {
  const statusIcon = hasUncommitted ? "●" : "○";
  const changes = `+${info.stats.additions}/-${info.stats.deletions}`;

  console.log(`${statusIcon} ${info.sessionName}`);
  console.log(`  Branch: ${info.branch}`);
  console.log(`  Commits: ${info.stats.commitCount} | Files: ${info.stats.filesChanged} | ${changes}`);

  if (hasUncommitted) {
    console.log(`  ⚠ Uncommitted changes`);
  }

  if (changedFiles.length > 0 && changedFiles.length <= 5) {
    for (const file of changedFiles) {
      const statusLabel = file.status === "A" ? "+" : file.status === "D" ? "-" : "~";
      console.log(`  ${statusLabel} ${file.file}`);
    }
  }
}
