import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import type { VehicleStore } from '../store/vehicleStore';
import type { PlaceIndex } from '../enrich/places';
import { parseStates } from './opensky';
import { parseAisMessage } from './aisstream';
import type { Ingestor } from './types';
import { setSource } from '../status';

const M_PER_DEG = 111_320;

/** Offline mode: loads sample data once, then moves every vehicle along its heading each second. */
export class FixtureIngestor implements Ingestor {
  private timer?: NodeJS.Timeout;
  constructor(private store: VehicleStore, private places: PlaceIndex) {}

  start() {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(config.paths.fixtures, f), 'utf8'));
    const now = Date.now();

    for (const u of parseStates(read('sample-opensky.json').states, now)) this.store.upsert(u.id, 'air', u.patch);
    for (const m of read('sample-ais.json')) {
      const u = parseAisMessage(m, this.places, now);
      if (u) this.store.upsert(u.id, 'sea', u.patch);
    }
    setSource('ships', 'live', 'sample data');
    setSource('planes', 'live', 'sample data');
    console.log(`[fixtures] loaded ${this.store.size} sample vehicles`);

    this.timer = setInterval(() => this.tick(1), 1000);
  }

  stop() {
    clearInterval(this.timer);
  }

  private tick(dt: number) {
    const now = Date.now();
    for (const v of this.store.snapshot()) {
      const rad = (v.heading * Math.PI) / 180;
      const dLat = (v.speed * dt * Math.cos(rad)) / M_PER_DEG;
      const dLon = (v.speed * dt * Math.sin(rad)) / (M_PER_DEG * Math.max(0.1, Math.cos((v.lat * Math.PI) / 180)));
      let lon = v.lon + dLon;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      this.store.upsert(v.id, v.mode, { lat: Math.max(-85, Math.min(85, v.lat + dLat)), lon, updatedAt: now });
    }
  }
}
