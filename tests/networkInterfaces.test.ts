import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';

vi.mock('os');

describe('getLocalInterfaces', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns non-loopback IPv4 addresses', async () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [
        { family: 'IPv4', address: '192.168.1.10', internal: false, netmask: '255.255.255.0', mac: '', cidr: null },
      ],
    } as any);

    const { getLocalInterfaces } = await import('../src/services/networkInterfaces');
    const result = getLocalInterfaces();
    expect(result).toEqual([{ name: 'eth0', ip: '192.168.1.10' }]);
  });

  it('excludes loopback addresses', async () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      lo: [
        { family: 'IPv4', address: '127.0.0.1', internal: true, netmask: '255.0.0.0', mac: '', cidr: null },
      ],
    } as any);

    const { getLocalInterfaces } = await import('../src/services/networkInterfaces');
    expect(getLocalInterfaces()).toEqual([]);
  });

  it('excludes link-local addresses', async () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [
        { family: 'IPv4', address: '169.254.1.1', internal: false, netmask: '255.255.0.0', mac: '', cidr: null },
      ],
    } as any);

    const { getLocalInterfaces } = await import('../src/services/networkInterfaces');
    expect(getLocalInterfaces()).toEqual([]);
  });

  it('excludes IPv6 addresses', async () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [
        { family: 'IPv6', address: '::1', internal: false, netmask: '', mac: '', cidr: null },
      ],
    } as any);

    const { getLocalInterfaces } = await import('../src/services/networkInterfaces');
    expect(getLocalInterfaces()).toEqual([]);
  });

  it('handles multiple interfaces', async () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [{ family: 'IPv4', address: '192.168.1.10', internal: false, netmask: '', mac: '', cidr: null }],
      eth1: [{ family: 'IPv4', address: '10.0.0.5', internal: false, netmask: '', mac: '', cidr: null }],
    } as any);

    const { getLocalInterfaces } = await import('../src/services/networkInterfaces');
    const result = getLocalInterfaces();
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ name: 'eth0', ip: '192.168.1.10' });
    expect(result).toContainEqual({ name: 'eth1', ip: '10.0.0.5' });
  });
});
