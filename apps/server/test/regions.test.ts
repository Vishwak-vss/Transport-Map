import { describe, it, expect } from 'vitest';
import { parseRegions, REGION_PRESETS, DEFAULT_REGIONS } from '../src/ingest/regions';

describe('parseRegions', () => {
  it('resolves preset names, tolerating case and spacing', () => {
    const r = parseRegions(' English-Channel , malacca');
    expect(r.names).toEqual(['english-channel', 'malacca']);
    expect(r.boxes).toEqual([REGION_PRESETS['english-channel'], REGION_PRESETS['malacca']]);
    expect(r.unknown).toEqual([]);
  });
  it('reports unknown names but keeps the valid ones', () => {
    const r = parseRegions('suez,atlantis');
    expect(r.names).toEqual(['suez']);
    expect(r.unknown).toEqual(['atlantis']);
  });
  it('falls back to the defaults when nothing valid is given', () => {
    expect(parseRegions(undefined).names).toEqual(DEFAULT_REGIONS.split(','));
    expect(parseRegions('atlantis').names).toEqual(DEFAULT_REGIONS.split(','));
  });
  it('every preset is a valid [lat, lon] box', () => {
    for (const [name, [a, b]] of Object.entries(REGION_PRESETS)) {
      for (const [lat, lon] of [a, b]) {
        expect(Math.abs(lat), name).toBeLessThanOrEqual(90);
        expect(Math.abs(lon), name).toBeLessThanOrEqual(180);
      }
    }
  });
});
