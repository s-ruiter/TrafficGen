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
- Indeterminate (`indeterminate` DOM property): only one is true
- Clicking when unchecked or indeterminate → sets both to true
- Clicking when both true → sets both to false

**Standard sub-row:** shows when appControl block is rendered. Contains the existing Edit, Upload, Use custom list, and delete-upload controls — unchanged except they are now a sub-row rather than a top-level row.

**Boost sub-row:** always visible (not gated on standardEnabled). Contains:
- Checkbox bound to `tc.heavyEnabled`
- Label "Boost (Facebook, Microsoft Office & Google Workspace)"
- Edit button → opens editor with key `'appControlHeavy'` and label `'Boost List'`
- "edited" indicator shown when `tc.heavyBuiltinModified` is true

**`canStart` logic:**
```javascript
get canStart() {
  const appControlActive = this.testCaseList
    .find(tc => tc.key === 'appControl')
    ?.let(tc => tc.standardEnabled || tc.heavyEnabled) ?? false;
  const othersActive = this.testCaseList
    .filter(tc => tc.key !== 'appControl')
    .some(tc => tc.enabled);
  return (appControlActive || othersActive)
    && this.selectedIps.length > 0
    && !this.isRunning
    && this.repeatCount >= 1;
}
```

*(Note: `generalWeb` and `malware` entries still use `tc.enabled` — no change.)*

---

## 3. POST Body Changes

**Before:**
```json
{
  "testCases": ["appControl"],
  "sourceIps": [...],
  "repeatCount": 1,
  "customLists": { "appControl": "builtin" },
  "heavyApps": false
}
```

**After:**
```json
{
  "testCases": ["appControl"],
  "sourceIps": [...],
  "repeatCount": 1,
  "customLists": { "appControl": "builtin" },
  "includeHeavyAppControl": false
}
```

- `'appControl'` is included in `testCases` only when `standardEnabled` is true
- `includeHeavyAppControl` is `true` when `heavyEnabled` is true — sent regardless of `testCases`
- `heavyApps` is renamed to `includeHeavyAppControl`

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
- Pass `includeHeavyAppControl` to `startRun()`

### `src/services/testRunner.ts`

Change the heavy-list append condition from:
```typescript
if (options.heavyApps && options.testCases.includes('appControl')) {
```
to:
```typescript
if (options.includeHeavyAppControl) {
```

The heavy list is now appended whenever the flag is true, independent of whether the standard appControl list is included.

### `src/routes/urlLists.ts`

Extend the valid builtin keys to include `'appControlHeavy'`:

- **GET `/api/url-lists/appControlHeavy/builtin`** — reads `uploads/appControlHeavy-builtin.json` if it exists, otherwise falls back to `src/data/appControlHeavy.json`. Returns `{ entries, isDefault }`.
- **PUT `/api/url-lists/appControlHeavy/builtin`** — validates and writes to `uploads/appControlHeavy-builtin.json`.
- **DELETE `/api/url-lists/appControlHeavy/builtin`** — removes `uploads/appControlHeavy-builtin.json`.

The `testRunner.ts` `loadUrlList` function already handles the builtin override pattern via `uploads/${testCase}-builtin.json`. Since `appControlHeavy` is not a `TestCase` enum value and is loaded directly (not via `loadUrlList`), the heavy-list load in `executeRun` must be updated to check for an override file:

```typescript
if (options.includeHeavyAppControl) {
  let heavyPath: string;
  try {
    await fs.access(path.resolve('uploads/appControlHeavy-builtin.json'));
    heavyPath = path.resolve('uploads/appControlHeavy-builtin.json');
  } catch {
    heavyPath = path.resolve('src/data/appControlHeavy.json');
  }
  const heavyData = await readFile(heavyPath, 'utf-8');
  const heavyUrls: UrlEntry[] = JSON.parse(heavyData);
  for (const u of heavyUrls) allUrls.push({ ...u, testCase: 'appControl' });
}
```

### `public/app.js` — `loadUrlLists()`

Update `loadUrlLists()` to also fetch `appControlHeavy` builtin status and set `heavyBuiltinModified` on the appControl test case:

```javascript
async loadUrlLists() {
  const res = await fetch('/api/url-lists');
  const data = await res.json();
  for (const tc of this.testCaseList) {
    if (tc.key === 'appControl') {
      const info = data['appControl'];
      tc.uploadInfo = info?.custom;
      tc.builtinModified = info?.builtinModified ?? false;
      const heavyInfo = data['appControlHeavy'];
      tc.heavyBuiltinModified = heavyInfo?.builtinModified ?? false;
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
- The built-in list editor component itself — same editor, just called with `'appControlHeavy'` key
- Upload/custom list functionality for the standard appControl list — unchanged
- The Boost list does not support custom uploads (only built-in editing) — out of scope
- No new API endpoints — the existing `/api/url-lists/:key/builtin` pattern is extended
