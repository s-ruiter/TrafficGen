# TrafficGen — README & Heavy Apps Feature Design

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Two deliverables:

1. **README.md** — deployment and update documentation for the TrafficGen app
2. **Heavy Apps checkbox** — a second checkbox inside the Application Control test case block that boosts request frequency for Facebook, Microsoft Office, and Google Workspace by appending a dedicated URL list to the pool

---

## 1. README.md

### Contents

- **Prerequisites:** Node.js 18+, npm
- **Installation:** `git clone` + `npm install`
- **Development:** `npm run dev` (tsx watch, no build step)
- **Production:** `npm run build` (compiles TypeScript to `dist/`) then `npm start`
- **Port configuration:** `PORT` environment variable (default: 3000)
- **Updating the app:** `git pull` → `npm install` → `npm run build` → restart

### Scope

No Docker, no CI/CD, no cloud-specific instructions — this is a local/server Node.js app. Keep it concise.

---

## 2. Heavy Apps Checkbox

### Goal

When the checkbox is selected, Facebook, Microsoft Office, and Google Workspace URLs appear twice in the Application Control URL pool (once from the standard list, once from the heavy list), doubling their hit frequency relative to other entries.

### Data Layer

New file: `src/data/appControlHeavy.json`

Contains ~18 entries across three categories:

| Category | Example URLs |
|---|---|
| `facebook` | facebook.com, messenger.com, business.facebook.com |
| `microsoft-office` | office.com, outlook.office.com, sharepoint.com, office apps subdomains |
| `google-workspace` | docs.google.com, sheets.google.com, slides.google.com, mail.google.com, calendar.google.com, meet.google.com |

### Frontend (`public/app.js`)

- Add `heavyApps: false` field to the `appControl` entry in `testCaseList`
- Render a second checkbox line inside the appControl block: "Boost Facebook, Microsoft Office & Google Workspace"
- Checkbox is only visible when appControl is enabled
- Send `heavyApps` flag in the `/api/test/start` JSON body alongside existing fields

### Frontend (`public/index.html`)

- Add the second checkbox markup inside the `appControl` test case block, conditionally shown with `x-show="tc.key === 'appControl' && tc.enabled"`

### Types (`src/types.ts`)

- Add `heavyApps?: boolean` to `StartRunOptions`

### Route (`src/routes/test.ts`)

- Extract `heavyApps` from `req.body` and pass to `startRun()`

### Test Runner (`src/services/testRunner.ts`)

- After loading the appControl URL list, if `options.heavyApps` is true, read `src/data/appControlHeavy.json` and append its entries to the `allUrls` array for the appControl test case
- No changes to the run loop itself — the duplication is handled entirely at list-build time

### User-visible behaviour

- Checkbox label: **"Boost Facebook, Microsoft Office & Google Workspace"**
- Appears indented under the Application Control header, below the existing "Use custom list" row
- Selecting both appControl + heavyApps + running → heavy URLs appear twice in the request log (once per occurrence in the pool)
- Dashboard cards will show separate cards for `facebook`, `microsoft-office`, `google-workspace` categories (same as any other appControl category)

### What is NOT changing

- The built-in list editor does not need to support `appControlHeavy.json` — it is not editable via the UI in this iteration
- No new API endpoints
- No changes to the upload/custom list flow
