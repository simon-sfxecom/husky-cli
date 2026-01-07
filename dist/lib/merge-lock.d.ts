/**
 * Merge Lock Mechanism for Husky Worktrees
 *
 * Provides file-based locking to prevent concurrent merges on the same session.
 * Uses atomic file creation with PID tracking for stale lock detection.
 *
 * Based on Auto-Claude's lock mechanism.
 */
export declare class MergeLockError extends Error {
    constructor(message: string);
}
interface LockInfo {
    pid: number;
    timestamp: number;
    sessionName: string;
}
export declare class MergeLock {
    private projectDir;
    private sessionName;
    private lockFile;
    private lockDir;
    private isHeldByMe;
    static readonly DEFAULT_TIMEOUT = 30000;
    static readonly POLL_INTERVAL = 500;
    constructor(projectDir: string, sessionName: string);
    /**
     * Acquire the merge lock.
     * Returns true if lock acquired, false if timeout.
     */
    acquire(timeout?: number): Promise<boolean>;
    /**
     * Try to acquire the lock atomically.
     */
    private tryAcquire;
    /**
     * Check if the lock is stale (held by a dead process).
     */
    private isStale;
    /**
     * Check if a process exists.
     */
    private processExists;
    /**
     * Release the lock.
     */
    release(): void;
    /**
     * Force release the lock (for stale lock cleanup).
     */
    private forceRelease;
    /**
     * Check if this lock instance holds the lock.
     */
    isHeld(): boolean;
    /**
     * Check if the lock file exists (held by any process).
     */
    isLocked(): boolean;
    /**
     * Get information about the current lock holder.
     */
    getLockInfo(): LockInfo | null;
    /**
     * Sleep helper.
     */
    private sleep;
    /**
     * Cleanup all stale locks in a project.
     */
    static cleanupStale(projectDir: string): number;
    /**
     * List all active locks in a project.
     */
    static listLocks(projectDir: string): Array<{
        sessionName: string;
        info: LockInfo;
    }>;
}
/**
 * Helper function to use MergeLock with async/await cleanup.
 */
export declare function withMergeLock<T>(projectDir: string, sessionName: string, fn: () => Promise<T>, timeout?: number): Promise<T>;
export {};
