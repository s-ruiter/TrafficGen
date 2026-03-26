# URLhaus Integration & README Custom Lists — Design

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Two deliverables:

1. **URLhaus integration** — Add abuse.ch URLhaus as an independent malware URL source alongside vxvault. URLhaus is cached server-side, has its own status bar and Refresh Now button, and is controlled by an independent checkbox in the malware block.
2. **README update** — Add a "Custom Lists" section documenting the file format, which test cases support custom lists, and how to upload and revert them.

---

## 1. Environment & Dependencies

### `.env`
Created at the repo root (not committed). Contains:
```
URLHAUS_API_KEY=<key>
```

### `.env.example`
Created at the repo root (committed). Contains:
```
URLHAUS_API_KEY=your_urlhaus_api_key_here
```

### `.gitignore`
Add `.env` if not already present.

### `dotenv` package
Add to dependencies: `npm install dotenv`

### `src/index.ts`
Load dotenv at the top of the file, before any other imports that read `process.env`:
```typescript
import 'dotenv/config';
```

---

## 2. Backend — `src/services/urlhausFetcher.ts`

New file, mirrors `vxvaultFetcher.ts` pattern.

**Fetch:** `POST https://urlhaus-api.abuse.ch/v1/urls/recent/` with header `Auth-Key: <URLHAUS_API_KEY>` and JSON body `{ "limit": 100 }`.

Expected response shape (relevant fields):
```json
{
  "query_status": "ok",
  "urls": [
    { "url": "http://...", "url_status": "online", "threat": "malware_download", ... }
  ]
}
```

**Filter:** Only include entries where `url_status === 'online'`.

**Map to `UrlEntry[]`:**
```typescript
{ name: entry.url, url: entry.url, category: 'urlhaus' }
```

**Cache:** Write to `cache/urlhaus-cache.json` as `{ timestamp: string, urls: UrlEntry[] }`.

**Exports:**
```typescript
export async function fetchUrlhausList(): Promise<UrlEntry[]>
export async function refreshUrlhausCache(): Promise<UrlhausCache>
export async function readUrlhausCache(): Promise<UrlhausCache | null>
```

**Error handling:** If `URLHAUS_API_KEY` is not set, `fetchUrlhausList` throws `Error('URLHAUS_API_KEY is not configured')`. If the API returns a non-ok status or `query_status !== 'ok'`, throw with the API's error message.

---

## 3. Backend — `src/routes/urlhaus.ts`

New file, mirrors `src/routes/vxvault.ts`.

```typescript
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
```

---

## 4. Backend — `src/types.ts`

**Add `UrlhausCache`** (same shape as `VxvaultCache`):
```typescript
export interface UrlhausCache {
  timestamp: string;
  urls: UrlEntry[];
}
```

**Update `StartRunOptions`** — add `includeUrlhaus`:
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

---

## 5. Backend — `src/server.ts`

Register the new router:
```typescript
import urlhausRouter from './routes/urlhaus';
// ...
app.use('/api/urlhaus', urlhausRouter);
```

---

## 6. Backend — `src/routes/test.ts`

**Add import** (alongside the existing `readCache` import from vxvaultFetcher — do not replace it):
```typescript
import { readCache } from '../services/vxvaultFetcher';
import { readUrlhausCache } from '../services/urlhausFetcher';
```

**Destructure `includeUrlhaus`:**
```typescript
const { testCases, sourceIps, runtimeMinutes, customLists = {}, includeHeavyAppControl = false, includeUrlhaus = false } = req.body;
```

**Validate:** If `includeUrlhaus` is true and the cache is empty, return 400:
```typescript
if (includeUrlhaus) {
  const cache = await readUrlhausCache();
  if (!cache || cache.urls.length === 0)
    return res.status(400).json({ error: 'URLhaus cache is empty. Please refresh.' }) as any;
}
```

**Pass to `startRun()`:**
```typescript
const runId = await startRun({ testCases, sourceIps, runtimeMinutes, customLists, includeHeavyAppControl, includeUrlhaus });
```

**Update the empty-testCases guard** to also allow an empty array when `includeUrlhaus` is true:
```typescript
if (!Array.isArray(testCases) || (testCases.length === 0 && !includeHeavyAppControl && !includeUrlhaus))
  return res.status(400).json({ error: 'testCases must be a non-empty array' }) as any;
```

---

## 7. Backend — `src/services/testRunner.ts`

After the existing `includeHeavyAppControl` block, add:
```typescript
if (options.includeUrlhaus) {
  const cache = await readUrlhausCache();
  if (cache) {
    for (const u of cache.urls) allUrls.push({ ...u, testCase: 'malware' });
  }
}
```

---

## 8. Frontend — `public/app.js`

### State additions

Add `urlhaus` state object alongside `vxvault`:
```javascript
urlhaus: { timestamp: null, count: 0, loading: false, error: null },
```

Add `urlhausEnabled: false` to the malware entry in `testCaseList`:
```javascript
{ key: 'malware', label: 'Malware (vxvault)', enabled: false, useCustom: false, uploadInfo: null, builtinModified: false, urlhausEnabled: false },
```

### `init()`

Add `loadUrlhausStatus()` to the parallel init calls:
```javascript
async init() {
  await Promise.all([this.loadInterfaces(), this.loadUrlLists(), this.loadVxvaultStatus(), this.loadUrlhausStatus()]);
},
```

### New methods

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

### `canStart` update

Include URLhaus in the active-source check:
```javascript
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

### `startRun()` POST body

Add a `mal` declaration alongside the existing `ac` declaration at the top of `startRun()`:
```javascript
const ac = this.testCaseList.find(tc => tc.key === 'appControl');
const mal = this.testCaseList.find(tc => tc.key === 'malware');
```

Then include `includeUrlhaus` in the POST body:
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

**Important:** `malware` is added to the `testCases` array only when `tc.enabled` (the vxvault checkbox) is true — NOT when only `urlhausEnabled` is true. The `testCases` array is built from `tc.enabled`, as before. URLhaus is passed via the separate `includeUrlhaus` flag. An `includeUrlhaus`-only run sends `testCases: []` with `includeUrlhaus: true`, which the backend allows (section 6 guard).

---

## 9. Frontend — `public/index.html`

### URLhaus status bar

Add a second status bar directly below the vxvault bar (same `.vxvault-bar` class and structure):
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

### Malware block restructure

The malware test case block (inside the `x-if="tc.key !== 'appControl'"` template) is updated. The `.custom-upload` row is moved out of indentation and placed as a peer row. The ordering is:

1. URLhaus sub-row (checkbox + label)
2. Malware/vxvault sub-row (checkbox + label) — this is `tc.enabled`
3. Use custom list row (checkbox + Upload button + filename) — shown when `tc.enabled` is true

The `<h3>` header for the malware block shows only the label with no checkbox (since the two sub-checkboxes are the controls), but the existing block for `tc.key !== 'appControl' && tc.key !== 'malware'` keeps its original layout.

So the malware block needs its own `x-if="tc.key === 'malware'"` template, similar to how appControl has its own template. The restructured block:

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
      <!-- Use custom list row (peer level, shown when vxvault enabled) -->
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

The existing `x-if="tc.key !== 'appControl'"` template is replaced with `x-if="tc.key !== 'appControl' && tc.key !== 'malware'"` so that malware uses its own dedicated template.

All three `<template x-if>` blocks — appControl, malware, and the generic one — must be **sibling elements at the same level** inside the `x-for` loop. None should be nested inside another. Alpine.js evaluates sibling `x-if` templates independently; nesting would break reactivity silently.

---

## 10. README update

Add a new section **"Custom Lists"** after the "Updating" section:

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

---

## 11. What Does NOT Change

- vxvault implementation — untouched
- `TestCase` union type — no new key added
- appControl, generalWeb — untouched
- The built-in list editor — untouched
- Upload/custom list flow mechanics — unchanged, only repositioned in the malware block UI
