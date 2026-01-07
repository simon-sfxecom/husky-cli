import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import { WorktreeManager } from '../../src/lib/worktree.js';
import { spawnSync } from 'child_process';

/**
 * Integration test for complete worktree workflow.
 * Simulates a typical session: create -> work -> commit -> cleanup
 */
describe('Worktree Workflow Integration', () => {
  let manager: WorktreeManager;
  const testProjectDir = '/home/user/project';

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();

    // Setup test project
    vol.fromJSON({
      [`${testProjectDir}/.git/config`]: '[core]\n',
      [`${testProjectDir}/README.md`]: '# Test Project',
    });

    // Default git mock responses
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      // Branch exists check - main exists
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--verify' && args?.[2] === 'main') {
        return {
          status: 0,
          stdout: 'abc123\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('abc123\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      // No namespace conflict
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--verify' && args?.[2] === 'husky') {
        return {
          status: 128,
          stdout: '',
          stderr: 'fatal: Needed a single revision\n',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('fatal: Needed a single revision\n')],
          signal: null,
        } as any;
      }

      // Default success
      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    manager = new WorktreeManager(testProjectDir, 'main');
  });

  it('should complete full worktree lifecycle', () => {
    const sessionName = 'feature-123';

    // Step 1: Create worktree
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--verify' && args?.[2] === 'husky') {
        return {
          status: 128,
          stdout: '',
          stderr: 'fatal: Needed a single revision\n',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('fatal: Needed a single revision\n')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'add') {
        return {
          status: 0,
          stdout: 'Preparing worktree...\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('Preparing worktree...\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref') {
        return {
          status: 0,
          stdout: 'husky/feature-123\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('husky/feature-123\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'rev-list') {
        return {
          status: 0,
          stdout: '0\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('0\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'diff') {
        return {
          status: 0,
          stdout: '',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('')],
          signal: null,
        } as any;
      }

      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    const worktree = manager.createWorktree(sessionName);

    expect(worktree).toBeDefined();
    expect(worktree.sessionName).toBe(sessionName);
    expect(worktree.branch).toBe('husky/feature-123');
    expect(worktree.stats.commitCount).toBe(0);

    // Step 2: Check for uncommitted changes (should be none initially)
    vol.mkdirSync(worktree.path, { recursive: true });

    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'status' && args?.[1] === '--porcelain') {
        return {
          status: 0,
          stdout: '',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('')],
          signal: null,
        } as any;
      }

      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    let hasChanges = manager.hasUncommittedChanges(sessionName);
    expect(hasChanges).toBe(false);

    // Step 3: Make changes (simulate file modifications)
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'status' && args?.[1] === '--porcelain') {
        return {
          status: 0,
          stdout: 'M README.md\nA new-file.ts\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('M README.md\nA new-file.ts\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    hasChanges = manager.hasUncommittedChanges(sessionName);
    expect(hasChanges).toBe(true);

    // Step 4: Verify worktree info updates
    const updatedWorktree = manager.getWorktree(sessionName);
    expect(updatedWorktree).toBeDefined();
    expect(updatedWorktree?.sessionName).toBe(sessionName);

    // Step 5: List all worktrees (should show our worktree)
    vi.mocked(spawnSync).mockImplementation((cmd, args, options) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref') {
        return {
          status: 0,
          stdout: 'husky/feature-123\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('husky/feature-123\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'rev-list') {
        return {
          status: 0,
          stdout: '0\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('0\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'diff') {
        return {
          status: 0,
          stdout: '',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('')],
          signal: null,
        } as any;
      }

      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    const allWorktrees = manager.listWorktrees();
    expect(allWorktrees.length).toBeGreaterThanOrEqual(1);
    expect(allWorktrees.find(w => w.sessionName === sessionName)).toBeDefined();

    // Step 6: Remove worktree
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    manager.removeWorktree(sessionName, true);

    // Verify git commands were called
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'remove']),
      expect.anything()
    );
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['branch', '-D']),
      expect.anything()
    );
  });

  it('should handle multiple concurrent worktrees', () => {
    const sessions = ['session-1', 'session-2', 'session-3'];

    // Create multiple worktrees
    sessions.forEach(sessionName => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--verify' && args?.[2] === 'husky') {
          return {
            status: 128,
            stdout: '',
            stderr: 'fatal: Needed a single revision\n',
            pid: 1234,
            output: [null, Buffer.from(''), Buffer.from('fatal: Needed a single revision\n')],
            signal: null,
          } as any;
        }

        if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'add') {
          return {
            status: 0,
            stdout: 'Preparing worktree...\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('Preparing worktree...\n'), Buffer.from('')],
            signal: null,
          } as any;
        }

        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref') {
          return {
            status: 0,
            stdout: `husky/${sessionName}\n`,
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from(`husky/${sessionName}\n`), Buffer.from('')],
            signal: null,
          } as any;
        }

        if (cmd === 'git' && args?.[0] === 'rev-list') {
          return {
            status: 0,
            stdout: '0\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('0\n'), Buffer.from('')],
            signal: null,
          } as any;
        }

        if (cmd === 'git' && args?.[0] === 'diff') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from(''), Buffer.from('')],
            signal: null,
          } as any;
        }

        return {
          status: 0,
          stdout: '',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('')],
          signal: null,
        } as any;
      });

      const worktree = manager.createWorktree(sessionName);
      vol.mkdirSync(worktree.path, { recursive: true });

      expect(worktree.sessionName).toBe(sessionName);
      expect(worktree.branch).toBe(`husky/${sessionName}`);
    });

    // List all worktrees
    sessions.forEach(sessionName => {
      vol.mkdirSync(manager.getWorktreePath(sessionName), { recursive: true });
    });

    vi.mocked(spawnSync).mockImplementation((cmd, args, options) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref') {
        const cwd = options?.cwd as string;
        const session = sessions.find(s => cwd?.includes(s));
        if (session) {
          return {
            status: 0,
            stdout: `husky/${session}\n`,
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from(`husky/${session}\n`), Buffer.from('')],
            signal: null,
          } as any;
        }
      }

      if (cmd === 'git' && args?.[0] === 'rev-list') {
        return {
          status: 0,
          stdout: '0\n',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from('0\n'), Buffer.from('')],
          signal: null,
        } as any;
      }

      if (cmd === 'git' && args?.[0] === 'diff') {
        return {
          status: 0,
          stdout: '',
          stderr: '',
          pid: 1234,
          output: [null, Buffer.from(''), Buffer.from('')],
          signal: null,
        } as any;
      }

      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    const allWorktrees = manager.listWorktrees();
    expect(allWorktrees).toHaveLength(3);

    // Verify each session is in the list
    sessions.forEach(sessionName => {
      const found = allWorktrees.find(w => w.sessionName === sessionName);
      expect(found).toBeDefined();
      expect(found?.branch).toBe(`husky/${sessionName}`);
    });
  });
});
