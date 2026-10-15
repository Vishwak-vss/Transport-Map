import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaces } from '../src/enrich/places';
import { config } from '../src/config';

const places = loadPlaces();
const { matchDestination } = places;

describe('matchDestination (messy AIS free text)', () => {
  it.each([
    ['NLRTM', 'NLRTM'],
    ['NL RTM', 'NLRTM'],
    ['rotterdam', 'NLRTM'],
    ['ROTTERDAM@@@@@@', 'NLRTM'],
    ['SINGAPORE > ROTTERDAM', 'NLRTM'],
    ['SG SIN', 'SGSIN'],
    ['SINGAPORE', 'SGSIN'],
    ['ANTWERP', 'BEANR'],
    ['ANTWERPEN', 'BEANR'],
    ['LE HAVRE', 'FRLEH'],
    ['FR LEH', 'FRLEH'],
    ['HAMBURG', 'DEHAM'],
    ['PORT KLANG', 'MYPKG'],
    ['SOUTHAMPTON', 'GBSOU'],
    ['JEBEL ALI', 'AEJEA'],
    ['DUNKIRK', 'FRDKK'],
    ['PORT SAID', 'EGPSD'],
    ['LOS ANGELES', 'USLAX'],
    ['SHANGHAI', 'CNSHA'],
    ['ALGECIRAS', 'ESALG'],
    ['MUNDRA', 'INMUN'],
    ['KAOHSIUNG', 'TWKHH'],
    ['MANZANILLO', 'MXZLO'],
    ['VANCOUVER', 'CAVAN'],
  ])('%s -> %s', (text, code) => {
    expect(matchDestination(text)?.code).toBe(code);
  });

  it('returns undefined rather than guessing', () => {
    for (const junk of ['FOR ORDERS', '', '   ', 'CLASS A', 'AT SEA', undefined]) {
      expect(matchDestination(junk), String(junk)).toBeUndefined();
    }
  });

  it('never resolves a ship destination to an airport code', () => {
    expect(matchDestination('SIN')).toBeUndefined();
    expect(matchDestination('LHR')).toBeUndefined();
  });
});

describe('reference data integrity', () => {
  it('has thousands of ports with valid coordinates', () => {
    expect(places.ports.length).toBeGreaterThan(5000);
    for (const p of places.ports) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
    }
  });
  it('every alias points at a real port', () => {
    const aliases = JSON.parse(fs.readFileSync(path.join(config.paths.data, 'port-aliases.json'), 'utf8')).aliases;
    for (const [name, code] of Object.entries(aliases)) {
      expect(places.byCode.has(code as string), `${name} -> ${code}`).toBe(true);
    }
  });
});
