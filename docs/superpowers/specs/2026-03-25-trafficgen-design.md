# TrafficGen — Design Spec
**Date:** 2026-03-25

## Overview

TrafficGen is a TypeScript/Node.js web application that generates outbound HTTP traffic from a machine inside a network, used to test firewall and SD-WAN configurations. It supports three test cases: Application Control, General Web Traffic, and Malware (vxvault). Tests run at 1 request per second (non-performance), support multiple source IPs, and can be repeated N times. A web UI is accessible from other machines on the network and shows a real-time summary dashboard.

---

## Architecture

A single Express + TypeScript server. The frontend is served as static files from `public/` and communicates with the backend via REST endpoints and Server-Sent Events (SSE) for live dashboard updates. No separate frontend build pipeline — plain HTML + vanilla JS with Alpine.js (CDN) for reactivity.

The TypeScript backend is compiled to `dist/` with `tsc` (target: ES2020, module: commonjs, outDir: dist). In production, the server runs as `node dist/server.js`. In development, `tsx` is used for direct TS execution.

On startup, the server ensures `cache/` and `uploads/` directories exist, creating them if absent.

```
TrafficGen/
├── src/
│   ├── server.ts                  # Express app entry point
│   ├── routes/
│   │   ├── test.ts                # Start/stop test, SSE stream
│   │   ├── urlLists.ts            # Upload/manage URL lists
│   │   ├── interfaces.ts          # List local network interfaces
│   │   └── vxvault.ts             # Fetch/cache vxvault list
│   ├── services/
│   │   ├── testRunner.ts          # Core test execution loop
│   │   ├── httpClient.ts          # HTTP requests with source IP binding
│   │   ├── vxvaultFetcher.ts      # Fetch + cache vxvault URL list
│   │   └── networkInterfaces.ts   # Enumerate local IPs
│   ├── data/
│   │   ├── appControl.json        # Built-in app control URLs
│   │   └── generalWeb.json        # Built-in general web URLs
│   └── types.ts                   # Shared TypeScript types
├── cache/
│   └── vxvault-cache.json         # Runtime vxvault cache (gitignored)
├── public/
│   ├── index.html                 # Main UI
│   ├── app.js                     # Alpine.js frontend logic
│   └── style.css
├── uploads/                       # User-uploaded URL lists (gitignored)
├── dist/                          # Compiled output (gitignored)
├── package.json
└── tsconfig.json
```

---

## URL Lists & Test Cases

### 1. Application Control
Built-in `appControl.json` contains ~50 URLs grouped by app category: `social`, `streaming`, `file-sharing`, `voip`, `gaming`. Curated manually to represent well-known apps in each category (e.g., Facebook, YouTube, Dropbox, Zoom, Steam). Users can upload a custom CSV or JSON file that **replaces** the built-in list **for that specific test case only** within a run.

### 2. General Web Traffic
Built-in `generalWeb.json` contains ~50 URLs across categories: `news`, `shopping`, `finance`, `search`, `tech`. Sourced from well-known public sites (e.g., BBC, Amazon, Bloomberg, Google, GitHub). Custom upload supported, scoped to this test case only.

### 3. Malware (vxvault)
The vxvault list is fetched from **`http://vxvault.net/URL_List.php`** — a plain-text response with one URL per line. Lines starting with `;` are comments and must be skipped. Each remaining line is trimmed and validated using Node's `new URL()` constructor — only lines that parse without error **and** have a scheme of `http:` or `https:` are kept; all others are silently discarded.

The parsed list is cached in `cache/vxvault-cache.json` with a timestamp. The cache is used for all test runs — never fetched live mid-test. A "Refresh Now" button in the UI triggers a fresh fetch. If a fresh fetch fails, the existing cache is retained and an error is shown in the UI.

**Malware list semantics in test runs:** There is no "built-in" static list for malware — the vxvault cache serves as the list. In the `POST /api/test/start` request, specifying `"malware": "builtin"` or omitting malware from `customLists` both mean "use the vxvault cache." If the cache file is missing or empty at run start, the backend returns 400 with a message directing the user to refresh the vxvault list. Custom CSV/JSON upload for malware is also supported (same format as other test cases, using standard CSV parsing only — not the vxvault line format) and replaces the cached vxvault list for that run.

### URL List Format (JSON)
```json
[
  { "name": "YouTube", "url": "https://youtube.com", "category": "streaming" },
  { "name": "Facebook", "url": "https://facebook.com", "category": "social" }
]
```

### CSV Upload Format
```
name,url,category
YouTube,https://youtube.com,streaming
```

**CSV validation rules:**
- All three columns (`name`, `url`, `category`) are required
- `url` must parse via `new URL()` without error and have a scheme of `http:` or `https:`; invalid rows are rejected with a descriptive error
- `category` is free-form text (no enum constraint)
- Extra columns beyond the three are ignored
- Maximum file size: 1 MB
- Maximum row count: 1000 URLs
- Empty rows are skipped

**Upload persistence:** Uploaded files are saved in `uploads/` and persist across runs until explicitly deleted. The UI lists available uploaded files per test case and allows deletion. Each test case has its own upload slot (one active custom list per test case at a time — uploading a new file replaces the previous one for that test case).

**Upload endpoint parameter:** `POST /api/url-lists/upload` expects a `multipart/form-data` request with two fields: `file` (the uploaded file) and `testCase` (one of `"appControl"`, `"generalWeb"`, `"malware"`) as a form field alongside the file.

The user selects any combination of the three test cases per run.

---

## Test Runner

### Execution Flow
1. User configures a run: selects test cases, source IPs (at least one required), repeat count (≥ 1), and clicks Start
2. `POST /api/test/start` validates the request and returns a `runId` immediately
3. The test runner starts after a **500ms delay** — this gives the frontend time to establish the SSE connection before the first event is emitted. No events are emitted during this window
4. Runner builds a flat combined URL list from all selected test cases (using custom list if provided, otherwise built-in/cache). With `repeatCount: N`, this combined list is repeated N times in full — repetition applies to the entire combined list, not per-test-case
5. For each URL: pick the next source IP (round-robin from user's selected IPs — if only one IP is selected, every request uses that IP), make an HTTP GET request with `localAddress` bound to that IP, then **wait 1 second after the response is received (or error/timeout occurs)** before the next request
6. On failure (timeout, DNS error, non-2xx): log it, skip, continue
7. Request timeout: **10 seconds** per request

**Repeat example:** With `testCases: ["appControl", "generalWeb"]` and `repeatCount: 3`, the runner executes: [all appControl URLs + all generalWeb URLs] × 3 in sequence.

### Source IP Binding
Node's native `http`/`https` modules support a `localAddress` option. The runner passes the selected source IP at request time. **`node-fetch` is not used — the native `http`/`https` modules are used directly.**

`/api/interfaces` enumerates all local network interfaces. **At least one source IP must be selected to start a run.** This is enforced in the UI (Start button is disabled if no IP is selected) and validated in the backend (`POST /api/test/start` returns 400 if `sourceIps` is empty). The backend also validates that each IP in `sourceIps` is present in the current interface list — unknown IPs return 400 rather than failing silently at bind time.

### Run Lifecycle
- Each run has a unique UUID
- Status: `idle | running | completed | stopped`
- **Only one run active at a time** — starting a new run while one is active returns 409
- User can stop a run via the Stop button. A stop sets an internal flag that is **checked between requests** — the in-flight request is allowed to complete naturally before the run halts. Stopping does not abort in-flight requests.

### SSE Progress Events
Frontend connects to `/api/test/:id/stream`. **The run continues regardless of whether the SSE client is connected.** The stream closes automatically after the `done` event. There is no event replay — clients that disconnect cannot retrieve missed events.

A `summary` event is emitted **after each individual request** (not at the end of a category), so the dashboard cards update in real-time.

```
{ type: "request", url, testCase, category, status: "success"|"failed", statusCode: number|null, responseTime, sourceIp, error?: string }
{ type: "summary", testCase, category, total, success, failed }
{ type: "done", totalRequests, totalSuccess, totalFailed }
```

- `statusCode` is `null` for transport-level failures (timeout, DNS error, connection refused) where no HTTP response was received
- `testCase` is present on both `request` and `summary` events to allow the frontend to unambiguously key dashboard cards even if the same category name appears in multiple test cases
- `totalRequests/totalSuccess/totalFailed` in the `done` event cover the **entire run including all repeats**, not just the final repeat

---

## Web UI

A single-page interface served at the root, with four sections:

### 1. Configuration Panel
- Checkboxes for test cases: Application Control, General Web Traffic, Malware (vxvault)
- Per test case: "Use custom list" toggle + file upload button + delete button for existing upload
- Source IP checklist (populated from `/api/interfaces`) — at least one must be checked to enable Start
- Repeat count input (number, min 1, default 1)
- Start button (disabled if no IP selected or run already active) / Stop button (shown during active run)

### 2. vxvault Status Bar
- Last cache update timestamp
- URL count in cached list
- "Refresh Now" button with loading spinner
- Error message shown if last refresh failed

### 3. Live Dashboard
- One card per (testCase + category) combination (e.g., "AppControl / Social", "GeneralWeb / News")
- Each card: total URLs, success count, failed count, mini progress bar
- Updates in real-time via SSE `summary` events, keyed by `testCase + category`

### 4. Request Log
- Scrollable table of all requests in the current run
- Columns: timestamp, test case, category, URL, source IP, status (success/fail), HTTP status code (or "—" if null), response time (ms), error (if any)
- Failed rows highlighted in red

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interfaces` | List local network interfaces with IPs |
| GET | `/api/url-lists` | List available URL lists (built-in + uploaded per test case) |
| POST | `/api/url-lists/upload` | Upload a custom URL list (CSV or JSON) for a specific test case |
| DELETE | `/api/url-lists/:testCase` | Delete the uploaded custom list for a test case |
| GET | `/api/vxvault/status` | Cache status (timestamp, count) |
| POST | `/api/vxvault/refresh` | Fetch fresh vxvault list and update cache |
| POST | `/api/test/start` | Start a new test run |
| POST | `/api/test/stop` | Stop the active run |
| GET | `/api/test/:id/stream` | SSE stream for live progress events |

### `GET /api/interfaces` — Response
Returns only non-loopback, non-link-local IPv4 addresses. Loopback (`127.x.x.x`) and link-local (`169.254.x.x`) addresses are excluded. IPv6 addresses are excluded.
```json
[
  { "name": "eth0", "ip": "192.168.1.10" },
  { "name": "eth1", "ip": "10.0.0.5" }
]
```

### `GET /api/url-lists` — Response
```json
{
  "appControl": { "builtin": 50, "custom": { "filename": "my-apps.csv", "count": 30 } },
  "generalWeb": { "builtin": 50, "custom": null },
  "malware": { "vxvaultCache": { "timestamp": "2026-03-25T10:00:00Z", "count": 412 }, "custom": null }
}
```
- `custom` is `null` if no file has been uploaded for that test case
- `malware` has a `vxvaultCache` field instead of `builtin`

### `POST /api/test/start` — Request Body Schema
```json
{
  "testCases": ["appControl", "generalWeb", "malware"],
  "sourceIps": ["192.168.1.10", "192.168.1.11"],
  "repeatCount": 3,
  "customLists": {
    "appControl": "custom",
    "generalWeb": "builtin",
    "malware": "builtin"
  }
}
```

- `testCases`: array of one or more of `"appControl"`, `"generalWeb"`, `"malware"` (required, non-empty)
- `sourceIps`: array of IP strings (required, non-empty, all IPs must exist in current interface list) — returns 400 if empty or if any IP is not in the interface list
- `repeatCount`: integer ≥ 1 (required) — returns 400 if < 1
- `customLists`: optional map of test case → `"builtin"` or `"custom"`. Defaults to `"builtin"` for any test case not specified. Returns 400 if `"custom"` is specified for a test case with no uploaded file. For `"malware"`, `"builtin"` means use the vxvault cache — returns 400 if cache is missing or empty.

**Response (200):**
```json
{ "runId": "uuid" }
```

**Error responses:** 400 (validation failure), 409 (run already active)

### `POST /api/test/stop` — Behavior
- If a run is active (status `running`): sets the stop flag, returns `200 { "status": "stopping" }`
- If no run is currently active (status is `idle`, `completed`, or `stopped`): returns `404 { "message": "no active run" }`
- Repeated calls while a run is stopping (flag set but run not yet halted) return `200 { "status": "stopping" }`

---

## Error Handling

- Failed HTTP requests: logged with error type, skipped, test continues
- Request timeout: 10 seconds; treated as failure; `statusCode` is `null` in the event
- vxvault fetch failure: retain existing cache, surface error in UI
- vxvault cache missing or empty at run start: return 400 with message to refresh
- File upload validation: reject invalid CSV/JSON with descriptive error message
- Zero source IPs selected: UI disables Start; backend returns 400
- Unknown source IP submitted: backend returns 400
- `repeatCount` < 1: backend returns 400
- Run already active: `POST /api/test/start` returns 409

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `typescript` | Type safety |
| `tsx` | TS execution in dev |
| `multer` | File upload handling |
| `uuid` | Run IDs |
| `alpine.js` (CDN) | Frontend reactivity |

Native Node.js `http`/`https` modules are used for all outbound requests (no `node-fetch`).

---

## Non-Goals
- Performance/load testing (this is functional traffic generation only)
- Authentication or access control
- Persistent test history across restarts
- HTTPS for the web UI itself
- Parallel requests (strictly sequential, 1 req/sec)
