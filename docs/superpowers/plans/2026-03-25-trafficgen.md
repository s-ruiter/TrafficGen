# TrafficGen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node.js web app that generates outbound HTTP traffic from a network-internal machine, used to test firewall and SD-WAN configurations.

**Architecture:** Single Express server serving a static Alpine.js frontend and REST + SSE API. Test runner executes URLs sequentially at 1 req/sec, binding to user-selected local network interfaces. Three test cases (Application Control, General Web Traffic, Malware/vxvault) each backed by a built-in JSON URL list and optional custom upload.

**Tech Stack:** Node.js 20+, TypeScript 5, Express 4, Multer, UUID, Vitest, Supertest, Alpine.js (CDN)

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/types.ts` | All shared TypeScript interfaces and types |
| `src/server.ts` | Express app setup, static files, route mounting |
| `src/index.ts` | Entry point — calls `startServer()` |
| `src/services/networkInterfaces.ts` | Enumerate non-loopback IPv4 addresses using `os.networkInterfaces()` |
| `src/services/httpClient.ts` | HTTP GET with `localAddress`, 10s timeout, returns status/timing/error |
| `src/services/vxvaultFetcher.ts` | Fetch vxvault list, parse plain-text, read/write JSON cache |
| `src/services/testRunner.ts` | Run lifecycle, execution loop, SSE emitter, stop flag |
| `src/routes/interfaces.ts` | `GET /api/interfaces` |
| `src/routes/urlLists.ts` | `GET/POST/DELETE /api/url-lists` — upload, list, delete |
| `src/routes/vxvault.ts` | `GET /api/vxvault/status`, `POST /api/vxvault/refresh` |
| `src/routes/test.ts` | `POST /api/test/start`, `POST /api/test/stop`, `GET /api/test/:id/stream` |
| `src/data/appControl.json` | ~50 built-in app control URLs |
| `src/data/generalWeb.json` | ~50 built-in general web URLs |
| `public/index.html` | Single-page UI shell |
| `public/app.js` | Alpine.js component — all frontend logic |
| `public/style.css` | UI styles |
| `tests/networkInterfaces.test.ts` | Unit tests for interface enumeration |
| `tests/httpClient.test.ts` | Integration tests against local test server |
| `tests/vxvaultFetcher.test.ts` | Unit tests for parsing + mock fetch tests |
| `tests/testRunner.test.ts` | Unit tests with mocked httpClient |
| `tests/routes/interfaces.test.ts` | Supertest route tests |
| `tests/routes/urlLists.test.ts` | Supertest route tests |
| `tests/routes/vxvault.test.ts` | Supertest route tests |
| `tests/routes/test.test.ts` | Supertest route tests |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "trafficgen",
  "version": "1.0.0",
  "description": "Web traffic generator for firewall and SD-WAN testing",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.0.0",
    "@types/supertest": "^6.0.2",
    "@types/uuid": "^9.0.7",
    "supertest": "^6.3.4",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
cache/
uploads/
*.env
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/routes src/services src/data public tests/routes
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore
git commit -m "feat: project scaffold"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
import type { ServerResponse } from 'http';

export type TestCase = 'appControl' | 'generalWeb' | 'malware';

export interface UrlEntry {
  name: string;
  url: string;
  category: string;
}

export interface NetworkInterface {
  name: string;
  ip: string;
}

export type RunStatus = 'idle' | 'running' | 'completed' | 'stopped';

export interface RunState {
  runId: string;
  status: RunStatus;
  stopRequested: boolean;
  sseClients: Set<ServerResponse>;
}

export interface RequestEvent {
  type: 'request';
  url: string;
  testCase: TestCase;
  category: string;
  status: 'success' | 'failed';
  statusCode: number | null;
  responseTime: number;
  sourceIp: string;
  error?: string;
}

export interface SummaryEvent {
  type: 'summary';
  testCase: TestCase;
  category: string;
  total: number;
  success: number;
  failed: number;
}

export interface DoneEvent {
  type: 'done';
  totalRequests: number;
  totalSuccess: number;
  totalFailed: number;
}

export type SseEvent = RequestEvent | SummaryEvent | DoneEvent;

export interface VxvaultCache {
  timestamp: string;
  urls: UrlEntry[];
}

export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  repeatCount: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared TypeScript types"
```

---

## Task 3: Network Interfaces Service

**Files:**
- Create: `src/services/networkInterfaces.ts`
- Create: `tests/networkInterfaces.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/networkInterfaces.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/networkInterfaces.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/networkInterfaces.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/networkInterfaces.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/networkInterfaces.ts tests/networkInterfaces.test.ts
git commit -m "feat: network interfaces service"
```

---

## Task 4: HTTP Client

**Files:**
- Create: `src/services/httpClient.ts`
- Create: `tests/httpClient.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/httpClient.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/httpClient.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/httpClient.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/httpClient.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/httpClient.ts tests/httpClient.test.ts
git commit -m "feat: HTTP client with localAddress binding and timeout"
```

---

## Task 5: vxvault Fetcher

**Files:**
- Create: `src/services/vxvaultFetcher.ts`
- Create: `tests/vxvaultFetcher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/vxvaultFetcher.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('parseVxvaultText', () => {
  it('extracts valid http and https URLs', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    const text = `; comment line
http://malware.example.com/payload.exe
https://evil.example.org/virus
not-a-url
ftp://wrong-scheme.com
`;
    const result = parseVxvaultText(text);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('http://malware.example.com/payload.exe');
    expect(result[1].url).toBe('https://evil.example.org/virus');
    expect(result.every((r) => r.category === 'malware')).toBe(true);
  });

  it('skips comment lines starting with ;', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    const result = parseVxvaultText('; this is a comment\nhttp://ok.com/x');
    expect(result).toHaveLength(1);
  });

  it('skips empty lines', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    const result = parseVxvaultText('\n\nhttp://ok.com/x\n\n');
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty input', async () => {
    const { parseVxvaultText } = await import('../src/services/vxvaultFetcher');
    expect(parseVxvaultText('')).toEqual([]);
  });
});

describe('readCache', () => {
  it('returns null when cache file does not exist', async () => {
    // Reset module registry so vxvaultFetcher re-imports with the new fs mock
    vi.resetModules();
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    }));
    const { readCache } = await import('../src/services/vxvaultFetcher');
    const result = await readCache();
    expect(result).toBeNull();
    vi.resetModules();
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/vxvaultFetcher.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/vxvaultFetcher.ts`**

```typescript
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import type { UrlEntry, VxvaultCache } from '../types';

const VXVAULT_URL = 'http://vxvault.net/URL_List.php';
const CACHE_PATH = path.resolve('cache/vxvault-cache.json');

export function parseVxvaultText(text: string): UrlEntry[] {
  const results: UrlEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    try {
      const u = new URL(line);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      results.push({ name: line, url: line, category: 'malware' });
    } catch {
      // invalid URL — skip
    }
  }
  return results;
}

export async function fetchVxvaultList(): Promise<UrlEntry[]> {
  return new Promise((resolve, reject) => {
    http.get(VXVAULT_URL, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve(parseVxvaultText(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function refreshCache(): Promise<VxvaultCache> {
  const urls = await fetchVxvaultList();
  const cache: VxvaultCache = { timestamp: new Date().toISOString(), urls };
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

export async function readCache(): Promise<VxvaultCache | null> {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(data) as VxvaultCache;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/vxvaultFetcher.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/vxvaultFetcher.ts tests/vxvaultFetcher.test.ts
git commit -m "feat: vxvault fetcher with parse and cache"
```

---

## Task 6: Built-in URL Data Files

**Files:**
- Create: `src/data/appControl.json`
- Create: `src/data/generalWeb.json`

- [ ] **Step 1: Create `src/data/appControl.json`**

```json
[
  { "name": "Facebook", "url": "https://www.facebook.com", "category": "social" },
  { "name": "Twitter/X", "url": "https://www.x.com", "category": "social" },
  { "name": "Instagram", "url": "https://www.instagram.com", "category": "social" },
  { "name": "LinkedIn", "url": "https://www.linkedin.com", "category": "social" },
  { "name": "TikTok", "url": "https://www.tiktok.com", "category": "social" },
  { "name": "Reddit", "url": "https://www.reddit.com", "category": "social" },
  { "name": "Snapchat", "url": "https://www.snapchat.com", "category": "social" },
  { "name": "Pinterest", "url": "https://www.pinterest.com", "category": "social" },
  { "name": "WhatsApp", "url": "https://web.whatsapp.com", "category": "social" },
  { "name": "Telegram", "url": "https://web.telegram.org", "category": "social" },
  { "name": "YouTube", "url": "https://www.youtube.com", "category": "streaming" },
  { "name": "Netflix", "url": "https://www.netflix.com", "category": "streaming" },
  { "name": "Spotify", "url": "https://open.spotify.com", "category": "streaming" },
  { "name": "Twitch", "url": "https://www.twitch.tv", "category": "streaming" },
  { "name": "Disney+", "url": "https://www.disneyplus.com", "category": "streaming" },
  { "name": "Amazon Prime", "url": "https://www.primevideo.com", "category": "streaming" },
  { "name": "Apple TV", "url": "https://tv.apple.com", "category": "streaming" },
  { "name": "Hulu", "url": "https://www.hulu.com", "category": "streaming" },
  { "name": "SoundCloud", "url": "https://soundcloud.com", "category": "streaming" },
  { "name": "Deezer", "url": "https://www.deezer.com", "category": "streaming" },
  { "name": "Dropbox", "url": "https://www.dropbox.com", "category": "file-sharing" },
  { "name": "Google Drive", "url": "https://drive.google.com", "category": "file-sharing" },
  { "name": "OneDrive", "url": "https://onedrive.live.com", "category": "file-sharing" },
  { "name": "WeTransfer", "url": "https://wetransfer.com", "category": "file-sharing" },
  { "name": "Box", "url": "https://www.box.com", "category": "file-sharing" },
  { "name": "iCloud", "url": "https://www.icloud.com", "category": "file-sharing" },
  { "name": "Mega", "url": "https://mega.nz", "category": "file-sharing" },
  { "name": "pCloud", "url": "https://www.pcloud.com", "category": "file-sharing" },
  { "name": "MediaFire", "url": "https://www.mediafire.com", "category": "file-sharing" },
  { "name": "Sync", "url": "https://www.sync.com", "category": "file-sharing" },
  { "name": "Zoom", "url": "https://zoom.us", "category": "voip" },
  { "name": "Microsoft Teams", "url": "https://teams.microsoft.com", "category": "voip" },
  { "name": "Skype", "url": "https://www.skype.com", "category": "voip" },
  { "name": "Webex", "url": "https://www.webex.com", "category": "voip" },
  { "name": "Google Meet", "url": "https://meet.google.com", "category": "voip" },
  { "name": "Discord", "url": "https://discord.com", "category": "voip" },
  { "name": "GoToMeeting", "url": "https://www.goto.com/meeting", "category": "voip" },
  { "name": "RingCentral", "url": "https://www.ringcentral.com", "category": "voip" },
  { "name": "8x8", "url": "https://www.8x8.com", "category": "voip" },
  { "name": "Vonage", "url": "https://www.vonage.com", "category": "voip" },
  { "name": "Steam", "url": "https://store.steampowered.com", "category": "gaming" },
  { "name": "Epic Games", "url": "https://www.epicgames.com", "category": "gaming" },
  { "name": "PlayStation", "url": "https://www.playstation.com", "category": "gaming" },
  { "name": "Xbox Live", "url": "https://www.xbox.com", "category": "gaming" },
  { "name": "Battle.net", "url": "https://www.blizzard.com", "category": "gaming" },
  { "name": "GOG", "url": "https://www.gog.com", "category": "gaming" },
  { "name": "itch.io", "url": "https://itch.io", "category": "gaming" },
  { "name": "Roblox", "url": "https://www.roblox.com", "category": "gaming" },
  { "name": "Minecraft", "url": "https://www.minecraft.net", "category": "gaming" },
  { "name": "EA", "url": "https://www.ea.com", "category": "gaming" }
]
```

- [ ] **Step 2: Create `src/data/generalWeb.json`**

```json
[
  { "name": "BBC News", "url": "https://www.bbc.com/news", "category": "news" },
  { "name": "CNN", "url": "https://www.cnn.com", "category": "news" },
  { "name": "Reuters", "url": "https://www.reuters.com", "category": "news" },
  { "name": "New York Times", "url": "https://www.nytimes.com", "category": "news" },
  { "name": "The Guardian", "url": "https://www.theguardian.com", "category": "news" },
  { "name": "AP News", "url": "https://apnews.com", "category": "news" },
  { "name": "NPR", "url": "https://www.npr.org", "category": "news" },
  { "name": "Washington Post", "url": "https://www.washingtonpost.com", "category": "news" },
  { "name": "Bloomberg News", "url": "https://www.bloomberg.com/news", "category": "news" },
  { "name": "Al Jazeera", "url": "https://www.aljazeera.com", "category": "news" },
  { "name": "Amazon", "url": "https://www.amazon.com", "category": "shopping" },
  { "name": "eBay", "url": "https://www.ebay.com", "category": "shopping" },
  { "name": "AliExpress", "url": "https://www.aliexpress.com", "category": "shopping" },
  { "name": "Walmart", "url": "https://www.walmart.com", "category": "shopping" },
  { "name": "Etsy", "url": "https://www.etsy.com", "category": "shopping" },
  { "name": "IKEA", "url": "https://www.ikea.com", "category": "shopping" },
  { "name": "Zalando", "url": "https://www.zalando.com", "category": "shopping" },
  { "name": "Best Buy", "url": "https://www.bestbuy.com", "category": "shopping" },
  { "name": "Target", "url": "https://www.target.com", "category": "shopping" },
  { "name": "Newegg", "url": "https://www.newegg.com", "category": "shopping" },
  { "name": "PayPal", "url": "https://www.paypal.com", "category": "finance" },
  { "name": "Stripe", "url": "https://stripe.com", "category": "finance" },
  { "name": "Wise", "url": "https://wise.com", "category": "finance" },
  { "name": "Revolut", "url": "https://www.revolut.com", "category": "finance" },
  { "name": "Coinbase", "url": "https://www.coinbase.com", "category": "finance" },
  { "name": "Yahoo Finance", "url": "https://finance.yahoo.com", "category": "finance" },
  { "name": "Bloomberg Finance", "url": "https://www.bloomberg.com/markets", "category": "finance" },
  { "name": "Investing.com", "url": "https://www.investing.com", "category": "finance" },
  { "name": "Morningstar", "url": "https://www.morningstar.com", "category": "finance" },
  { "name": "E*TRADE", "url": "https://www.etrade.com", "category": "finance" },
  { "name": "Google", "url": "https://www.google.com", "category": "search" },
  { "name": "Bing", "url": "https://www.bing.com", "category": "search" },
  { "name": "DuckDuckGo", "url": "https://duckduckgo.com", "category": "search" },
  { "name": "Yahoo Search", "url": "https://search.yahoo.com", "category": "search" },
  { "name": "Baidu", "url": "https://www.baidu.com", "category": "search" },
  { "name": "Yandex", "url": "https://yandex.com", "category": "search" },
  { "name": "Ecosia", "url": "https://www.ecosia.org", "category": "search" },
  { "name": "Startpage", "url": "https://www.startpage.com", "category": "search" },
  { "name": "Brave Search", "url": "https://search.brave.com", "category": "search" },
  { "name": "Ask.com", "url": "https://www.ask.com", "category": "search" },
  { "name": "GitHub", "url": "https://github.com", "category": "tech" },
  { "name": "Stack Overflow", "url": "https://stackoverflow.com", "category": "tech" },
  { "name": "Hacker News", "url": "https://news.ycombinator.com", "category": "tech" },
  { "name": "TechCrunch", "url": "https://techcrunch.com", "category": "tech" },
  { "name": "Wired", "url": "https://www.wired.com", "category": "tech" },
  { "name": "Ars Technica", "url": "https://arstechnica.com", "category": "tech" },
  { "name": "The Verge", "url": "https://www.theverge.com", "category": "tech" },
  { "name": "CNET", "url": "https://www.cnet.com", "category": "tech" },
  { "name": "AnandTech", "url": "https://www.anandtech.com", "category": "tech" },
  { "name": "Tom's Hardware", "url": "https://www.tomshardware.com", "category": "tech" }
]
```

- [ ] **Step 3: Commit**

```bash
git add src/data/appControl.json src/data/generalWeb.json
git commit -m "feat: built-in URL lists for app control and general web"
```

---

## Task 7: Test Runner Service

**Files:**
- Create: `src/services/testRunner.ts`
- Create: `tests/testRunner.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/testRunner.test.ts
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
      repeatCount: 1,
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
      repeatCount: 1,
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
      repeatCount: 1,
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
      repeatCount: 1,
      customLists: {},
    });

    addSseClient(runId, mockRes as any);

    // Advance past 500ms startup delay
    await vi.advanceTimersByTimeAsync(500);
    // Advance past 1000ms post-request wait
    await vi.advanceTimersByTimeAsync(1100);

    const requestEvents = events.filter(e => e.type === 'request');
    const summaryEvents = events.filter(e => e.type === 'summary');
    const doneEvents = events.filter(e => e.type === 'done');

    expect(requestEvents.length).toBeGreaterThan(0);
    expect(summaryEvents.length).toBeGreaterThan(0);
    expect(doneEvents.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/testRunner.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/testRunner.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
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
    const data = await fs.readFile(path.resolve(`uploads/${testCase}.json`), 'utf-8');
    return JSON.parse(data) as UrlEntry[];
  }
  if (testCase === 'malware') {
    const cache = await readCache();
    if (!cache || cache.urls.length === 0) throw new Error('vxvault cache is empty');
    return cache.urls;
  }
  const data = await fs.readFile(path.resolve(`src/data/${testCase}.json`), 'utf-8');
  return JSON.parse(data) as UrlEntry[];
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
      const isSuccess = result.statusCode !== null
        && result.statusCode >= 200
        && result.statusCode < 300;

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/testRunner.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/testRunner.ts tests/testRunner.test.ts
git commit -m "feat: test runner service with SSE and stop support"
```

---

## Task 8: Route — Interfaces

**Files:**
- Create: `src/routes/interfaces.ts`
- Create: `tests/routes/interfaces.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/routes/interfaces.test.ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/networkInterfaces', () => ({
  getLocalInterfaces: vi.fn().mockReturnValue([
    { name: 'eth0', ip: '192.168.1.10' },
    { name: 'eth1', ip: '10.0.0.5' },
  ]),
}));

describe('GET /api/interfaces', () => {
  it('returns a list of network interfaces', async () => {
    const { default: router } = await import('../../src/routes/interfaces');
    const app = express();
    app.use('/api/interfaces', router);

    const res = await request(app).get('/api/interfaces');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { name: 'eth0', ip: '192.168.1.10' },
      { name: 'eth1', ip: '10.0.0.5' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/routes/interfaces.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/interfaces.ts`**

```typescript
import { Router } from 'express';
import { getLocalInterfaces } from '../services/networkInterfaces';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getLocalInterfaces());
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/routes/interfaces.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/interfaces.ts tests/routes/interfaces.test.ts
git commit -m "feat: GET /api/interfaces route"
```

---

## Task 9: Route — URL Lists

**Files:**
- Create: `src/routes/urlLists.ts`
- Create: `tests/routes/urlLists.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/routes/urlLists.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

describe('URL Lists routes', () => {
  let tmpDir: string;
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trafficgen-test-'));
    // Create the tmp subdirectory that multer needs
    await fs.mkdir(path.join(tmpDir, 'tmp'), { recursive: true });

    // Redirect all path.resolve('uploads/...') calls to tmpDir
    vi.doMock('path', async (importOriginal) => {
      const actual = await importOriginal<typeof path>();
      return {
        ...actual,
        resolve: (...args: string[]) => {
          const joined = args.join('/');
          if (joined.startsWith('uploads/tmp') || joined === 'uploads/tmp') {
            return path.join(tmpDir, 'tmp');
          }
          if (joined.startsWith('uploads')) {
            return path.join(tmpDir, joined.replace(/^uploads\/?/, ''));
          }
          return actual.resolve(...args);
        },
      };
    });

    const { default: router } = await import('../../src/routes/urlLists');
    app = express();
    app.use(express.json());
    app.use('/api/url-lists', router);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('GET /api/url-lists returns list structure', async () => {
    const res = await request(app).get('/api/url-lists');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('appControl');
    expect(res.body).toHaveProperty('generalWeb');
    expect(res.body).toHaveProperty('malware');
    expect(res.body.appControl.custom).toBeNull();
  });

  it('POST /api/url-lists/upload rejects missing testCase', async () => {
    const res = await request(app)
      .post('/api/url-lists/upload')
      .attach('file', Buffer.from('name,url,category\nTest,http://x.com,test'), 'test.csv');
    expect(res.status).toBe(400);
  });

  it('POST /api/url-lists/upload rejects invalid testCase', async () => {
    const res = await request(app)
      .post('/api/url-lists/upload')
      .field('testCase', 'invalid')
      .attach('file', Buffer.from('name,url,category\nTest,http://x.com,test'), 'test.csv');
    expect(res.status).toBe(400);
  });

  it('POST /api/url-lists/upload accepts valid CSV', async () => {
    const csv = 'name,url,category\nYouTube,https://youtube.com,streaming';
    const res = await request(app)
      .post('/api/url-lists/upload')
      .field('testCase', 'appControl')
      .attach('file', Buffer.from(csv), 'custom.csv');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('POST /api/url-lists/upload rejects CSV with invalid URL', async () => {
    const csv = 'name,url,category\nBad,not-a-url,test';
    const res = await request(app)
      .post('/api/url-lists/upload')
      .field('testCase', 'appControl')
      .attach('file', Buffer.from(csv), 'bad.csv');
    expect(res.status).toBe(400);
  });

  it('DELETE /api/url-lists/:testCase returns 200', async () => {
    const res = await request(app).delete('/api/url-lists/appControl');
    expect(res.status).toBe(200);
  });

  it('DELETE /api/url-lists/:testCase rejects invalid testCase', async () => {
    const res = await request(app).delete('/api/url-lists/invalid');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/routes/urlLists.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/urlLists.ts`**

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import type { UrlEntry, TestCase } from '../types';
import { readCache } from '../services/vxvaultFetcher';
import appControlData from '../data/appControl.json';
import generalWebData from '../data/generalWeb.json';

const router = Router();
const VALID_TEST_CASES: TestCase[] = ['appControl', 'generalWeb', 'malware'];
const upload = multer({ dest: path.resolve('uploads/tmp'), limits: { fileSize: 1024 * 1024 } });

function parseCsv(text: string): { entries: UrlEntry[]; errors: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries: UrlEntry[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) { errors.push(`Row ${i + 1}: missing columns`); continue; }
    const [name, url, category] = parts.map((p) => p.trim());
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        errors.push(`Row ${i + 1}: URL must use http or https`);
        continue;
      }
    } catch {
      errors.push(`Row ${i + 1}: invalid URL "${url}"`);
      continue;
    }
    entries.push({ name, url, category });
  }
  return { entries, errors };
}

function validateJson(entries: UrlEntry[]): string[] {
  return entries.flatMap((e, i) => {
    const errs: string[] = [];
    if (!e.name || !e.url || !e.category) errs.push(`Entry ${i + 1}: missing fields`);
    else {
      try {
        const u = new URL(e.url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') errs.push(`Entry ${i + 1}: invalid scheme`);
      } catch { errs.push(`Entry ${i + 1}: invalid URL`); }
    }
    return errs;
  });
}

async function getCustomInfo(testCase: TestCase) {
  try {
    const [meta, data] = await Promise.all([
      fs.readFile(path.resolve(`uploads/${testCase}.meta.json`), 'utf-8'),
      fs.readFile(path.resolve(`uploads/${testCase}.json`), 'utf-8'),
    ]);
    const { filename } = JSON.parse(meta) as { filename: string };
    const entries = JSON.parse(data) as UrlEntry[];
    return { filename, count: entries.length };
  } catch { return null; }
}

router.get('/', async (_req, res) => {
  const cache = await readCache();
  const [acCustom, gwCustom, mCustom] = await Promise.all([
    getCustomInfo('appControl'),
    getCustomInfo('generalWeb'),
    getCustomInfo('malware'),
  ]);
  res.json({
    appControl: { builtin: (appControlData as UrlEntry[]).length, custom: acCustom },
    generalWeb: { builtin: (generalWebData as UrlEntry[]).length, custom: gwCustom },
    malware: {
      vxvaultCache: cache ? { timestamp: cache.timestamp, count: cache.urls.length } : null,
      custom: mCustom,
    },
  });
});

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const testCase = req.body.testCase as TestCase;
  if (!VALID_TEST_CASES.includes(testCase)) return res.status(400).json({ error: 'Invalid testCase' }) as any;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' }) as any;

  try {
    const text = await fs.readFile(req.file.path, 'utf-8');
    let entries: UrlEntry[];
    let errors: string[];

    if (req.file.originalname.endsWith('.json')) {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return res.status(400).json({ error: 'Invalid JSON' }) as any; }
      if (!Array.isArray(parsed)) return res.status(400).json({ error: 'JSON must be an array' }) as any;
      errors = validateJson(parsed as UrlEntry[]);
      if (errors.length) return res.status(400).json({ errors }) as any;
      entries = parsed as UrlEntry[];
    } else {
      const result = parseCsv(text);
      if (result.errors.length) return res.status(400).json({ errors: result.errors }) as any;
      entries = result.entries;
    }

    if (entries.length === 0) return res.status(400).json({ error: 'No valid entries' }) as any;
    if (entries.length > 1000) return res.status(400).json({ error: 'Exceeds 1000 URL limit' }) as any;

    await fs.writeFile(path.resolve(`uploads/${testCase}.json`), JSON.stringify(entries, null, 2));
    await fs.writeFile(path.resolve(`uploads/${testCase}.meta.json`), JSON.stringify({ filename: req.file.originalname }));
    res.json({ count: entries.length });
  } finally {
    await fs.unlink(req.file!.path).catch(() => {});
  }
});

router.delete('/:testCase', async (req, res) => {
  const testCase = req.params.testCase as TestCase;
  if (!VALID_TEST_CASES.includes(testCase)) return res.status(400).json({ error: 'Invalid testCase' }) as any;
  await Promise.all([
    fs.unlink(path.resolve(`uploads/${testCase}.json`)).catch(() => {}),
    fs.unlink(path.resolve(`uploads/${testCase}.meta.json`)).catch(() => {}),
  ]);
  res.json({ deleted: true });
});

export default router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/routes/urlLists.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/urlLists.ts tests/routes/urlLists.test.ts
git commit -m "feat: url lists route (upload, list, delete)"
```

---

## Task 10: Route — vxvault

**Files:**
- Create: `src/routes/vxvault.ts`
- Create: `tests/routes/vxvault.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/routes/vxvault.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/vxvaultFetcher');

describe('vxvault routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    const { default: router } = await import('../../src/routes/vxvault');
    app = express();
    app.use('/api/vxvault', router);
  });

  it('GET /api/vxvault/status returns null when no cache', async () => {
    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue(null);

    const res = await request(app).get('/api/vxvault/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timestamp: null, count: 0 });
  });

  it('GET /api/vxvault/status returns cache info when cache exists', async () => {
    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue({
      timestamp: '2026-01-01T00:00:00Z',
      urls: [{ name: 'x', url: 'http://x.com', category: 'malware' }],
    });

    const res = await request(app).get('/api/vxvault/status');
    expect(res.body).toEqual({ timestamp: '2026-01-01T00:00:00Z', count: 1 });
  });

  it('POST /api/vxvault/refresh returns updated cache info', async () => {
    const { refreshCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(refreshCache).mockResolvedValue({
      timestamp: '2026-02-01T00:00:00Z',
      urls: Array(50).fill({ name: 'x', url: 'http://x.com', category: 'malware' }),
    });

    const res = await request(app).post('/api/vxvault/refresh');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(50);
  });

  it('POST /api/vxvault/refresh returns 500 on fetch failure', async () => {
    const { refreshCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(refreshCache).mockRejectedValue(new Error('Network error'));

    const res = await request(app).post('/api/vxvault/refresh');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Network error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/routes/vxvault.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/vxvault.ts`**

```typescript
import { Router } from 'express';
import { readCache, refreshCache } from '../services/vxvaultFetcher';

const router = Router();

router.get('/status', async (_req, res) => {
  const cache = await readCache();
  if (!cache) return res.json({ timestamp: null, count: 0 }) as any;
  res.json({ timestamp: cache.timestamp, count: cache.urls.length });
});

router.post('/refresh', async (_req, res) => {
  try {
    const cache = await refreshCache();
    res.json({ timestamp: cache.timestamp, count: cache.urls.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/routes/vxvault.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/vxvault.ts tests/routes/vxvault.test.ts
git commit -m "feat: vxvault status and refresh routes"
```

---

## Task 11: Route — Test (Start / Stop / SSE)

**Files:**
- Create: `src/routes/test.ts`
- Create: `tests/routes/test.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/routes/test.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/testRunner');
vi.mock('../../src/services/networkInterfaces');
vi.mock('../../src/services/vxvaultFetcher');
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, access: vi.fn().mockResolvedValue(undefined) };
});

describe('Test routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();

    const { getLocalInterfaces } = await import('../../src/services/networkInterfaces');
    vi.mocked(getLocalInterfaces).mockReturnValue([{ name: 'eth0', ip: '192.168.1.10' }]);

    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue({
      timestamp: '2026-01-01T00:00:00Z',
      urls: [{ name: 'x', url: 'http://x.com', category: 'malware' }],
    });

    const { startRun, stopRun, getCurrentRun } = await import('../../src/services/testRunner');
    vi.mocked(startRun).mockResolvedValue('test-run-id');
    vi.mocked(stopRun).mockReturnValue('stopping');
    vi.mocked(getCurrentRun).mockReturnValue(null);

    const { default: router } = await import('../../src/routes/test');
    app = express();
    app.use(express.json());
    app.use('/api/test', router);
  });

  it('POST /api/test/start returns runId for valid request', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe('test-run-id');
  });

  it('POST /api/test/start returns 400 for empty testCases', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: [],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 400 for empty sourceIps', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: [],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 400 for unknown IP', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['1.2.3.4'],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 400 for repeatCount < 1', async () => {
    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 0,
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/test/start returns 409 when run is already active', async () => {
    const { getCurrentRun } = await import('../../src/services/testRunner');
    vi.mocked(getCurrentRun).mockReturnValue({
      runId: 'existing',
      status: 'running',
      stopRequested: false,
      sseClients: new Set(),
    });

    const res = await request(app).post('/api/test/start').send({
      testCases: ['appControl'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/test/stop returns 200 when run is active', async () => {
    const res = await request(app).post('/api/test/stop');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('stopping');
  });

  it('POST /api/test/stop returns 404 when no active run', async () => {
    const { stopRun } = await import('../../src/services/testRunner');
    vi.mocked(stopRun).mockReturnValue('no-active-run');

    const res = await request(app).post('/api/test/stop');
    expect(res.status).toBe(404);
  });

  it('POST /api/test/start returns 400 when malware selected and vxvault cache is empty', async () => {
    const { readCache } = await import('../../src/services/vxvaultFetcher');
    vi.mocked(readCache).mockResolvedValue(null);

    const res = await request(app).post('/api/test/start').send({
      testCases: ['malware'],
      sourceIps: ['192.168.1.10'],
      repeatCount: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vxvault/i);
  });

  it('POST /api/test/start returns 409 before validating body when run is already active', async () => {
    const { getCurrentRun } = await import('../../src/services/testRunner');
    vi.mocked(getCurrentRun).mockReturnValue({
      runId: 'existing',
      status: 'running',
      stopRequested: false,
      sseClients: new Set(),
    });

    // Even with an empty body, 409 should be returned first
    const res = await request(app).post('/api/test/start').send({
      testCases: [],
      sourceIps: [],
      repeatCount: 0,
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/routes/test.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/test.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/routes/test.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/test.ts tests/routes/test.test.ts
git commit -m "feat: test start/stop/SSE routes"
```

---

## Task 12: Server Entry Point

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/server.ts`**

```typescript
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
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

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(path.resolve('cache'), { recursive: true });
  await fs.mkdir(path.resolve('uploads'), { recursive: true });
  await fs.mkdir(path.resolve('uploads/tmp'), { recursive: true });
}

export async function startServer(port = 3000): Promise<import('http').Server> {
  await ensureDirectories();
  return new Promise((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`TrafficGen running at http://0.0.0.0:${port}`);
      resolve(server);
    });
  });
}

export default app;
```

- [ ] **Step 2: Create `src/index.ts`**

```typescript
import { startServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
startServer(PORT).catch(console.error);
```

- [ ] **Step 3: Build and verify compilation**

```bash
npx tsc
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 4: Start the server and verify it runs**

```bash
node dist/index.js
```

Expected output: `TrafficGen running at http://0.0.0.0:3000`

Stop the server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/index.ts
git commit -m "feat: server entry point and startup"
```

---

## Task 13: Frontend UI

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/style.css`

- [ ] **Step 1: Create `public/style.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f0f2f5;
  color: #1a1a2e;
  min-height: 100vh;
}

header {
  background: #1a1a2e;
  color: #fff;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}
header h1 { font-size: 1.4rem; font-weight: 600; }

.layout { display: grid; grid-template-columns: 320px 1fr; gap: 1.5rem; padding: 1.5rem; }

.panel {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
}
.panel h2 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #1a1a2e; }

label { display: flex; align-items: center; gap: .5rem; cursor: pointer; font-size: .9rem; }
input[type=checkbox], input[type=radio] { width: 16px; height: 16px; cursor: pointer; }
input[type=number] { width: 80px; padding: .3rem .5rem; border: 1px solid #ddd; border-radius: 4px; }

.test-case-block { border: 1px solid #e8e8e8; border-radius: 6px; padding: .75rem; margin-bottom: .75rem; }
.test-case-block h3 { font-size: .85rem; font-weight: 600; margin-bottom: .5rem; color: #555; }
.custom-upload { margin-top: .5rem; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.custom-upload span { font-size: .8rem; color: #888; }

.ip-list { max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: .4rem; margin-top: .5rem; }

.repeat-row { display: flex; align-items: center; gap: .75rem; margin-top: 1rem; font-size: .9rem; }

.btn {
  padding: .55rem 1.25rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: .9rem;
  font-weight: 500;
  transition: background .15s;
}
.btn-primary { background: #4361ee; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #3451d4; }
.btn-danger { background: #e63946; color: #fff; }
.btn-danger:hover { background: #c1121f; }
.btn-secondary { background: #e8e8e8; color: #333; }
.btn-secondary:hover { background: #d5d5d5; }
.btn:disabled { opacity: .45; cursor: not-allowed; }

.action-row { display: flex; gap: .75rem; margin-top: 1.25rem; }

.vxvault-bar {
  background: #fff;
  border-radius: 8px;
  padding: .75rem 1.25rem;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  font-size: .85rem;
  flex-wrap: wrap;
}
.vxvault-bar strong { font-weight: 600; }
.vxvault-bar .error { color: #e63946; }

.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }

.card {
  background: #fff;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
}
.card-label { font-size: .75rem; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: .04em; margin-bottom: .4rem; }
.card-title { font-size: .9rem; font-weight: 600; margin-bottom: .75rem; }
.card-stats { display: flex; gap: .5rem; font-size: .85rem; margin-bottom: .6rem; }
.stat-success { color: #2d6a4f; font-weight: 600; }
.stat-failed { color: #e63946; font-weight: 600; }
.stat-total { color: #888; }
.progress-bar { height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: #4361ee; transition: width .3s; }

.log-table { width: 100%; border-collapse: collapse; font-size: .8rem; }
.log-table th { text-align: left; padding: .5rem .75rem; background: #f7f7f7; border-bottom: 1px solid #e8e8e8; font-weight: 600; color: #555; position: sticky; top: 0; }
.log-table td { padding: .45rem .75rem; border-bottom: 1px solid #f0f0f0; word-break: break-all; }
.log-table tr.failed td { background: #fff5f5; color: #c1121f; }
.log-scroll { max-height: 400px; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 6px; }

.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #ccc; border-top-color: #4361ee; border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }

.badge { display: inline-block; padding: .1rem .4rem; border-radius: 3px; font-size: .75rem; font-weight: 600; }
.badge-success { background: #d8f3dc; color: #2d6a4f; }
.badge-failed { background: #ffe5e5; color: #c1121f; }
```

- [ ] **Step 2: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrafficGen</title>
  <link rel="stylesheet" href="/style.css">
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script defer src="/app.js"></script>
</head>
<body x-data="trafficGen()" x-init="init()">
  <header>
    <h1>TrafficGen</h1>
    <span style="font-size:.85rem;opacity:.7">Firewall &amp; SD-WAN Traffic Generator</span>
  </header>

  <!-- vxvault status bar -->
  <div style="padding:0 1.5rem">
    <div class="vxvault-bar">
      <strong>vxvault Malware List</strong>
      <span x-text="vxvault.count > 0 ? vxvault.count + ' URLs' : 'Not cached'"></span>
      <span x-show="vxvault.timestamp" x-text="'Last updated: ' + formatDate(vxvault.timestamp)"></span>
      <span class="error" x-show="vxvault.error" x-text="vxvault.error"></span>
      <button class="btn btn-secondary" @click="refreshVxvault" :disabled="vxvault.loading">
        <span x-show="vxvault.loading" class="spinner"></span>
        <span x-text="vxvault.loading ? 'Refreshing…' : 'Refresh Now'"></span>
      </button>
    </div>
  </div>

  <div class="layout">
    <!-- Left: config panel -->
    <div>
      <div class="panel">
        <h2>Test Configuration</h2>

        <!-- Test cases -->
        <template x-for="tc in testCaseList" :key="tc.key">
          <div class="test-case-block">
            <h3><label><input type="checkbox" x-model="tc.enabled"> <span x-text="tc.label"></span></label></h3>
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
                <span x-text="tc.uploadInfo.filename + ' (' + tc.uploadInfo.count + ' URLs)'"></span>
                <button class="btn btn-secondary" style="font-size:.78rem;padding:.3rem .5rem;color:#e63946"
                  @click="deleteUpload(tc.key)">✕</button>
              </template>
            </div>
          </div>
        </template>

        <!-- Source IPs -->
        <div style="margin-top:1rem">
          <strong style="font-size:.9rem">Source IPs</strong>
          <div class="ip-list" x-show="interfaces.length > 0">
            <template x-for="iface in interfaces" :key="iface.ip">
              <label>
                <input type="checkbox" :value="iface.ip" x-model="selectedIps">
                <span x-text="iface.name + ' — ' + iface.ip"></span>
              </label>
            </template>
          </div>
          <p x-show="interfaces.length === 0" style="font-size:.85rem;color:#888;margin-top:.5rem">
            No network interfaces found.
          </p>
        </div>

        <!-- Repeat count -->
        <div class="repeat-row">
          <label>Repeat:</label>
          <input type="number" x-model.number="repeatCount" min="1" step="1">
          <span style="font-size:.85rem;color:#888">time(s)</span>
        </div>

        <!-- Actions -->
        <div class="action-row">
          <button class="btn btn-primary" @click="startRun"
            :disabled="!canStart" x-show="!isRunning">Start</button>
          <button class="btn btn-danger" @click="stopRun" x-show="isRunning">Stop</button>
        </div>

        <p x-show="statusMessage" style="margin-top:.75rem;font-size:.85rem;color:#555"
          x-text="statusMessage"></p>
      </div>
    </div>

    <!-- Right: dashboard + log -->
    <div>
      <!-- Category cards -->
      <div class="cards-grid">
        <template x-for="card in categoryCards" :key="card.key">
          <div class="card">
            <div class="card-label" x-text="card.testCase"></div>
            <div class="card-title" x-text="card.category"></div>
            <div class="card-stats">
              <span class="stat-success" x-text="'✓ ' + card.success"></span>&nbsp;
              <span class="stat-failed" x-text="'✗ ' + card.failed"></span>&nbsp;
              <span class="stat-total" x-text="'/ ' + card.total"></span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill"
                :style="'width:' + (card.total > 0 ? Math.round(card.success/card.total*100) : 0) + '%'">
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Request log -->
      <div class="panel">
        <h2>Request Log
          <span x-show="requests.length > 0" style="font-weight:400;font-size:.85rem;color:#888"
            x-text="' — ' + requests.length + ' requests'"></span>
        </h2>
        <div class="log-scroll" x-show="requests.length > 0">
          <table class="log-table">
            <thead>
              <tr>
                <th>Time</th><th>Test Case</th><th>Category</th>
                <th>URL</th><th>Source IP</th>
                <th>Status</th><th>Code</th><th>Time (ms)</th><th>Error</th>
              </tr>
            </thead>
            <tbody>
              <template x-for="(r, i) in requests" :key="i">
                <tr :class="r.status === 'failed' ? 'failed' : ''">
                  <td x-text="r.time"></td>
                  <td x-text="r.testCase"></td>
                  <td x-text="r.category"></td>
                  <td x-text="r.url" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></td>
                  <td x-text="r.sourceIp"></td>
                  <td>
                    <span class="badge" :class="r.status === 'success' ? 'badge-success' : 'badge-failed'"
                      x-text="r.status"></span>
                  </td>
                  <td x-text="r.statusCode ?? '—'"></td>
                  <td x-text="r.responseTime"></td>
                  <td x-text="r.error ?? ''"></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p x-show="requests.length === 0" style="font-size:.85rem;color:#888">
          No requests yet. Start a test to see results.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 3: Create `public/app.js`**

```javascript
function trafficGen() {
  return {
    // State
    testCaseList: [
      { key: 'appControl', label: 'Application Control', enabled: true, useCustom: false, uploadInfo: null },
      { key: 'generalWeb', label: 'General Web Traffic', enabled: true, useCustom: false, uploadInfo: null },
      { key: 'malware',    label: 'Malware (vxvault)',   enabled: false, useCustom: false, uploadInfo: null },
    ],
    interfaces: [],
    selectedIps: [],
    repeatCount: 1,
    vxvault: { timestamp: null, count: 0, loading: false, error: null },
    isRunning: false,
    statusMessage: '',
    categoryCards: [],
    requests: [],
    currentRunId: null,
    sseSource: null,

    get canStart() {
      return this.selectedIps.length > 0
        && this.testCaseList.some(tc => tc.enabled)
        && !this.isRunning
        && this.repeatCount >= 1;
    },

    async init() {
      await Promise.all([this.loadInterfaces(), this.loadUrlLists(), this.loadVxvaultStatus()]);
    },

    async loadInterfaces() {
      const res = await fetch('/api/interfaces');
      this.interfaces = await res.json();
    },

    async loadUrlLists() {
      const res = await fetch('/api/url-lists');
      const data = await res.json();
      for (const tc of this.testCaseList) {
        const info = data[tc.key];
        tc.uploadInfo = tc.key === 'malware' ? info?.custom : info?.custom;
      }
    },

    async loadVxvaultStatus() {
      const res = await fetch('/api/vxvault/status');
      const data = await res.json();
      this.vxvault.timestamp = data.timestamp;
      this.vxvault.count = data.count;
    },

    async refreshVxvault() {
      this.vxvault.loading = true;
      this.vxvault.error = null;
      try {
        const res = await fetch('/api/vxvault/refresh', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Refresh failed');
        this.vxvault.timestamp = data.timestamp;
        this.vxvault.count = data.count;
      } catch (e) {
        this.vxvault.error = e.message;
      } finally {
        this.vxvault.loading = false;
      }
    },

    triggerUpload(tcKey) {
      document.getElementById('upload-' + tcKey).click();
    },

    async handleUpload(tcKey, event) {
      const file = event.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('testCase', tcKey);
      const res = await fetch('/api/url-lists/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert('Upload failed: ' + (data.errors?.join('\n') || data.error));
        return;
      }
      await this.loadUrlLists();
      const tc = this.testCaseList.find(t => t.key === tcKey);
      if (tc) tc.useCustom = true;
    },

    async deleteUpload(tcKey) {
      await fetch('/api/url-lists/' + tcKey, { method: 'DELETE' });
      const tc = this.testCaseList.find(t => t.key === tcKey);
      if (tc) { tc.uploadInfo = null; tc.useCustom = false; }
    },

    async startRun() {
      this.statusMessage = '';
      this.categoryCards = [];
      this.requests = [];

      const testCases = this.testCaseList.filter(tc => tc.enabled).map(tc => tc.key);
      const customLists = {};
      for (const tc of this.testCaseList) {
        if (tc.enabled) customLists[tc.key] = tc.useCustom ? 'custom' : 'builtin';
      }

      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases,
          sourceIps: this.selectedIps,
          repeatCount: this.repeatCount,
          customLists,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        this.statusMessage = 'Error: ' + data.error;
        return;
      }

      this.currentRunId = data.runId;
      this.isRunning = true;
      this.statusMessage = 'Running…';
      this.connectSse(data.runId);
    },

    connectSse(runId) {
      if (this.sseSource) this.sseSource.close();
      this.sseSource = new EventSource('/api/test/' + runId + '/stream');

      this.sseSource.onmessage = (event) => {
        const e = JSON.parse(event.data);

        if (e.type === 'request') {
          this.requests.unshift({
            time: new Date().toLocaleTimeString(),
            testCase: e.testCase,
            category: e.category,
            url: e.url,
            sourceIp: e.sourceIp,
            status: e.status,
            statusCode: e.statusCode,
            responseTime: e.responseTime,
            error: e.error,
          });
        }

        if (e.type === 'summary') {
          const key = e.testCase + ':' + e.category;
          const existing = this.categoryCards.find(c => c.key === key);
          if (existing) {
            existing.total = e.total;
            existing.success = e.success;
            existing.failed = e.failed;
          } else {
            this.categoryCards.push({ key, testCase: e.testCase, category: e.category, total: e.total, success: e.success, failed: e.failed });
          }
        }

        if (e.type === 'done') {
          this.isRunning = false;
          this.statusMessage = `Done — ${e.totalRequests} requests, ${e.totalSuccess} success, ${e.totalFailed} failed`;
          this.sseSource.close();
        }
      };

      this.sseSource.onerror = () => {
        // Run continues server-side; just close the stream client-side
        this.sseSource.close();
      };
    },

    async stopRun() {
      await fetch('/api/test/stop', { method: 'POST' });
      this.statusMessage = 'Stopping…';
    },

    formatDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString();
    },
  };
}
```

- [ ] **Step 4: Start the server and open the UI in a browser**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser. Verify:
- Configuration panel loads with test case checkboxes
- Source IP checklist populates (if network interfaces are available)
- vxvault status bar shows "Not cached" with a Refresh Now button
- Start button is disabled until at least one IP is selected

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat: complete frontend UI with Alpine.js"
```

---

## Task 14: Final Build Verification

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests PASS, zero failures.

- [ ] **Step 2: Build for production**

```bash
npm run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 3: Run the production build**

```bash
node dist/index.js
```

Expected: `TrafficGen running at http://0.0.0.0:3000`

- [ ] **Step 4: Smoke test the API**

```bash
# Should return JSON array of interfaces
curl http://localhost:3000/api/interfaces

# Should return url list info
curl http://localhost:3000/api/url-lists

# Should return vxvault cache status
curl http://localhost:3000/api/vxvault/status
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete TrafficGen implementation"
```
