import { v4 as uuidv4 } from 'uuid';
import { readFile } from 'fs/promises';
import path from 'path';
import type { ServerResponse } from 'http';
import type {
  RunState, TestCase, UrlEntry, SseEvent,
  RequestEvent, SummaryEvent, DoneEvent, StartRunOptions,
} from '../types';
import { makeRequest } from './httpClient';
import { readCache } from './vxvaultFetcher';

let currentRun: RunState | null = null;
const categorySummaries = new Map<string, { total: number; success: number; failed: number }>();

export function getCurrentRun(): RunState | null {
  return currentRun;
}

export function addSseClient(runId: string, res: ServerResponse): boolean {
  if (!currentRun || currentRun.runId !== runId) return false;
  currentRun.sseClients.add(res);
  return true;
}

function emitEvent(event: SseEvent): void {
  if (!currentRun) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of currentRun.sseClients) {
    try { client.write(data); } catch { /* client disconnected */ }
  }
}

function closeAllClients(): void {
  if (!currentRun) return;
  for (const client of currentRun.sseClients) {
    try { client.end(); } catch { /* already closed */ }
  }
  currentRun.sseClients.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadUrlList(testCase: TestCase, useCustom: boolean): Promise<UrlEntry[]> {
  if (useCustom) {
    const data = await readFile(path.resolve(`uploads/${testCase}.json`), 'utf-8');
    return JSON.parse(data) as UrlEntry[];
  }
  if (testCase === 'malware') {
    const cache = await readCache();
    if (!cache || cache.urls.length === 0) throw new Error('vxvault cache is empty');
    return cache.urls;
  }
  try {
    const data = await readFile(path.resolve(`uploads/${testCase}-builtin.json`), 'utf-8');
    return JSON.parse(data) as UrlEntry[];
  } catch {
    const data = await readFile(path.resolve(`src/data/${testCase}.json`), 'utf-8');
    return JSON.parse(data) as UrlEntry[];
  }
}

export async function startRun(options: StartRunOptions): Promise<string> {
  const runId = uuidv4();
  currentRun = {
    runId,
    status: 'running',
    stopRequested: false,
    sseClients: new Set(),
  };
  categorySummaries.clear();

  executeRun(runId, options).catch(console.error);

  return runId;
}

async function executeRun(runId: string, options: StartRunOptions): Promise<void> {
  await sleep(500);
  if (!currentRun || currentRun.runId !== runId) return;

  // Build combined URL list
  const allUrls: (UrlEntry & { testCase: TestCase })[] = [];
  for (const tc of options.testCases) {
    const useCustom = options.customLists[tc] === 'custom';
    const urls = await loadUrlList(tc, useCustom);
    for (const u of urls) allUrls.push({ ...u, testCase: tc });
  }

  // Append heavy app URLs when requested (doubles their frequency in the pool)
  if (options.heavyApps && options.testCases.includes('appControl')) {
    const heavyData = await readFile(path.resolve('src/data/appControlHeavy.json'), 'utf-8');
    const heavyUrls: UrlEntry[] = JSON.parse(heavyData);
    for (const u of heavyUrls) allUrls.push({ ...u, testCase: 'appControl' });
  }

  let totalRequests = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let ipIndex = 0;

  outer: for (let repeat = 0; repeat < options.repeatCount; repeat++) {
    for (const entry of allUrls) {
      if (currentRun.stopRequested) break outer;

      const sourceIp = options.sourceIps[ipIndex % options.sourceIps.length];
      ipIndex++;

      const result = await makeRequest(entry.url, sourceIp);
      const isSuccess = result.statusCode !== null;

      totalRequests++;
      if (isSuccess) totalSuccess++; else totalFailed++;

      const reqEvent: RequestEvent = {
        type: 'request',
        url: entry.url,
        testCase: entry.testCase,
        category: entry.category,
        status: isSuccess ? 'success' : 'failed',
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        sourceIp,
        ...(result.error ? { error: result.error } : {}),
      };
      emitEvent(reqEvent);

      const key = `${entry.testCase}:${entry.category}`;
      const prev = categorySummaries.get(key) ?? { total: 0, success: 0, failed: 0 };
      const updated = {
        total: prev.total + 1,
        success: prev.success + (isSuccess ? 1 : 0),
        failed: prev.failed + (isSuccess ? 0 : 1),
      };
      categorySummaries.set(key, updated);

      const sumEvent: SummaryEvent = {
        type: 'summary',
        testCase: entry.testCase,
        category: entry.category,
        ...updated,
      };
      emitEvent(sumEvent);

      await sleep(1000);
    }
  }

  if (currentRun && currentRun.runId === runId) {
    currentRun.status = currentRun.stopRequested ? 'stopped' : 'completed';
  }

  const doneEvent: DoneEvent = { type: 'done', totalRequests, totalSuccess, totalFailed };
  emitEvent(doneEvent);
  closeAllClients();
}

export function stopRun(): 'stopping' | 'no-active-run' {
  if (!currentRun || currentRun.status !== 'running') return 'no-active-run';
  currentRun.stopRequested = true;
  return 'stopping';
}
