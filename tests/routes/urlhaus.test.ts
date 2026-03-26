import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/urlhausFetcher');

describe('urlhaus routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    const { default: router } = await import('../../src/routes/urlhaus');
    app = express();
    app.use('/api/urlhaus', router);
  });

  it('GET /api/urlhaus/status returns null when no cache', async () => {
    const { readUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(readUrlhausCache).mockResolvedValue(null);

    const res = await request(app).get('/api/urlhaus/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timestamp: null, count: 0 });
  });

  it('GET /api/urlhaus/status returns cache info when cache exists', async () => {
    const { readUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(readUrlhausCache).mockResolvedValue({
      timestamp: '2026-01-01T00:00:00Z',
      urls: [{ name: 'http://x.com', url: 'http://x.com', category: 'urlhaus' }],
    });

    const res = await request(app).get('/api/urlhaus/status');
    expect(res.body).toEqual({ timestamp: '2026-01-01T00:00:00Z', count: 1 });
  });

  it('POST /api/urlhaus/refresh returns updated cache info', async () => {
    const { refreshUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(refreshUrlhausCache).mockResolvedValue({
      timestamp: '2026-02-01T00:00:00Z',
      urls: Array(75).fill({ name: 'http://x.com', url: 'http://x.com', category: 'urlhaus' }),
    });

    const res = await request(app).post('/api/urlhaus/refresh');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(75);
  });

  it('POST /api/urlhaus/refresh returns 500 on fetch failure', async () => {
    const { refreshUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(refreshUrlhausCache).mockRejectedValue(new Error('API error'));

    const res = await request(app).post('/api/urlhaus/refresh');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('API error');
  });
});
