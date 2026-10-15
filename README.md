# Transport Map

A web app showing live ships and planes on a world map, with freight highlighted. Click a vehicle to see
its route, type, cargo category, speed and ETA. Hobby project.

## Quick start

Requires Node 20.19+ or 22 (see `.nvmrc`).

```bash
npm install
npm run dev        # server on :3001, web app on http://localhost:5173
```

It starts in **fixtures mode**: a handful of synthetic ships and planes that move around, so you can build the
UI with no API keys and no rate limits.

## Going live

1. Copy `.env.example` to `.env` (never commit it).
2. **Ships:** set `AISSTREAM_API_KEY` (free key from aisstream.io). Pick sea areas with `AIS_REGIONS`
   (for example `english-channel,malacca`). Start with a few regions: the worldwide stream is very heavy.
3. **Planes (optional credentials):** with no OpenSky credentials the app uses OpenSky's anonymous access,
   which has a much smaller allowance, so planes update slowly (every 15 minutes by default).
   For more, log in at opensky-network.org, open your Account page, create an API client, and set
   `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`.
4. Set `DATA_MODE=live` and restart `npm run dev`.

If planes show an error, the panel and terminal give the reason (for example `connection timed out (UND_ERR_CONNECT_TIMEOUT)`).
The panel in the top-left corner shows whether each feed is live, connecting, off or failing, and why.
The server terminal also logs `[ais]` and `[opensky]` lines (messages received, credits left, errors).
Check each provider's current terms and limits before relying on them.

## Layout

```
apps/server    Fastify + WebSocket: ingest, enrichment, routing, API
apps/web       React + Vite + MapLibre + deck.gl
packages/shared  Types used by both sides (Vehicle, RouteGeometry, StreamMessage)
data/          Reference data (ports, airports, freight callsigns)  see data/README.md
fixtures/      Synthetic sample feeds for offline development
docs/          PLAN.md (milestones) and ARCHITECTURE.md
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server and web app together |
| `npm test` | Server unit tests (parsing, freight rules, destination matching, routing, store) |
| `npm run typecheck` | Type-check all packages |
| `npm run build` | Build the web app (served by the server in production) |
| `npm start` | Run the server (serves `apps/web/dist` if built) |

## Status

See `docs/PLAN.md` for the milestone checklist.

## Troubleshooting

- **Vehicles and panels show but the map layer is blank:** open the browser console. A "Worker failed to load" error means MapLibre cannot find its worker file. `apps/web/src/map/MapView.tsx` sets it explicitly with `setWorkerUrl`; keep that if you upgrade MapLibre.
- **Terminal says `mode: fixtures` but you wanted live data:** read the `[config]` lines printed at startup. They say whether a `.env` was found, which settings it contained, and what to fix. Common causes: the file is named `.env.txt` (Windows hides extensions), it sits in the wrong folder (it belongs next to `package.json`), or `DATA_MODE=live` is missing. On Windows, create it with `cp .env.example .env` and edit it in a normal editor such as VS Code (UTF-8). The app also tolerates files saved with a BOM or as UTF-16, which Node's own loader silently misreads.
- **`ws proxy error: ECONNABORTED` in the terminal during `npm run dev`:** harmless. React StrictMode opens the WebSocket twice in development, and Vite logs the first one closing.
- **Red 404 messages after clicking a plane:** expected. Planes have no known destination, so their route request returns 404.
- **Ships only appear in a few spots (for example the UK and Malaysia):** ships show up only inside the sea areas listed in
  `AIS_REGIONS`. Add more areas (see `.env.example`) or use `world`, then restart. AISStream's coverage depends on
  shore-based receivers, so the open ocean stays empty.
- **No visible movement:** ships are slow compared with the map scale. At 12 knots a ship moves about 6 metres a second,
  which is under a pixel a minute at regional zoom. Zoom in, or select a ship to see its path build up.
- **"Origin" is never shown for ships:** ships do not broadcast where they came from, only where they are going.
  "Path so far" shows where the app has watched a ship travel since it started.
- **All ships look like one blob at world zoom:** you are watching a few small sea areas (`AIS_REGIONS`), so at world
  zoom they overlap. Use the **Jump to** buttons in the controls panel, or zoom in.
- **Ships show "Not received yet" for type, cargo and destination:** the feed only sends a ship's name, type and
  destination roughly every 6 minutes, so details fill in over the first several minutes. Freight highlighting depends
  on this too, so the "Freight only" count starts at zero and grows. Small boats (Class B) send a name and type but never
  a destination.
- **Planes show a connection error:** the panel says why (for example `connection timed out`). OpenSky can be down or
  unreachable from your network; the app keeps retrying on its own.
- **Route line looks odd near its ends:** routes follow a shipping-lane network (`searoute-js`) for realistic-looking
  paths, not for navigation. If its route is absurdly long (for example trans-Pacific) the app draws a straight line instead.
# Transport-Map
