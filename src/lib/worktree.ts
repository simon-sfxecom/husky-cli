/**
 * Git Worktree Manager für Husky
 *
 * Manages per-session Git worktrees for isolated agent workspaces.
 * Each session gets its own worktree in .husky/worktrees/sessions/{session-name}/
 * with a corresponding branch husky/{session-name}.
 *
 * Based on Auto-Claude's worktree architecture.
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export class WorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeError";
  }
}

export interface WorktreeStats {
  commitCount: number;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  sessionName: string;
  baseBranch: string;
  isActive: boolean;
  stats: WorktreeStats;
}

export interface ChangedFile {
  status: string;
  file: string;
}

export interface MergeOptions {
  noCommit?: boolean;
  deleteAfter?: boolean;
  message?: string;
}

export class WorktreeManager {
  private projectDir: string;
  private baseBranch: string;
  private worktreesDir: string;

  constructor(projectDir: string, baseBranch?: string) {
    this.projectDir = path.resolve(projectDir);
    this.baseBranch = baseBranch || this.detectBaseBranch();
    this.worktreesDir = path.join(this.projectDir, ".husky", "worktrees", "sessions");
  }

  /**
   * Detect the base branch for worktree creation.
   * Priority: DEFAULT_BRANCH env var > main > master > current branch
   */
  private detectBaseBranch(): string {
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

  private branchExists(branch: string): boolean {
    const result = this.runGit(["rev-parse", "--verify", branch]);
    return result.status === 0;
  }

  private getCurrentBranch(): string {
    const result = this.runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (result.status !== 0) {
      throw new WorktreeError(`Failed to get current branch: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  private runGit(
    args: string[],
    options: { cwd?: string; timeout?: number } = {}
  ): { status: number; stdout: string; stderr: string } {
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
    } catch (error) {
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
  setup(): void {
    fs.mkdirSync(this.worktreesDir, { recursive: true });
  }

  // ==================== Path Helpers ====================

  getWorktreePath(sessionName: string): string {
    return path.join(this.worktreesDir, sessionName);
  }

  getBranchName(sessionName: string): string {
    return `husky/${sessionName}`;
  }

  worktreeExists(sessionName: string): boolean {
    return fs.existsSync(this.getWorktreePath(sessionName));
  }

  // ==================== CRUD Operations ====================

  /**
   * Get info about a session's worktree.
   */
  getWorktree(sessionName: string): WorktreeInfo | null {
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
  private getWorktreeStats(sessionName: string): WorktreeStats {
    const worktreePath = this.getWorktreePath(sessionName);
    const stats: WorktreeStats = {
      commitCount: 0,
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    };

    if (!fs.existsSync(worktreePath)) {
      return stats;
    }

    // Commit count
    const commitResult = this.runGit(
      ["rev-list", "--count", `${this.baseBranch}..HEAD`],
      { cwd: worktreePath }
    );
    if (commitResult.status === 0) {
      stats.commitCount = parseInt(commitResult.stdout.trim() || "0", 10);
    }

    // Diff stats
    const diffResult = this.runGit(
      ["diff", "--shortstat", `${this.baseBranch}...HEAD`],
      { cwd: worktreePath }
    );
    if (diffResult.status === 0 && diffResult.stdout.trim()) {
      // Parse: "3 files changed, 50 insertions(+), 10 deletions(-)"
      const filesMatch = diffResult.stdout.match(/(\d+) files? changed/);
      if (filesMatch) stats.filesChanged = parseInt(filesMatch[1], 10);

      const insertionsMatch = diffResult.stdout.match(/(\d+) insertions?/);
      if (insertionsMatch) stats.additions = parseInt(insertionsMatch[1], 10);

      const deletionsMatch = diffResult.stdout.match(/(\d+) deletions?/);
      if (deletionsMatch) stats.deletions = parseInt(deletionsMatch[1], 10);
    }

    return stats;
  }

  /**
   * Check for branch namespace conflict.
   * Git stores branch refs as files, so a branch named 'husky' blocks 'husky/*'.
   */
  private checkBranchNamespaceConflict(): string | null {
    const result = this.runGit(["rev-parse", "--verify", "husky"]);
    if (result.status === 0) {
      return "husky";
    }
    return null;
  }

  /**
   * Create a worktree for a session.
   */
  createWorktree(sessionName: string): WorktreeInfo {
    this.setup();

    const worktreePath = this.getWorktreePath(sessionName);
    const branchName = this.getBranchName(sessionName);

    // Check for branch namespace conflict
    const conflictingBranch = this.checkBranchNamespaceConflict();
    if (conflictingBranch) {
      throw new WorktreeError(
        `Branch '${conflictingBranch}' exists and blocks creating '${branchName}'.\n` +
          `\n` +
          `Git branch names work like file paths - a branch named 'husky' prevents\n` +
          `creating branches under 'husky/' (like 'husky/${sessionName}').\n` +
          `\n` +
          `Fix: Rename the conflicting branch:\n` +
          `  git branch -m ${conflictingBranch} ${conflictingBranch}-backup`
      );
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
    } else {
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
      throw new WorktreeError(
        `Failed to create worktree for ${sessionName}: ${result.stderr}`
      );
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
  getOrCreateWorktree(sessionName: string): WorktreeInfo {
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
  removeWorktree(sessionName: string, deleteBranch = false): void {
    const worktreePath = this.getWorktreePath(sessionName);
    const branchName = this.getBranchName(sessionName);

    if (fs.existsSync(worktreePath)) {
      const result = this.runGit(["worktree", "remove", "--force", worktreePath]);
      if (result.status === 0) {
        console.log(`Removed worktree: ${sessionName}`);
      } else {
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
  commitInWorktree(sessionName: string, message: string): boolean {
    const worktreePath = this.getWorktreePath(sessionName);
    if (!fs.existsSync(worktreePath)) {
      return false;
    }

    this.runGit(["add", "."], { cwd: worktreePath });
    const result = this.runGit(["commit", "-m", message], { cwd: worktreePath });

    if (result.status === 0) {
      return true;
    } else if (
      result.stdout.includes("nothing to commit") ||
      result.stderr.includes("nothing to commit")
    ) {
      return true;
    } else {
      console.error(`Commit failed: ${result.stderr}`);
      return false;
    }
  }

  /**
   * Merge a session's worktree branch back to base branch.
   */
  mergeWorktree(sessionName: string, options: MergeOptions = {}): boolean {
    const info = this.getWorktree(sessionName);
    if (!info) {
      console.error(`No worktree found for session: ${sessionName}`);
      return false;
    }

    const { noCommit = false, deleteAfter = false, message } = options;

    if (noCommit) {
      console.log(`Merging ${info.branch} into ${this.baseBranch} (staged, not committed)...`);
    } else {
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
    } else {
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
    } else {
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
  hasUncommittedChanges(sessionName?: string): boolean {
    const cwd = sessionName ? this.getWorktreePath(sessionName) : undefined;
    const result = this.runGit(["status", "--porcelain"], { cwd });
    return !!result.stdout.trim();
  }

  // ==================== Listing & Discovery ====================

  /**
   * List all session worktrees.
   */
  listWorktrees(): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];

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
  listBranches(): string[] {
    const result = this.runGit(["branch", "--list", "husky/*"]);
    if (result.status !== 0) {
      return [];
    }

    const branches: string[] = [];
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
  getChangedFiles(sessionName: string): ChangedFile[] {
    const worktreePath = this.getWorktreePath(sessionName);
    if (!fs.existsSync(worktreePath)) {
      return [];
    }

    const result = this.runGit(
      ["diff", "--name-status", `${this.baseBranch}...HEAD`],
      { cwd: worktreePath }
    );

    const files: ChangedFile[] = [];
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) continue;
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
  getChangeSummary(sessionName: string): { newFiles: number; modifiedFiles: number; deletedFiles: number } {
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
  cleanupAll(): void {
    for (const worktree of this.listWorktrees()) {
      this.removeWorktree(worktree.sessionName, true);
    }
  }

  /**
   * Remove worktrees that aren't registered with git.
   */
  cleanupStale(): void {
    if (!fs.existsSync(this.worktreesDir)) {
      return;
    }

    // Get list of registered worktrees
    const result = this.runGit(["worktree", "list", "--porcelain"]);
    const registeredPaths = new Set<string>();

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
  getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Get the base branch.
   */
  getBaseBranch(): string {
    return this.baseBranch;
  }

  /**
   * Get the worktrees directory.
   */
  getWorktreesDir(): string {
    return this.worktreesDir;
  }
}
