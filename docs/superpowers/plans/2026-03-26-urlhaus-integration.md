# URLhaus Integration & README Custom Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add URLhaus (abuse.ch) as an independent second malware URL source with its own cache, status bar, and Refresh Now button, alongside an independent checkbox in the malware block; update README with custom-lists documentation.

**Architecture:** URLhaus mirrors the vxvaultFetcher/vxvault-route/frontend-bar pattern exactly. A new `includeUrlhaus` flag flows from the UI checkbox → POST body → `StartRunOptions` → `testRunner.ts`, where cached URLhaus URLs are appended to the malware pool. `dotenv` loads `URLHAUS_API_KEY` from `.env` at server startup.

**Tech Stack:** Node.js 18+, TypeScript, Express, Alpine.js, Vitest, dotenv

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Create | `.env` | `URLHAUS_API_KEY=<key>` (not committed) |
| Create | `.env.example` | Placeholder key |
| Modify | `src/index.ts:1` | Add `import 'dotenv/config'` |
| Create | `src/services/urlhausFetcher.ts` | Fetch, cache, read URLhaus list |
| Create | `tests/urlhausFetcher.test.ts` | Unit tests for service |
| Create | `src/routes/urlhaus.ts` | `/status` and `/refresh` routes |
| Create | `tests/routes/urlhaus.test.ts` | Route tests |
| Modify | `src/server.ts:6-16` | Register `/api/urlhaus` router |
| Modify | `src/types.ts` | Add `UrlhausCache`; add `includeUrlhaus` to `StartRunOptions` |
| Modify | `src/routes/test.ts` | Validate + pass `includeUrlhaus` |
| Modify | `tests/routes/test.test.ts` | Add URLhaus validation tests |
| Modify | `src/services/testRunner.ts` | Append URLhaus URLs to pool |
| Modify | `tests/testRunner.test.ts` | Add URLhaus pool test; mock module |
| Modify | `public/app.js` | State, methods, canStart, startRun |
| Modify | `public/index.html` | URLhaus status bar; malware block restructure |
| Modify | `README.md` | Add Custom Lists section |

---

## Task 1: dotenv setup

**Files:**
- Create: `.env`
- Create: `.env.example`
- Modify: `src/index.ts`

No automated tests for this task — verified by server startup in later tasks.

- [ ] **Step 1: Install dotenv**

```bash
npm install dotenv
```

Expected: `dotenv` appears in `package.json` dependencies.

- [ ] **Step 2: Create `.env`**

```
URLHAUS_API_KEY=a545c83ceb7253a9e88dc57c1f279822cf8ea9cde19229b0
```

- [ ] **Step 3: Create `.env.example`**

```
URLHAUS_API_KEY=your_urlhaus_api_key_here
```

- [ ] **Step 4: Update `src/index.ts` to load dotenv**

Current file content:
```typescript
import { startServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8007;
startServer(PORT).catch(console.error);
```

Replace with:
```typescript
import 'dotenv/config';
import { startServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8007;
startServer(PORT).catch(console.error);
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/index.ts
git commit -m "feat: add dotenv and URLHAUS_API_KEY configuration"
```

Note: do NOT `git add .env` — it is already covered by `*.env` in `.gitignore`.

---

## Task 2: `src/services/urlhausFetcher.ts` + tests

**Files:**
- Create: `src/services/urlhausFetcher.ts`
- Create: `tests/urlhausFetcher.test.ts`

The URLhaus API endpoint is `POST https://urlhaus-api.abuse.ch/v1/urls/recent/` with header `Auth-Key: <key>` and JSON body `{ "limit": 100 }`. Node 18 global `fetch` is used (no extra dependency). Only entries with `url_status === 'online'` are kept. Results are mapped to `UrlEntry` with `category: 'urlhaus'` and cached at `cache/urlhaus-cache.json`.

- [ ] **Step 1: Write the tests**

Create `tests/urlhausFetcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('fetchUrlhausList', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns only online URLs mapped to UrlEntry', async () => {
    vi.stubEnv('URLHAUS_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query_status: 'ok',
        urls: [
          { url: 'http://malware.example.com/bad.exe', url_status: 'online', threat: 'malware_download' },
          { url: 'http://offline.example.com/gone', url_status: 'offline', threat: 'malware_download' },
          { url: 'http://another.example.com/evil', url_status: 'online', threat: 'malware_download' },
        ],
      }),
    }));

    const { fetchUrlhausList } = await import('../src/services/urlhausFetcher');
    const result = await fetchUrlhausList();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'http://malware.example.com/bad.exe', url: 'http://malware.example.com/bad.exe', category: 'urlhaus' });
    expect(result[1]).toEqual({ name: 'http://another.example.com/evil', url: 'http://another.example.com/evil', category: 'urlhaus' });
  });

  it('throws when URLHAUS_API_KEY is not set', async () => {
    vi.stubEnv('URLHAUS_API_KEY', '');
    const { fetchUrlhausList } = await import('../src/services/urlhausFetcher');
    await expect(fetchUrlhausList()).rejects.toThrow('URLHAUS_API_KEY is not configured');
  });

  it('throws when API returns non-ok response', async () => {
    vi.stubEnv('URLHAUS_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }));
    const { fetchUrlhausList } = await import('../src/services/urlhausFetcher');
    await expect(fetchUrlhausList()).rejects.toThrow('403');
  });
});

describe('readUrlhausCache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when cache file does not exist', async () => {
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    }));
    const { readUrlhausCache } = await import('../src/services/urlhausFetcher');
    const result = await readUrlhausCache();
    expect(result).toBeNull();
    vi.resetModules();
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/urlhausFetcher.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create `src/services/urlhausFetcher.ts`**

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { UrlEntry, UrlhausCache } from '../types';

const URLHAUS_URL = 'https://urlhaus-api.abuse.ch/v1/urls/recent/';
const CACHE_PATH = path.resolve('cache/urlhaus-cache.json');

export async function fetchUrlhausList(): Promise<UrlEntry[]> {
  const apiKey = process.env.URLHAUS_API_KEY;
  if (!apiKey) throw new Error('URLHAUS_API_KEY is not configured');

  const response = await fetch(URLHAUS_URL, {
    method: 'POST',
    headers: {
      'Auth-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 100 }),
  });

  if (!response.ok) throw new Error(`URLhaus API error: ${response.status}`);

  const data = await response.json() as { query_status: string; urls: Array<{ url: string; url_status: string }> };
  if (data.query_status !== 'ok') throw new Error(`URLhaus query failed: ${data.query_status}`);

  return data.urls
    .filter(entry => entry.url_status === 'online')
    .slice(0, 100)
    .map(entry => ({ name: entry.url, url: entry.url, category: 'urlhaus' }));
}

export async function refreshUrlhausCache(): Promise<UrlhausCache> {
  const urls = await fetchUrlhausList();
  const cache: UrlhausCache = { timestamp: new Date().toISOString(), urls };
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

export async function readUrlhausCache(): Promise<UrlhausCache | null> {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(data) as UrlhausCache;
  } catch {
    return null;
  }
}
```

Note: `UrlhausCache` is added to `src/types.ts` in Task 4. If TypeScript complains in the build step, that is expected and will be resolved by Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/urlhausFetcher.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/urlhausFetcher.ts tests/urlhausFetcher.test.ts
git commit -m "feat: add URLhaus fetcher service with cache"
```

---

## Task 3: `src/routes/urlhaus.ts` + tests + server registration

**Files:**
- Create: `src/routes/urlhaus.ts`
- Create: `tests/routes/urlhaus.test.ts`
- Modify: `src/server.ts:6-16`

- [ ] **Step 1: Write the route tests**

Create `tests/routes/urlhaus.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/urlhausFetcher');

describe('urlhaus routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    const { default: router } = await import('../../src/routes/urlhaus');
    app = express();
    app.use('/api/urlhaus', router);
  });

  it('GET /api/urlhaus/status returns null when no cache', async () => {
    const { readUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(readUrlhausCache).mockResolvedValue(null);

    const res = await request(app).get('/api/urlhaus/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timestamp: null, count: 0 });
  });

  it('GET /api/urlhaus/status returns cache info when cache exists', async () => {
    const { readUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(readUrlhausCache).mockResolvedValue({
      timestamp: '2026-01-01T00:00:00Z',
      urls: [{ name: 'http://x.com', url: 'http://x.com', category: 'urlhaus' }],
    });

    const res = await request(app).get('/api/urlhaus/status');
    expect(res.body).toEqual({ timestamp: '2026-01-01T00:00:00Z', count: 1 });
  });

  it('POST /api/urlhaus/refresh returns updated cache info', async () => {
    const { refreshUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(refreshUrlhausCache).mockResolvedValue({
      timestamp: '2026-02-01T00:00:00Z',
      urls: Array(75).fill({ name: 'http://x.com', url: 'http://x.com', category: 'urlhaus' }),
    });

    const res = await request(app).post('/api/urlhaus/refresh');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(75);
  });

  it('POST /api/urlhaus/refresh returns 500 on fetch failure', async () => {
    const { refreshUrlhausCache } = await import('../../src/services/urlhausFetcher');
    vi.mocked(refreshUrlhausCache).mockRejectedValue(new Error('API error'));

    const res = await request(app).post('/api/urlhaus/refresh');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('API error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/routes/urlhaus.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create `src/routes/urlhaus.ts`**

```typescript
import { Router } from 'express';
import { readUrlhausCache, refreshUrlhausCache } from '../services/urlhausFetcher';

const router = Router();

router.get('/status', async (_req, res) => {
  const cache = await readUrlhausCache();
  if (!cache) return res.json({ timestamp: null, count: 0 }) as any;
  res.json({ timestamp: cache.timestamp, count: cache.urls.length });
});

router.post('/refresh', async (_req, res) => {
  try {
    const cache = await refreshUrlhausCache();
    res.json({ timestamp: cache.timestamp, count: cache.urls.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 4: Run route tests to verify they pass**

Run: `npx vitest run tests/routes/urlhaus.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Register the router in `src/server.ts`**

Add the import and route registration. Current lines 6–16 of `src/server.ts`:
```typescript
import interfacesRouter from './routes/interfaces';
import urlListsRouter from './routes/urlLists';
import vxvaultRouter from './routes/vxvault';
import testRouter from './routes/test';

const app = express();

app.use(express.json());
app.use(express.static(path.resolve('public')));
app.use('/api/interfaces', interfacesRouter);
app.use('/api/url-lists', urlListsRouter);
app.use('/api/vxvault', vxvaultRouter);
app.use('/api/test', testRouter);
```

Replace with:
```typescript
import interfacesRouter from './routes/interfaces';
import urlListsRouter from './routes/urlLists';
import vxvaultRouter from './routes/vxvault';
import urlhausRouter from './routes/urlhaus';
import testRouter from './routes/test';

const app = express();

app.use(express.json());
app.use(express.static(path.resolve('public')));
app.use('/api/interfaces', interfacesRouter);
app.use('/api/url-lists', urlListsRouter);
app.use('/api/vxvault', vxvaultRouter);
app.use('/api/urlhaus', urlhausRouter);
app.use('/api/test', testRouter);
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: TypeScript errors only for missing `UrlhausCache` type (resolved in Task 4). Route and server code should compile cleanly.

- [ ] **Step 7: Commit**

```bash
git add src/routes/urlhaus.ts tests/routes/urlhaus.test.ts src/server.ts
git commit -m "feat: add URLhaus route and register in server"
```

---

## Task 4: Update `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `UrlhausCache` and `includeUrlhaus`**

Open `src/types.ts`. Make two changes:

**Change 1:** After the `VxvaultCache` interface (lines 61–64), add `UrlhausCache`:

```typescript
export interface UrlhausCache {
  timestamp: string;
  urls: UrlEntry[];
}
```

**Change 2:** In `StartRunOptions`, add `includeUrlhaus?: boolean` after `includeHeavyAppControl`:

```typescript
export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  runtimeMinutes: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
  includeHeavyAppControl?: boolean;
  includeUrlhaus?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npm run build`
Expected: No errors. (All usages of `UrlhausCache` in the new service and route files now resolve correctly.)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add UrlhausCache type and includeUrlhaus to StartRunOptions"
```

---

## Task 5: Update `src/routes/test.ts` + tests

**Files:**
- Modify: `src/routes/test.ts`
- Modify: `tests/routes/test.test.ts`

- [ ] **Step 1: Add URLhaus tests to `tests/routes/test.test.ts`**

The test file currently mocks `vxvaultFetcher` and `testRunner`. Add a mock for `urlhausFetcher` at the top of the file (alongside the existing mocks):

```typescript
vi.mock('../../src/services/urlhausFetcher');
```

In the `beforeEach`, add a default mock for `readUrlhausCache`:

```typescript
const { readUrlhausCache } = await import('../../src/services/urlhausFetcher');
vi.mocked(readUrlhausCache).mockResolvedValue({
  timestamp: '2026-01-01T00:00:00Z',
  urls: [{ name: 'http://x.com', url: 'http://x.com', category: 'urlhaus' }],
});
```

Add these new tests at the end of the `describe` block:

```typescript
it('POST /api/test/start returns 200 when testCases is empty but includeUrlhaus is true', async () => {
  const res = await request(app).post('/api/test/start').send({
    testCases: [],
    sourceIps: ['192.168.1.10'],
    runtimeMinutes: 10,
    includeUrlhaus: true,
  });
  expect(res.status).toBe(200);
});

it('POST /api/test/start returns 400 when includeUrlhaus is true but cache is empty', async () => {
  const { readUrlhausCache } = await import('../../src/services/urlhausFetcher');
  vi.mocked(readUrlhausCache).mockResolvedValue(null);

  const res = await request(app).post('/api/test/start').send({
    testCases: [],
    sourceIps: ['192.168.1.10'],
    runtimeMinutes: 10,
    includeUrlhaus: true,
  });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/urlhaus/i);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/routes/test.test.ts`
Expected: The two new tests fail (route doesn't handle `includeUrlhaus` yet).

- [ ] **Step 3: Update `src/routes/test.ts`**

**Change 1** — Add import at the top of `src/routes/test.ts` (after the existing vxvaultFetcher import on line 7):

```typescript
import { readUrlhausCache } from '../services/urlhausFetcher';
```

**Change 2** — Line 13, add `includeUrlhaus` to the destructuring:

```typescript
const { testCases, sourceIps, runtimeMinutes, customLists = {}, includeHeavyAppControl = false, includeUrlhaus = false } = req.body;
```

**Change 3** — Line 19, extend the empty-testCases guard to allow `includeUrlhaus`:

```typescript
// Before:
if (!Array.isArray(testCases) || (testCases.length === 0 && !includeHeavyAppControl))
  return res.status(400).json({ error: 'testCases must be a non-empty array' }) as any;

// After:
if (!Array.isArray(testCases) || (testCases.length === 0 && !includeHeavyAppControl && !includeUrlhaus))
  return res.status(400).json({ error: 'testCases must be a non-empty array' }) as any;
```

**Change 4** — After the existing malware/vxvault cache check (after the `for` loop, before line 45), add the URLhaus cache validation:

```typescript
if (includeUrlhaus) {
  const cache = await readUrlhausCache();
  if (!cache || cache.urls.length === 0)
    return res.status(400).json({ error: 'URLhaus cache is empty. Please refresh.' }) as any;
}
```

**Change 5** — Line 45, add `includeUrlhaus` to `startRun()` call:

```typescript
const runId = await startRun({ testCases, sourceIps, runtimeMinutes, customLists, includeHeavyAppControl, includeUrlhaus });
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run tests/routes/test.test.ts`
Expected: All 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test.ts tests/routes/test.test.ts
git commit -m "feat: add includeUrlhaus validation in test route"
```

---

## Task 6: Update `src/services/testRunner.ts` + tests

**Files:**
- Modify: `src/services/testRunner.ts`
- Modify: `tests/testRunner.test.ts`

- [ ] **Step 1: Add URLhaus test to `tests/testRunner.test.ts`**

Add the mock for `urlhausFetcher` at the top of the file, alongside the existing mocks:

```typescript
vi.mock('../src/services/urlhausFetcher', () => ({
  readUrlhausCache: vi.fn().mockResolvedValue({
    timestamp: '2026-01-01T00:00:00Z',
    urls: [{ name: 'http://urlhaus.example.com', url: 'http://urlhaus.example.com', category: 'urlhaus' }],
  }),
}));
```

Add this new test inside the `describe('testRunner')` block:

```typescript
it('appends URLhaus URLs to pool when includeUrlhaus is true', async () => {
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
    testCases: [],
    sourceIps: ['192.168.1.1'],
    runtimeMinutes: 1,
    customLists: {},
    includeUrlhaus: true,
  });

  addSseClient(runId, mockRes as any);

  await vi.advanceTimersByTimeAsync(500);
  await vi.advanceTimersByTimeAsync(2100);

  const requestEvents = events.filter(e => e.type === 'request');
  expect(requestEvents.length).toBeGreaterThan(0);
  expect(requestEvents[0].category).toBe('urlhaus');
  expect(requestEvents[0].testCase).toBe('malware');
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `npx vitest run tests/testRunner.test.ts`
Expected: The new test fails (runner doesn't handle `includeUrlhaus` yet).

- [ ] **Step 3: Update `src/services/testRunner.ts`**

**Change 1** — Add `readUrlhausCache` to the import at lines 5–8:

```typescript
import type {
  RunState, TestCase, UrlEntry, SseEvent,
  RequestEvent, SummaryEvent, ProgressEvent, DoneEvent, StartRunOptions,
} from '../types';
import { makeRequest } from './httpClient';
import { readCache } from './vxvaultFetcher';
import { readUrlhausCache } from './urlhausFetcher';
```

Wait — currently `readCache` is imported from `vxvaultFetcher` in `testRunner.ts`? Let me check the current testRunner — actually looking at the file, `readCache` is only used in `loadUrlList` for the `malware` case. The testRunner doesn't directly import `readCache`; that import is in `routes/test.ts`. The testRunner imports are just `readFile`, `access` from `fs/promises`.

So for testRunner, just add the import:

```typescript
import { readUrlhausCache } from './urlhausFetcher';
```

after the existing `import { readCache } from './vxvaultFetcher'` — except there is no such import in testRunner. Add it as a new import line after the `makeRequest` import:

```typescript
import { makeRequest } from './httpClient';
import { readUrlhausCache } from './urlhausFetcher';
import { readCache } from './vxvaultFetcher';
```

**Change 2** — After the existing `includeHeavyAppControl` block in `executeRun`, add the URLhaus append block:

```typescript
if (options.includeUrlhaus) {
  const cache = await readUrlhausCache();
  if (cache) {
    for (const u of cache.urls) allUrls.push({ ...u, testCase: 'malware' });
  }
}
```

The full section after URL list building should look like:

```typescript
  // Append heavy app URLs when requested
  if (options.includeHeavyAppControl) {
    let heavyPath: string;
    try {
      await access(path.resolve('uploads/appControlHeavy-builtin.json'));
      heavyPath = path.resolve('uploads/appControlHeavy-builtin.json');
    } catch {
      heavyPath = path.resolve('src/data/appControlHeavy.json');
    }
    const heavyData = await readFile(heavyPath, 'utf-8');
    const heavyUrls: UrlEntry[] = JSON.parse(heavyData);
    for (const u of heavyUrls) allUrls.push({ ...u, testCase: 'appControl' });
  }

  // Append URLhaus URLs when requested
  if (options.includeUrlhaus) {
    const cache = await readUrlhausCache();
    if (cache) {
      for (const u of cache.urls) allUrls.push({ ...u, testCase: 'malware' });
    }
  }
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (49+ with the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/services/testRunner.ts tests/testRunner.test.ts
git commit -m "feat: append URLhaus URLs to pool when includeUrlhaus is true"
```

---

## Task 7: Update `public/app.js`

**Files:**
- Modify: `public/app.js`

No automated tests for the frontend. Verified visually after Task 8.

- [ ] **Step 1: Add `urlhaus` state and `urlhausEnabled` to malware entry**

Find the state declarations near the top. Add `urlhaus` alongside `vxvault` (line ~15):

```javascript
// Before:
vxvault: { timestamp: null, count: 0, loading: false, error: null },

// After:
vxvault: { timestamp: null, count: 0, loading: false, error: null },
urlhaus: { timestamp: null, count: 0, loading: false, error: null },
```

Find the malware entry in `testCaseList` (line ~7):

```javascript
// Before:
{ key: 'malware', label: 'Malware (vxvault)', enabled: false, useCustom: false, uploadInfo: null, builtinModified: false },

// After:
{ key: 'malware', label: 'Malware (vxvault)', enabled: false, useCustom: false, uploadInfo: null, builtinModified: false, urlhausEnabled: false },
```

- [ ] **Step 2: Update `init()` to load URLhaus status**

```javascript
// Before:
async init() {
  await Promise.all([this.loadInterfaces(), this.loadUrlLists(), this.loadVxvaultStatus()]);
},

// After:
async init() {
  await Promise.all([this.loadInterfaces(), this.loadUrlLists(), this.loadVxvaultStatus(), this.loadUrlhausStatus()]);
},
```

- [ ] **Step 3: Add `loadUrlhausStatus()` and `refreshUrlhaus()` methods**

After the `refreshVxvault()` method, add:

```javascript
async loadUrlhausStatus() {
  const res = await fetch('/api/urlhaus/status');
  const data = await res.json();
  this.urlhaus.timestamp = data.timestamp;
  this.urlhaus.count = data.count;
},

async refreshUrlhaus() {
  this.urlhaus.loading = true;
  this.urlhaus.error = null;
  try {
    const res = await fetch('/api/urlhaus/refresh', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Refresh failed');
    this.urlhaus.timestamp = data.timestamp;
    this.urlhaus.count = data.count;
  } catch (e) {
    this.urlhaus.error = e.message;
  } finally {
    this.urlhaus.loading = false;
  }
},
```

- [ ] **Step 4: Update `canStart` getter**

```javascript
// Before:
get canStart() {
  const ac = this.testCaseList.find(tc => tc.key === 'appControl');
  const appControlActive = ac ? (ac.standardEnabled || ac.heavyEnabled) : false;
  const othersActive = this.testCaseList
    .filter(tc => tc.key !== 'appControl')
    .some(tc => tc.enabled);
  return (appControlActive || othersActive)
    && this.selectedIps.length > 0
    && !this.isRunning
    && this.runtimeMinutes >= 1;
},

// After:
get canStart() {
  const ac = this.testCaseList.find(tc => tc.key === 'appControl');
  const mal = this.testCaseList.find(tc => tc.key === 'malware');
  const appControlActive = ac ? (ac.standardEnabled || ac.heavyEnabled) : false;
  const urlhausActive = mal?.urlhausEnabled ?? false;
  const othersActive = this.testCaseList
    .filter(tc => tc.key !== 'appControl')
    .some(tc => tc.enabled);
  return (appControlActive || othersActive || urlhausActive)
    && this.selectedIps.length > 0
    && !this.isRunning
    && this.runtimeMinutes >= 1;
},
```

- [ ] **Step 5: Update `startRun()` to declare `mal` and include `includeUrlhaus`**

In `startRun()`, find the `const ac = ...` declaration. Add `mal` on the next line:

```javascript
const ac = this.testCaseList.find(tc => tc.key === 'appControl');
const mal = this.testCaseList.find(tc => tc.key === 'malware');
```

In the `JSON.stringify({...})` POST body, add `includeUrlhaus` after `includeHeavyAppControl`:

```javascript
body: JSON.stringify({
  testCases,
  sourceIps: this.selectedIps,
  runtimeMinutes: this.runtimeMinutes,
  customLists,
  includeHeavyAppControl: ac?.heavyEnabled ?? false,
  includeUrlhaus: mal?.urlhausEnabled ?? false,
}),
```

**Important:** The `testCases` array only includes `'malware'` when `tc.enabled` (vxvault checkbox) is true. `urlhausEnabled` does NOT add `'malware'` to `testCases`. This is already true since `testCases` is built using `tc.enabled` from the existing logic.

- [ ] **Step 6: Verify build still passes**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add public/app.js
git commit -m "feat: add URLhaus state, methods, and canStart/startRun integration to frontend"
```

---

## Task 8: Update `public/index.html`

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add URLhaus status bar**

The vxvault status bar is at lines 18–29. Add the URLhaus bar immediately after it (after the closing `</div>` on line 29):

```html
<!-- URLhaus status bar -->
<div style="padding:0 1.5rem">
  <div class="vxvault-bar">
    <strong>URLhaus Malware List</strong>
    <span x-text="urlhaus.count > 0 ? urlhaus.count + ' URLs' : 'Not cached'"></span>
    <span x-show="urlhaus.timestamp" x-text="'Last updated: ' + formatDate(urlhaus.timestamp)"></span>
    <span class="error" x-show="urlhaus.error" x-text="urlhaus.error"></span>
    <button class="btn btn-secondary" @click="refreshUrlhaus" :disabled="urlhaus.loading">
      <span x-show="urlhaus.loading" class="spinner"></span>
      <span x-text="urlhaus.loading ? 'Refreshing…' : 'Refresh Now'"></span>
    </button>
  </div>
</div>
```

- [ ] **Step 2: Restructure the malware block**

The test-case loop currently has two `<template x-if>` siblings inside the `x-for`:
1. `x-if="tc.key === 'appControl'"` — the appControl block
2. `x-if="tc.key !== 'appControl'"` — catches everything else including malware

Change the second template's condition to exclude malware:
```html
<!-- Before: -->
<template x-if="tc.key !== 'appControl'">

<!-- After: -->
<template x-if="tc.key !== 'appControl' && tc.key !== 'malware'">
```

Then add a third sibling `<template x-if>` for the malware block, between the appControl template and the generic template:

```html
<!-- Malware block -->
<template x-if="tc.key === 'malware'">
  <div>
    <h3><span x-text="tc.label"></span></h3>
    <div style="margin-left:1.2rem">
      <!-- URLhaus sub-row -->
      <div style="margin-bottom:.3rem">
        <label><input type="checkbox" x-model="tc.urlhausEnabled"> URLhaus (abuse.ch)</label>
      </div>
      <!-- vxvault sub-row -->
      <div style="margin-bottom:.3rem">
        <label><input type="checkbox" x-model="tc.enabled"> Malware (vxvault)</label>
      </div>
      <!-- Use custom list row (same level, shown when vxvault enabled) -->
      <div class="custom-upload" x-show="tc.enabled">
        <label>
          <input type="checkbox" x-model="tc.useCustom" :disabled="!tc.uploadInfo">
          Use custom list
        </label>
        <button class="btn btn-secondary" style="font-size:.78rem;padding:.3rem .7rem"
          @click="triggerUpload(tc.key)">Upload</button>
        <input type="file" style="display:none" :id="'upload-' + tc.key"
          accept=".csv,.json" @change="handleUpload(tc.key, $event)">
        <template x-if="tc.uploadInfo">
          <span style="display:contents">
            <span x-text="tc.uploadInfo.filename + ' (' + tc.uploadInfo.count + ' URLs)'"></span>
            <button class="btn btn-secondary" style="font-size:.78rem;padding:.3rem .5rem;color:#e63946"
              @click="deleteUpload(tc.key)">✕</button>
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
```

All three `<template x-if>` blocks (appControl, malware, generic) must be **sibling elements at the same nesting level** inside the `<template x-for="tc in testCaseList">` loop. Do not nest one inside another.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add URLhaus status bar and restructure malware block with independent sub-checkboxes"
```

---

## Task 9: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Custom Lists section**

Append the following after the existing "Updating" section (after line 53):

```markdown
## Custom Lists

Each test case that uses a built-in URL list (Application Control Standard, General Web, and Malware/vxvault) supports replacing the built-in list with your own.

### File format

Custom lists must be a JSON file — an array of URL objects:

```json
[
  { "name": "Example Site", "url": "https://example.com", "category": "my-category" },
  { "name": "Another Site", "url": "https://another.com", "category": "my-category" }
]
```

Fields:
- `name` — display name (shown in the request log)
- `url` — the full URL to request (must start with `http://` or `https://`)
- `category` — used for grouping in the dashboard (any string)

### Uploading a custom list

1. In the Test Configuration panel, find the test case you want to customise.
2. Click **Upload** next to that test case.
3. Select your `.json` file.
4. Once uploaded, tick **Use custom list** to activate it.

### Reverting to the built-in list

Click **✕** next to the uploaded filename to remove the custom list. The test case will revert to its built-in URL list.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Custom Lists section to README"
```

---

## Task 10: Full test suite verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Start dev server and smoke-test**

Run: `npm run dev`

Check the following:
1. Two status bars appear at the top — "vxvault Malware List" and "URLhaus Malware List"
2. Click **Refresh Now** on the URLhaus bar — it calls the API and shows URL count
3. Under the Malware test case: three rows at the same indent level — URLhaus checkbox, Malware (vxvault) checkbox, Use custom list row
4. URLhaus and vxvault checkboxes are independently selectable
5. "Use custom list" row appears only when vxvault is checked
6. Start button activates when only URLhaus is checked (no vxvault needed)
7. With URLhaus-only enabled, a run fires requests with `category: 'urlhaus'`
