/**
 * Agent Lock Mechanism for Husky Worktrees
 *
 * Prevents multiple agents from working in the same worktree simultaneously.
 * Tracks agent identity (workerId, sessionId) alongside PID for detection.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class AgentLockError extends Error {
  constructor(
    message: string,
    public lockInfo?: AgentLockInfo
  ) {
    super(message);
    this.name = "AgentLockError";
  }
}

export interface AgentLockInfo {
  workerId: string;
  sessionId: string;
  pid: number;
  timestamp: number;
  hostname: string;
  worktreePath: string;
  cwd: string;
}

export class AgentLock {
  private projectDir: string;
  private worktreePath: string;
  private lockFile: string;
  private lockDir: string;
  private isHeldByMe: boolean = false;
  private workerId: string;
  private sessionId: string;

  static readonly STALE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(
    projectDir: string,
    worktreePath: string,
    workerId: string,
    sessionId: string
  ) {
    this.projectDir = path.resolve(projectDir);
    this.worktreePath = worktreePath;
    this.workerId = workerId;
    this.sessionId = sessionId;
    this.lockDir = path.join(this.projectDir, ".husky", ".locks");
    // Use worktree path hash to create unique lock file name
    const worktreeHash = this.hashPath(worktreePath);
    this.lockFile = path.join(this.lockDir, `agent-${worktreeHash}.lock`);
  }

  /**
   * Create a simple hash of a path for lock file naming.
   */
  private hashPath(p: string): string {
    // Simple hash: use last two path segments
    const parts = p.split(path.sep).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
    }
    return parts[parts.length - 1] || "default";
  }

  /**
   * Check if another agent is working in this worktree.
   * Returns the lock info if locked by another agent, null otherwise.
   */
  checkForConflict(): AgentLockInfo | null {
    if (!fs.existsSync(this.lockFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.lockFile, "utf-8");
      const lockInfo: AgentLockInfo = JSON.parse(content);

      // Same agent, same session - no conflict
      if (lockInfo.workerId === this.workerId && lockInfo.sessionId === this.sessionId) {
        return null;
      }

      // Check if the locking process is still running
      if (!this.processExists(lockInfo.pid)) {
        // Process is dead, lock is stale
        return null;
      }

      // Check if lock is too old
      if (this.isStale(lockInfo)) {
        return null;
      }

      // Another agent is actively working here
      return lockInfo;
    } catch {
      // Can't read lock file, assume no conflict
      return null;
    }
  }

  /**
   * Acquire the agent lock for this worktree.
   */
  acquire(): boolean {
    // First check for conflicts
    const conflict = this.checkForConflict();
    if (conflict) {
      throw new AgentLockError(
        `Worktree is already in use by another agent!\n` +
          `  Worker: ${conflict.workerId}\n` +
          `  Session: ${conflict.sessionId}\n` +
          `  PID: ${conflict.pid}\n` +
          `  Since: ${new Date(conflict.timestamp).toISOString()}\n` +
          `  Host: ${conflict.hostname}`,
        conflict
      );
    }

    // Clean up stale lock if exists
    if (fs.existsSync(this.lockFile)) {
      try {
        const content = fs.readFileSync(this.lockFile, "utf-8");
        const lockInfo: AgentLockInfo = JSON.parse(content);
        if (!this.processExists(lockInfo.pid) || this.isStale(lockInfo)) {
          fs.unlinkSync(this.lockFile);
        }
      } catch {
        // Ignore errors, try to acquire anyway
      }
    }

    // Create lock directory
    fs.mkdirSync(this.lockDir, { recursive: true });

    const lockInfo: AgentLockInfo = {
      workerId: this.workerId,
      sessionId: this.sessionId,
      pid: process.pid,
      timestamp: Date.now(),
      hostname: os.hostname(),
      worktreePath: this.worktreePath,
      cwd: process.cwd(),
    };

    try {
      // Use exclusive flag for atomic creation
      const fd = fs.openSync(
        this.lockFile,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
      );
      fs.writeSync(fd, JSON.stringify(lockInfo, null, 2));
      fs.closeSync(fd);
      this.isHeldByMe = true;
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        // File was created between our check and acquire attempt
        // Re-check for conflict
        const newConflict = this.checkForConflict();
        if (newConflict) {
          throw new AgentLockError(
            `Worktree was just locked by another agent!\n` +
              `  Worker: ${newConflict.workerId}\n` +
              `  Session: ${newConflict.sessionId}`,
            newConflict
          );
        }
        // Stale lock, try to remove and retry
        try {
          fs.unlinkSync(this.lockFile);
          return this.acquire();
        } catch {
          return false;
        }
      }
      throw error;
    }
  }

  /**
   * Release the agent lock.
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
   * Update the lock timestamp (heartbeat).
   */
  heartbeat(): void {
    if (!this.isHeldByMe || !fs.existsSync(this.lockFile)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.lockFile, "utf-8");
      const lockInfo: AgentLockInfo = JSON.parse(content);
      lockInfo.timestamp = Date.now();
      fs.writeFileSync(this.lockFile, JSON.stringify(lockInfo, null, 2));
    } catch {
      // Ignore heartbeat errors
    }
  }

  /**
   * Check if a process exists.
   */
  private processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a lock is stale.
   */
  private isStale(lockInfo: AgentLockInfo): boolean {
    const age = Date.now() - lockInfo.timestamp;
    return age > AgentLock.STALE_TIMEOUT;
  }

  /**
   * Get the current lock info.
   */
  getLockInfo(): AgentLockInfo | null {
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
   * Check if the lock file exists.
   */
  isLocked(): boolean {
    return fs.existsSync(this.lockFile);
  }

  /**
   * List all agent locks in a project.
   */
  static listLocks(projectDir: string): Array<{ worktree: string; info: AgentLockInfo; isStale: boolean }> {
    const lockDir = path.join(projectDir, ".husky", ".locks");

    if (!fs.existsSync(lockDir)) {
      return [];
    }

    const locks: Array<{ worktree: string; info: AgentLockInfo; isStale: boolean }> = [];
    const entries = fs.readdirSync(lockDir);

    for (const entry of entries) {
      if (!entry.startsWith("agent-") || !entry.endsWith(".lock")) {
        continue;
      }

      const lockFile = path.join(lockDir, entry);
      try {
        const content = fs.readFileSync(lockFile, "utf-8");
        const info: AgentLockInfo = JSON.parse(content);

        // Check if stale
        let isStale = false;
        try {
          process.kill(info.pid, 0);
          // Process exists, check age
          isStale = Date.now() - info.timestamp > AgentLock.STALE_TIMEOUT;
        } catch {
          // Process doesn't exist
          isStale = true;
        }

        locks.push({
          worktree: info.worktreePath,
          info,
          isStale,
        });
      } catch {
        // Skip invalid lock files
      }
    }

    return locks;
  }

  /**
   * Clean up all stale agent locks.
   */
  static cleanupStale(projectDir: string): number {
    const lockDir = path.join(projectDir, ".husky", ".locks");

    if (!fs.existsSync(lockDir)) {
      return 0;
    }

    let cleaned = 0;
    const entries = fs.readdirSync(lockDir);

    for (const entry of entries) {
      if (!entry.startsWith("agent-") || !entry.endsWith(".lock")) {
        continue;
      }

      const lockFile = path.join(lockDir, entry);
      try {
        const content = fs.readFileSync(lockFile, "utf-8");
        const info: AgentLockInfo = JSON.parse(content);

        let isStale = false;
        try {
          process.kill(info.pid, 0);
          isStale = Date.now() - info.timestamp > AgentLock.STALE_TIMEOUT;
        } catch {
          isStale = true;
        }

        if (isStale) {
          fs.unlinkSync(lockFile);
          cleaned++;
        }
      } catch {
        // Try to remove invalid lock files
        try {
          fs.unlinkSync(lockFile);
          cleaned++;
        } catch {
          // Ignore
        }
      }
    }

    return cleaned;
  }
}

/**
 * Helper to check if a worktree is in use by another agent.
 */
export function checkWorktreeConflict(
  projectDir: string,
  worktreePath: string,
  workerId: string,
  sessionId: string
): AgentLockInfo | null {
  const lock = new AgentLock(projectDir, worktreePath, workerId, sessionId);
  return lock.checkForConflict();
}

/**
 * Helper to acquire an agent lock and run a function.
 */
export async function withAgentLock<T>(
  projectDir: string,
  worktreePath: string,
  workerId: string,
  sessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = new AgentLock(projectDir, worktreePath, workerId, sessionId);

  if (!lock.acquire()) {
    throw new AgentLockError(`Could not acquire agent lock for ${worktreePath}`);
  }

  // Set up heartbeat interval
  const heartbeatInterval = setInterval(() => {
    lock.heartbeat();
  }, 60000); // Every minute

  try {
    return await fn();
  } finally {
    clearInterval(heartbeatInterval);
    lock.release();
  }
}
