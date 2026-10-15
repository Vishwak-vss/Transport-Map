import type { Mode, Vehicle, VehicleDelta } from '@tm/shared';

type Patch = Partial<Omit<Vehicle, 'id' | 'mode'>>;

/** [lon, lat, epoch ms] */
export type TrackPoint = [number, number, number];

const TRACK_MIN_MOVE_M = 100; // ignore jitter and moored ships
const TRACK_MIN_GAP_MS = 30_000;
const TRACK_MAX_POINTS = 240; // about 2 hours at one point per 30 s

/** In-memory source of truth for every tracked vehicle. */
export class VehicleStore {
  private vehicles = new Map<string, Vehicle>();
  /** static info (ship name/destination) that arrived before the first position */
  private pending = new Map<string, Patch>();
  private dirty = new Set<string>();
  private removed = new Set<string>();
  /** where each vehicle has been since we started watching it */
  private tracks = new Map<string, TrackPoint[]>();

  constructor(private ttl: Record<Mode, number>) {}

  get size() {
    return this.vehicles.size;
  }

  get(id: string) {
    return this.vehicles.get(id);
  }

  upsert(id: string, mode: Mode, rawPatch: Patch) {
    // A message that lacks a field (for example a position report with a blank ship name) must not erase
    // what an earlier message already told us.
    const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== undefined)) as Patch;
    const existing = this.vehicles.get(id);
    if (existing) {
      const freightChanged = patch.isFreight !== undefined && patch.isFreight !== existing.isFreight;
      Object.assign(existing, patch);
      if (patch.lat !== undefined && patch.lon !== undefined) this.record(id, existing.lat, existing.lon, existing.updatedAt);
      // freight status drives the icon colour, so tell clients straight away rather than at the next position
      if (patch.lat !== undefined || patch.lon !== undefined || freightChanged) this.dirty.add(id);
      return;
    }
    const merged = { ...this.pending.get(id), ...patch };
    if (merged.lat === undefined || merged.lon === undefined) {
      this.pending.set(id, merged);
      // static data for ships we never see a position for must not grow without bound
      if (this.pending.size > 5000) this.pending.delete(this.pending.keys().next().value as string);
      return;
    }
    this.pending.delete(id);
    this.vehicles.set(id, {
      heading: 0,
      speed: 0,
      updatedAt: Date.now(),
      isFreight: false,
      ...merged,
      id,
      mode,
      lat: merged.lat,
      lon: merged.lon,
    });
    this.dirty.add(id);
    const v = this.vehicles.get(id)!;
    this.record(id, v.lat, v.lon, v.updatedAt);
  }

  private record(id: string, lat: number, lon: number, t: number) {
    let pts = this.tracks.get(id);
    if (!pts) this.tracks.set(id, (pts = []));
    const last = pts[pts.length - 1];
    if (last) {
      let dLon = lon - last[0];
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const meters = Math.hypot(dLon * 111_320 * Math.cos((lat * Math.PI) / 180), (lat - last[1]) * 111_320);
      if (meters < TRACK_MIN_MOVE_M || t - last[2] < TRACK_MIN_GAP_MS) return;
    }
    pts.push([lon, lat, t]);
    if (pts.length > TRACK_MAX_POINTS) pts.shift();
  }

  /** Points where this vehicle has been, oldest first (a copy). */
  track(id: string): TrackPoint[] {
    return [...(this.tracks.get(id) ?? [])];
  }

  /** Drop vehicles with no recent report. Returns how many were removed. */
  expire(now = Date.now()) {
    let n = 0;
    for (const [id, v] of this.vehicles) {
      if (now - v.updatedAt > this.ttl[v.mode]) {
        this.vehicles.delete(id);
        this.tracks.delete(id);
        this.dirty.delete(id);
        this.removed.add(id);
        n++;
      }
    }
    return n;
  }

  snapshot(): VehicleDelta[] {
    return [...this.vehicles.values()].map(toDelta);
  }

  /** Changes since the last drain; clears the change log. */
  drain(): { changed: VehicleDelta[]; removed: string[] } {
    const changed: VehicleDelta[] = [];
    for (const id of this.dirty) {
      const v = this.vehicles.get(id);
      if (v) changed.push(toDelta(v));
    }
    const removed = [...this.removed];
    this.dirty.clear();
    this.removed.clear();
    return { changed, removed };
  }
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

export function toDelta(v: Vehicle): VehicleDelta {
  return {
    id: v.id,
    mode: v.mode,
    lat: round(v.lat, 5), // about 1 m: plenty, and it keeps the messages small
    lon: round(v.lon, 5),
    heading: Math.round(v.heading),
    speed: round(v.speed, 1),
    updatedAt: v.updatedAt,
    isFreight: v.isFreight,
  };
}
