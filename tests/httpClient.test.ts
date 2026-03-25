import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { makeRequest } from '../src/services/httpClient';

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/slow') {
      // Never respond — triggers timeout
      return;
    }
    if (req.url === '/error') {
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200);
    res.end('OK');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

describe('makeRequest', () => {
  it('returns statusCode 200 for a successful request', async () => {
    const result = await makeRequest(`http://127.0.0.1:${port}/`, '127.0.0.1');
    expect(result.statusCode).toBe(200);
    expect(result.responseTime).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('returns statusCode 500 for server error response', async () => {
    const result = await makeRequest(`http://127.0.0.1:${port}/error`, '127.0.0.1');
    expect(result.statusCode).toBe(500);
  });

  it('returns null statusCode and error on timeout', async () => {
    const result = await makeRequest(`http://127.0.0.1:${port}/slow`, '127.0.0.1', 200);
    expect(result.statusCode).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.responseTime).toBeGreaterThanOrEqual(200);
  }, 5000);

  it('returns null statusCode and error for connection refused', async () => {
    const result = await makeRequest('http://127.0.0.1:1', '127.0.0.1');
    expect(result.statusCode).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('returns null statusCode and error for a malformed URL', async () => {
    const result = await makeRequest('not a valid url', '127.0.0.1');
    expect(result.statusCode).toBeNull();
    expect(result.responseTime).toBe(0);
    expect(result.error).toBeDefined();
  });
});
