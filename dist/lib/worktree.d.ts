/**
 * Git Worktree Manager für Husky
 *
 * Manages per-session Git worktrees for isolated agent workspaces.
 * Each session gets its own worktree in .husky/worktrees/sessions/{session-name}/
 * with a corresponding branch husky/{session-name}.
 *
 * Based on Auto-Claude's worktree architecture.
 */
export declare class WorktreeError extends Error {
    constructor(message: string);
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
export declare class WorktreeManager {
    private projectDir;
    private baseBranch;
    private worktreesDir;
    constructor(projectDir: string, baseBranch?: string);
    /**
     * Detect the base branch for worktree creation.
     * Priority: DEFAULT_BRANCH env var > main > master > current branch
     */
    private detectBaseBranch;
    private branchExists;
    private getCurrentBranch;
    private runGit;
    /**
     * Create worktrees directory if needed.
     */
    setup(): void;
    getWorktreePath(sessionName: string): string;
    getBranchName(sessionName: string): string;
    worktreeExists(sessionName: string): boolean;
    /**
     * Get info about a session's worktree.
     */
    getWorktree(sessionName: string): WorktreeInfo | null;
    /**
     * Get diff statistics for a worktree.
     */
    private getWorktreeStats;
    /**
     * Check for branch namespace conflict.
     * Git stores branch refs as files, so a branch named 'husky' blocks 'husky/*'.
     */
    private checkBranchNamespaceConflict;
    /**
     * Create a worktree for a session.
     */
    createWorktree(sessionName: string): WorktreeInfo;
    /**
     * Get existing worktree or create a new one.
     */
    getOrCreateWorktree(sessionName: string): WorktreeInfo;
    /**
     * Remove a session's worktree.
     */
    removeWorktree(sessionName: string, deleteBranch?: boolean): void;
    /**
     * Commit all changes in a session's worktree.
     */
    commitInWorktree(sessionName: string, message: string): boolean;
    /**
     * Merge a session's worktree branch back to base branch.
     */
    mergeWorktree(sessionName: string, options?: MergeOptions): boolean;
    /**
     * Check if there are uncommitted changes.
     */
    hasUncommittedChanges(sessionName?: string): boolean;
    /**
     * List all session worktrees.
     */
    listWorktrees(): WorktreeInfo[];
    /**
     * List all husky branches (even if worktree removed).
     */
    listBranches(): string[];
    /**
     * Get list of changed files in a session's worktree.
     */
    getChangedFiles(sessionName: string): ChangedFile[];
    /**
     * Get a summary of changes in a worktree.
     */
    getChangeSummary(sessionName: string): {
        newFiles: number;
        modifiedFiles: number;
        deletedFiles: number;
    };
    /**
     * Remove all worktrees and their branches.
     */
    cleanupAll(): void;
    /**
     * Remove worktrees that aren't registered with git.
     */
    cleanupStale(): void;
    /**
     * Get the project directory.
     */
    getProjectDir(): string;
    /**
     * Get the base branch.
     */
    getBaseBranch(): string;
    /**
     * Get the worktrees directory.
     */
    getWorktreesDir(): string;
}
