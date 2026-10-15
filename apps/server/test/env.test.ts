import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeEnvBuffer, parseEnv, loadEnv } from '../src/env';
import { startupSummary } from '../src/startup';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-env-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const k of ['TM_A', 'TM_B', 'TM_C']) delete process.env[k];
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

const body = 'TM_A=live\r\nTM_B=key123\r\n';

describe('parseEnv', () => {
  it('handles comments, export, spaces, quotes and trailing comments', () => {
    expect(parseEnv('# c\nexport TM_A = live\nTM_B="a b" # note\nTM_C=plain # note\n\nbad line')).toEqual({
      TM_A: 'live',
      TM_B: 'a b',
      TM_C: 'plain',
    });
  });
  it('allows empty values', () => {
    expect(parseEnv('TM_A=\nTM_B=')).toEqual({ TM_A: '', TM_B: '' });
  });
});

describe('loadEnv with Windows-style files', () => {
  const cases: [string, Buffer][] = [
    ['plain UTF-8', Buffer.from(body)],
    ['UTF-8 with BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body)])],
    ['UTF-16 LE with BOM (PowerShell redirect)', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')])],
    ['UTF-16 BE with BOM', (() => { const b = Buffer.from(body, 'utf16le'); b.swap16(); return Buffer.concat([Buffer.from([0xfe, 0xff]), b]); })()],
  ];
  it.each(cases)('reads every setting from %s', (_name, buf) => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '.env'), buf);
    const r = loadEnv(dir);
    expect(r.found).toBe(true);
    expect(r.keys).toEqual(['TM_A', 'TM_B']);
    expect(process.env.TM_A).toBe('live'); // the first line: what Node's own loader loses with a BOM
    expect(process.env.TM_B).toBe('key123');
  });
  it('does not override variables already set in the real environment', () => {
    process.env.TM_A = 'from-shell';
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '.env'), body);
    loadEnv(dir);
    expect(process.env.TM_A).toBe('from-shell');
  });
  it('explains a file accidentally named .env.txt', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '.env.txt'), body);
    const r = loadEnv(dir);
    expect(r.found).toBe(false);
    expect(r.hints.join(' ')).toMatch(/rename it to exactly "\.env"/);
  });
  it('tells you to copy .env.example when there is no .env', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '.env.example'), body);
    expect(loadEnv(dir).hints.join(' ')).toMatch(/Copy ".env.example"/);
  });
});

describe('startupSummary', () => {
  const env = { path: '/x/.env', found: true, keys: ['AISSTREAM_API_KEY'], hints: [] };
  const base = { opensky: { clientId: '', clientSecret: '' }, ais: { apiKey: 'k', regionNames: ['english-channel'] } };
  it('warns when a key is set but the mode is still fixtures', () => {
    const out = startupSummary(env, { ...base, dataMode: 'fixtures' }).join('\n');
    expect(out).toMatch(/mode: fixtures/);
    expect(out).toMatch(/DATA_MODE is not "live"/);
  });
  it('describes live mode without printing secret values', () => {
    const out = startupSummary(env, { ...base, dataMode: 'live' }).join('\n');
    expect(out).toMatch(/mode: live/);
    expect(out).toMatch(/regions: english-channel/);
    expect(out).toMatch(/anonymous/);
    expect(out).not.toMatch(/key123/);
  });
});
