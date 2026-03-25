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
