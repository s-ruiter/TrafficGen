import http from 'http';

export interface ConnectivityResult {
  ok: boolean;
  results: { host: string; reachable: boolean }[];
}

const DEFAULT_URLS = ['http://1.1.1.1', 'http://8.8.8.8'];

function probeUrl(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: boolean) => {
      if (!settled) { settled = true; resolve(v); }
    };

    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', () => settle(true));
    });

    req.setTimeout(timeoutMs, () => { settle(false); req.destroy(); });
    req.on('error', () => settle(false));
  });
}

export async function checkConnectivity(
  urls: string[] = DEFAULT_URLS,
  timeoutMs = 3000
): Promise<ConnectivityResult> {
  const results = await Promise.all(
    urls.map(async (url) => {
      const host = new URL(url).hostname;
      const reachable = await probeUrl(url, timeoutMs);
      return { host, reachable };
    })
  );
  return { ok: results.some(r => r.reachable), results };
}
