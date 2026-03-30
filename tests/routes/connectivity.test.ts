import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/connectivityChecker', () => ({
  checkConnectivity: vi.fn(),
}));

describe('GET /api/connectivity', () => {
  it('returns the connectivity result as JSON', async () => {
    const { checkConnectivity } = await import('../../src/services/connectivityChecker');
    vi.mocked(checkConnectivity).mockResolvedValue({
      ok: true,
      results: [
        { host: '1.1.1.1', reachable: true },
        { host: '8.8.8.8', reachable: false },
      ],
    });

    const { default: router } = await import('../../src/routes/connectivity');
    const app = express();
    app.use('/api/connectivity', router);

    const res = await request(app).get('/api/connectivity');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      results: [
        { host: '1.1.1.1', reachable: true },
        { host: '8.8.8.8', reachable: false },
      ],
    });
  });

  it('returns ok:false when connectivity check fails', async () => {
    const { checkConnectivity } = await import('../../src/services/connectivityChecker');
    vi.mocked(checkConnectivity).mockResolvedValue({
      ok: false,
      results: [
        { host: '1.1.1.1', reachable: false },
        { host: '8.8.8.8', reachable: false },
      ],
    });

    const { default: router } = await import('../../src/routes/connectivity');
    const app = express();
    app.use('/api/connectivity', router);

    const res = await request(app).get('/api/connectivity');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('returns 503 with ok:false when checkConnectivity throws', async () => {
    const { checkConnectivity } = await import('../../src/services/connectivityChecker');
    vi.mocked(checkConnectivity).mockRejectedValue(new Error('unexpected'));

    const { default: router } = await import('../../src/routes/connectivity');
    const app = express();
    app.use('/api/connectivity', router);

    const res = await request(app).get('/api/connectivity');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});
