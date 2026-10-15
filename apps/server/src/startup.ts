import type { EnvLoad } from './env';

type Cfg = {
  dataMode: 'live' | 'fixtures';
  opensky: { clientId: string; clientSecret: string };
  ais: { apiKey: string; regionNames: string[] };
};

/** Plain-language lines printed at startup so it is obvious what the server picked up. */
export function startupSummary(env: EnvLoad, cfg: Cfg): string[] {
  const lines: string[] = [];
  lines.push(
    env.found
      ? `.env loaded from ${env.path} (settings found: ${env.keys.join(', ') || 'none'})`
      : `no .env file at ${env.path}; using defaults`,
  );
  lines.push(...env.hints);

  if (cfg.dataMode === 'fixtures') {
    lines.push('mode: fixtures (synthetic sample data, no live feeds)');
    if (cfg.ais.apiKey) {
      lines.push('AISSTREAM_API_KEY is set, but DATA_MODE is not "live", so it is not being used. Set DATA_MODE=live in .env and restart.');
    }
  } else {
    lines.push('mode: live');
    lines.push(
      cfg.ais.apiKey
        ? `ships: AISStream key set, regions: ${cfg.ais.regionNames.join(', ')}`
        : 'ships: no AISSTREAM_API_KEY, so no ships',
    );
    lines.push(
      cfg.opensky.clientId && cfg.opensky.clientSecret
        ? 'planes: OpenSky API client set'
        : 'planes: no OpenSky credentials, using slow anonymous access',
    );
  }
  return lines;
}
