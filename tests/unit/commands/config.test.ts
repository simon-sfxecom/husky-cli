import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { getConfig, setConfig } from '../../../src/commands/config.js';

describe('config command', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('getConfig', () => {
    it('should return empty config when file does not exist', () => {
      const config = getConfig();
      expect(config).toEqual({});
    });

    it('should read existing config file', () => {
      // Setup: Create config file with memfs
      vol.fromJSON({
        '/home/user/.husky/config.json': JSON.stringify({
          apiUrl: 'http://localhost:3000',
          apiKey: 'test-key-123456789',
        }),
      });

      const config = getConfig();
      expect(config).toEqual({
        apiUrl: 'http://localhost:3000',
        apiKey: 'test-key-123456789',
      });
    });

    it('should handle corrupted config file gracefully', () => {
      vol.fromJSON({
        '/home/user/.husky/config.json': 'invalid json{',
      });

      const config = getConfig();
      expect(config).toEqual({});
    });
  });

  describe('setConfig', () => {
    it('should set api-url', () => {
      setConfig('apiUrl', 'http://localhost:3000');

      const config = getConfig();
      expect(config.apiUrl).toBe('http://localhost:3000');
    });

    it('should set api-key', () => {
      setConfig('apiKey', 'test-key-123456789');

      const config = getConfig();
      expect(config.apiKey).toBe('test-key-123456789');
    });

    it('should preserve existing config when updating', () => {
      setConfig('apiUrl', 'http://localhost:3000');
      setConfig('apiKey', 'test-key-123456789');

      const config = getConfig();
      expect(config).toEqual({
        apiUrl: 'http://localhost:3000',
        apiKey: 'test-key-123456789',
      });
    });

    it('should create config directory if it does not exist', () => {
      setConfig('apiUrl', 'http://localhost:3000');

      // Verify by reading the config back - if directory wasn't created, this would fail
      const config = getConfig();
      expect(config.apiUrl).toBe('http://localhost:3000');
    });
  });
});
