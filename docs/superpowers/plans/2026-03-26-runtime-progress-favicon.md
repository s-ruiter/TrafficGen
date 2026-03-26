# Runtime Setting, Progress Bar, Favicon & Log UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repeat-count setting with a runtime (minutes) setting, add a progress bar and remaining-time display driven by a new `progress` SSE event, widen request log columns, switch timestamps to 24H, and add a favicon.

**Architecture:** A new `ProgressEvent` SSE type carries `elapsedSeconds` / `totalSeconds` from backend to frontend. The backend replaces the outer repeat-count loop with a deadline-based while loop that emits a progress event after every request. The frontend renders a progress bar and countdown from these events. All other run mechanics (SSE stream, stop, done event) are unchanged.

**Tech Stack:** Node.js 18+, TypeScript, Express, Alpine.js, Vitest

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/types.ts` | Replace `repeatCount` with `runtimeMinutes`; add `ProgressEvent`; update `SseEvent` union |
| Modify | `src/routes/test.ts` | Replace `repeatCount` validation with `runtimeMinutes` (1–240) |
| Modify | `src/services/testRunner.ts` | Replace repeat loop with time-based while loop; emit `progress` events |
| Modify | `tests/routes/test.test.ts` | Update all `repeatCount` references to `runtimeMinutes` |
| Modify | `tests/testRunner.test.ts` | Update `repeatCount` to `runtimeMinutes`; add progress event test |
| Modify | `public/app.js` | Replace `repeatCount` state; handle progress SSE; add `formatRemaining()`; 24H time |
| Modify | `public/index.html` | Replace repeat-count row; add progress bar; widen log columns |
| Create | `public/favicon.svg` | Teal traffic-flow SVG icon |

---

## Task 1: Update `src/types.ts`

**Files:**
- Modify: `src/types.ts:60-66`

- [ ] **Step 1: Replace `repeatCount` with `runtimeMinutes`, add `ProgressEvent`, update `SseEvent` union**

Open `src/types.ts`. Make these three changes:

**Change 1** — In `StartRunOptions` (line 63), replace `repeatCount: number` with `runtimeMinutes: number`:

```typescript
export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  runtimeMinutes: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
  includeHeavyAppControl?: boolean;
}
```

**Change 2** — Add `ProgressEvent` after `DoneEvent` (after line 51):

```typescript
export interface ProgressEvent {
  type: 'progress';
  elapsedSeconds: number;
  totalSeconds: number;
}
```

**Change 3** — Replace the existing `SseEvent` type alias (line 53):

```typescript
// Replace:
export type SseEvent = RequestEvent | SummaryEvent | DoneEvent;

// With:
export type SseEvent = RequestEvent | SummaryEvent | ProgressEvent | DoneEvent;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: replace repeatCount with runtimeMinutes; add ProgressEvent type"
```

---

## Task 2: Update `src/routes/test.ts`

**Files:**
- Modify: `src/routes/test.ts:13,25,45`
- Test: `tests/routes/test.test.ts`

- [ ] **Step 1: Update the route tests first**

Open `tests/routes/test.test.ts`. Replace every occurrence of `repeatCount: 1` with `runtimeMinutes: 10`. There are multiple — use find-and-replace. Also replace `repeatCount: 0` at line 143 (inside the "409 before validating body" test) with `runtimeMinutes: 10` (the 409 fires before validation so any valid or invalid value works here; use 10 for clarity). Then replace the test at line 76:

```typescript
// Remove this test:
it('POST /api/test/start returns 400 for repeatCount < 1', async () => {
  const res = await request(app).post('/api/test/start').send({
    testCases: ['appControl'],
    sourceIps: ['192.168.1.10'],
    repeatCount: 0,
  });
  expect(res.status).toBe(400);
});

// Replace with:
it('POST /api/test/start returns 400 for runtimeMinutes out of range', async () => {
  const res0 = await request(app).post('/api/test/start').send({
    testCases: ['appControl'],
    sourceIps: ['192.168.1.10'],
    runtimeMinutes: 0,
  });
  expect(res0.status).toBe(400);

  const res241 = await request(app).post('/api/test/start').send({
    testCases: ['appControl'],
    sourceIps: ['192.168.1.10'],
    runtimeMinutes: 241,
  });
  expect(res241.status).toBe(400);
});
```

Also update the `includeHeavyAppControl` test at the bottom (currently uses `repeatCount: 1`):

```typescript
it('POST /api/test/start returns 200 when testCases is empty but includeHeavyAppControl is true', async () => {
  const res = await request(app).post('/api/test/start').send({
    testCases: [],
    sourceIps: ['192.168.1.10'],
    runtimeMinutes: 10,
    includeHeavyAppControl: true,
  });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run tests to verify they fail with current implementation**

Run: `npx vitest run tests/routes/test.test.ts`
Expected: Multiple failures (type mismatches, validation passes when it shouldn't).

- [ ] **Step 3: Update the route implementation**

Open `src/routes/test.ts`. Make three targeted changes:

**Line 13** — Replace `repeatCount` in destructuring:

```typescript
// Before:
const { testCases, sourceIps, repeatCount, customLists = {}, includeHeavyAppControl = false } = req.body;

// After:
const { testCases, sourceIps, runtimeMinutes, customLists = {}, includeHeavyAppControl = false } = req.body;
```

**Lines 25–26** — Replace the `repeatCount` validation guard:

```typescript
// Before:
if (!Number.isInteger(repeatCount) || repeatCount < 1)
  return res.status(400).json({ error: 'repeatCount must be an integer >= 1' }) as any;

// After:
if (!Number.isInteger(runtimeMinutes) || runtimeMinutes < 1 || runtimeMinutes > 240)
  return res.status(400).json({ error: 'runtimeMinutes must be an integer between 1 and 240' }) as any;
```

**Line 45** — Replace `repeatCount` in `startRun()` call:

```typescript
// Before:
const runId = await startRun({ testCases, sourceIps, repeatCount, customLists, includeHeavyAppControl });

// After:
const runId = await startRun({ testCases, sourceIps, runtimeMinutes, customLists, includeHeavyAppControl });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/routes/test.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test.ts tests/routes/test.test.ts
git commit -m "feat: replace repeatCount with runtimeMinutes in route validation"
```

---

## Task 3: Update `src/services/testRunner.ts`

**Files:**
- Modify: `src/services/testRunner.ts:79-155`
- Test: `tests/testRunner.test.ts`

- [ ] **Step 1: Update the testRunner tests first**

Open `tests/testRunner.test.ts`. Replace every `repeatCount: 1` with `runtimeMinutes: 1`. There are 4 occurrences (lines 51, 63, 80, 104).

Then find the `'emits request and summary SSE events during execution'` test (starting at line 88). The test currently advances 500ms then 1100ms. With time-based execution, the done event only fires when `Date.now() >= deadline`. Replace the time-advance section and assertions:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail with current implementation**

Run: `npx vitest run tests/testRunner.test.ts`
Expected: TypeScript errors or test failures (wrong field name, no progress events).

- [ ] **Step 3: Replace the repeat loop with a time-based while loop**

Open `src/services/testRunner.ts`. Find `executeRun` (starting at line 79).

First, update the import at the top of the file (lines 5–8) to add `ProgressEvent`:

```typescript
// Before:
import type {
  RunState, TestCase, UrlEntry, SseEvent,
  RequestEvent, SummaryEvent, DoneEvent, StartRunOptions,
} from '../types';

// After:
import type {
  RunState, TestCase, UrlEntry, SseEvent,
  RequestEvent, SummaryEvent, ProgressEvent, DoneEvent, StartRunOptions,
} from '../types';
```

Then find and replace the entire `executeRun` body from after `await sleep(500)` onwards:

Replace the entire `// Build combined URL list` block through the end of the outer loop (lines 83–155). Here is the full updated `executeRun` body from after `await sleep(500)` onwards:

```typescript
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

  let totalRequests = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let ipIndex = 0;

  const totalSeconds = options.runtimeMinutes * 60;
  const startTime = Date.now();
  const deadline = startTime + totalSeconds * 1000;

  outer: while (Date.now() < deadline) {
    for (const entry of allUrls) {
      if (currentRun.stopRequested || Date.now() >= deadline) break outer;

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

      const elapsedSeconds = Math.min(Math.floor((Date.now() - startTime) / 1000), totalSeconds);
      emitEvent({ type: 'progress', elapsedSeconds, totalSeconds });

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/testRunner.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass (no regression in other test files).

- [ ] **Step 6: Commit**

```bash
git add src/services/testRunner.ts tests/testRunner.test.ts
git commit -m "feat: replace repeat loop with time-based while loop; emit progress SSE events"
```

---

## Task 4: Update `public/app.js`

**Files:**
- Modify: `public/app.js:12,22-32,159-198,204-244`

No automated tests cover `app.js` (it's Alpine.js frontend). Verify visually after Task 5.

- [ ] **Step 1: Replace `repeatCount` state with runtime state**

In `app.js`, on line 12, replace:
```javascript
repeatCount: 1,
```
With:
```javascript
runtimeMinutes: 10,
elapsedSeconds: 0,
totalSeconds: 0,
```

- [ ] **Step 2: Update `canStart` getter**

On line 31, replace:
```javascript
&& this.repeatCount >= 1;
```
With:
```javascript
&& this.runtimeMinutes >= 1;
```

- [ ] **Step 3: Reset progress state in `startRun()`**

In `startRun()`, after line 163 (`this._requestSeq = 0;`), add:
```javascript
this.elapsedSeconds = 0;
this.totalSeconds = 0;
```

- [ ] **Step 4: Replace `repeatCount` in POST body with `runtimeMinutes`**

In `startRun()`, in the `JSON.stringify({...})` block (around line 182), replace:
```javascript
repeatCount: this.repeatCount,
```
With:
```javascript
runtimeMinutes: this.runtimeMinutes,
```

- [ ] **Step 5: Add `progress` SSE event handler**

In `connectSse()`, the `onmessage` handler (around line 204), add a new `if` block after the `done` block:

```javascript
if (e.type === 'progress') {
  this.elapsedSeconds = e.elapsedSeconds;
  this.totalSeconds = e.totalSeconds;
}
```

- [ ] **Step 6: Fix timestamp to 24-hour format**

On line 210, replace:
```javascript
time: new Date().toLocaleTimeString(),
```
With:
```javascript
time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
```

- [ ] **Step 7: Add `formatRemaining()` helper method**

After `formatDate()` (around line 252), add:
```javascript
formatRemaining() {
  const remaining = Math.max(0, this.totalSeconds - this.elapsedSeconds);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s.toString().padStart(2, '0')} left`;
},
```

- [ ] **Step 8: Commit**

```bash
git add public/app.js
git commit -m "feat: replace repeatCount with runtimeMinutes in frontend; add progress state and 24H timestamps"
```

---

## Task 5: Update `public/index.html`

**Files:**
- Modify: `public/index.html:147-163,196-221`

- [ ] **Step 1: Replace the repeat-count row with the runtime row**

Find the `<!-- Repeat count -->` section (lines 147–152):

```html
<!-- Repeat count -->
<div class="repeat-row">
  <label>Repeat:</label>
  <input type="number" x-model.number="repeatCount" min="1" step="1">
  <span style="font-size:.85rem;color:#888">time(s)</span>
</div>
```

Replace with:

```html
<!-- Runtime -->
<div class="repeat-row">
  <label>Runtime (minutes):</label>
  <input type="number" x-model.number="runtimeMinutes" min="1" max="240" step="1" style="width:5rem">
</div>
```

- [ ] **Step 2: Add progress bar after the action row**

Find the `<!-- Actions -->` section (lines 154–163). After the closing `</div>` of `.action-row` and the `<p x-show="statusMessage"...` paragraph, add the progress bar:

The section from `<!-- Actions -->` through the status paragraph should look like this after the change:

```html
        <!-- Actions -->
        <div class="action-row">
          <button class="btn btn-primary" @click="startRun"
            :disabled="!canStart" x-show="!isRunning">Start</button>
          <button class="btn btn-danger" @click="stopRun" x-show="isRunning">Stop</button>
        </div>

        <!-- Progress bar -->
        <div x-show="isRunning" style="margin-top:.75rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;font-size:.85rem;color:#555">
            <span x-text="formatRemaining()"></span>
            <span x-text="totalSeconds > 0 ? Math.round(elapsedSeconds / totalSeconds * 100) + '%' : '0%'"></span>
          </div>
          <div style="background:#e8e8e8;border-radius:6px;height:10px;overflow:hidden">
            <div :style="'width:' + (totalSeconds > 0 ? Math.min(elapsedSeconds / totalSeconds * 100, 100) : 0) + '%;background:#2a9d8f;height:100%;border-radius:6px;transition:width .4s linear'"></div>
          </div>
        </div>

        <p x-show="statusMessage" style="margin-top:.75rem;font-size:.85rem;color:#555"
          x-text="statusMessage"></p>
```

- [ ] **Step 3: Widen the request log columns**

Find the `<thead>` of the log table (lines 196–201):

```html
            <thead>
              <tr>
                <th>Time</th><th>Test Case</th><th>Category</th>
                <th>URL</th><th>Source IP</th>
                <th>Status</th><th>Code</th><th>Time (ms)</th><th>Error</th>
              </tr>
            </thead>
```

Replace with:

```html
            <thead>
              <tr>
                <th style="min-width:70px">Time</th>
                <th style="min-width:110px">Test Case</th>
                <th style="min-width:130px">Category</th>
                <th style="min-width:360px">URL</th>
                <th style="min-width:120px">Source IP</th>
                <th style="min-width:80px">Status</th>
                <th style="min-width:60px">Code</th>
                <th style="min-width:80px">Time (ms)</th>
                <th>Error</th>
              </tr>
            </thead>
```

Also find the URL `<td>` (line 209) and update its `max-width` from `240px` to `360px`:

```html
<!-- Before: -->
<td x-text="r.url" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></td>

<!-- After: -->
<td x-text="r.url" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></td>
```

- [ ] **Step 4: Verify TypeScript build still passes**

Run: `npm run build`
Expected: No errors. (HTML changes don't affect TypeScript compilation but confirms nothing is broken.)

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: replace repeat-count row with runtime input; add progress bar; widen log columns"
```

---

## Task 6: Add favicon

**Files:**
- Create: `public/favicon.svg`
- Modify: `public/index.html:7` (head section)

- [ ] **Step 1: Create `public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#2a9d8f"/>
  <polyline points="6,16 13,9 13,13 26,13" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="26,16 19,23 19,19 6,19" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: Add `<link rel="icon">` to `public/index.html`**

In the `<head>` section (after line 7, `<link rel="stylesheet" href="/style.css">`), add:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

The `<head>` block should look like:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrafficGen</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <script defer src="/app.js"></script>
  <script defer src="/alpine.min.js"></script>
</head>
```

- [ ] **Step 3: Commit**

```bash
git add public/favicon.svg public/index.html
git commit -m "feat: add SVG favicon"
```

---

## Task 7: Full test suite verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full Vitest suite**

Run: `npx vitest run`
Expected: All tests pass. Note the exact count — should be 49 or more (no regressions).

- [ ] **Step 2: Start the dev server and smoke-test**

Run: `npm run dev`

Check the following in the browser:
1. "Runtime (minutes)" input appears with default value 10, range 1–240
2. Start button is enabled with runtime ≥ 1, a test case selected, and a source IP selected
3. After starting a run, the progress bar appears and fills over time; "X:XX left" countdown ticks down
4. "Stop" button cancels the run and bar disappears
5. Browser tab shows the teal favicon
6. Request log timestamps show 24H format (e.g. "14:32:05")
7. URL column in request log is noticeably wider

- [ ] **Step 3: If any fixups are needed, commit them**

```bash
git add -p
git commit -m "fix: <describe what was fixed>"
```
