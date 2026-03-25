import http from 'http';
import https from 'https';

export interface RequestResult {
  statusCode: number | null;
  responseTime: number;
  error?: string;
}

export async function makeRequest(
  url: string,
  localAddress: string,
  timeoutMs = 10000
): Promise<RequestResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    let settled = false;

    const settle = (result: RequestResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port
        ? parseInt(parsedUrl.port)
        : isHttps ? 443 : 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      localAddress,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrafficGen/1.0)',
      },
    };

    const req = transport.request(options, (res) => {
      res.resume(); // consume body to release socket
      res.on('end', () => {
        settle({
          statusCode: res.statusCode ?? null,
          responseTime: Date.now() - start,
        });
      });
      res.on('error', (err) => {
        settle({
          statusCode: null,
          responseTime: Date.now() - start,
          error: err.message,
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      settle({
        statusCode: null,
        responseTime: Date.now() - start,
        error: 'Request timed out',
      });
    });

    req.on('error', (err) => {
      settle({
        statusCode: null,
        responseTime: Date.now() - start,
        error: err.message,
      });
    });

    req.end();
  });
}
