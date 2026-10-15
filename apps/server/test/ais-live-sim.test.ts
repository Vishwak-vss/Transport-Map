import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import { config } from '../src/config';
import { AisStreamIngestor } from '../src/ingest/aisstream';
import { VehicleStore } from '../src/store/vehicleStore';
import { loadPlaces } from '../src/enrich/places';
import { sources, setSource } from '../src/status';

let wss: WebSocketServer | undefined;
let ingestor: AisStreamIngestor | undefined;
afterEach(() => {
  ingestor?.stop();
  wss?.close();
});

const wait = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
};

describe('AISStream client against a local fake server', () => {
  it('sends the documented subscription, then ingests ship data', async () => {
    const subscriptions: Record<string, unknown>[] = [];
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (socket) => {
      socket.on('message', (raw) => {
        subscriptions.push(JSON.parse(raw.toString()));
        socket.send(JSON.stringify({
          MessageType: 'ShipStaticData',
          MetaData: { MMSI: 111, ShipName: 'TEST VESSEL@@@' },
          Message: { ShipStaticData: { Name: 'TEST VESSEL@@@', Type: 71, Destination: 'NLRTM@@@@', Eta: { Month: 12, Day: 1, Hour: 8, Minute: 30 } } },
        }));
        socket.send(JSON.stringify({
          MessageType: 'PositionReport',
          MetaData: { MMSI: 111, ShipName: 'TEST VESSEL@@@' },
          Message: { PositionReport: { Latitude: 51.5, Longitude: 2.0, Sog: 10, Cog: 90, TrueHeading: 90 } },
        }));
      });
    });

    config.ais.apiKey = 'test-key';
    config.ais.url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
    config.ais.boundingBoxes = [[[48.5, -6], [52, 3.5]]];

    const store = new VehicleStore(config.ttl);
    ingestor = new AisStreamIngestor(store, loadPlaces());
    setSource('ships', 'off', '');
    ingestor.start();
    expect(sources.ships.state).toBe('connecting');
    await wait(() => store.size > 0);
    expect(sources.ships.state).toBe('live');

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      APIKey: 'test-key',
      BoundingBoxes: [[[48.5, -6], [52, 3.5]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'StaticDataReport'],
    });
    const v = store.get('111');
    expect(v).toMatchObject({ name: 'TEST VESSEL', model: 'Cargo ship', isFreight: true, lat: 51.5, lon: 2 });
    expect(v?.destination?.code).toBe('NLRTM');
    expect(v?.etaAt).toBeGreaterThan(0);
  });

  it('survives server error messages without crashing', async () => {
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (socket) => socket.on('message', () => socket.send(JSON.stringify({ error: 'Api Key Is Not Valid' }))));
    config.ais.apiKey = 'bad';
    config.ais.url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
    const store = new VehicleStore(config.ttl);
    ingestor = new AisStreamIngestor(store, loadPlaces());
    ingestor.start();
    await new Promise((r) => setTimeout(r, 400));
    expect(store.size).toBe(0);
    expect(sources.ships).toMatchObject({ state: 'error', detail: 'Api Key Is Not Valid' });
  });

  it('reports the feed as off when there is no API key', () => {
    config.ais.apiKey = '';
    ingestor = new AisStreamIngestor(new VehicleStore(config.ttl), loadPlaces());
    ingestor.start();
    expect(sources.ships.state).toBe('off');
  });
});
