import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { VehicleStore, toDelta } from '../src/store/vehicleStore';
import { seaRoute, splitAtAntimeridian, pathKm } from '../src/routing/seaRoute';
import { registerRoutes } from '../src/api/routes';

const ttl = { air: 60_000_000, sea: 60_000_000 };
const T0 = 1_000_000_000_000;

describe('track history', () => {
  it('records movement but ignores jitter and moored ships', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'sea', { lat: 50, lon: 1, updatedAt: T0 });
    s.upsert('a', 'sea', { lat: 50.00001, lon: 1, updatedAt: T0 + 60_000 }); // ~1 m: jitter
    s.upsert('a', 'sea', { lat: 50.01, lon: 1, updatedAt: T0 + 61_000 }); // ~1 km, 61 s after the last stored point
    expect(s.track('a').map((p) => p[1])).toEqual([50, 50.01]);
  });
  it('waits at least 30 s between points', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'sea', { lat: 50, lon: 1, updatedAt: T0 });
    s.upsert('a', 'sea', { lat: 50.01, lon: 1, updatedAt: T0 + 5_000 });
    expect(s.track('a')).toHaveLength(1);
    s.upsert('a', 'sea', { lat: 50.02, lon: 1, updatedAt: T0 + 31_000 });
    expect(s.track('a')).toHaveLength(2);
  });
  it('caps the history and forgets expired vehicles', () => {
    const s = new VehicleStore({ air: 1000, sea: 1000 });
    for (let i = 0; i < 300; i++) s.upsert('a', 'sea', { lat: 10 + i * 0.01, lon: 0, updatedAt: T0 + i * 31_000 });
    expect(s.track('a').length).toBe(240);
    s.expire(T0 + 300 * 31_000 + 5000);
    expect(s.track('a')).toEqual([]);
  });
  it('handles crossing the antimeridian without a huge jump', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'sea', { lat: 0, lon: 179.999, updatedAt: T0 });
    s.upsert('a', 'sea', { lat: 0, lon: -179.99, updatedAt: T0 + 40_000 }); // about 1.2 km east across the line
    expect(s.track('a')).toHaveLength(2);
  });
});

describe('message size', () => {
  it('rounds positions to about a metre', () => {
    const s = new VehicleStore(ttl);
    s.upsert('a', 'sea', { lat: 50.123456789, lon: 1.987654321, heading: 90.4, speed: 5.14444 });
    expect(toDelta(s.get('a')!)).toMatchObject({ lat: 50.12346, lon: 1.98765, heading: 90, speed: 5.1 });
  });
});

describe('seaRoute', () => {
  it('follows shipping lanes for a short regional trip', () => {
    const r = seaRoute('x', [0.5, 49.5], [4.14, 51.95]);
    expect(r.kind).toBe('sea-lane');
    expect(r.distanceKm).toBeGreaterThan(300);
    expect(r.distanceKm).toBeLessThan(1500);
    // starts and ends exactly at the given points
    expect(r.lines[0]![0]).toEqual([0.5, 49.5]);
    expect(r.lines.at(-1)!.at(-1)).toEqual([4.14, 51.95]);
  });
  it('falls back to a straight line when the lane route is absurdly long (trans-Pacific)', () => {
    const r = seaRoute('x', [121.5, 31.2], [-118.3, 33.7]);
    expect(r.kind).toBe('great-circle');
    expect(r.distanceKm).toBeLessThan(12000);
  });
  it('never throws, even for identical or odd points', () => {
    expect(() => seaRoute('x', [10, 10], [10, 10])).not.toThrow();
    expect(() => seaRoute('x', [0, 0], [179.9, 80])).not.toThrow();
  });
  it('splits a path at the antimeridian', () => {
    const lines = splitAtAntimeridian([[170, 0], [179, 1], [-179, 2], [-170, 3]]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.at(-1)).toEqual([179, 1]);
    expect(lines[1]![0]).toEqual([-179, 2]);
  });
  it('measures path length', () => {
    expect(pathKm([[0, 0], [1, 0]])).toBeCloseTo(111.19, 0);
  });
});

describe('API: track and route endpoints', () => {
  it('serves a vehicle track and a sea-lane route', async () => {
    const store = new VehicleStore(ttl);
    store.upsert('1', 'sea', { lat: 49.5, lon: 0.5, updatedAt: T0, destination: { code: 'NLRTM', name: 'ROTTERDAM', lat: 51.95, lon: 4.14 } });
    store.upsert('1', 'sea', { lat: 49.6, lon: 0.6, updatedAt: T0 + 60_000 });
    const app = Fastify();
    registerRoutes(app, store);
    const track = await app.inject('/api/vehicles/1/track');
    expect(track.statusCode).toBe(200);
    expect(track.json().points).toHaveLength(2);
    const route = await app.inject('/api/vehicles/1/route');
    expect(route.json().kind).toBe('sea-lane');
    expect((await app.inject('/api/vehicles/nope/track')).statusCode).toBe(404);
    await app.close();
  });
});
