# Build plan

Status key: [x] done, [~] built and tested with fake feeds only, [ ] to do.

- [x] 1. Monorepo, map renders (MapLibre basemap + deck.gl overlay)
- [x] 2. Ships and planes moving on the map (fixtures mode, dead-reckoned between updates)
- [x] 3. Server + WebSocket + fixture replay
- [~] 4. Live OpenSky planes: client written, with anonymous fallback. Tested against a local fake server only; needs a test with real OpenSky
- [~] 5. Live AISStream ships: client written, checked against AISStream's published schema, regions supported. Tested against a local fake server only; needs a test with a real key
- [ ] 6. Click panel enrichment: add the OpenSky aircraft database (icao24 -> type) and a plane route lookup
- [ ] 7. Real routes: sea-lane routing (`routing/seaRoute.ts`), plane origin/destination, ETA fallback from distance / speed
- [ ] 8. Freight highlighting polish, search by name/callsign
- [ ] 9. Deploy (one Node process on Fly.io or Railway; WebSockets need a persistent server)
- [ ] 10. Rail and road layers

## Known gaps / things to verify
- AISStream field names were checked against their published schema, but no real connection has been tested yet.
- OpenSky: query by bounding box to save credits; confirm current credit costs in their docs.
- Planes do not broadcast a destination; milestone 6/7 needs a separate route lookup.
- Basemap is the MapLibre demo style: fine for dev, replace before sharing publicly.
