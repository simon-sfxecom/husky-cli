import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { server } from './helpers/mock-api.js';
import { vol } from 'memfs';

// Mock fs module globally with memfs
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock os.homedir to return consistent path for tests
vi.mock('os', async () => {
  const actual = await vi.importActual('os');
  return {
    ...actual,
    homedir: () => '/home/user',
  };
});

// Mock child_process for git command testing
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

// MSW Server Setup
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vol.reset();
});
afterAll(() => server.close());

// Mock process.exit to prevent test termination
const exitMock = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  throw new Error(`process.exit(${code})`);
}) as any);

// Mock console to reduce noise
const originalConsole = { ...console };
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as any;

// Restore console for debugging if needed
export { originalConsole, exitMock };
