import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock httpClient so tests don't make real requests
vi.mock('../src/services/httpClient', () => ({
  makeRequest: vi.fn().mockResolvedValue({ statusCode: 200, responseTime: 50 }),
}));

// Mock fs so tests don't need real files
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn().mockImplementation((p: string) => {
      if (p.toString().includes('appControl')) {
        return Promise.resolve(JSON.stringify([
          { name: 'Test', url: 'http://example.com', category: 'social' },
        ]));
      }
      if (p.toString().includes('generalWeb')) {
        return Promise.resolve(JSON.stringify([
          { name: 'Test2', url: 'http://example2.com', category: 'news' },
        ]));
      }
      return Promise.reject(new Error('File not found'));
    }),
  };
});

vi.mock('../src/services/vxvaultFetcher', () => ({
  readCache: vi.fn().mockResolvedValue({
    timestamp: '2026-01-01T00:00:00Z',
    urls: [{ name: 'malware.com', url: 'http://malware.com', category: 'malware' }],
  }),
}));

// Speed up tests by mocking setTimeout
vi.useFakeTimers();

describe('testRunner', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { makeRequest } = await import('../src/services/httpClient');
    vi.mocked(makeRequest).mockResolvedValue({ statusCode: 200, responseTime: 50 });
  });

  it('startRun returns a runId string', async () => {
    const { startRun } = await import('../src/services/testRunner');
    const runId = await startRun({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.1'],
      runtimeMinutes: 1,
      customLists: {},
    });
    expect(typeof runId).toBe('string');
    expect(runId.length).toBeGreaterThan(0);
  });

  it('getCurrentRun returns running state after startRun', async () => {
    const { startRun, getCurrentRun } = await import('../src/services/testRunner');
    await startRun({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.1'],
      runtimeMinutes: 1,
      customLists: {},
    });
    const state = getCurrentRun();
    expect(state?.status).toBe('running');
  });

  it('stopRun returns "no-active-run" when no run is active', async () => {
    const { stopRun } = await import('../src/services/testRunner');
    const result = stopRun();
    expect(result).toBe('no-active-run');
  });

  it('stopRun returns "stopping" when a run is active', async () => {
    const { startRun, stopRun } = await import('../src/services/testRunner');
    await startRun({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.1'],
      runtimeMinutes: 1,
      customLists: {},
    });
    const result = stopRun();
    expect(result).toBe('stopping');
  });

  it('emits request and summary SSE events during execution', async () => {
    const { startRun } = await import('../src/services/testRunner');
    const events: any[] = [];

    const mockRes = {
      write: (data: string) => {
        const json = data.replace('data: ', '').trim();
        if (json) events.push(JSON.parse(json));
      },
      end: vi.fn(),
    };

    const { addSseClient } = await import('../src/services/testRunner');
    const runId = await startRun({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.1'],
      runtimeMinutes: 1,
      customLists: {},
    });

    addSseClient(runId, mockRes as any);

    // Advance past 500ms startup delay
    await vi.advanceTimersByTimeAsync(500);
    // Advance 1 minute + buffer to expire deadline, then one more request cycle
    await vi.advanceTimersByTimeAsync(62_000);

    const requestEvents = events.filter(e => e.type === 'request');
    const summaryEvents = events.filter(e => e.type === 'summary');
    const progressEvents = events.filter(e => e.type === 'progress');
    const doneEvents = events.filter(e => e.type === 'done');

    expect(requestEvents.length).toBeGreaterThan(0);
    expect(summaryEvents.length).toBeGreaterThan(0);
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0]).toMatchObject({ type: 'progress', elapsedSeconds: expect.any(Number), totalSeconds: 60 });
    expect(doneEvents.length).toBe(1);
  });
});
