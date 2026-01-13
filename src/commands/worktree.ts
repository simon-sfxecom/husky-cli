import { Command } from "commander";
import * as path from "path";
import { WorktreeManager, WorktreeInfo } from "../lib/worktree.js";
import { MergeLock, withMergeLock } from "../lib/merge-lock.js";
import { AgentLock, AgentLockInfo } from "../lib/agent-lock.js";
import { getConfig } from "./config.js";

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
  .option("--task-id <id>", "Link worktree to task and register with dashboard API")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      const manager = getManager(options);
      const info = manager.createWorktree(sessionName);

      // Register with dashboard API if task-id provided
      if (options.taskId) {
        const config = getConfig();
        if (!config.apiUrl) {
          console.warn("Warning: API URL not configured. Worktree created but not registered.");
          console.warn("Run: husky config set api-url <url>");
        } else {
          try {
            const res = await fetch(`${config.apiUrl}/api/tasks/${options.taskId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
              },
              body: JSON.stringify({
                worktreePath: info.path,
                worktreeBranch: info.branch,
              }),
            });

            if (!res.ok) {
              console.warn(`Warning: Failed to register worktree with task (API ${res.status})`);
            } else if (!options.json) {
              console.log(`✓ Registered worktree with task ${options.taskId}`);
            }
          } catch (err) {
            console.warn(`Warning: Failed to register worktree: ${err instanceof Error ? err.message : err}`);
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify({ ...info, taskId: options.taskId }, null, 2));
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
      const projectDir = getProjectDir(options);
      const manager = getManager(options);
      const worktrees = manager.listWorktrees();
      const agentLocks = AgentLock.listLocks(projectDir);

      // Build a map of worktree path to lock info
      const locksByPath = new Map<string, { info: ReturnType<typeof AgentLock.listLocks>[0]["info"]; isStale: boolean }>();
      for (const lock of agentLocks) {
        locksByPath.set(lock.worktree, { info: lock.info, isStale: lock.isStale });
      }

      if (options.json) {
        const worktreesWithLocks = worktrees.map(wt => ({
          ...wt,
          agentLock: locksByPath.get(wt.path) || null,
        }));
        console.log(JSON.stringify({ worktrees: worktreesWithLocks, baseBranch: manager.getBaseBranch(), agentLocks }, null, 2));
      } else {
        printWorktreeList(worktrees, manager.getBaseBranch(), locksByPath);
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
      const projectDir = getProjectDir(options);
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      const changedFiles = manager.getChangedFiles(sessionName);
      const hasUncommitted = manager.hasUncommittedChanges(sessionName);

      // Check for agent lock
      const agentLocks = AgentLock.listLocks(projectDir);
      const agentLock = agentLocks.find(l => l.worktree === info.path) || null;

      if (options.json) {
        console.log(JSON.stringify({ ...info, changedFiles, hasUncommittedChanges: hasUncommitted, agentLock }, null, 2));
      } else {
        printWorktreeDetail(info, changedFiles, hasUncommitted, agentLock);
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
        const staleMergeLocks = MergeLock.cleanupStale(projectDir);
        const staleAgentLocks = AgentLock.cleanupStale(projectDir);

        if (options.json) {
          console.log(JSON.stringify({ staleMergeLocksRemoved: staleMergeLocks, staleAgentLocksRemoved: staleAgentLocks, type: "stale" }, null, 2));
        } else {
          console.log("Cleaned up stale worktrees and locks");
          if (staleMergeLocks > 0) {
            console.log(`  Removed ${staleMergeLocks} stale merge lock(s)`);
          }
          if (staleAgentLocks > 0) {
            console.log(`  Removed ${staleAgentLocks} stale agent lock(s)`);
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
function printWorktreeList(
  worktrees: WorktreeInfo[],
  baseBranch: string,
  locksByPath: Map<string, { info: AgentLockInfo; isStale: boolean }>
) {
  console.log(`\n  Base branch: ${baseBranch}`);
  console.log("  " + "-".repeat(90));

  if (worktrees.length === 0) {
    console.log("  No worktrees found.");
    console.log("  Create one with: husky worktree create <session-name>");
  } else {
    console.log(
      `  ${"SESSION".padEnd(20)} ${"BRANCH".padEnd(25)} ${"COMMITS".padEnd(8)} ${"CHANGES".padEnd(20)} ${"AGENT"}`
    );
    console.log("  " + "-".repeat(90));

    for (const wt of worktrees) {
      const changes = `+${wt.stats.additions}/-${wt.stats.deletions} (${wt.stats.filesChanged} files)`;
      const lock = locksByPath.get(wt.path);
      let agentInfo = "";
      if (lock) {
        if (lock.isStale) {
          agentInfo = `[stale] ${lock.info.workerId}`;
        } else {
          agentInfo = `${lock.info.workerId} (PID: ${lock.info.pid})`;
        }
      }
      console.log(
        `  ${wt.sessionName.padEnd(20)} ${wt.branch.padEnd(25)} ${String(wt.stats.commitCount).padEnd(8)} ${changes.padEnd(20)} ${agentInfo}`
      );
    }
  }

  console.log("");
}

function printWorktreeDetail(
  info: WorktreeInfo,
  changedFiles: Array<{ status: string; file: string }>,
  hasUncommitted: boolean,
  agentLock: { worktree: string; info: AgentLockInfo; isStale: boolean } | null
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

  if (agentLock) {
    console.log(`\n  Agent Lock:`);
    if (agentLock.isStale) {
      console.log(`    Status:   STALE (process no longer running)`);
    } else {
      console.log(`    Status:   ACTIVE`);
    }
    console.log(`    Worker:   ${agentLock.info.workerId}`);
    console.log(`    Session:  ${agentLock.info.sessionId}`);
    console.log(`    PID:      ${agentLock.info.pid}`);
    console.log(`    Host:     ${agentLock.info.hostname}`);
    console.log(`    Since:    ${new Date(agentLock.info.timestamp).toISOString()}`);
  }

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

// ============================================
// DASHBOARD SYNC COMMANDS
// ============================================

// husky worktree sync-stats <session-name> --task-id <id>
worktreeCommand
  .command("sync-stats <session-name>")
  .description("Sync worktree stats to dashboard for a task")
  .requiredOption("--task-id <id>", "Task ID to update")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      // Prepare stats payload
      const worktreeStats = {
        commitCount: info.stats.commitCount,
        filesChanged: info.stats.filesChanged,
        additions: info.stats.additions,
        deletions: info.stats.deletions,
        lastUpdated: new Date().toISOString(),
      };

      // Update task via API
      const res = await fetch(`${config.apiUrl}/api/tasks/${options.taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          worktreePath: info.path,
          worktreeBranch: info.branch,
          worktreeStats,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, taskId: options.taskId, worktreeStats }, null, 2));
      } else {
        console.log(`✓ Synced stats for ${sessionName} to task ${options.taskId}`);
        console.log(`  Commits: ${worktreeStats.commitCount}`);
        console.log(`  Files:   ${worktreeStats.filesChanged}`);
        console.log(`  Changes: +${worktreeStats.additions}/-${worktreeStats.deletions}`);
      }
    } catch (error) {
      console.error("Error syncing stats:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree check-conflicts <session-name> --task-id <id>
worktreeCommand
  .command("check-conflicts <session-name>")
  .description("Check for merge conflicts and sync to dashboard")
  .requiredOption("--task-id <id>", "Task ID to update")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      // Check for conflicts
      const conflictResult = manager.checkMergeConflicts(sessionName);

      // Update task via API
      const res = await fetch(`${config.apiUrl}/api/tasks/${options.taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify({
          worktreeHasConflicts: conflictResult.hasConflicts,
          worktreeConflictFiles: conflictResult.conflictFiles,
          worktreeConflictCheckedAt: conflictResult.checkedAt.toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: options.taskId,
          hasConflicts: conflictResult.hasConflicts,
          conflictFiles: conflictResult.conflictFiles,
          checkedAt: conflictResult.checkedAt.toISOString(),
        }, null, 2));
      } else {
        if (conflictResult.hasConflicts) {
          console.log(`⚠ Conflicts detected in ${sessionName}`);
          console.log(`  Files with conflicts:`);
          for (const file of conflictResult.conflictFiles.slice(0, 5)) {
            console.log(`    - ${file}`);
          }
          if (conflictResult.conflictFiles.length > 5) {
            console.log(`    ... and ${conflictResult.conflictFiles.length - 5} more`);
          }
        } else {
          console.log(`✓ No conflicts in ${sessionName}`);
        }
        console.log(`  Updated task ${options.taskId}`);
      }
    } catch (error) {
      console.error("Error checking conflicts:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree poll-actions
worktreeCommand
  .command("poll-actions")
  .description("Poll for pending worktree actions from dashboard")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--execute", "Execute pending actions immediately")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      // Fetch pending actions
      const res = await fetch(`${config.apiUrl}/api/worktrees/pending`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const pendingActions = data.pendingActions || [];

      if (options.json && !options.execute) {
        console.log(JSON.stringify({ pendingActions }, null, 2));
        return;
      }

      if (pendingActions.length === 0) {
        if (!options.json) {
          console.log("No pending actions.");
        }
        return;
      }

      if (!options.execute) {
        console.log(`\n  PENDING WORKTREE ACTIONS`);
        console.log("  " + "-".repeat(60));
        for (const action of pendingActions) {
          const icon = action.action === "merge" ? "↑" : "✕";
          console.log(`  ${icon} ${action.action.toUpperCase().padEnd(8)} ${action.taskId}`);
          console.log(`    Branch: ${action.worktreeBranch}`);
          console.log(`    Path:   ${action.worktreePath}`);
        }
        console.log("");
        console.log("  Use --execute to process these actions");
        return;
      }

      // Execute pending actions
      const projectDir = getProjectDir(options);
      const results: Array<{ taskId: string; action: string; success: boolean; error?: string }> = [];

      for (const action of pendingActions) {
        console.log(`\nExecuting ${action.action} for task ${action.taskId}...`);

        // Extract session name from branch (e.g., "husky/task-abc123" -> "task-abc123")
        const sessionName = action.worktreeBranch.replace("husky/", "");
        const manager = new WorktreeManager(projectDir);

        let success = false;
        let error: string | undefined;

        try {
          if (action.action === "merge") {
            // Execute merge with lock
            success = await withMergeLock(
              projectDir,
              sessionName,
              async () => {
                return manager.mergeWorktree(sessionName, {
                  deleteAfter: false,
                  message: `husky: Merge ${action.worktreeBranch} (via dashboard)`,
                });
              }
            );

            if (!success) {
              error = "Merge failed - check for conflicts";
            }
          } else if (action.action === "cleanup") {
            // Execute cleanup
            manager.removeWorktree(sessionName, true);
            success = true;
          }
        } catch (err) {
          success = false;
          error = err instanceof Error ? err.message : "Unknown error";
        }

        // Report result to dashboard
        const completeRes = await fetch(`${config.apiUrl}/api/worktrees/${action.taskId}/action`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
          },
          body: JSON.stringify({
            status: success ? "completed" : "failed",
            error,
          }),
        });

        if (!completeRes.ok) {
          console.error(`  Warning: Failed to report status to dashboard`);
        }

        results.push({ taskId: action.taskId, action: action.action, success, error });

        if (success) {
          console.log(`  ✓ ${action.action} completed`);
        } else {
          console.log(`  ✗ ${action.action} failed: ${error}`);
        }
      }

      if (options.json) {
        console.log(JSON.stringify({ results }, null, 2));
      }
    } catch (error) {
      console.error("Error polling actions:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree push <session-name>
worktreeCommand
  .command("push <session-name>")
  .description("Push worktree branch to remote")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("-f, --force", "Force push")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    try {
      // Worker role cannot push - must submit for review
      const config = getConfig();
      const role = config.sessionRole || config.role || "";
      if (role === "worker") {
        console.error("Error: Workers cannot push directly.");
        console.error("Submit for review instead: husky task update <id> --status review");
        console.error("The Reviewer agent will push and create the PR.");
        process.exit(1);
      }

      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      const success = manager.pushWorktreeBranch(sessionName, options.force);

      if (options.json) {
        console.log(JSON.stringify({ success, sessionName, branch: info.branch }, null, 2));
      }

      if (!success) {
        process.exit(1);
      }
    } catch (error) {
      console.error("Error pushing branch:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree pr <session-name>
worktreeCommand
  .command("pr <session-name>")
  .description("Create a pull request for worktree branch")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .requiredOption("-t, --title <title>", "PR title")
  .option("-b, --body <body>", "PR body/description")
  .option("--draft", "Create as draft PR")
  .option("--push", "Push branch before creating PR")
  .option("--task-id <id>", "Task ID to update with PR URL")
  .option("--json", "Output as JSON")
  .action(async (sessionName, options) => {
    const config = getConfig();

    // Worker role cannot create PRs - must submit for review
    const role = config.sessionRole || config.role || "";
    if (role === "worker") {
      console.error("Error: Workers cannot create PRs directly.");
      console.error("Submit for review instead: husky task update <id> --status review");
      console.error("The Reviewer agent will create the PR after code review.");
      process.exit(1);
    }

    try {
      const manager = getManager(options);
      const info = manager.getWorktree(sessionName);

      if (!info) {
        console.error(`Error: No worktree found for session: ${sessionName}`);
        process.exit(1);
      }

      // Push first if requested
      if (options.push) {
        const pushSuccess = manager.pushWorktreeBranch(sessionName);
        if (!pushSuccess) {
          console.error("Failed to push branch");
          process.exit(1);
        }
      }

      // Create PR
      const result = manager.createPullRequest(sessionName, {
        title: options.title,
        body: options.body,
        draft: options.draft,
      });

      if (!result.success) {
        console.error(`Error creating PR: ${result.error}`);
        process.exit(1);
      }

      // Update task with PR URL if specified
      if (options.taskId && config.apiUrl && result.prUrl) {
        try {
          await fetch(`${config.apiUrl}/api/tasks/${options.taskId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              result: {
                prUrl: result.prUrl,
                completedAt: new Date().toISOString(),
              },
            }),
          });
        } catch {
          console.warn("Warning: Could not update task with PR URL");
        }
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          sessionName,
          branch: info.branch,
          prUrl: result.prUrl,
        }, null, 2));
      } else {
        console.log(`✓ Pull request created: ${result.prUrl}`);
        if (options.taskId) {
          console.log(`  Updated task ${options.taskId}`);
        }
      }
    } catch (error) {
      console.error("Error creating PR:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// husky worktree sync-all
worktreeCommand
  .command("sync-all")
  .description("Sync stats and check conflicts for all worktrees with linked tasks")
  .option("-p, --project <path>", "Project directory (default: current directory)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = getConfig();
    if (!config.apiUrl) {
      console.error("Error: API URL not configured. Run: husky config set api-url <url>");
      process.exit(1);
    }

    try {
      const manager = getManager(options);
      const worktrees = manager.listWorktrees();

      if (worktrees.length === 0) {
        console.log("No worktrees found.");
        return;
      }

      // Fetch tasks with worktrees to find linked tasks
      const tasksRes = await fetch(`${config.apiUrl}/api/worktrees`, {
        headers: config.apiKey ? { "x-api-key": config.apiKey } : {},
      });

      if (!tasksRes.ok) {
        throw new Error(`API error: ${tasksRes.status}`);
      }

      const tasksData = await tasksRes.json();
      const tasksByBranch = new Map<string, string>();

      for (const wt of tasksData.worktrees || []) {
        tasksByBranch.set(wt.worktreeBranch, wt.taskId);
      }

      const results: Array<{ sessionName: string; taskId?: string; synced: boolean; hasConflicts?: boolean }> = [];

      for (const wt of worktrees) {
        const taskId = tasksByBranch.get(wt.branch);

        if (!taskId) {
          results.push({ sessionName: wt.sessionName, synced: false });
          continue;
        }

        // Check conflicts
        const conflictResult = manager.checkMergeConflicts(wt.sessionName);

        // Prepare update
        const updatePayload = {
          worktreePath: wt.path,
          worktreeBranch: wt.branch,
          worktreeStats: {
            commitCount: wt.stats.commitCount,
            filesChanged: wt.stats.filesChanged,
            additions: wt.stats.additions,
            deletions: wt.stats.deletions,
            lastUpdated: new Date().toISOString(),
          },
          worktreeHasConflicts: conflictResult.hasConflicts,
          worktreeConflictFiles: conflictResult.conflictFiles,
          worktreeConflictCheckedAt: conflictResult.checkedAt.toISOString(),
        };

        // Update task
        const updateRes = await fetch(`${config.apiUrl}/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
          },
          body: JSON.stringify(updatePayload),
        });

        results.push({
          sessionName: wt.sessionName,
          taskId,
          synced: updateRes.ok,
          hasConflicts: conflictResult.hasConflicts,
        });
      }

      if (options.json) {
        console.log(JSON.stringify({ results }, null, 2));
      } else {
        console.log(`\n  WORKTREE SYNC RESULTS`);
        console.log("  " + "-".repeat(60));

        for (const r of results) {
          const icon = r.synced ? "✓" : r.taskId ? "✗" : "○";
          const conflictIcon = r.hasConflicts ? " ⚠" : "";
          const taskInfo = r.taskId ? ` → ${r.taskId}` : " (no linked task)";
          console.log(`  ${icon} ${r.sessionName}${taskInfo}${conflictIcon}`);
        }

        const synced = results.filter(r => r.synced).length;
        const conflicts = results.filter(r => r.hasConflicts).length;
        console.log("");
        console.log(`  Synced: ${synced}/${results.length}`);
        if (conflicts > 0) {
          console.log(`  With conflicts: ${conflicts}`);
        }
      }
    } catch (error) {
      console.error("Error syncing worktrees:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
