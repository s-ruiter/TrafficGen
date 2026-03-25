import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/vxvaultFetcher');

describe('vxvault routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    const { default: router } = await import('../../src/routes/vxvault');
    app = express();
    app.use('/api/vxvault', router);
  });

  it('GET /api/vxvault/status returns null when no cache', async () => {
    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue(null);

    const res = await request(app).get('/api/vxvault/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timestamp: null, count: 0 });
  });

  it('GET /api/vxvault/status returns cache info when cache exists', async () => {
    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue({
      timestamp: '2026-01-01T00:00:00Z',
      urls: [{ name: 'x', url: 'http://x.com', category: 'malware' }],
    });

    const res = await request(app).get('/api/vxvault/status');
    expect(res.body).toEqual({ timestamp: '2026-01-01T00:00:00Z', count: 1 });
  });

  it('POST /api/vxvault/refresh returns updated cache info', async () => {
    const { refreshCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(refreshCache).mockResolvedValue({
      timestamp: '2026-02-01T00:00:00Z',
      urls: Array(50).fill({ name: 'x', url: 'http://x.com', category: 'malware' }),
    });

    const res = await request(app).post('/api/vxvault/refresh');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(50);
  });

  it('POST /api/vxvault/refresh returns 500 on fetch failure', async () => {
    const { refreshCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(refreshCache).mockRejectedValue(new Error('Network error'));

    const res = await request(app).post('/api/vxvault/refresh');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Network error');
  });
});
