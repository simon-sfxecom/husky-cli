import { describe, it, expect } from 'vitest';
import { mockApiResponse } from './helpers/mock-api.js';
import { mockConfig, getConfigFromMock } from './helpers/mock-fs.js';

describe('Test Infrastructure', () => {
  it('should setup vitest correctly', () => {
    expect(true).toBe(true);
  });

  it('should mock API responses', async () => {
    mockApiResponse('GET', '/api/test', { message: 'Hello' });

    const response = await fetch('http://localhost:3000/api/test');
    const data = await response.json();

    expect(data).toEqual({ message: 'Hello' });
  });

  it('should mock file system', () => {
    mockConfig({ apiUrl: 'http://test', apiKey: 'key123' });

    const config = getConfigFromMock();

    expect(config).toEqual({ apiUrl: 'http://test', apiKey: 'key123' });
  });
});
