import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/networkInterfaces', () => ({
  getLocalInterfaces: vi.fn().mockReturnValue([
    { name: 'eth0', ip: '192.168.1.10' },
    { name: 'eth1', ip: '10.0.0.5' },
  ]),
}));

describe('GET /api/interfaces', () => {
  it('returns a list of network interfaces', async () => {
    const { default: router } = await import('../../src/routes/interfaces');
    const app = express();
    app.use('/api/interfaces', router);

    const res = await request(app).get('/api/interfaces');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { name: 'eth0', ip: '192.168.1.10' },
      { name: 'eth1', ip: '10.0.0.5' },
    ]);
  });
});
