import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import type { TestCase } from '../types';
import { startRun, stopRun, getCurrentRun, addSseClient } from '../services/testRunner';
import { getLocalInterfaces } from '../services/networkInterfaces';
import { readCache } from '../services/vxvaultFetcher';

const router = Router();
const VALID_TEST_CASES: TestCase[] = ['appControl', 'generalWeb', 'malware'];

router.post('/start', async (req, res) => {
  const { testCases, sourceIps, repeatCount, customLists = {} } = req.body;

  // 409 check first — spec requires this to take priority
  if (getCurrentRun()?.status === 'running')
    return res.status(409).json({ error: 'A run is already active' }) as any;

  if (!Array.isArray(testCases) || testCases.length === 0)
    return res.status(400).json({ error: 'testCases must be a non-empty array' }) as any;
  if (testCases.some((tc: unknown) => !VALID_TEST_CASES.includes(tc as TestCase)))
    return res.status(400).json({ error: 'Invalid test case value' }) as any;
  if (!Array.isArray(sourceIps) || sourceIps.length === 0)
    return res.status(400).json({ error: 'sourceIps must be a non-empty array' }) as any;
  if (!Number.isInteger(repeatCount) || repeatCount < 1)
    return res.status(400).json({ error: 'repeatCount must be an integer >= 1' }) as any;

  const validIps = getLocalInterfaces().map((i) => i.ip);
  const badIp = (sourceIps as string[]).find((ip) => !validIps.includes(ip));
  if (badIp) return res.status(400).json({ error: `Unknown source IP: ${badIp}` }) as any;

  for (const tc of testCases as TestCase[]) {
    const choice = (customLists[tc] as string | undefined) ?? 'builtin';
    if (choice === 'custom') {
      try { await fs.access(path.resolve(`uploads/${tc}.json`)); }
      catch { return res.status(400).json({ error: `No custom list for ${tc}` }) as any; }
    }
    if (tc === 'malware' && choice === 'builtin') {
      const cache = await readCache();
      if (!cache || cache.urls.length === 0)
        return res.status(400).json({ error: 'vxvault cache is empty. Please refresh.' }) as any;
    }
  }

  const runId = await startRun({ testCases, sourceIps, repeatCount, customLists });
  res.json({ runId });
});

router.post('/stop', (_req, res) => {
  const result = stopRun();
  if (result === 'no-active-run') return res.status(404).json({ message: 'no active run' }) as any;
  res.json({ status: 'stopping' });
});

router.get('/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const added = addSseClient(req.params.id, res);
  if (!added) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Run not found' })}\n\n`);
    res.end();
  }
});

export default router;
