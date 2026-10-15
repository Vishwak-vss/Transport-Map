import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { config, envInfo } from './config';
import { startupSummary } from './startup';
import { VehicleStore } from './store/vehicleStore';
import { loadPlaces } from './enrich/places';
import { registerRoutes } from './api/routes';
import { registerStream } from './api/stream';
import { OpenSkyIngestor } from './ingest/opensky';
import { AisStreamIngestor } from './ingest/aisstream';
import { FixtureIngestor } from './ingest/fixtures';
import type { Ingestor } from './ingest/types';

for (const line of startupSummary(envInfo, config)) console.log(`[config] ${line}`);

const app = Fastify({ logger: { level: 'info' } });
const store = new VehicleStore(config.ttl);
const places = loadPlaces();

await app.register(cors, { origin: true });
await app.register(websocket, { options: { perMessageDeflate: { threshold: 1024 } } }); // JSON compresses very well
registerRoutes(app, store);
registerStream(app, store, config.broadcastMs);

// In production the built web app is served from the same process.
if (fs.existsSync(config.paths.webDist)) {
  await app.register(fastifyStatic, { root: config.paths.webDist });
}

const ingestors: Ingestor[] =
  config.dataMode === 'live'
    ? [new OpenSkyIngestor(store), new AisStreamIngestor(store, places)]
    : [new FixtureIngestor(store, places)];

setInterval(() => {
  const n = store.expire();
  if (n) app.log.info(`expired ${n} stale vehicles`);
}, 30_000);

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`data mode: ${config.dataMode}`);
for (const i of ingestors) await i.start();

const shutdown = async () => {
  ingestors.forEach((i) => i.stop());
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
