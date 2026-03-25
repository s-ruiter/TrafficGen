# Application Control Split Checkboxes & Boost List Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Application Control checkbox into two independent sub-checkboxes (Standard list / Boost list), support running with either or both selected, and add an Edit button for the Boost list using the existing built-in list editor.

**Architecture:** Rename `heavyApps` to `includeHeavyAppControl` throughout the stack and remove its dependency on `testCases` containing `'appControl'`. Extend `urlLists.ts` with a new `EDITABLE_BUILTIN_KEYS` string array and a dedicated helper for the heavy override file. Restructure the `appControl` entry in `testCaseList` to carry `standardEnabled` and `heavyEnabled` flags; rebuild `canStart` and `startRun()` accordingly. Restructure the HTML block for Application Control with a tri-state header checkbox and two sub-rows.

**Tech Stack:** Node.js 18+, TypeScript, Express, Alpine.js, Vitest

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/types.ts` | Rename `heavyApps` → `includeHeavyAppControl` in `StartRunOptions` |
| Modify | `src/routes/test.ts` | New field name, updated empty-testCases validation |
| Modify | `src/services/testRunner.ts` | Add `access` import, replace heavy-list block |
| Modify | `src/routes/urlLists.ts` | `EDITABLE_BUILTIN_KEYS`, `appControlHeavyData`, `getHeavyBuiltinOverride`, updated GET `/`, updated builtin route handlers |
| Modify | `public/app.js` | New `appControl` state model, `canStart`, `loadUrlLists`, `startRun` |
| Modify | `public/index.html` | Tri-state header checkbox, Standard sub-row, Boost sub-row |
| Modify | `tests/routes/test.test.ts` | Add test: empty `testCases` allowed when `includeHeavyAppControl` is true |
| Modify | `tests/routes/urlLists.test.ts` | Add tests for `appControlHeavy` builtin GET/PUT/DELETE and GET `/` response |

---

## Task 1: Update `src/types.ts` — rename `heavyApps` to `includeHeavyAppControl`

**Files:**
- Modify: `src/types.ts:60-65`

- [ ] **Step 1: Update `StartRunOptions`**

Change `heavyApps?: boolean` to `includeHeavyAppControl?: boolean`:

```typescript
export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  repeatCount: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
  includeHeavyAppControl?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: errors about `heavyApps` being unknown (in `test.ts` and `testRunner.ts`) — these will be fixed in the next tasks. Zero errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "refactor: rename heavyApps to includeHeavyAppControl in StartRunOptions"
```

---

## Task 2: Update `src/routes/test.ts` — new field name, updated validation

**Files:**
- Modify: `src/routes/test.ts:13,19,45`
- Test: `tests/routes/test.test.ts`

- [ ] **Step 1: Add a failing test for the new empty-testCases behaviour**

In `tests/routes/test.test.ts`, add this test inside the existing `describe('Test routes', ...)` block:

```typescript
it('POST /api/test/start returns 200 when testCases is empty but includeHeavyAppControl is true', async () => {
  const res = await request(app).post('/api/test/start').send({
    testCases: [],
    sourceIps: ['192.168.1.10'],
    repeatCount: 1,
    includeHeavyAppControl: true,
  });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run the new test to confirm it fails**

```bash
npm test -- tests/routes/test.test.ts 2>&1 | tail -20
```

Expected: FAIL — the route currently rejects empty `testCases`.

- [ ] **Step 3: Update `src/routes/test.ts`**

**Line 13** — destructure `includeHeavyAppControl` (replacing `heavyApps`):
```typescript
const { testCases, sourceIps, repeatCount, customLists = {}, includeHeavyAppControl = false } = req.body;
```

**Line 19** — update the empty-testCases guard:
```typescript
if (!Array.isArray(testCases) || (testCases.length === 0 && !includeHeavyAppControl))
  return res.status(400).json({ error: 'testCases must be a non-empty array' }) as any;
```

**Line 45** — pass the new field to `startRun`:
```typescript
const runId = await startRun({ testCases, sourceIps, repeatCount, customLists, includeHeavyAppControl });
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test.ts tests/routes/test.test.ts
git commit -m "feat: accept empty testCases when includeHeavyAppControl is true"
```

---

## Task 3: Update `src/services/testRunner.ts` — replace heavy-list block

**Files:**
- Modify: `src/services/testRunner.ts:2,91-96`

- [ ] **Step 1: Add `access` to the existing named import (line 2)**

Change:
```typescript
import { readFile } from 'fs/promises';
```
to:
```typescript
import { readFile, access } from 'fs/promises';
```

- [ ] **Step 2: Remove the existing heavy-list block and replace it**

Remove lines 91–96 (the `// Append heavy app URLs...` block):
```typescript
  // Append heavy app URLs when requested (doubles their frequency in the pool)
  if (options.heavyApps && options.testCases.includes('appControl')) {
    const heavyData = await readFile(path.resolve('src/data/appControlHeavy.json'), 'utf-8');
    const heavyUrls: UrlEntry[] = JSON.parse(heavyData);
    for (const u of heavyUrls) allUrls.push({ ...u, testCase: 'appControl' });
  }
```

Replace with:
```typescript
  // Append heavy app URLs when requested (doubles their frequency in the pool)
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/testRunner.ts
git commit -m "feat: load heavy list independently of standard appControl, support override file"
```

---

## Task 4: Update `src/routes/urlLists.ts` — appControlHeavy editor support

**Files:**
- Modify: `src/routes/urlLists.ts:7-8,53-57,59-64,78-103,139-165`
- Test: `tests/routes/urlLists.test.ts`

- [ ] **Step 1: Add failing tests for the new appControlHeavy endpoints**

In `tests/routes/urlLists.test.ts`, add these tests inside the existing `describe` block:

```typescript
it('GET /api/url-lists returns appControlHeavy in response', async () => {
  const res = await request(app).get('/api/url-lists');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('appControlHeavy');
  expect(res.body.appControlHeavy).toHaveProperty('builtinModified');
  expect(res.body.appControlHeavy.builtinModified).toBe(false);
});

it('GET /api/url-lists/appControlHeavy/builtin returns default entries', async () => {
  const res = await request(app).get('/api/url-lists/appControlHeavy/builtin');
  expect(res.status).toBe(200);
  expect(res.body.isDefault).toBe(true);
  expect(Array.isArray(res.body.entries)).toBe(true);
  expect(res.body.entries.length).toBeGreaterThan(0);
});

it('PUT /api/url-lists/appControlHeavy/builtin saves custom entries', async () => {
  const entries = [{ name: 'Test', url: 'https://example.com', category: 'test' }];
  const res = await request(app)
    .put('/api/url-lists/appControlHeavy/builtin')
    .send(entries);
  expect(res.status).toBe(200);
  expect(res.body.count).toBe(1);
});

it('DELETE /api/url-lists/appControlHeavy/builtin returns 200', async () => {
  const res = await request(app).delete('/api/url-lists/appControlHeavy/builtin');
  expect(res.status).toBe(200);
  expect(res.body.reset).toBe(true);
});

it('GET /api/url-lists/appControlHeavy/builtin shows builtinModified after PUT', async () => {
  const entries = [{ name: 'Test', url: 'https://example.com', category: 'test' }];
  await request(app).put('/api/url-lists/appControlHeavy/builtin').send(entries);

  const listRes = await request(app).get('/api/url-lists');
  expect(listRes.body.appControlHeavy.builtinModified).toBe(true);
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
npm test -- tests/routes/urlLists.test.ts 2>&1 | tail -30
```

Expected: the five new tests fail.

- [ ] **Step 3: Update `src/routes/urlLists.ts`**

**Add import** (after line 8):
```typescript
import appControlHeavyData from '../data/appControlHeavy.json';
```

**Add `EDITABLE_BUILTIN_KEYS`** and update `defaultBuiltins` (replace lines 53–57):
```typescript
const EDITABLE_TEST_CASES: TestCase[] = ['appControl', 'generalWeb'];
const EDITABLE_BUILTIN_KEYS: string[] = ['appControl', 'generalWeb', 'appControlHeavy'];
const defaultBuiltins: Record<string, UrlEntry[]> = {
  appControl: appControlData as UrlEntry[],
  generalWeb: generalWebData as UrlEntry[],
  appControlHeavy: appControlHeavyData as UrlEntry[],
};
```

**Add `getHeavyBuiltinOverride` helper** (after the existing `getCustomInfo` function, around line 76):
```typescript
async function getHeavyBuiltinOverride(): Promise<UrlEntry[] | null> {
  try {
    const data = await fs.readFile(path.resolve('uploads/appControlHeavy-builtin.json'), 'utf-8');
    return JSON.parse(data) as UrlEntry[];
  } catch { return null; }
}
```

**Update `GET /` handler** — add `heavyOverride` to the Promise.all and add `appControlHeavy` to the response:
```typescript
router.get('/', async (_req, res) => {
  const cache = await readCache();
  const [acCustom, gwCustom, mCustom, acOverride, gwOverride, heavyOverride] = await Promise.all([
    getCustomInfo('appControl'),
    getCustomInfo('generalWeb'),
    getCustomInfo('malware'),
    getBuiltinOverride('appControl'),
    getBuiltinOverride('generalWeb'),
    getHeavyBuiltinOverride(),
  ]);
  res.json({
    appControl: {
      builtin: (acOverride ?? (appControlData as UrlEntry[])).length,
      builtinModified: acOverride !== null,
      custom: acCustom,
    },
    generalWeb: {
      builtin: (gwOverride ?? (generalWebData as UrlEntry[])).length,
      builtinModified: gwOverride !== null,
      custom: gwCustom,
    },
    malware: {
      vxvaultCache: cache ? { timestamp: cache.timestamp, count: cache.urls.length } : null,
      custom: mCustom,
    },
    appControlHeavy: {
      builtinModified: heavyOverride !== null,
    },
  });
});
```

**Replace the three builtin route handlers** (GET, PUT, DELETE `/:testCase/builtin`) to use `EDITABLE_BUILTIN_KEYS` and `string` keys:

```typescript
router.get('/:testCase/builtin', async (req, res) => {
  const key = req.params.testCase;
  if (!EDITABLE_BUILTIN_KEYS.includes(key))
    return res.status(400).json({ error: 'Invalid testCase' }) as any;
  const override = key === 'appControlHeavy'
    ? await getHeavyBuiltinOverride()
    : await getBuiltinOverride(key as TestCase);
  res.json({ entries: override ?? defaultBuiltins[key], isDefault: override === null });
});

router.put('/:testCase/builtin', async (req, res) => {
  const key = req.params.testCase;
  if (!EDITABLE_BUILTIN_KEYS.includes(key))
    return res.status(400).json({ error: 'Invalid testCase' }) as any;
  const entries = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'Body must be an array' }) as any;
  if (entries.length === 0) return res.status(400).json({ error: 'List cannot be empty' }) as any;
  const errors = validateJson(entries as UrlEntry[]);
  if (errors.length) return res.status(400).json({ errors }) as any;
  await fs.writeFile(path.resolve(`uploads/${key}-builtin.json`), JSON.stringify(entries, null, 2));
  res.json({ count: entries.length });
});

router.delete('/:testCase/builtin', async (req, res) => {
  const key = req.params.testCase;
  if (!EDITABLE_BUILTIN_KEYS.includes(key))
    return res.status(400).json({ error: 'Invalid testCase' }) as any;
  await fs.unlink(path.resolve(`uploads/${key}-builtin.json`)).catch(() => {});
  res.json({ reset: true });
});
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/routes/urlLists.ts tests/routes/urlLists.test.ts
git commit -m "feat: extend urlLists route to support appControlHeavy builtin editing"
```

---

## Task 5: Update `public/app.js` — new state model and run logic

**Files:**
- Modify: `public/app.js:5,22-27,38-46,147-168`

- [ ] **Step 1: Update the `appControl` entry in `testCaseList` (line 5)**

Change:
```javascript
{ key: 'appControl', label: 'Application Control', enabled: true, useCustom: false, uploadInfo: null, builtinModified: false, heavyApps: false },
```
to:
```javascript
{ key: 'appControl', label: 'Application Control', standardEnabled: true, heavyEnabled: false, useCustom: false, uploadInfo: null, builtinModified: false, heavyBuiltinModified: false },
```

- [ ] **Step 2: Replace the `canStart` getter (lines 22–27)**

Replace:
```javascript
    get canStart() {
      return this.selectedIps.length > 0
        && this.testCaseList.some(tc => tc.enabled)
        && !this.isRunning
        && this.repeatCount >= 1;
    },
```
with:
```javascript
    get canStart() {
      const ac = this.testCaseList.find(tc => tc.key === 'appControl');
      const appControlActive = ac ? (ac.standardEnabled || ac.heavyEnabled) : false;
      const othersActive = this.testCaseList
        .filter(tc => tc.key !== 'appControl')
        .some(tc => tc.enabled);
      return (appControlActive || othersActive)
        && this.selectedIps.length > 0
        && !this.isRunning
        && this.repeatCount >= 1;
    },
```

- [ ] **Step 3: Update `loadUrlLists()` (lines 38–46)**

Replace:
```javascript
    async loadUrlLists() {
      const res = await fetch('/api/url-lists');
      const data = await res.json();
      for (const tc of this.testCaseList) {
        const info = data[tc.key];
        tc.uploadInfo = info?.custom;
        tc.builtinModified = info?.builtinModified ?? false;
      }
    },
```
with:
```javascript
    async loadUrlLists() {
      const res = await fetch('/api/url-lists');
      const data = await res.json();
      for (const tc of this.testCaseList) {
        if (tc.key === 'appControl') {
          const info = data['appControl'];
          tc.uploadInfo = info?.custom;
          tc.builtinModified = info?.builtinModified ?? false;
          tc.heavyBuiltinModified = data['appControlHeavy']?.builtinModified ?? false;
        } else {
          const info = data[tc.key];
          tc.uploadInfo = info?.custom;
          tc.builtinModified = info?.builtinModified ?? false;
        }
      }
    },
```

- [ ] **Step 4: Replace the `startRun()` method (lines 147–181)**

Replace the entire `startRun()` method with:
```javascript
    async startRun() {
      this.statusMessage = '';
      this.categoryCards = [];
      this.requests = [];
      this._requestSeq = 0;

      const ac = this.testCaseList.find(tc => tc.key === 'appControl');
      const testCases = [
        ...(ac?.standardEnabled ? ['appControl'] : []),
        ...this.testCaseList.filter(tc => tc.key !== 'appControl' && tc.enabled).map(tc => tc.key),
      ];
      const customLists = {};
      if (ac?.standardEnabled) customLists['appControl'] = ac.useCustom ? 'custom' : 'builtin';
      for (const tc of this.testCaseList.filter(t => t.key !== 'appControl' && t.enabled)) {
        customLists[tc.key] = tc.useCustom ? 'custom' : 'builtin';
      }

      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases,
          sourceIps: this.selectedIps,
          repeatCount: this.repeatCount,
          customLists,
          includeHeavyAppControl: ac?.heavyEnabled ?? false,
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
```

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: split appControl into standardEnabled/heavyEnabled, update canStart and startRun"
```

---

## Task 6: Update `public/index.html` — restructure Application Control block

**Files:**
- Modify: `public/index.html:38-71`

- [ ] **Step 1: Replace the Application Control block**

The current `test-case-block` template (lines 38–71) uses `tc.enabled` for the header checkbox and has a single `custom-upload` sub-row plus the `heavyApps` row.

**Alpine.js tri-state note:** `indeterminate` cannot be bound with `:indeterminate` — it must be set imperatively. Place `x-effect` on the `<h3>` element (not on the `<input>`) so that `$el.querySelector('input[type=checkbox]')` finds the checkbox inside it. The header checkbox uses `:checked` and `@click` rather than `x-model` to control both flags at once.

Replace the entire `<template x-for="tc in testCaseList" :key="tc.key">` block (lines 38–72) with:

```html
        <template x-for="tc in testCaseList" :key="tc.key">
          <div class="test-case-block">

            <!-- Application Control: tri-state header + two sub-rows -->
            <template x-if="tc.key === 'appControl'">
              <div>
                <h3 style="display:flex;justify-content:space-between;align-items:center"
                    x-effect="$el.querySelector('input[type=checkbox]').indeterminate = (tc.standardEnabled !== tc.heavyEnabled)">
                  <label>
                    <input type="checkbox"
                      :checked="tc.standardEnabled && tc.heavyEnabled"
                      @click="tc.standardEnabled && tc.heavyEnabled ? (tc.standardEnabled = false, tc.heavyEnabled = false) : (tc.standardEnabled = true, tc.heavyEnabled = true)">
                    <span x-text="tc.label"></span>
                  </label>
                </h3>

                <!-- Standard sub-row -->
                <div style="margin-left:1.2rem">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <label><input type="checkbox" x-model="tc.standardEnabled"> Standard list</label>
                    <span style="display:flex;align-items:center;gap:.4rem">
                      <span x-show="tc.builtinModified" style="font-size:.7rem;color:#f4a261;font-weight:600">edited</span>
                      <button class="btn btn-secondary" style="font-size:.75rem;padding:.2rem .5rem"
                        @click="openEditor('appControl', 'Application Control')">Edit</button>
                    </span>
                  </div>
                  <div class="custom-upload" x-show="tc.standardEnabled">
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

                <!-- Boost sub-row -->
                <div style="margin-left:1.2rem;margin-top:.4rem">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <label><input type="checkbox" x-model="tc.heavyEnabled"> Boost (Facebook, Microsoft Office &amp; Google Workspace)</label>
                    <span style="display:flex;align-items:center;gap:.4rem">
                      <span x-show="tc.heavyBuiltinModified" style="font-size:.7rem;color:#f4a261;font-weight:600">edited</span>
                      <button class="btn btn-secondary" style="font-size:.75rem;padding:.2rem .5rem"
                        @click="openEditor('appControlHeavy', 'Boost List')">Edit</button>
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <!-- All other test cases: original layout unchanged -->
            <template x-if="tc.key !== 'appControl'">
              <div>
                <h3 style="display:flex;justify-content:space-between;align-items:center">
                  <label><input type="checkbox" x-model="tc.enabled"> <span x-text="tc.label"></span></label>
                  <span style="display:flex;align-items:center;gap:.4rem">
                    <span x-show="tc.builtinModified" style="font-size:.7rem;color:#f4a261;font-weight:600">edited</span>
                    <button x-show="tc.key !== 'malware'" class="btn btn-secondary"
                      style="font-size:.75rem;padding:.2rem .5rem" @click="openEditor(tc.key, tc.label)">Edit</button>
                  </span>
                </h3>
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
            </template>

          </div>
        </template>
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: restructure Application Control block with tri-state header and two sub-rows"
```

---

## Task 7: Smoke test end-to-end

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: server starts on port 3000, no TypeScript errors.

- [ ] **Step 3: Verify the UI**

Open `http://localhost:3000`.

Check:
- Application Control shows a header checkbox (tri-state) with two sub-rows: "Standard list" and "Boost (Facebook, Microsoft Office & Google Workspace)"
- Each sub-row has an Edit button
- Checking only "Standard list" makes the header indeterminate
- Checking only "Boost" makes the header indeterminate
- Checking neither disables the Start button (if no other test case is active)
- Checking the header selects both; unchecking deselects both

- [ ] **Step 4: Verify the Boost list editor**

Click Edit on the Boost sub-row. Confirm the editor opens with 18 entries. Make a change, save, verify the "edited" indicator appears.

- [ ] **Step 5: Verify "Boost only" run**

Uncheck Standard list, check Boost list, select a source IP, click Start. Confirm the request log shows only `facebook`, `microsoft-office`, and `google-workspace` category entries.

- [ ] **Step 6: Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix: <describe what was fixed>"
```
