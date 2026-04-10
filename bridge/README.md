# StockDesk Local Printer Bridge

This bridge is for shops that run StockDesk against the cloud backend but need receipt printing from a local USB or LAN ESC/POS printer.

## What it does

- accepts printer configuration from the StockDesk frontend
- accepts print jobs as structured receipt data
- sends ESC/POS output to a locally reachable printer

## What it does not do

- it does not replace the StockDesk backend
- it does not read sales directly from PostgreSQL
- it does not drive the built-in Sunmi printer SDK by itself

## Start

From the backend repo root:

```bash
npm run print-bridge
```

## Environment variables

- `PRINTER_BRIDGE_PORT=4100`
- `PRINTER_BRIDGE_CORS_ORIGINS=http://localhost:5173,https://your-vercel-app.vercel.app`
- `PRINTER_BRIDGE_KEY=optional-shared-secret`

## Frontend configuration

Point the frontend at Railway for normal API traffic and at the bridge for printer traffic:

```bash
VITE_API_URL=https://your-railway-domain/api
VITE_PRINTER_API_URL=http://192.168.1.20:4100
VITE_PRINTER_BRIDGE_KEY=optional-shared-secret
```

## Sunmi note

If you need the built-in printer on a Sunmi handheld, this bridge is only part of the solution. You still need an Android-side integration or WebView bridge that can call the Sunmi printer SDK.