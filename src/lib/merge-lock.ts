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
  constructor(message: string) {
    super(message);
    this.name = "MergeLockError";
  }
}

interface LockInfo {
  pid: number;
  timestamp: number;
  sessionName: string;
}

export class MergeLock {
  private projectDir: string;
  private sessionName: string;
  private lockFile: string;
  private lockDir: string;
  private isHeldByMe: boolean = false;

  static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  static readonly POLL_INTERVAL = 500; // 500ms

  constructor(projectDir: string, sessionName: string) {
    this.projectDir = path.resolve(projectDir);
    this.sessionName = sessionName;
    this.lockDir = path.join(this.projectDir, ".husky", ".locks");
    this.lockFile = path.join(this.lockDir, `merge-${sessionName}.lock`);
  }

  /**
   * Acquire the merge lock.
   * Returns true if lock acquired, false if timeout.
   */
  async acquire(timeout: number = MergeLock.DEFAULT_TIMEOUT): Promise<boolean> {
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
  private tryAcquire(): boolean {
    const lockInfo: LockInfo = {
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
    } catch (error) {
      // File already exists (lock held by another process)
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if the lock is stale (held by a dead process).
   */
  private isStale(): boolean {
    if (!fs.existsSync(this.lockFile)) {
      return false;
    }

    try {
      const content = fs.readFileSync(this.lockFile, "utf-8");
      const lockInfo: LockInfo = JSON.parse(content);

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
    } catch {
      // If we can't read the lock file, assume it's stale
      return true;
    }
  }

  /**
   * Check if a process exists.
   */
  private processExists(pid: number): boolean {
    try {
      // Sending signal 0 doesn't kill the process, just checks if it exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Release the lock.
   */
  release(): void {
    if (!this.isHeldByMe) {
      return;
    }

    try {
      fs.unlinkSync(this.lockFile);
    } catch {
      // Ignore errors during cleanup
    }

    this.isHeldByMe = false;
  }

  /**
   * Force release the lock (for stale lock cleanup).
   */
  private forceRelease(): void {
    try {
      fs.unlinkSync(this.lockFile);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if this lock instance holds the lock.
   */
  isHeld(): boolean {
    return this.isHeldByMe;
  }

  /**
   * Check if the lock file exists (held by any process).
   */
  isLocked(): boolean {
    return fs.existsSync(this.lockFile);
  }

  /**
   * Get information about the current lock holder.
   */
  getLockInfo(): LockInfo | null {
    if (!fs.existsSync(this.lockFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.lockFile, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all stale locks in a project.
   */
  static cleanupStale(projectDir: string): number {
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
  static listLocks(projectDir: string): Array<{ sessionName: string; info: LockInfo }> {
    const lockDir = path.join(projectDir, ".husky", ".locks");

    if (!fs.existsSync(lockDir)) {
      return [];
    }

    const locks: Array<{ sessionName: string; info: LockInfo }> = [];
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
export async function withMergeLock<T>(
  projectDir: string,
  sessionName: string,
  fn: () => Promise<T>,
  timeout?: number
): Promise<T> {
  const lock = new MergeLock(projectDir, sessionName);

  const acquired = await lock.acquire(timeout);
  if (!acquired) {
    throw new MergeLockError(`Could not acquire merge lock for ${sessionName} within timeout`);
  }

  try {
    return await fn();
  } finally {
    lock.release();
  }
}
