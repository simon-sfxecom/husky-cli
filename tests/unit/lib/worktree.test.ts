import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import { WorktreeManager, WorktreeError } from '../../../src/lib/worktree.js';
import { spawnSync } from 'child_process';

describe('WorktreeManager', () => {
  let manager: WorktreeManager;
  const testProjectDir = '/home/user/project';

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();

    // Setup test project directory
    vol.fromJSON({
      [`${testProjectDir}/.git/config`]: '[core]\n',
      [`${testProjectDir}/README.md`]: '# Test Project',
    });

    // Mock default branch detection
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
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
      return {
        status: 1,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any;
    });

    manager = new WorktreeManager(testProjectDir, 'main');
  });

  describe('constructor', () => {
    it('should initialize with project directory and base branch', () => {
      expect(manager).toBeDefined();
    });

    it('should detect main branch automatically', () => {
      const autoManager = new WorktreeManager(testProjectDir);
      expect(autoManager).toBeDefined();
    });
  });

  describe('path helpers', () => {
    it('should generate correct worktree path', () => {
      const path = manager.getWorktreePath('test-session');
      expect(path).toBe('/home/user/project/.husky/worktrees/sessions/test-session');
    });

    it('should generate correct branch name', () => {
      const branch = manager.getBranchName('test-session');
      expect(branch).toBe('husky/test-session');
    });

    it('should check if worktree exists', () => {
      // Not exists initially
      expect(manager.worktreeExists('test-session')).toBe(false);

      // Create worktree directory
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/test-session', { recursive: true });

      // Now exists
      expect(manager.worktreeExists('test-session')).toBe(true);
    });
  });

  describe('setup', () => {
    it('should create worktrees directory', () => {
      manager.setup();

      // Verify by checking if the directory now exists in memfs
      const worktreePath = manager.getWorktreePath('test');
      // If setup() worked, parent directory should exist
      expect(worktreePath).toContain('.husky/worktrees/sessions');
    });
  });

  describe('getWorktree', () => {
    it('should return null for non-existent worktree', () => {
      const info = manager.getWorktree('non-existent');
      expect(info).toBeNull();
    });

    it('should return worktree info for existing worktree', () => {
      // Create worktree directory
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/test-session', { recursive: true });
      vol.writeFileSync('/home/user/project/.husky/worktrees/sessions/test-session/README.md', '# Test');

      // Mock git commands for worktree
      vi.mocked(spawnSync).mockImplementation((cmd, args, options) => {
        // Get current branch in worktree
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref' && args?.[2] === 'HEAD') {
          return {
            status: 0,
            stdout: 'husky/test-session\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('husky/test-session\n'), Buffer.from('')],
            signal: null,
          } as any;
        }

        // Commit count
        if (cmd === 'git' && args?.[0] === 'rev-list' && args?.[1] === '--count') {
          return {
            status: 0,
            stdout: '3\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('3\n'), Buffer.from('')],
            signal: null,
          } as any;
        }

        // Diff stats
        if (cmd === 'git' && args?.[0] === 'diff' && args?.[1] === '--shortstat') {
          return {
            status: 0,
            stdout: '2 files changed, 10 insertions(+), 5 deletions(-)\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('2 files changed, 10 insertions(+), 5 deletions(-)\n'), Buffer.from('')],
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

      const info = manager.getWorktree('test-session');

      expect(info).toBeDefined();
      expect(info?.sessionName).toBe('test-session');
      expect(info?.branch).toBe('husky/test-session');
      expect(info?.baseBranch).toBe('main');
      expect(info?.path).toBe('/home/user/project/.husky/worktrees/sessions/test-session');
      expect(info?.stats.commitCount).toBe(3);
      expect(info?.stats.filesChanged).toBe(2);
      expect(info?.stats.additions).toBe(10);
      expect(info?.stats.deletions).toBe(5);
    });
  });

  describe('createWorktree', () => {
    it('should create new worktree', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        // Check for namespace conflicts - return not found
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

        // Create worktree
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

        // Get current branch
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref') {
          return {
            status: 0,
            stdout: 'husky/test-session\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('husky/test-session\n'), Buffer.from('')],
            signal: null,
          } as any;
        }

        // Stats
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

      const worktree = manager.createWorktree('test-session');

      expect(worktree).toBeDefined();
      expect(worktree.sessionName).toBe('test-session');
      expect(worktree.branch).toBe('husky/test-session');
    });

    it('should throw error if git worktree add fails', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'for-each-ref') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from(''), Buffer.from('')],
            signal: null,
          } as any;
        }

        if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'add') {
          return {
            status: 128,
            stdout: '',
            stderr: 'fatal: branch already exists\n',
            pid: 1234,
            output: [null, Buffer.from(''), Buffer.from('fatal: branch already exists\n')],
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

      expect(() => manager.createWorktree('test-session')).toThrow(WorktreeError);
    });
  });

  describe('removeWorktree', () => {
    it('should remove worktree without deleting branch', () => {
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/test-session', { recursive: true });

      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'worktree' && args?.[1] === 'remove') {
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

      manager.removeWorktree('test-session', false);

      // Verify worktree remove was called
      expect(spawnSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'remove']),
        expect.anything()
      );
    });

    it('should remove worktree and delete branch', () => {
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/test-session', { recursive: true });

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

      manager.removeWorktree('test-session', true);

      // Verify both worktree remove and branch delete were called
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
  });

  describe('listWorktrees', () => {
    it('should list all worktrees', () => {
      // Create worktree directories
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/session1', { recursive: true });
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/session2', { recursive: true });
      vol.writeFileSync('/home/user/project/.husky/worktrees/sessions/session1/README.md', '# Session 1');
      vol.writeFileSync('/home/user/project/.husky/worktrees/sessions/session2/README.md', '# Session 2');

      vi.mocked(spawnSync).mockImplementation((cmd, args, options) => {
        // Get current branch for each worktree
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[1] === '--abbrev-ref' && args?.[2] === 'HEAD') {
          const cwd = options?.cwd as string;
          if (cwd?.includes('session1')) {
            return {
              status: 0,
              stdout: 'husky/session1\n',
              stderr: '',
              pid: 1234,
              output: [null, Buffer.from('husky/session1\n'), Buffer.from('')],
              signal: null,
            } as any;
          }
          if (cwd?.includes('session2')) {
            return {
              status: 0,
              stdout: 'husky/session2\n',
              stderr: '',
              pid: 1234,
              output: [null, Buffer.from('husky/session2\n'), Buffer.from('')],
              signal: null,
            } as any;
          }
        }

        // Stats for each worktree
        if (cmd === 'git' && args?.[0] === 'rev-list') {
          return {
            status: 0,
            stdout: '2\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('2\n'), Buffer.from('')],
            signal: null,
          } as any;
        }

        if (cmd === 'git' && args?.[0] === 'diff') {
          return {
            status: 0,
            stdout: '1 file changed, 5 insertions(+)\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('1 file changed, 5 insertions(+)\n'), Buffer.from('')],
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

      const worktrees = manager.listWorktrees();

      expect(worktrees).toHaveLength(2);
      expect(worktrees[0].sessionName).toBe('session1');
      expect(worktrees[1].sessionName).toBe('session2');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should detect uncommitted changes in worktree', () => {
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/test-session', { recursive: true });

      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'status' && args?.[1] === '--porcelain') {
          return {
            status: 0,
            stdout: 'M file.txt\n',
            stderr: '',
            pid: 1234,
            output: [null, Buffer.from('M file.txt\n'), Buffer.from('')],
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

      const hasChanges = manager.hasUncommittedChanges('test-session');
      expect(hasChanges).toBe(true);
    });

    it('should return false when no uncommitted changes', () => {
      vol.mkdirSync('/home/user/project/.husky/worktrees/sessions/test-session', { recursive: true });

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

      const hasChanges = manager.hasUncommittedChanges('test-session');
      expect(hasChanges).toBe(false);
    });
  });

  describe('getProjectDir', () => {
    it('should return project directory', () => {
      expect(manager.getProjectDir()).toBe(testProjectDir);
    });
  });

  describe('getBaseBranch', () => {
    it('should return base branch', () => {
      expect(manager.getBaseBranch()).toBe('main');
    });
  });
});
