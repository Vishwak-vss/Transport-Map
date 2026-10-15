import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from '../src/config';
import { OpenSkyIngestor } from '../src/ingest/opensky';
import { VehicleStore } from '../src/store/vehicleStore';
import { sources } from '../src/status';

let server: http.Server | undefined;
let ingestor: OpenSkyIngestor | undefined;
afterEach(() => {
  ingestor?.stop();
  server?.close();
});

const wait = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
};

const states = [
  ['a1b2c3', 'FDX124  ', 'United States', 0, 0, -40, 48, 11000, false, 240, 60],
  ['3c6444', 'DLH456  ', 'Germany', 0, 0, 10, 50, 10800, false, 230, 300],
];

function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  return new Promise<string>((resolve) => {
    server = http.createServer(handler).listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/states`);
    });
  });
}

describe('OpenSky client without credentials (anonymous) against a local fake server', () => {
  it('polls without an Authorization header and ingests aircraft', async () => {
    let auth: string | undefined = 'unset';
    config.opensky.clientId = '';
    config.opensky.clientSecret = '';
    config.opensky.statesUrl = await serve((req, res) => {
      auth = req.headers.authorization;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('x-rate-limit-remaining', '350');
      res.end(JSON.stringify({ time: 0, states }));
    });
    const store = new VehicleStore(config.ttl);
    ingestor = new OpenSkyIngestor(store);
    ingestor.start();
    await wait(() => store.size === 2);

    expect(auth).toBeUndefined();
    expect(store.get('a1b2c3')).toMatchObject({ isFreight: true, name: 'FDX124' });
    expect(store.get('3c6444')?.isFreight).toBe(false);
    expect(sources.planes.state).toBe('live');
    expect(sources.planes.detail).toMatch(/anonymous/);
  });

  it('pauses and reports a problem when rate limited', async () => {
    config.opensky.statesUrl = await serve((_req, res) => {
      res.statusCode = 429;
      res.setHeader('x-rate-limit-retry-after-seconds', '120');
      res.end();
    });
    const store = new VehicleStore(config.ttl);
    ingestor = new OpenSkyIngestor(store);
    ingestor.start();
    await wait(() => sources.planes.state === 'error');
    expect(sources.planes).toMatchObject({ state: 'error' });
    expect(sources.planes.detail).toMatch(/rate limited/);
    expect(store.size).toBe(0);
  });
});

describe('OpenSky failures give a specific reason instead of "fetch failed"', () => {
  it('reports a refused connection with its cause', async () => {
    // find a port with nothing listening on it
    const probe = http.createServer().listen(0, '127.0.0.1');
    await new Promise((r) => probe.once('listening', r));
    const port = (probe.address() as AddressInfo).port;
    await new Promise((r) => probe.close(r));

    config.opensky.statesUrl = `http://127.0.0.1:${port}/states`;
    ingestor = new OpenSkyIngestor(new VehicleStore(config.ttl));
    ingestor.start();
    await wait(() => sources.planes.state === 'error');
    expect(sources.planes.detail).toMatch(/ECONNREFUSED/);
    expect(sources.planes.detail).not.toBe('fetch failed');
  });

  it('gives up on a server that never answers', async () => {
    config.opensky.statesUrl = await serve(() => { /* accept the request, never respond */ });
    const original = config.opensky.timeoutMs;
    config.opensky.timeoutMs = 300;
    try {
      ingestor = new OpenSkyIngestor(new VehicleStore(config.ttl));
      ingestor.start();
      await wait(() => sources.planes.state === 'error', 3000);
      expect(sources.planes.detail).toMatch(/timed out/);
    } finally {
      config.opensky.timeoutMs = original;
    }
  });
});
