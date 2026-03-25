import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('parseVxvaultText', () => {
  it('extracts valid http and https URLs', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    const text = `; comment line
http://malware.example.com/payload.exe
https://evil.example.org/virus
not-a-url
ftp://wrong-scheme.com
`;
    const result = parseVxvaultText(text);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('http://malware.example.com/payload.exe');
    expect(result[1].url).toBe('https://evil.example.org/virus');
    expect(result.every((r) => r.category === 'malware')).toBe(true);
  });

  it('skips comment lines starting with ;', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    const result = parseVxvaultText('; this is a comment\nhttp://ok.com/x');
    expect(result).toHaveLength(1);
  });

  it('skips empty lines', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    const result = parseVxvaultText('\n\nhttp://ok.com/x\n\n');
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty input', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    expect(parseVxvaultText('')).toEqual([]);
  });
});

describe('readCache', () => {
  it('returns null when cache file does not exist', async () => {
    // Reset module registry so vxvaultFetcher re-imports with the new fs mock
    vi.resetModules();
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    }));
    const { readCache } = await import('../src/services/vxvaultFetcher');
    const result = await readCache();
    expect(result).toBeNull();
    vi.resetModules();
    vi.restoreAllMocks();
  });
});
