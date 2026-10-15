import fs from 'node:fs';
import path from 'node:path';
import type { Place } from '@tm/shared';
import { config } from '../config';

function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(config.paths.data, file), 'utf8').trim();
  const [head, ...rows] = text.split(/\r?\n/);
  const cols = (head ?? '').split(',');
  return rows.map((r) => {
    const cells = r.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
}

export type PlaceIndex = {
  ports: Place[];
  airports: Place[];
  /** ports and airports by code (LOCODE or IATA) */
  byCode: Map<string, Place>;
  /** Free-text AIS destination -> port. Returns undefined rather than guessing. */
  matchDestination(text?: string): Place | undefined;
};

type RankedPort = { place: Place; rank: number };

export function loadPlaces(): PlaceIndex {
  const ranked: RankedPort[] = readCsv('ports.csv').map((r) => ({
    place: { code: r.locode!, name: r.name!, country: r.country, lat: Number(r.lat), lon: Number(r.lon) },
    rank: Number(r.rank) || 0,
  }));
  const ports = ranked.map((r) => r.place);
  const airports: Place[] = readCsv('airports.csv').map((r) => ({
    code: r.iata!, name: r.name!, country: r.country, lat: Number(r.lat), lon: Number(r.lon),
  }));

  const portByCode = new Map(ports.map((p) => [p.code.toUpperCase(), p]));
  const byCode = new Map<string, Place>(portByCode);
  for (const a of airports) if (!byCode.has(a.code.toUpperCase())) byCode.set(a.code.toUpperCase(), a);

  // name -> candidate ports (a name such as "SAN JOSE" can belong to several ports)
  const byName = new Map<string, RankedPort[]>();
  const addName = (name: string, rp: RankedPort) => {
    const list = byName.get(name);
    if (list) list.push(rp);
    else byName.set(name, [rp]);
  };
  for (const rp of ranked) {
    const name = rp.place.name.toUpperCase();
    addName(name, rp);
    const bare = name.replace(/\s*\(.*\)\s*$/, '').trim(); // "PORT KLANG (PELABUHAN KLANG)" -> "PORT KLANG"
    if (bare && bare !== name) addName(bare, rp);
  }

  const aliasFile = JSON.parse(fs.readFileSync(path.join(config.paths.data, 'port-aliases.json'), 'utf8'));
  const aliases = aliasFile.aliases as Record<string, string>;

  function matchDestination(text?: string): Place | undefined {
    if (!text) return undefined;
    // AIS destinations are free text: "SINGAPORE > ROTTERDAM", "NL RTM", "NLRTM", "ROTTERDAM@@@@"
    const last = text
      .toUpperCase()
      .replace(/[@_]+/g, ' ')
      .split(/>|->|\bTO\b/)
      .pop()!
      .replace(/\s+/g, ' ')
      .trim();
    if (!last) return undefined;

    const byLocode = portByCode.get(last.replace(/\s+/g, ''));
    if (byLocode) return byLocode;

    const alias = aliases[last];
    if (alias) return portByCode.get(alias);

    const candidates = byName.get(last);
    if (!candidates) return undefined;
    if (candidates.length === 1) return candidates[0]!.place;
    // Several ports share this name: take one only if it is clearly the biggest hub.
    const sorted = [...candidates].sort((a, b) => b.rank - a.rank);
    return sorted[0]!.rank > sorted[1]!.rank ? sorted[0]!.place : undefined;
  }

  return { ports, airports, byCode, matchDestination };
}
