import searoute from 'searoute-js';
import type { RouteGeometry } from '@tm/shared';
import { greatCircleRoute } from './greatCircle';

type LonLat = [number, number];

const point = (c: LonLat) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } });

/** Great-circle length of a path in kilometres. */
export function pathKm(coords: LonLat[]): number {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1]!;
    const [lon2, lat2] = coords[i]!;
    const r = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return km;
}

/** Split a path wherever it jumps across the antimeridian, so it draws as separate lines. */
export function splitAtAntimeridian(coords: LonLat[]): LonLat[][] {
  const lines: LonLat[][] = [[]];
  coords.forEach((c, i) => {
    const prev = coords[i - 1];
    if (prev && Math.abs(c[0] - prev[0]) > 180) lines.push([]);
    lines[lines.length - 1]!.push(c);
  });
  return lines.filter((l) => l.length > 1);
}

/**
 * Route that follows shipping lanes instead of cutting across land. The library is meant for
 * realistic-looking visualisations (not navigation) and can take absurd detours, for example the
 * long way round the world for a trans-Pacific trip, so anything much longer than the direct
 * path falls back to a great-circle line.
 */
export function seaRoute(vehicleId: string, from: LonLat, to: LonLat): RouteGeometry {
  const direct = greatCircleRoute(vehicleId, from, to);
  const log = console.log; // the library prints debug numbers on every call
  try {
    console.log = () => {};
    const result = searoute(point(from), point(to), 'kilometers');
    const lane = result.geometry.coordinates as LonLat[];
    if (!lane || lane.length < 2) return direct;
    const path: LonLat[] = [from, ...lane, to]; // anchor both ends at the real positions
    const km = pathKm(path);
    if (!Number.isFinite(km) || km > direct.distanceKm * 2.5 + 200) return direct;
    return { vehicleId, lines: splitAtAntimeridian(path), distanceKm: km, kind: 'sea-lane' };
  } catch {
    return direct;
  } finally {
    console.log = log;
  }
}
