type LonLat = [number, number];

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

/** Smallest [[west, south], [east, north]] box around some points, or null if there are none. */
export function boundsOf(points: LonLat[]): [LonLat, LonLat] | null {
  if (points.length === 0) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of points) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return [[west, south], [east, north]];
}
