import { describe, it, expect } from 'vitest';
import { greatCircleRoute } from '../src/routing/greatCircle';

describe('greatCircleRoute', () => {
  it('splits a Tokyo -> Los Angeles route at the antimeridian', () => {
    const r = greatCircleRoute('x', [139.78, 35.55], [-118.41, 33.94]);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.distanceKm).toBeGreaterThan(8000);
  });
  it('keeps a short route as a single line', () => {
    const r = greatCircleRoute('x', [4.14, 51.95], [-0.45, 51.47]);
    expect(r.lines).toHaveLength(1);
  });
});
