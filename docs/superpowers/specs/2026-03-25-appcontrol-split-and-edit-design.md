# Application Control Split Checkboxes & Boost List Editor — Design

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Two additions to the Application Control test case:

1. **Split checkboxes** — The single "Application Control" checkbox splits into two independent sub-checkboxes: "Standard list" and "Boost (Facebook, Microsoft Office & Google Workspace)". Either or both can be selected. A select-all header checkbox controls both at once.

2. **Boost list editor** — The built-in list editor is extended to support `appControlHeavy` as an editable key, accessible via an Edit button on the Boost sub-row.

---

## 1. State Model (frontend)

The `appControl` entry in `testCaseList` (`public/app.js`) changes:

**Before:**
```javascript
{ key: 'appControl', label: 'Application Control', enabled: true, useCustom: false, uploadInfo: null, builtinModified: false, heavyApps: false }
```

**After:**
```javascript
{ key: 'appControl', label: 'Application Control', standardEnabled: true, heavyEnabled: false, useCustom: false, uploadInfo: null, builtinModified: false, heavyBuiltinModified: false }
```

- `enabled` is removed and replaced by `standardEnabled` and `heavyEnabled`
- `heavyApps` is removed and replaced by `heavyEnabled`
- `heavyBuiltinModified` tracks whether `appControlHeavy-builtin.json` differs from the default

---

## 2. UI Layout (index.html)

The Application Control `test-case-block` is restructured:

```
[☑/☐/~] Application Control          ← header checkbox (select-all / tri-state)
    [☑] Standard list  [Edit] [Upload]
        ☐ Use custom list  filename.json (×)
    [☐] Boost (Facebook, Microsoft Office & Google Workspace)  [Edit]
        • edited                      ← shown when heavyBuiltinModified is true
```

**Header checkbox behaviour:**
- Checked: both `standardEnabled` and `heavyEnabled` are true
- Unchecked: both are false
- Indeterminate (`indeterminate` DOM property set via `$el.indeterminate = ...`): only one is true
- Clicking when unchecked or indeterminate → sets both to true
- Clicking when both true → sets both to false

The header checkbox cannot use `x-model` directly (Alpine.js does not support tri-state). Instead use `@click` and `:checked` with a ref or `$el` to set the `indeterminate` property via an `x-init` or `x-effect`.

**Standard sub-row:** always visible in the appControl block. Contains the existing Edit, Upload, "Use custom list", and delete-upload controls — unchanged except they are now a sub-row.

**Boost sub-row:** always visible in the appControl block (not gated on standardEnabled). Contains:
- Checkbox bound to `tc.heavyEnabled` via `x-model`
- Label "Boost (Facebook, Microsoft Office &amp; Google Workspace)"
- Edit button → calls `openEditor('appControlHeavy', 'Boost List')`
- `• edited` indicator shown when `tc.heavyBuiltinModified` is true

**`canStart` logic** (valid JavaScript):
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

*(Note: `generalWeb` and `malware` entries still use `tc.enabled` — no change.)*

---

## 3. POST Body & `startRun()` logic

**`testCases` array:** includes `'appControl'` only when `standardEnabled` is true.

**`includeHeavyAppControl`:** `true` when `heavyEnabled` is true — sent regardless of `testCases` contents.

```javascript
// In startRun() in app.js
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

body: JSON.stringify({
  testCases,
  sourceIps: this.selectedIps,
  repeatCount: this.repeatCount,
  customLists,
  includeHeavyAppControl: ac?.heavyEnabled ?? false,
})
```

---

## 4. Backend Changes

### `src/types.ts`

```typescript
export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  repeatCount: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
  includeHeavyAppControl?: boolean;   // renamed from heavyApps
}
```

### `src/routes/test.ts`

- Destructure `includeHeavyAppControl = false` from `req.body` (replacing `heavyApps`)
- Update the empty-`testCases` validation to allow an empty array when `includeHeavyAppControl` is true:

```typescript
const { testCases, sourceIps, repeatCount, customLists = {}, includeHeavyAppControl = false } = req.body;

if (!Array.isArray(testCases) || (testCases.length === 0 && !includeHeavyAppControl))
  return res.status(400).json({ error: 'testCases must be a non-empty array' }) as any;
```

- Pass `includeHeavyAppControl` to `startRun()`

### `src/services/testRunner.ts`

First, add `access` to the existing named import at the top of the file (line 2):
```typescript
import { readFile, access } from 'fs/promises';
```

Then **remove the existing `if (options.heavyApps ...)` block entirely** and replace it with:

```typescript
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

The block is now gated solely on `options.includeHeavyAppControl` (the `testCases.includes('appControl')` guard is gone) and checks for an override file before falling back to the default JSON.

### `src/routes/urlLists.ts`

**Imports:** Add `appControlHeavyData` import:
```typescript
import appControlHeavyData from '../data/appControlHeavy.json';
```

**New constant alongside `EDITABLE_TEST_CASES`:**
```typescript
const EDITABLE_BUILTIN_KEYS: string[] = ['appControl', 'generalWeb', 'appControlHeavy'];
```

**Update `defaultBuiltins`:**
```typescript
const defaultBuiltins: Record<string, UrlEntry[]> = {
  appControl: appControlData as UrlEntry[],
  generalWeb: generalWebData as UrlEntry[],
  appControlHeavy: appControlHeavyData as UrlEntry[],
};
```

**New helper** (alongside `getBuiltinOverride` and `getCustomInfo`):
```typescript
async function getHeavyBuiltinOverride(): Promise<UrlEntry[] | null> {
  try {
    const data = await fs.readFile(path.resolve('uploads/appControlHeavy-builtin.json'), 'utf-8');
    return JSON.parse(data) as UrlEntry[];
  } catch { return null; }
}
```

**Update `GET /` handler** to include `appControlHeavy` in the response:
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

**Update the three builtin route handlers** to use `EDITABLE_BUILTIN_KEYS` instead of `EDITABLE_TEST_CASES` for the guard, and use `string` instead of `TestCase` for the parameter type:

```typescript
router.get('/:testCase/builtin', async (req, res) => {
  const key = req.params.testCase;
  if (!EDITABLE_BUILTIN_KEYS.includes(key))
    return res.status(400).json({ error: 'Invalid testCase' }) as any;
  // For appControlHeavy use the dedicated helper; for others use getBuiltinOverride
  let override: UrlEntry[] | null;
  if (key === 'appControlHeavy') {
    override = await getHeavyBuiltinOverride();
  } else {
    override = await getBuiltinOverride(key as TestCase);
  }
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

### `public/app.js` — `loadUrlLists()`

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

---

## 5. What Does NOT Change

- `generalWeb` and `malware` test case entries — still use `tc.enabled`, unaffected
- The built-in list editor component itself — same editor, called with `'appControlHeavy'` key
- Upload/custom list functionality for the standard appControl list — unchanged
- The Boost list does not support custom uploads — out of scope
- The `EDITABLE_TEST_CASES` constant and `VALID_TEST_CASES` constant in urlLists.ts remain as-is; only the three builtin route handlers switch to `EDITABLE_BUILTIN_KEYS`
