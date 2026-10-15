import type { Vehicle } from '@tm/shared';
import { config } from '../config';
import type { VehicleStore } from '../store/vehicleStore';
import { freightFromCallsign } from '../enrich/freight';
import type { Ingestor } from './types';
import { setSource } from '../status';

/** Node's fetch reports every network failure as just "fetch failed"; the useful part is in `cause`. */
export function describeFetchError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'no response from OpenSky (timed out)';
  const code = e?.cause?.code;
  const hint: Record<string, string> = {
    ENOTFOUND: 'DNS lookup failed',
    EAI_AGAIN: 'DNS lookup failed',
    ECONNREFUSED: 'connection refused',
    ETIMEDOUT: 'connection timed out',
    UND_ERR_CONNECT_TIMEOUT: 'connection timed out',
    ECONNRESET: 'connection reset',
    CERT_HAS_EXPIRED: 'certificate problem',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'certificate problem (antivirus or proxy?)',
  };
  if (code) return `cannot reach OpenSky: ${hint[code] ?? e.cause?.message ?? e.message} (${code})`;
  return e?.message ?? String(err);
}

export type ParsedUpdate = { id: string; patch: Partial<Vehicle> };

/**
 * Convert OpenSky state vectors into vehicle patches.
 * Index map: 0 icao24, 1 callsign, 3 time_position (s), 5 lon, 6 lat, 8 on_ground, 9 velocity (m/s), 10 true_track.
 * Airborne aircraft with a known position only.
 */
export function parseStates(states: unknown[][] | null | undefined, now = Date.now()): ParsedUpdate[] {
  const out: ParsedUpdate[] = [];
  for (const s of states ?? []) {
    const id = String(s[0] ?? '');
    const lon = s[5];
    const lat = s[6];
    if (!id || typeof lon !== 'number' || typeof lat !== 'number') continue;
    if (s[8] === true) continue; // on ground
    const callsign = typeof s[1] === 'string' ? s[1].trim() : undefined;
    const freight = freightFromCallsign(callsign);
    const timePosition = typeof s[3] === 'number' && s[3] > 0 ? s[3] * 1000 : now;
    out.push({
      id,
      patch: {
        lat,
        lon,
        heading: typeof s[10] === 'number' ? s[10] : 0,
        speed: typeof s[9] === 'number' ? s[9] : 0,
        updatedAt: timePosition,
        name: callsign || undefined,
        isFreight: freight !== null,
        cargoCategory: freight?.category,
        model: freight?.operator,
      },
    });
  }
  return out;
}

class TokenManager {
  private token = '';
  private expiresAt = 0;
  async get(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 30_000) return this.token;
    const res = await fetch(config.opensky.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(config.opensky.timeoutMs),
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.opensky.clientId,
        client_secret: config.opensky.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`OpenSky token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = body.access_token;
    this.expiresAt = Date.now() + body.expires_in * 1000;
    return this.token;
  }
}

/**
 * Polls OpenSky on a timer. With API client credentials it uses OAuth2 and polls every
 * OPENSKY_POLL_SECONDS. Without them it falls back to anonymous access, which has a much smaller
 * allowance, so it polls every OPENSKY_ANON_POLL_SECONDS instead.
 */
export class OpenSkyIngestor implements Ingestor {
  private timer?: NodeJS.Timeout;
  private tokens = new TokenManager();
  private backoffUntil = 0;
  private readonly authed = Boolean(config.opensky.clientId && config.opensky.clientSecret);

  constructor(private store: VehicleStore) {}

  start() {
    const seconds = this.authed ? config.opensky.pollSeconds : config.opensky.anonPollSeconds;
    if (this.authed) {
      setSource('planes', 'connecting', 'signed in with API client');
      console.log(`[opensky] signed in with API client; polling every ${seconds}s`);
    } else {
      setSource('planes', 'connecting', `anonymous access, limited, updates every ${Math.round(seconds / 60)} min`);
      console.warn(
        `[opensky] no OPENSKY_CLIENT_ID/SECRET: using anonymous access with a small allowance; polling every ${seconds}s. ` +
          'Create a free API client on your OpenSky account page for more.',
      );
    }
    void this.poll();
    this.timer = setInterval(() => void this.poll(), seconds * 1000);
  }

  stop() {
    clearInterval(this.timer);
  }

  private async poll() {
    if (Date.now() < this.backoffUntil) return;
    try {
      const headers: Record<string, string> = this.authed ? { Authorization: `Bearer ${await this.tokens.get()}` } : {};
      // TODO: add ?lamin=&lomin=&lamax=&lomax= for the visible region to spend fewer credits.
      const res = await fetch(config.opensky.statesUrl, { headers, signal: AbortSignal.timeout(config.opensky.timeoutMs) });
      if (res.status === 429) {
        const wait = Number(res.headers.get('x-rate-limit-retry-after-seconds')) || 600;
        this.backoffUntil = Date.now() + wait * 1000;
        console.warn(`[opensky] rate limited; pausing ${wait}s`);
        setSource('planes', 'error', `rate limited, pausing ${Math.round(wait / 60)} min`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { states?: unknown[][] };
      const updates = parseStates(body.states);
      for (const u of updates) this.store.upsert(u.id, 'air', u.patch);
      const left = res.headers.get('x-rate-limit-remaining');
      console.log(`[opensky] ${updates.length} airborne aircraft${left ? `, ${left} credits left` : ''}`);
      setSource('planes', 'live', this.authed ? 'signed in' : 'anonymous access, limited');
    } catch (err) {
      const detail = describeFetchError(err);
      console.error('[opensky] poll failed:', detail);
      setSource('planes', 'error', detail);
    }
  }
}
