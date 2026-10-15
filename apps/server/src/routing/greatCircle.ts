import greatCircle from '@turf/great-circle';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import type { RouteGeometry } from '@tm/shared';

type LonLat = [number, number];

/** Great-circle path, split into separate lines where it crosses the antimeridian. */
export function greatCircleRoute(vehicleId: string, from: LonLat, to: LonLat): RouteGeometry {
  const feature = greatCircle(from, to, { npoints: 100, offset: 10 });
  const geom = feature.geometry;
  const lines = (geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates]) as LonLat[][];
  return {
    vehicleId,
    lines,
    distanceKm: distance(point(from), point(to), { units: 'kilometers' }),
    kind: 'great-circle',
  };
}
