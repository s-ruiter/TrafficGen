# Runtime Setting, Progress Bar, Favicon & Log UI — Design

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Four changes to TrafficGen:

1. **Runtime setting** — Replace the "Repeat count" input with a "Runtime (minutes)" input (1–240). Tests loop continuously until the configured time expires.
2. **Progress bar & timer** — A progress bar and remaining-time display appear during a run, driven by a new `progress` SSE event from the backend.
3. **Request log UI improvements** — Wider columns for readability; timestamp uses 24-hour format.
4. **Favicon** — A small SVG icon served as a static asset.

---

## 1. Types (`src/types.ts`)

### `StartRunOptions`

Replace `repeatCount: number` with `runtimeMinutes: number`:

```typescript
export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  runtimeMinutes: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
  includeHeavyAppControl?: boolean;
}
```

### New `ProgressEvent`

Add the interface and replace the existing `SseEvent` type alias:

```typescript
export interface ProgressEvent {
  type: 'progress';
  elapsedSeconds: number;
  totalSeconds: number;
}

// Replace the existing SseEvent type alias with:
export type SseEvent = RequestEvent | SummaryEvent | ProgressEvent | DoneEvent;
```

---

## 2. Backend — `src/routes/test.ts`

Replace `repeatCount` with `runtimeMinutes` throughout:

```typescript
const { testCases, sourceIps, runtimeMinutes, customLists = {}, includeHeavyAppControl = false } = req.body;
```

Validation (replaces the `repeatCount` check):
```typescript
if (!Number.isInteger(runtimeMinutes) || runtimeMinutes < 1 || runtimeMinutes > 240)
  return res.status(400).json({ error: 'runtimeMinutes must be an integer between 1 and 240' }) as any;
```

Pass `runtimeMinutes` to `startRun()`:
```typescript
const runId = await startRun({ testCases, sourceIps, runtimeMinutes, customLists, includeHeavyAppControl });
```

---

## 3. Backend — `src/services/testRunner.ts`

### Time-based loop

Replace the outer `for (let repeat ...)` loop with a deadline-based `while` loop. After each request, emit a `ProgressEvent`:

```typescript
const totalSeconds = options.runtimeMinutes * 60;
const startTime = Date.now();
const deadline = startTime + totalSeconds * 1000;

outer: while (Date.now() < deadline) {
  for (const entry of allUrls) {
    if (currentRun.stopRequested || Date.now() >= deadline) break outer;

    // ... existing request logic (makeRequest, emitEvent for request + summary) ...

    const elapsedSeconds = Math.min(Math.floor((Date.now() - startTime) / 1000), totalSeconds);
    emitEvent({ type: 'progress', elapsedSeconds, totalSeconds });

    await sleep(1000);
  }
}
```

No other changes to request handling, stop logic, or done event.

---

## 4. Frontend — `public/app.js`

### State

Replace `repeatCount: 1` with:
```javascript
runtimeMinutes: 10,
elapsedSeconds: 0,
totalSeconds: 0,
```

### `canStart` getter

Replace `this.repeatCount >= 1` with `this.runtimeMinutes >= 1`.

### `startRun()` POST body

Replace `repeatCount: this.repeatCount` with `runtimeMinutes: this.runtimeMinutes`.

### SSE event handler — handle `progress`

In the SSE `message` handler, add a `progress` case:
```javascript
} else if (event.type === 'progress') {
  this.elapsedSeconds = event.elapsedSeconds;
  this.totalSeconds = event.totalSeconds;
}
```

Reset on run start:
```javascript
this.elapsedSeconds = 0;
this.totalSeconds = 0;
```

### Helper method — `formatRemaining()`

```javascript
formatRemaining() {
  const remaining = Math.max(0, this.totalSeconds - this.elapsedSeconds);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s.toString().padStart(2, '0')} left`;
},
```

### Timestamp format — 24H

Change the time stamp assigned when a request event is received:
```javascript
// Before:
time: new Date().toLocaleTimeString(),

// After:
time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
```

`'en-GB'` locale forces 24-hour HH:MM:SS format regardless of browser locale.

---

## 5. Frontend — `public/index.html`

### Replace repeat-count row

Find the `.repeat-row` div (or equivalent) and replace it with:
```html
<div class="repeat-row">
  <label>Runtime (minutes)
    <input type="number" x-model.number="runtimeMinutes" min="1" max="240" style="width:5rem">
  </label>
</div>
```

### Progress bar

Add below the Start/Stop buttons, visible only during a run (`x-show="isRunning"`):

```html
<div x-show="isRunning" style="margin-top:.75rem">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;font-size:.85rem;color:#555">
    <span x-text="formatRemaining()"></span>
    <span x-text="totalSeconds > 0 ? Math.round(elapsedSeconds / totalSeconds * 100) + '%' : '0%'"></span>
  </div>
  <div style="background:#e8e8e8;border-radius:6px;height:10px;overflow:hidden">
    <div :style="'width:' + (totalSeconds > 0 ? Math.min(elapsedSeconds / totalSeconds * 100, 100) : 0) + '%;background:#2a9d8f;height:100%;border-radius:6px;transition:width .4s linear'"></div>
  </div>
</div>
```

### Request log — wider columns

Update the URL column `max-width` from `240px` to `360px`. Add explicit `min-width` values to prevent columns from collapsing:

```html
<th style="min-width:70px">Time</th>
<th style="min-width:110px">Test Case</th>
<th style="min-width:130px">Category</th>
<th style="min-width:360px">URL</th>
<th style="min-width:120px">Source IP</th>
<th style="min-width:80px">Status</th>
<th style="min-width:60px">Code</th>
<th style="min-width:80px">Time (ms)</th>
<th>Error</th>
```

URL cell:
```html
<td x-text="r.url" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></td>
```

---

## 6. Favicon — `public/favicon.svg`

A simple traffic/flow SVG icon in the app's teal color (`#2a9d8f`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#2a9d8f"/>
  <polyline points="6,16 13,9 13,13 26,13" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="26,16 19,23 19,19 6,19" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Link tag added to `<head>` in `index.html`:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

---

## 7. What Does NOT Change

- The SSE stream endpoint and connection logic — unchanged
- The Stop button and stop logic — unchanged (works the same; `stopRequested` flag breaks the while loop)
- The `done` event — unchanged
- Dashboard cards, summary display — unchanged
- Test case selection, upload flow — unchanged
- The `EDITABLE_TEST_CASES` / `EDITABLE_BUILTIN_KEYS` constants — unchanged
