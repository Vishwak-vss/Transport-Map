import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseRegions } from './ingest/regions';
import { loadEnv } from './env';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');

// Load <repo>/.env (tolerates Windows encodings). What was found is printed at startup.
export const envInfo = loadEnv(repoRoot);

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const regions = parseRegions(process.env.AIS_REGIONS);
if (regions.unknown.length) {
  console.warn(`[config] unknown AIS_REGIONS ignored: ${regions.unknown.join(', ')}`);
}

export const config = {
  port: num(process.env.PORT, 3001),
  dataMode: (process.env.DATA_MODE === 'live' ? 'live' : 'fixtures') as 'live' | 'fixtures',
  opensky: {
    clientId: process.env.OPENSKY_CLIENT_ID ?? '',
    clientSecret: process.env.OPENSKY_CLIENT_SECRET ?? '',
    /** poll interval when signed in with an API client */
    pollSeconds: num(process.env.OPENSKY_POLL_SECONDS, 120),
    /** without credentials OpenSky allows far less, so poll much less often */
    anonPollSeconds: num(process.env.OPENSKY_ANON_POLL_SECONDS, 900),
    /** give up on a stalled request after this long */
    timeoutMs: 30_000,
    tokenUrl:
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
    statesUrl: process.env.OPENSKY_STATES_URL ?? 'https://opensky-network.org/api/states/all',
  },
  ais: {
    apiKey: process.env.AISSTREAM_API_KEY ?? '',
    url: process.env.AISSTREAM_URL ?? 'wss://stream.aisstream.io/v0/stream',
    /** [[lat, lon], [lat, lon]] corners per region; defaults come from ingest/regions.ts */
    boundingBoxes: regions.boxes as [number, number][][],
    regionNames: regions.names,
  },
  /** ms before a vehicle with no new report is dropped */
  ttl: { air: 5 * 60_000, sea: 30 * 60_000 },
  /** ms between WebSocket delta broadcasts */
  broadcastMs: 3000,
  paths: {
    data: path.join(repoRoot, 'data'),
    fixtures: path.join(repoRoot, 'fixtures'),
    webDist: path.join(repoRoot, 'apps/web/dist'),
  },
};
