// Builds data/ports.csv from the open UN/LOCODE dataset (github.com/datasets/un-locode).
// Usage: node scripts/build-ports.mjs [path-or-url-to-code-list.csv]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = process.argv[2] ?? 'https://raw.githubusercontent.com/datasets/un-locode/main/data/code-list.csv';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/ports.csv');

const text = /^https?:/.test(SOURCE) ? await (await fetch(SOURCE)).text() : fs.readFileSync(SOURCE, 'utf8');

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes). */
function parseCsv(src) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "4230N 00131E" -> { lat, lon } */
function coords(s) {
  const m = /^(\d{2})(\d{2})([NS]) (\d{3})(\d{2})([EW])$/.exec(s.trim());
  if (!m) return null;
  const lat = (Number(m[1]) + Number(m[2]) / 60) * (m[3] === 'S' ? -1 : 1);
  const lon = (Number(m[4]) + Number(m[5]) / 60) * (m[6] === 'W' ? -1 : 1);
  return { lat: +lat.toFixed(4), lon: +lon.toFixed(4) };
}

const [header, ...rows] = parseCsv(text);
const byCode = new Map(); // locode -> csv line (later entries override earlier ones)
const col = Object.fromEntries(header.map((h, i) => [h, i]));
let skipped = 0;
for (const r of rows) {
  const fn = r[col.Function] ?? '';
  const status = r[col.Status] ?? '';
  const c = coords(r[col.Coordinates] ?? '');
  const location = r[col.Location];
  if (fn[0] !== '1' || status === 'XX' || !c || !location) { skipped++; continue; } // ports only, with coordinates
  const name = (r[col.NameWoDiacritics] || r[col.Name]).replace(/[,"]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const rank = [...fn].filter((ch) => ch !== '-').length; // more transport functions = bigger hub
  byCode.set(r[col.Country] + location, [r[col.Country] + location, name, r[col.Country], c.lat, c.lon, rank].join(','));
}

// Curated layer: hand-checked ports that win over the dataset, and cover ports UN/LOCODE lists without coordinates.
const curatedFile = path.join(path.dirname(out), 'ports-curated.csv');
let curated = 0;
if (fs.existsSync(curatedFile)) {
  for (const line of fs.readFileSync(curatedFile, 'utf8').trim().split(/\r?\n/).slice(1)) {
    byCode.set(line.split(',')[0], line);
    curated++;
  }
}
const lines = ['locode,name,country,lat,lon,rank', ...byCode.values()];
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`wrote ${lines.length - 1} ports to ${path.relative(process.cwd(), out)} (${curated} curated, skipped ${skipped} non-port or coordinate-less rows)`);
