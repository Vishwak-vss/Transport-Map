import { describe, it, expect } from 'vitest';
import { parseStates } from '../src/ingest/opensky';

const row = (over: Record<number, unknown> = {}) => {
  const base: unknown[] = ['abc123', 'FDX124  ', 'United States', 0, 0, -40, 48, 11000, false, 240, 60];
  Object.entries(over).forEach(([i, v]) => (base[Number(i)] = v));
  return base;
};

describe('parseStates', () => {
  it('parses an airborne freight aircraft', () => {
    const [u] = parseStates([row()], 1000);
    expect(u?.id).toBe('abc123');
    expect(u?.patch).toMatchObject({ lat: 48, lon: -40, heading: 60, speed: 240, name: 'FDX124', isFreight: true });
  });
  it('skips aircraft on the ground or without a position', () => {
    expect(parseStates([row({ 8: true }), row({ 5: null }), row({ 6: null })])).toHaveLength(0);
  });
  it('does not flag passenger airlines as freight', () => {
    const [u] = parseStates([row({ 1: 'DLH456  ' })]);
    expect(u?.patch.isFreight).toBe(false);
  });
});
