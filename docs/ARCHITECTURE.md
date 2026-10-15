# Architecture

```
Browser (React + MapLibre + deck.gl)
   ^  WebSocket /stream  (snapshot, then deltas every ~3 s)
   |  REST /api/vehicles, /api/vehicles/:id, /api/vehicles/:id/route
Server (Fastify)
   ingest/     OpenSky poller, AISStream client, fixture replay  -> VehicleStore
   store/      in-memory Map with expiry and a change log (drain)
   enrich/     freight rules (callsign prefixes, AIS ship types), port/airport matching
   routing/    great-circle (planes), sea lanes (ships, TODO)
```

Design choices
- API keys stay on the server; the browser only talks to our own endpoints.
- The server sends compact deltas; the browser slides vehicles along their heading between reports (dead reckoning, `lib/motion.ts`).
- Routes are computed on click, not for every vehicle.
- Cargo is a category inferred from ship type or operator. Feeds do not broadcast actual cargo contents.
