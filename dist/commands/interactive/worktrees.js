/**
 * Interactive Mode: Worktrees Module
 *
 * Provides menu-based worktree management for isolated agent workspaces.
 */
import { select, input, confirm } from "@inquirer/prompts";
import { WorktreeManager } from "../../lib/worktree.js";
import { MergeLock, withMergeLock } from "../../lib/merge-lock.js";
import { pressEnterToContinue, truncate } from "./utils.js";
let manager;
function getManager() {
    if (!manager) {
        manager = new WorktreeManager(process.cwd());
    }
    return manager;
}
export async function worktreesMenu() {
    const mgr = getManager();
    const worktrees = mgr.listWorktrees();
    console.log("\n  WORKTREES");
    console.log("  " + "-".repeat(50));
    console.log(`  Base branch: ${mgr.getBaseBranch()}`);
    console.log(`  Active worktrees: ${worktrees.length}`);
    console.log("");
    const menuItems = [
        { name: "📋 List Worktrees", value: "list" },
        { name: "➕ Create Worktree", value: "create" },
        { name: "🔍 View Worktree Details", value: "view" },
        { name: "📊 Show Status", value: "status" },
        { name: "🔀 Merge Worktree", value: "merge" },
        { name: "🗑️  Remove Worktree", value: "remove" },
        { name: "🧹 Cleanup Stale", value: "cleanup" },
        { name: "🌿 List Branches", value: "branches" },
        { name: "← Back", value: "back" },
    ];
    const choice = await select({
        message: "Worktree Action:",
        choices: menuItems,
    });
    switch (choice) {
        case "list":
            await listWorktrees();
            break;
        case "create":
            await createWorktree();
            break;
        case "view":
            await viewWorktree();
            break;
        case "status":
            await showStatus();
            break;
        case "merge":
            await mergeWorktree();
            break;
        case "remove":
            await removeWorktree();
            break;
        case "cleanup":
            await cleanup();
            break;
        case "branches":
            await listBranches();
            break;
        case "back":
            return;
    }
}
async function listWorktrees() {
    const mgr = getManager();
    const worktrees = mgr.listWorktrees();
    console.log("\n  WORKTREES");
    console.log("  " + "-".repeat(70));
    if (worktrees.length === 0) {
        console.log("  No worktrees found.");
        console.log("  Create one with the 'Create Worktree' option.");
    }
    else {
        console.log(`  ${"SESSION".padEnd(20)} ${"BRANCH".padEnd(25)} ${"COMMITS".padEnd(8)} ${"CHANGES"}`);
        console.log("  " + "-".repeat(70));
        for (const wt of worktrees) {
            const changes = `+${wt.stats.additions}/-${wt.stats.deletions} (${wt.stats.filesChanged} files)`;
            console.log(`  ${truncate(wt.sessionName, 18).padEnd(20)} ${truncate(wt.branch, 23).padEnd(25)} ${String(wt.stats.commitCount).padEnd(8)} ${changes}`);
        }
    }
    console.log("");
    await pressEnterToContinue();
}
async function createWorktree() {
    const mgr = getManager();
    const sessionName = await input({
        message: "Session name:",
        validate: (val) => {
            if (!val.trim())
                return "Session name is required";
            if (!/^[a-zA-Z0-9_-]+$/.test(val)) {
                return "Session name can only contain letters, numbers, hyphens, and underscores";
            }
            if (mgr.worktreeExists(val)) {
                return "A worktree with this name already exists";
            }
            return true;
        },
    });
    const baseBranch = await input({
        message: "Base branch (leave empty for default):",
        default: mgr.getBaseBranch(),
    });
    try {
        // Recreate manager with custom base branch if specified
        const actualManager = baseBranch !== mgr.getBaseBranch()
            ? new WorktreeManager(process.cwd(), baseBranch)
            : mgr;
        const info = actualManager.createWorktree(sessionName);
        console.log("\n  ✓ Worktree created successfully!");
        console.log(`    Session:  ${info.sessionName}`);
        console.log(`    Branch:   ${info.branch}`);
        console.log(`    Path:     ${info.path}`);
        console.log("\n  To work in this worktree:");
        console.log(`    cd ${info.path}`);
        console.log("");
    }
    catch (error) {
        console.error("\n  ✗ Error creating worktree:", error instanceof Error ? error.message : error);
    }
    await pressEnterToContinue();
}
async function selectWorktree(message) {
    const mgr = getManager();
    const worktrees = mgr.listWorktrees();
    if (worktrees.length === 0) {
        console.log("\n  No worktrees found.");
        await pressEnterToContinue();
        return null;
    }
    const choices = worktrees.map((wt) => ({
        name: `${wt.sessionName} (${wt.branch})`,
        value: wt.sessionName,
    }));
    choices.push({ name: "← Cancel", value: "__cancel__" });
    const sessionName = await select({
        message,
        choices,
    });
    if (sessionName === "__cancel__")
        return null;
    return mgr.getWorktree(sessionName);
}
async function viewWorktree() {
    const mgr = getManager();
    const info = await selectWorktree("Select worktree to view:");
    if (!info)
        return;
    const changedFiles = mgr.getChangedFiles(info.sessionName);
    const hasUncommitted = mgr.hasUncommittedChanges(info.sessionName);
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
        const maxFiles = 15;
        for (const file of changedFiles.slice(0, maxFiles)) {
            const statusLabel = file.status === "A" ? "[new]" : file.status === "D" ? "[del]" : "[mod]";
            console.log(`    ${statusLabel.padEnd(6)} ${file.file}`);
        }
        if (changedFiles.length > maxFiles) {
            console.log(`    ... and ${changedFiles.length - maxFiles} more`);
        }
    }
    console.log("");
    await pressEnterToContinue();
}
async function showStatus() {
    const mgr = getManager();
    const worktrees = mgr.listWorktrees();
    console.log("\n  WORKTREE STATUS");
    console.log("  " + "-".repeat(50));
    if (worktrees.length === 0) {
        console.log("  No worktrees found.");
    }
    else {
        for (const wt of worktrees) {
            const hasUncommitted = mgr.hasUncommittedChanges(wt.sessionName);
            const statusIcon = hasUncommitted ? "●" : "○";
            const changes = `+${wt.stats.additions}/-${wt.stats.deletions}`;
            console.log(`\n  ${statusIcon} ${wt.sessionName}`);
            console.log(`    Branch: ${wt.branch}`);
            console.log(`    Commits: ${wt.stats.commitCount} | Files: ${wt.stats.filesChanged} | ${changes}`);
            if (hasUncommitted) {
                console.log(`    ⚠ Uncommitted changes`);
            }
        }
    }
    console.log("");
    await pressEnterToContinue();
}
async function mergeWorktree() {
    const mgr = getManager();
    const worktrees = mgr.listWorktrees();
    // Filter to worktrees with commits
    const mergeableWorktrees = worktrees.filter((wt) => wt.stats.commitCount > 0);
    if (mergeableWorktrees.length === 0) {
        console.log("\n  No worktrees have commits to merge.");
        await pressEnterToContinue();
        return;
    }
    const choices = mergeableWorktrees.map((wt) => ({
        name: `${wt.sessionName} (${wt.stats.commitCount} commits, +${wt.stats.additions}/-${wt.stats.deletions})`,
        value: wt.sessionName,
    }));
    choices.push({ name: "← Cancel", value: "__cancel__" });
    const sessionName = await select({
        message: "Select worktree to merge:",
        choices,
    });
    if (sessionName === "__cancel__")
        return;
    const noCommit = await confirm({
        message: "Stage only (no commit)?",
        default: false,
    });
    const deleteAfter = await confirm({
        message: "Delete worktree after successful merge?",
        default: false,
    });
    const info = mgr.getWorktree(sessionName);
    if (!info) {
        console.log("\n  Worktree not found.");
        return;
    }
    try {
        console.log(`\n  Merging ${info.branch} into ${info.baseBranch}...`);
        const success = await withMergeLock(process.cwd(), sessionName, async () => {
            return mgr.mergeWorktree(sessionName, {
                noCommit,
                deleteAfter,
            });
        });
        if (success) {
            console.log("\n  ✓ Merge successful!");
            if (noCommit) {
                console.log("    Changes are staged. Review and commit when ready.");
            }
            if (deleteAfter) {
                console.log("    Worktree and branch have been removed.");
            }
        }
        else {
            console.log("\n  ✗ Merge failed. There may be conflicts.");
        }
    }
    catch (error) {
        console.error("\n  ✗ Error during merge:", error instanceof Error ? error.message : error);
    }
    console.log("");
    await pressEnterToContinue();
}
async function removeWorktree() {
    const mgr = getManager();
    const worktrees = mgr.listWorktrees();
    if (worktrees.length === 0) {
        console.log("\n  No worktrees found.");
        await pressEnterToContinue();
        return;
    }
    const choices = worktrees.map((wt) => {
        const hasUncommitted = mgr.hasUncommittedChanges(wt.sessionName);
        const warning = hasUncommitted ? " ⚠" : "";
        return {
            name: `${wt.sessionName} (${wt.branch})${warning}`,
            value: wt.sessionName,
        };
    });
    choices.push({ name: "← Cancel", value: "__cancel__" });
    const sessionName = await select({
        message: "Select worktree to remove:",
        choices,
    });
    if (sessionName === "__cancel__")
        return;
    const deleteBranch = await confirm({
        message: "Also delete the branch?",
        default: false,
    });
    const shouldContinue = await confirm({
        message: "Are you sure?",
        default: false,
    });
    if (!shouldContinue) {
        console.log("\n  Cancelled.");
        return;
    }
    const info = mgr.getWorktree(sessionName);
    try {
        mgr.removeWorktree(sessionName, deleteBranch);
        console.log(`\n  ✓ Worktree removed: ${sessionName}`);
        if (deleteBranch && info) {
            console.log(`    Branch deleted: ${info.branch}`);
        }
    }
    catch (error) {
        console.error("\n  ✗ Error removing worktree:", error instanceof Error ? error.message : error);
    }
    await pressEnterToContinue();
}
async function cleanup() {
    const mgr = getManager();
    const projectDir = process.cwd();
    console.log("\n  Cleaning up stale worktrees and locks...");
    try {
        mgr.cleanupStale();
        const staleLocks = MergeLock.cleanupStale(projectDir);
        console.log("\n  ✓ Cleanup complete");
        if (staleLocks > 0) {
            console.log(`    Removed ${staleLocks} stale lock(s)`);
        }
    }
    catch (error) {
        console.error("\n  ✗ Error during cleanup:", error instanceof Error ? error.message : error);
    }
    await pressEnterToContinue();
}
async function listBranches() {
    const mgr = getManager();
    const branches = mgr.listBranches();
    const worktrees = mgr.listWorktrees();
    const worktreeSessionNames = new Set(worktrees.map((w) => w.sessionName));
    console.log("\n  HUSKY BRANCHES");
    console.log("  " + "-".repeat(50));
    if (branches.length === 0) {
        console.log("  No husky/* branches found.");
    }
    else {
        for (const branch of branches) {
            const sessionName = branch.replace("husky/", "");
            const hasWorktree = worktreeSessionNames.has(sessionName);
            const marker = hasWorktree ? " [worktree]" : "";
            console.log(`  ${branch}${marker}`);
        }
    }
    console.log("");
    await pressEnterToContinue();
}
