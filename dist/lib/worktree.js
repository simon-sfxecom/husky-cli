/**
 * Git Worktree Manager für Husky
 *
 * Manages per-session Git worktrees for isolated agent workspaces.
 * Each session gets its own worktree in .husky/worktrees/sessions/{session-name}/
 * with a corresponding branch husky/{session-name}.
 *
 * Based on Auto-Claude's worktree architecture.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
export class WorktreeError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorktreeError";
    }
}
export class WorktreeManager {
    projectDir;
    baseBranch;
    worktreesDir;
    constructor(projectDir, baseBranch) {
        this.projectDir = path.resolve(projectDir);
        this.baseBranch = baseBranch || this.detectBaseBranch();
        this.worktreesDir = path.join(this.projectDir, ".husky", "worktrees", "sessions");
    }
    /**
     * Detect the base branch for worktree creation.
     * Priority: DEFAULT_BRANCH env var > main > master > current branch
     */
    detectBaseBranch() {
        // Check DEFAULT_BRANCH env var
        const envBranch = process.env.DEFAULT_BRANCH;
        if (envBranch && this.branchExists(envBranch)) {
            return envBranch;
        }
        // Auto-detect main/master
        for (const branch of ["main", "master"]) {
            if (this.branchExists(branch)) {
                return branch;
            }
        }
        // Fall back to current branch
        const current = this.getCurrentBranch();
        console.warn(`Warning: Could not find 'main' or 'master' branch.`);
        console.warn(`Using current branch '${current}' as base for worktree.`);
        return current;
    }
    branchExists(branch) {
        const result = this.runGit(["rev-parse", "--verify", branch]);
        return result.status === 0;
    }
    getCurrentBranch() {
        const result = this.runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
        if (result.status !== 0) {
            throw new WorktreeError(`Failed to get current branch: ${result.stderr}`);
        }
        return result.stdout.trim();
    }
    runGit(args, options = {}) {
        const cwd = options.cwd || this.projectDir;
        const timeout = options.timeout || 60000;
        try {
            const result = spawnSync("git", args, {
                cwd,
                timeout,
                encoding: "utf-8",
                maxBuffer: 10 * 1024 * 1024, // 10MB
            });
            return {
                status: result.status ?? -1,
                stdout: result.stdout || "",
                stderr: result.stderr || "",
            };
        }
        catch (error) {
            return {
                status: -1,
                stdout: "",
                stderr: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    /**
     * Create worktrees directory if needed.
     */
    setup() {
        fs.mkdirSync(this.worktreesDir, { recursive: true });
    }
    // ==================== Path Helpers ====================
    getWorktreePath(sessionName) {
        return path.join(this.worktreesDir, sessionName);
    }
    getBranchName(sessionName) {
        return `husky/${sessionName}`;
    }
    worktreeExists(sessionName) {
        return fs.existsSync(this.getWorktreePath(sessionName));
    }
    // ==================== CRUD Operations ====================
    /**
     * Get info about a session's worktree.
     */
    getWorktree(sessionName) {
        const worktreePath = this.getWorktreePath(sessionName);
        if (!fs.existsSync(worktreePath)) {
            return null;
        }
        // Verify the branch exists in the worktree
        const result = this.runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: worktreePath });
        if (result.status !== 0) {
            return null;
        }
        const actualBranch = result.stdout.trim();
        const stats = this.getWorktreeStats(sessionName);
        return {
            path: worktreePath,
            branch: actualBranch,
            sessionName,
            baseBranch: this.baseBranch,
            isActive: true,
            stats,
        };
    }
    /**
     * Get diff statistics for a worktree.
     */
    getWorktreeStats(sessionName) {
        const worktreePath = this.getWorktreePath(sessionName);
        const stats = {
            commitCount: 0,
            filesChanged: 0,
            additions: 0,
            deletions: 0,
        };
        if (!fs.existsSync(worktreePath)) {
            return stats;
        }
        // Commit count
        const commitResult = this.runGit(["rev-list", "--count", `${this.baseBranch}..HEAD`], { cwd: worktreePath });
        if (commitResult.status === 0) {
            stats.commitCount = parseInt(commitResult.stdout.trim() || "0", 10);
        }
        // Diff stats
        const diffResult = this.runGit(["diff", "--shortstat", `${this.baseBranch}...HEAD`], { cwd: worktreePath });
        if (diffResult.status === 0 && diffResult.stdout.trim()) {
            // Parse: "3 files changed, 50 insertions(+), 10 deletions(-)"
            const filesMatch = diffResult.stdout.match(/(\d+) files? changed/);
            if (filesMatch)
                stats.filesChanged = parseInt(filesMatch[1], 10);
            const insertionsMatch = diffResult.stdout.match(/(\d+) insertions?/);
            if (insertionsMatch)
                stats.additions = parseInt(insertionsMatch[1], 10);
            const deletionsMatch = diffResult.stdout.match(/(\d+) deletions?/);
            if (deletionsMatch)
                stats.deletions = parseInt(deletionsMatch[1], 10);
        }
        return stats;
    }
    /**
     * Check for branch namespace conflict.
     * Git stores branch refs as files, so a branch named 'husky' blocks 'husky/*'.
     */
    checkBranchNamespaceConflict() {
        const result = this.runGit(["rev-parse", "--verify", "husky"]);
        if (result.status === 0) {
            return "husky";
        }
        return null;
    }
    /**
     * Create a worktree for a session.
     */
    createWorktree(sessionName) {
        this.setup();
        const worktreePath = this.getWorktreePath(sessionName);
        const branchName = this.getBranchName(sessionName);
        // Check for branch namespace conflict
        const conflictingBranch = this.checkBranchNamespaceConflict();
        if (conflictingBranch) {
            throw new WorktreeError(`Branch '${conflictingBranch}' exists and blocks creating '${branchName}'.\n` +
                `\n` +
                `Git branch names work like file paths - a branch named 'husky' prevents\n` +
                `creating branches under 'husky/' (like 'husky/${sessionName}').\n` +
                `\n` +
                `Fix: Rename the conflicting branch:\n` +
                `  git branch -m ${conflictingBranch} ${conflictingBranch}-backup`);
        }
        // Remove existing if present (from crashed previous run)
        if (fs.existsSync(worktreePath)) {
            this.runGit(["worktree", "remove", "--force", worktreePath]);
        }
        // Delete branch if it exists (from previous attempt)
        this.runGit(["branch", "-D", branchName]);
        // Fetch latest from remote
        const fetchResult = this.runGit(["fetch", "origin", this.baseBranch]);
        if (fetchResult.status !== 0) {
            console.warn(`Warning: Could not fetch ${this.baseBranch} from origin`);
        }
        // Determine start point (prefer remote)
        const remoteRef = `origin/${this.baseBranch}`;
        let startPoint = this.baseBranch;
        const checkRemote = this.runGit(["rev-parse", "--verify", remoteRef]);
        if (checkRemote.status === 0) {
            startPoint = remoteRef;
            console.log(`Creating worktree from remote: ${remoteRef}`);
        }
        else {
            console.log(`Using local branch: ${this.baseBranch}`);
        }
        // Create worktree with new branch
        const result = this.runGit([
            "worktree",
            "add",
            "-b",
            branchName,
            worktreePath,
            startPoint,
        ]);
        if (result.status !== 0) {
            throw new WorktreeError(`Failed to create worktree for ${sessionName}: ${result.stderr}`);
        }
        console.log(`Created worktree: ${sessionName} on branch ${branchName}`);
        return {
            path: worktreePath,
            branch: branchName,
            sessionName,
            baseBranch: this.baseBranch,
            isActive: true,
            stats: { commitCount: 0, filesChanged: 0, additions: 0, deletions: 0 },
        };
    }
    /**
     * Get existing worktree or create a new one.
     */
    getOrCreateWorktree(sessionName) {
        const existing = this.getWorktree(sessionName);
        if (existing) {
            console.log(`Using existing worktree: ${existing.path}`);
            return existing;
        }
        return this.createWorktree(sessionName);
    }
    /**
     * Remove a session's worktree.
     */
    removeWorktree(sessionName, deleteBranch = false) {
        const worktreePath = this.getWorktreePath(sessionName);
        const branchName = this.getBranchName(sessionName);
        if (fs.existsSync(worktreePath)) {
            const result = this.runGit(["worktree", "remove", "--force", worktreePath]);
            if (result.status === 0) {
                console.log(`Removed worktree: ${sessionName}`);
            }
            else {
                console.warn(`Warning: Could not remove worktree: ${result.stderr}`);
                // Force remove directory
                fs.rmSync(worktreePath, { recursive: true, force: true });
            }
        }
        if (deleteBranch) {
            this.runGit(["branch", "-D", branchName]);
            console.log(`Deleted branch: ${branchName}`);
        }
        this.runGit(["worktree", "prune"]);
    }
    // ==================== Git Operations ====================
    /**
     * Commit all changes in a session's worktree.
     */
    commitInWorktree(sessionName, message) {
        const worktreePath = this.getWorktreePath(sessionName);
        if (!fs.existsSync(worktreePath)) {
            return false;
        }
        this.runGit(["add", "."], { cwd: worktreePath });
        const result = this.runGit(["commit", "-m", message], { cwd: worktreePath });
        if (result.status === 0) {
            return true;
        }
        else if (result.stdout.includes("nothing to commit") ||
            result.stderr.includes("nothing to commit")) {
            return true;
        }
        else {
            console.error(`Commit failed: ${result.stderr}`);
            return false;
        }
    }
    /**
     * Merge a session's worktree branch back to base branch.
     */
    mergeWorktree(sessionName, options = {}) {
        const info = this.getWorktree(sessionName);
        if (!info) {
            console.error(`No worktree found for session: ${sessionName}`);
            return false;
        }
        const { noCommit = false, deleteAfter = false, message } = options;
        if (noCommit) {
            console.log(`Merging ${info.branch} into ${this.baseBranch} (staged, not committed)...`);
        }
        else {
            console.log(`Merging ${info.branch} into ${this.baseBranch}...`);
        }
        // Switch to base branch in main project
        const checkoutResult = this.runGit(["checkout", this.baseBranch]);
        if (checkoutResult.status !== 0) {
            console.error(`Error: Could not checkout base branch: ${checkoutResult.stderr}`);
            return false;
        }
        // Merge the session branch
        const mergeArgs = ["merge", "--no-ff", info.branch];
        if (noCommit) {
            mergeArgs.push("--no-commit");
        }
        else {
            const mergeMessage = message || `husky: Merge ${info.branch}`;
            mergeArgs.push("-m", mergeMessage);
        }
        const mergeResult = this.runGit(mergeArgs);
        if (mergeResult.status !== 0) {
            console.error("Merge conflict! Aborting merge...");
            this.runGit(["merge", "--abort"]);
            return false;
        }
        if (noCommit) {
            console.log(`Changes from ${info.branch} are now staged.`);
            console.log("Review the changes, then commit when ready:");
            console.log("  git commit -m 'your commit message'");
        }
        else {
            console.log(`Successfully merged ${info.branch}`);
        }
        if (deleteAfter) {
            this.removeWorktree(sessionName, true);
        }
        return true;
    }
    /**
     * Check if there are uncommitted changes.
     */
    hasUncommittedChanges(sessionName) {
        const cwd = sessionName ? this.getWorktreePath(sessionName) : undefined;
        const result = this.runGit(["status", "--porcelain"], { cwd });
        return !!result.stdout.trim();
    }
    // ==================== Listing & Discovery ====================
    /**
     * List all session worktrees.
     */
    listWorktrees() {
        const worktrees = [];
        if (!fs.existsSync(this.worktreesDir)) {
            return worktrees;
        }
        const entries = fs.readdirSync(this.worktreesDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const info = this.getWorktree(entry.name);
                if (info) {
                    worktrees.push(info);
                }
            }
        }
        return worktrees;
    }
    /**
     * List all husky branches (even if worktree removed).
     */
    listBranches() {
        const result = this.runGit(["branch", "--list", "husky/*"]);
        if (result.status !== 0) {
            return [];
        }
        const branches = [];
        for (const line of result.stdout.split("\n")) {
            const branch = line.trim().replace(/^\* /, "");
            if (branch) {
                branches.push(branch);
            }
        }
        return branches;
    }
    /**
     * Get list of changed files in a session's worktree.
     */
    getChangedFiles(sessionName) {
        const worktreePath = this.getWorktreePath(sessionName);
        if (!fs.existsSync(worktreePath)) {
            return [];
        }
        const result = this.runGit(["diff", "--name-status", `${this.baseBranch}...HEAD`], { cwd: worktreePath });
        const files = [];
        for (const line of result.stdout.split("\n")) {
            if (!line.trim())
                continue;
            const parts = line.split("\t");
            if (parts.length >= 2) {
                files.push({ status: parts[0], file: parts[1] });
            }
        }
        return files;
    }
    /**
     * Get a summary of changes in a worktree.
     */
    getChangeSummary(sessionName) {
        const files = this.getChangedFiles(sessionName);
        return {
            newFiles: files.filter((f) => f.status === "A").length,
            modifiedFiles: files.filter((f) => f.status === "M").length,
            deletedFiles: files.filter((f) => f.status === "D").length,
        };
    }
    // ==================== Cleanup ====================
    /**
     * Remove all worktrees and their branches.
     */
    cleanupAll() {
        for (const worktree of this.listWorktrees()) {
            this.removeWorktree(worktree.sessionName, true);
        }
    }
    /**
     * Remove worktrees that aren't registered with git.
     */
    cleanupStale() {
        if (!fs.existsSync(this.worktreesDir)) {
            return;
        }
        // Get list of registered worktrees
        const result = this.runGit(["worktree", "list", "--porcelain"]);
        const registeredPaths = new Set();
        for (const line of result.stdout.split("\n")) {
            if (line.startsWith("worktree ")) {
                registeredPaths.add(line.slice(9));
            }
        }
        // Remove unregistered directories
        const entries = fs.readdirSync(this.worktreesDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(this.worktreesDir, entry.name);
                if (!registeredPaths.has(fullPath)) {
                    console.log(`Removing stale worktree directory: ${entry.name}`);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                }
            }
        }
        this.runGit(["worktree", "prune"]);
    }
    // ==================== Utility ====================
    /**
     * Get the project directory.
     */
    getProjectDir() {
        return this.projectDir;
    }
    /**
     * Get the base branch.
     */
    getBaseBranch() {
        return this.baseBranch;
    }
    /**
     * Get the worktrees directory.
     */
    getWorktreesDir() {
        return this.worktreesDir;
    }
    /**
     * Check if a worktree branch would have merge conflicts with base branch.
     * Uses git merge-tree to simulate the merge without actually doing it.
     */
    checkMergeConflicts(sessionName) {
        const worktreePath = this.getWorktreePath(sessionName);
        const branchName = this.getBranchName(sessionName);
        if (!fs.existsSync(worktreePath)) {
            return {
                hasConflicts: false,
                conflictFiles: [],
                checkedAt: new Date(),
            };
        }
        // Get the merge base
        const mergeBaseResult = this.runGit([
            "merge-base",
            this.baseBranch,
            branchName,
        ]);
        if (mergeBaseResult.status !== 0) {
            // No common ancestor, can't check conflicts
            return {
                hasConflicts: false,
                conflictFiles: [],
                checkedAt: new Date(),
            };
        }
        const mergeBase = mergeBaseResult.stdout.trim();
        // Use git merge-tree to simulate the merge
        const mergeTreeResult = this.runGit([
            "merge-tree",
            mergeBase,
            this.baseBranch,
            branchName,
        ]);
        // Parse the output for conflicts
        const output = mergeTreeResult.stdout;
        const conflictFiles = [];
        // Look for conflict markers in merge-tree output
        // Format: "changed in both" or conflict sections
        const lines = output.split("\n");
        let inConflict = false;
        for (const line of lines) {
            if (line.includes("changed in both") || line.includes("CONFLICT")) {
                inConflict = true;
            }
            // Extract file paths from conflict sections
            if (inConflict && line.match(/^\+\+\+|^---|^@@/)) {
                const fileMatch = line.match(/^\+\+\+ b\/(.+)$/) || line.match(/^--- a\/(.+)$/);
                if (fileMatch && fileMatch[1] && !conflictFiles.includes(fileMatch[1])) {
                    conflictFiles.push(fileMatch[1]);
                }
            }
        }
        // Alternative: use diff to find files changed in both branches
        if (conflictFiles.length === 0 && output.includes("<<<<<<<")) {
            // Parse conflict markers directly
            const conflictMatches = output.matchAll(/\+\+\+ b\/([^\n]+)/g);
            for (const match of conflictMatches) {
                if (match[1] && !conflictFiles.includes(match[1])) {
                    conflictFiles.push(match[1]);
                }
            }
        }
        return {
            hasConflicts: conflictFiles.length > 0 || output.includes("<<<<<<<") || output.includes("CONFLICT"),
            conflictFiles,
            checkedAt: new Date(),
        };
    }
    /**
     * Push the worktree branch to remote.
     */
    pushWorktreeBranch(sessionName, force = false) {
        const branchName = this.getBranchName(sessionName);
        const pushArgs = ["push", "-u", "origin", branchName];
        if (force) {
            pushArgs.splice(1, 0, "--force");
        }
        const result = this.runGit(pushArgs);
        if (result.status !== 0) {
            console.error(`Failed to push branch: ${result.stderr}`);
            return false;
        }
        console.log(`Pushed ${branchName} to origin`);
        return true;
    }
    /**
     * Create a PR for a worktree branch using gh CLI.
     */
    createPullRequest(sessionName, options) {
        const branchName = this.getBranchName(sessionName);
        // Check if gh CLI is available
        const ghCheck = spawnSync("which", ["gh"], { encoding: "utf-8" });
        if (ghCheck.status !== 0) {
            return { success: false, error: "GitHub CLI (gh) not installed" };
        }
        // Create PR
        const prArgs = [
            "pr",
            "create",
            "--base",
            this.baseBranch,
            "--head",
            branchName,
            "--title",
            options.title,
        ];
        if (options.body) {
            prArgs.push("--body", options.body);
        }
        if (options.draft) {
            prArgs.push("--draft");
        }
        const result = spawnSync("gh", prArgs, {
            cwd: this.projectDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        if (result.status !== 0) {
            return { success: false, error: result.stderr || "Failed to create PR" };
        }
        // Extract PR URL from output
        const prUrl = result.stdout.trim();
        return { success: true, prUrl };
    }
}
