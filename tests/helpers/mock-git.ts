import { vi } from 'vitest';
import type { SpawnSyncReturns } from 'child_process';

export function mockGitCommand(
  args: string[],
  stdout = '',
  stderr = '',
  status = 0
) {
  const child_process = await import('child_process');

  vi.spyOn(child_process, 'spawnSync').mockImplementation((cmd, cmdArgs) => {
    if (cmd === 'git' && JSON.stringify(cmdArgs) === JSON.stringify(args)) {
      return {
        status,
        stdout: Buffer.from(stdout),
        stderr: Buffer.from(stderr),
        pid: 1234,
        output: [null, Buffer.from(stdout), Buffer.from(stderr)],
        signal: null,
      } as SpawnSyncReturns<Buffer>;
    }
    // Fall back to original implementation for other commands
    return child_process.spawnSync(cmd, cmdArgs || []);
  });
}
