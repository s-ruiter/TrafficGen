import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('fetchUrlhausList', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns only online URLs mapped to UrlEntry', async () => {
    vi.stubEnv('URLHAUS_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query_status: 'ok',
        urls: [
          { url: 'http://malware.example.com/bad.exe', url_status: 'online', threat: 'malware_download' },
          { url: 'http://offline.example.com/gone', url_status: 'offline', threat: 'malware_download' },
          { url: 'http://another.example.com/evil', url_status: 'online', threat: 'malware_download' },
        ],
      }),
    }));

    const { fetchUrlhausList } = await import('../src/services/urlhausFetcher');
    const result = await fetchUrlhausList();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'http://malware.example.com/bad.exe', url: 'http://malware.example.com/bad.exe', category: 'urlhaus' });
    expect(result[1]).toEqual({ name: 'http://another.example.com/evil', url: 'http://another.example.com/evil', category: 'urlhaus' });
  });

  it('throws when URLHAUS_API_KEY is not set', async () => {
    vi.stubEnv('URLHAUS_API_KEY', '');
    const { fetchUrlhausList } = await import('../src/services/urlhausFetcher');
    await expect(fetchUrlhausList()).rejects.toThrow('URLHAUS_API_KEY is not configured');
  });

  it('throws when API returns non-ok response', async () => {
    vi.stubEnv('URLHAUS_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }));
    const { fetchUrlhausList } = await import('../src/services/urlhausFetcher');
    await expect(fetchUrlhausList()).rejects.toThrow('403');
  });
});

describe('readUrlhausCache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when cache file does not exist', async () => {
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    }));
    const { readUrlhausCache } = await import('../src/services/urlhausFetcher');
    const result = await readUrlhausCache();
    expect(result).toBeNull();
    vi.resetModules();
    vi.restoreAllMocks();
  });
});
