import { vol } from 'memfs';
import { join } from 'path';

export function mockConfig(config: { apiUrl?: string; apiKey?: string }) {
  const configDir = join('/home/user', '.husky');
  const configFile = join(configDir, 'config.json');

  vol.fromJSON({
    [configFile]: JSON.stringify(config, null, 2),
  });
}

export function getConfigFromMock() {
  const configFile = join('/home/user', '.husky', 'config.json');
  try {
    return JSON.parse(vol.readFileSync(configFile, 'utf-8') as string);
  } catch {
    return null;
  }
}
