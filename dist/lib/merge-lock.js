/**
 * Merge Lock Mechanism for Husky Worktrees
 *
 * Provides file-based locking to prevent concurrent merges on the same session.
 * Uses atomic file creation with PID tracking for stale lock detection.
 *
 * Based on Auto-Claude's lock mechanism.
 */
import * as fs from "fs";
import * as path from "path";
export class MergeLockError extends Error {
    constructor(message) {
        super(message);
        this.name = "MergeLockError";
    }
}
export class MergeLock {
    projectDir;
    sessionName;
    lockFile;
    lockDir;
    isHeldByMe = false;
    static DEFAULT_TIMEOUT = 30000; // 30 seconds
    static POLL_INTERVAL = 500; // 500ms
    constructor(projectDir, sessionName) {
        this.projectDir = path.resolve(projectDir);
        this.sessionName = sessionName;
        this.lockDir = path.join(this.projectDir, ".husky", ".locks");
        this.lockFile = path.join(this.lockDir, `merge-${sessionName}.lock`);
    }
    /**
     * Acquire the merge lock.
     * Returns true if lock acquired, false if timeout.
     */
    async acquire(timeout = MergeLock.DEFAULT_TIMEOUT) {
        // Ensure lock directory exists
        fs.mkdirSync(this.lockDir, { recursive: true });
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (this.tryAcquire()) {
                this.isHeldByMe = true;
                return true;
            }
            // Check for stale lock
            if (this.isStale()) {
                console.log(`Removing stale lock for ${this.sessionName}`);
                this.forceRelease();
                continue;
            }
            // Wait before retrying
            await this.sleep(MergeLock.POLL_INTERVAL);
        }
        return false;
    }
    /**
     * Try to acquire the lock atomically.
     */
    tryAcquire() {
        const lockInfo = {
            pid: process.pid,
            timestamp: Date.now(),
            sessionName: this.sessionName,
        };
        try {
            // Use exclusive flag for atomic creation
            const fd = fs.openSync(this.lockFile, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
            fs.writeSync(fd, JSON.stringify(lockInfo));
            fs.closeSync(fd);
            return true;
        }
        catch (error) {
            // File already exists (lock held by another process)
            if (error.code === "EEXIST") {
                return false;
            }
            throw error;
        }
    }
    /**
     * Check if the lock is stale (held by a dead process).
     */
    isStale() {
        if (!fs.existsSync(this.lockFile)) {
            return false;
        }
        try {
            const content = fs.readFileSync(this.lockFile, "utf-8");
            const lockInfo = JSON.parse(content);
            // Check if process is still running
            if (!this.processExists(lockInfo.pid)) {
                return true;
            }
            // Check if lock is too old (more than 10 minutes)
            const lockAge = Date.now() - lockInfo.timestamp;
            if (lockAge > 10 * 60 * 1000) {
                console.warn(`Lock for ${this.sessionName} is ${Math.round(lockAge / 1000)}s old`);
                return true;
            }
            return false;
        }
        catch {
            // If we can't read the lock file, assume it's stale
            return true;
        }
    }
    /**
     * Check if a process exists.
     */
    processExists(pid) {
        try {
            // Sending signal 0 doesn't kill the process, just checks if it exists
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Release the lock.
     */
    release() {
        if (!this.isHeldByMe) {
            return;
        }
        try {
            fs.unlinkSync(this.lockFile);
        }
        catch {
            // Ignore errors during cleanup
        }
        this.isHeldByMe = false;
    }
    /**
     * Force release the lock (for stale lock cleanup).
     */
    forceRelease() {
        try {
            fs.unlinkSync(this.lockFile);
        }
        catch {
            // Ignore errors
        }
    }
    /**
     * Check if this lock instance holds the lock.
     */
    isHeld() {
        return this.isHeldByMe;
    }
    /**
     * Check if the lock file exists (held by any process).
     */
    isLocked() {
        return fs.existsSync(this.lockFile);
    }
    /**
     * Get information about the current lock holder.
     */
    getLockInfo() {
        if (!fs.existsSync(this.lockFile)) {
            return null;
        }
        try {
            const content = fs.readFileSync(this.lockFile, "utf-8");
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    /**
     * Sleep helper.
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Cleanup all stale locks in a project.
     */
    static cleanupStale(projectDir) {
        const lockDir = path.join(projectDir, ".husky", ".locks");
        if (!fs.existsSync(lockDir)) {
            return 0;
        }
        let cleaned = 0;
        const entries = fs.readdirSync(lockDir);
        for (const entry of entries) {
            if (!entry.startsWith("merge-") || !entry.endsWith(".lock")) {
                continue;
            }
            const lockFile = path.join(lockDir, entry);
            const sessionName = entry.replace("merge-", "").replace(".lock", "");
            const lock = new MergeLock(projectDir, sessionName);
            if (lock.isStale()) {
                console.log(`Cleaning up stale lock: ${sessionName}`);
                lock.forceRelease();
                cleaned++;
            }
        }
        return cleaned;
    }
    /**
     * List all active locks in a project.
     */
    static listLocks(projectDir) {
        const lockDir = path.join(projectDir, ".husky", ".locks");
        if (!fs.existsSync(lockDir)) {
            return [];
        }
        const locks = [];
        const entries = fs.readdirSync(lockDir);
        for (const entry of entries) {
            if (!entry.startsWith("merge-") || !entry.endsWith(".lock")) {
                continue;
            }
            const sessionName = entry.replace("merge-", "").replace(".lock", "");
            const lock = new MergeLock(projectDir, sessionName);
            const info = lock.getLockInfo();
            if (info) {
                locks.push({ sessionName, info });
            }
        }
        return locks;
    }
}
/**
 * Helper function to use MergeLock with async/await cleanup.
 */
export async function withMergeLock(projectDir, sessionName, fn, timeout) {
    const lock = new MergeLock(projectDir, sessionName);
    const acquired = await lock.acquire(timeout);
    if (!acquired) {
        throw new MergeLockError(`Could not acquire merge lock for ${sessionName} within timeout`);
    }
    try {
        return await fn();
    }
    finally {
        lock.release();
    }
}
