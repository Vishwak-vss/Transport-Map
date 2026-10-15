import fs from 'node:fs';
import path from 'node:path';

/**
 * Decode a .env file the way Windows tools may have written it: plain UTF-8, UTF-8 with a BOM
 * (some editors), or UTF-16 (PowerShell's `>` redirect). Node's own loader silently drops the first
 * line of a BOM file and everything in a UTF-16 file, which is a hard bug to spot.
 */
export function decodeEnvBuffer(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** KEY=VALUE lines. Supports comments, `export`, spaces around `=`, quotes, and trailing # comments. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = (m[2] ?? '').trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1));
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]!] = value;
  }
  return out;
}

export type EnvLoad = {
  path: string;
  found: boolean;
  /** names only, never values */
  keys: string[];
  /** plain-language problems, such as a file called .env.txt */
  hints: string[];
};

/** Reads <dir>/.env into process.env without overriding variables that are already set. */
export function loadEnv(dir: string): EnvLoad {
  const file = path.join(dir, '.env');
  const has = (name: string) => fs.existsSync(path.join(dir, name));
  const result: EnvLoad = { path: file, found: false, keys: [], hints: [] };

  if (!has('.env')) {
    if (has('.env.txt')) {
      result.hints.push('Found ".env.txt". Windows added .txt to the name; rename it to exactly ".env".');
    } else if (has('.env.example')) {
      result.hints.push('No ".env" yet. Copy ".env.example" to ".env" and fill it in.');
    }
    return result;
  }

  try {
    const values = parseEnv(decodeEnvBuffer(fs.readFileSync(file)));
    for (const [k, v] of Object.entries(values)) if (process.env[k] === undefined) process.env[k] = v;
    result.found = true;
    result.keys = Object.keys(values);
  } catch (err) {
    result.hints.push(`Could not read .env: ${(err as Error).message}`);
  }
  return result;
}
