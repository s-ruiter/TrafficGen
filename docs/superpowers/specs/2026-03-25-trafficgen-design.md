# TrafficGen — Design Spec
**Date:** 2026-03-25

## Overview

TrafficGen is a TypeScript/Node.js web application that generates outbound HTTP traffic from a machine inside a network, used to test firewall and SD-WAN configurations. It supports three test cases: Application Control, General Web Traffic, and Malware (vxvault). Tests run at 1 request per second (non-performance), support multiple source IPs, and can be repeated N times. A web UI is accessible from other machines on the network and shows a real-time summary dashboard.

---

## Architecture

A single Express + TypeScript server. The frontend is served as static files from `public/` and communicates with the backend via REST endpoints and Server-Sent Events (SSE) for live dashboard updates. No separate frontend build pipeline — plain HTML + vanilla JS with Alpine.js (CDN) for reactivity.

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
│   │   ├── generalWeb.json        # Built-in general web URLs
│   │   └── vxvault-cache.json     # Cached vxvault list (gitignored)
│   └── types.ts                   # Shared TypeScript types
├── public/
│   ├── index.html                 # Main UI
│   ├── app.js                     # Alpine.js frontend logic
│   └── style.css
├── uploads/                       # User-uploaded URL lists (gitignored)
├── package.json
└── tsconfig.json
```

---

## URL Lists & Test Cases

### 1. Application Control
Built-in `appControl.json` contains URLs grouped by app category (e.g., `social`, `streaming`, `file-sharing`, `voip`, `gaming`). Users can upload a custom CSV or JSON file to replace the built-in list for a test run.

### 2. General Web Traffic
Built-in `generalWeb.json` contains a broad mix of common websites across categories like `news`, `shopping`, `finance`, `search`, `tech`. Custom upload supported.

### 3. Malware (vxvault)
The vxvault list is fetched from the public vxvault URL feed and cached in `data/vxvault-cache.json` with a timestamp. The cache is used for all test runs — never fetched live mid-test. A "Refresh Now" button in the UI triggers a fresh fetch.

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

The user selects any combination of the three test cases per run.

---

## Test Runner

### Execution Flow
1. User configures a run: selects test cases, source IPs, repeat count, and clicks Start
2. Runner builds a flat ordered list of URLs from selected test cases
3. For each URL: pick the next source IP (round-robin from user's selected IPs), make an HTTP GET request with `localAddress` bound to that IP, wait 1 second, move to next URL
4. If `repeatCount > 1`, the full list runs again from the top
5. On failure (timeout, DNS error, non-2xx): log it, skip, continue

### Source IP Binding
Node's `http`/`https` modules support a `localAddress` option. The runner passes the selected source IP at request time. `/api/interfaces` enumerates all local network interfaces so the UI can show a checklist.

### Run Lifecycle
- Each run has a unique UUID
- Status: `idle | running | completed | stopped`
- User can stop a run mid-way via a Stop button
- Only one run active at a time

### SSE Progress Events
Frontend connects to `/api/test/:id/stream` and receives:
```
{ type: "request", url, category, status, statusCode, responseTime, sourceIp }
{ type: "summary", category, total, success, failed }
{ type: "done" }
```

---

## Web UI

A single-page interface served at the root, with four sections:

### 1. Configuration Panel
- Checkboxes for test cases: Application Control, General Web Traffic, Malware (vxvault)
- Per test case: "Use custom list" toggle + file upload button
- Source IP checklist (populated from `/api/interfaces`)
- Repeat count input (number, default 1)
- Start / Stop buttons

### 2. vxvault Status Bar
- Last cache update timestamp
- URL count in cached list
- "Refresh Now" button with loading spinner

### 3. Live Dashboard
- One card per category (Social, Streaming, News, Malware, etc.)
- Each card: total URLs, success count, failed count, mini progress bar
- Updates in real-time via SSE

### 4. Request Log
- Scrollable table of all requests in the current run
- Columns: timestamp, category, URL, source IP, status (success/fail), HTTP status code, response time (ms)
- Failed rows highlighted in red

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interfaces` | List local network interfaces with IPs |
| GET | `/api/url-lists` | List available URL lists (built-in + uploaded) |
| POST | `/api/url-lists/upload` | Upload a custom URL list (CSV or JSON) |
| GET | `/api/vxvault/status` | Cache status (timestamp, count) |
| POST | `/api/vxvault/refresh` | Fetch fresh vxvault list and update cache |
| POST | `/api/test/start` | Start a new test run |
| POST | `/api/test/stop` | Stop the active run |
| GET | `/api/test/:id/stream` | SSE stream for live progress events |

---

## Error Handling

- Failed HTTP requests: logged with error type, skipped, test continues
- vxvault fetch failure: retain existing cache, surface error in UI
- File upload validation: reject files that don't match expected CSV/JSON format
- Only one active run at a time: return 409 if a run is already in progress

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `typescript` | Type safety |
| `tsx` | TS execution in dev |
| `multer` | File upload handling |
| `node-fetch` or native `https` | HTTP requests with localAddress |
| `uuid` | Run IDs |
| `alpine.js` (CDN) | Frontend reactivity |

---

## Non-Goals
- Performance/load testing (this is functional traffic generation only)
- Authentication or access control
- Persistent test history across restarts
- HTTPS for the web UI itself
