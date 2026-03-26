import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/testRunner');
vi.mock('../../src/services/networkInterfaces');
vi.mock('../../src/services/vxvaultFetcher');
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, access: vi.fn().mockResolvedValue(undefined) };
});

describe('Test routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();

    const { getLocalInterfaces } = await import('../../src/services/networkInterfaces');
    vi.mocked(getLocalInterfaces).mockReturnValue([{ name: 'eth0', ip: '192.168.1.10' }]);

    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue({
      timestamp: '2026-01-01T00:00:00Z',
      urls: [{ name: 'x', url: 'http://x.com', category: 'malware' }],
    });

    const { startRun, stopRun, getCurrentRun } = await import('../../src/services/testRunner');
    vi.mocked(startRun).mockResolvedValue('test-run-id');
    vi.mocked(stopRun).mockReturnValue('stopping');
    vi.mocked(getCurrentRun).mockReturnValue(null);

    const { default: router } = await import('../../src/routes/test');
    app = express();
    app.use(express.json());
    app.use('/api/test', router);
  });

  it('POST /api/test/start returns runId for valid request', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe('test-run-id');
  });

  it('POST /api/test/start returns 400 for empty testCases', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: [],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 400 for empty sourceIps', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: [],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 400 for unknown IP', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['1.2.3.4'],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 400 for repeatCount < 1', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 0,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 409 when run is already active', async () => {
    const { getCurrentRun } = await import('../../src/services/testRunner');
    vi.mocked(getCurrentRun).mockReturnValue({
      runId: 'existing',
      status: 'running',
      stopRequested: false,
      sseClients: new Set(),
    });

    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/test/stop returns 200 when run is active', async () => {
    const res = await request(app).post('/api/test/stop');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('stopping');
  });

  it('POST /api/test/stop returns 404 when no active run', async () => {
    const { stopRun } = await import('../../src/services/testRunner');
    vi.mocked(stopRun).mockReturnValue('no-active-run');

    const res = await request(app).post('/api/test/stop');
    expect(res.status).toBe(404);
  });

  it('POST /api/test/start returns 400 when malware selected and vxvault cache is empty', async () => {
    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue(null);

    const res = await request(app).post('/api/test/start').send({
      testCases: ['malware'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vxvault/i);
  });

  it('POST /api/test/start returns 409 before validating body when run is already active', async () => {
    const { getCurrentRun } = await import('../../src/services/testRunner');
    vi.mocked(getCurrentRun).mockReturnValue({
      runId: 'existing',
      status: 'running',
      stopRequested: false,
      sseClients: new Set(),
    });

    // Even with an empty body, 409 should be returned first
    const res = await request(app).post('/api/test/start').send({
      testCases: [],
      sourceIps: [],
      repeatCount: 0,
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/test/start returns 200 when testCases is empty but includeHeavyAppControl is true', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: [],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
      includeHeavyAppControl: true,
    });
    expect(res.status).toBe(200);
  });
});
