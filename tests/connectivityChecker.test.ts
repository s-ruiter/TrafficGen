import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { checkConnectivity } from '../src/services/connectivityChecker';

let server: http.Server;
let reachableUrl: string;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('OK');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      reachableUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => { server.close(); });

const unreachableUrl = 'http://127.0.0.1:1'; // port 1 is never open

describe('checkConnectivity', () => {
  it('returns ok:true when at least one host responds', async () => {
    const result = await checkConnectivity([reachableUrl, unreachableUrl]);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].reachable).toBe(true);
    expect(result.results[1].reachable).toBe(false);
  }, 10000);

  it('returns ok:true when both hosts respond', async () => {
    const result = await checkConnectivity([reachableUrl, reachableUrl]);
    expect(result.ok).toBe(true);
    expect(result.results.every(r => r.reachable)).toBe(true);
  });

  it('returns ok:false when all hosts are unreachable', async () => {
    const result = await checkConnectivity([unreachableUrl, unreachableUrl]);
    expect(result.ok).toBe(false);
    expect(result.results.every(r => !r.reachable)).toBe(true);
  }, 10000);

  it('includes the hostname in each result', async () => {
    const result = await checkConnectivity([reachableUrl]);
    expect(result.results[0].host).toBe('127.0.0.1');
  });
});
