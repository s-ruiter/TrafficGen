import os from 'os';
import type { NetworkInterface } from '../types';

export function getLocalInterfaces(): NetworkInterface[] {
  const ifaces = os.networkInterfaces();
  const result: NetworkInterface[] = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4') continue;
      if (addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue;
      result.push({ name, ip: addr.address });
    }
  }

  return result;
}
