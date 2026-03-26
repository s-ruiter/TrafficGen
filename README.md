# TrafficGen

Web traffic generator for firewall and SD-WAN testing. Sends HTTP requests to configurable URL lists (application control traffic, general web, and malware URLs from vxvault) across multiple source IPs.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (included with Node.js)

## Installation

```bash
git clone <repo-url>
cd TrafficGen
npm install
```

## Running

### Development

Starts the server with live TypeScript compilation (no build step required):

```bash
npm run dev
```

### Production

Build first, then start:

```bash
npm run build
npm start
```

The server starts on port **3000** by default. To use a different port:

```bash
PORT=8080 npm start
```

Open `http://localhost:3000` (or your configured port) in a browser.

## Updating

```bash
git pull
npm install
npm run build   # production only
```

Then restart the server.

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
