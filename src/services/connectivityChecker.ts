import { exec } from 'child_process';

export interface ConnectivityResult {
  ok: boolean;
  results: { host: string; reachable: boolean }[];
}

const DEFAULT_HOSTS = ['1.1.1.1', '8.8.8.8'];

function pingHost(host: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutSec = Math.ceil(timeoutMs / 1000);
    // -c 1: one packet, -W: wait timeout (Linux), -t: timeout (macOS)
    const cmd = `ping -c 1 -W ${timeoutSec} ${host} 2>/dev/null || ping -c 1 -t ${timeoutSec} ${host} 2>/dev/null`;
    exec(cmd, (err) => resolve(!err));
  });
}

export async function checkConnectivity(
  hosts: string[] = DEFAULT_HOSTS,
  timeoutMs = 3000
): Promise<ConnectivityResult> {
  const results = await Promise.all(
    hosts.map(async (host) => {
      const reachable = await pingHost(host, timeoutMs);
      return { host, reachable };
    })
  );
  return { ok: results.some(r => r.reachable), results };
}
