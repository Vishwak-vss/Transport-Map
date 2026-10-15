import WebSocket from 'ws';
import type { Vehicle } from '@tm/shared';
import { config } from '../config';
import type { VehicleStore } from '../store/vehicleStore';
import type { PlaceIndex } from '../enrich/places';
import { shipTypeInfo } from '../enrich/freight';
import type { Ingestor } from './types';
import { setSource } from '../status';

const KNOTS_TO_MS = 0.514444;

const regionText = () => config.ais.regionNames.join(', ');

/** AIS pads text fields with '@' and spaces. */
export const cleanAisText = (t?: string) => t?.replace(/@+/g, ' ').replace(/\s+/g, ' ').trim() || undefined;

type PositionFields = { Cog?: number; Sog?: number; TrueHeading?: number; Latitude?: number; Longitude?: number };

type AisMessage = {
  MessageType?: string;
  MetaData?: { MMSI?: number; ShipName?: string };
  Message?: {
    // Class A ships
    PositionReport?: PositionFields;
    ShipStaticData?: {
      Name?: string;
      Type?: number;
      Destination?: string;
      ImoNumber?: number;
      Eta?: { Month?: number; Day?: number; Hour?: number; Minute?: number };
    };
    // Class B (smaller vessels): positions, plus name/type in separate reports
    StandardClassBPositionReport?: PositionFields;
    ExtendedClassBPositionReport?: PositionFields & { Name?: string; Type?: number };
    StaticDataReport?: {
      ReportA?: { Valid?: boolean; Name?: string };
      ReportB?: { Valid?: boolean; ShipType?: number };
    };
  };
};

/** Every message type the app subscribes to (see AISStream's type-definition.yaml). */
export const SUBSCRIBED_MESSAGE_TYPES = [
  'PositionReport',
  'ShipStaticData',
  'StandardClassBPositionReport',
  'ExtendedClassBPositionReport',
  'StaticDataReport',
] as const;

const POSITION_TYPES = ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'] as const;

/** Ship type 0 / missing means "not available". */
function typeFields(code: number | undefined): Partial<Vehicle> {
  if (!code) return {};
  const info = shipTypeInfo(code);
  return { model: info.label, isFreight: info.isFreight, cargoCategory: info.category };
}

/** AIS ETA has no year, and month 0 / hour 24 / minute 60 mean "not available". */
export function parseAisEta(eta: { Month?: number; Day?: number; Hour?: number; Minute?: number } | undefined, now = new Date()): number | undefined {
  if (!eta || !eta.Month || !eta.Day || eta.Hour === undefined || eta.Hour > 23 || eta.Minute === undefined || eta.Minute > 59) {
    return undefined;
  }
  let d = Date.UTC(now.getUTCFullYear(), eta.Month - 1, eta.Day, eta.Hour, eta.Minute);
  if (d < now.getTime() - 30 * 86_400_000) d = Date.UTC(now.getUTCFullYear() + 1, eta.Month - 1, eta.Day, eta.Hour, eta.Minute);
  return d;
}

export function parseAisMessage(
  msg: AisMessage,
  places: PlaceIndex,
  now = Date.now(),
): { id: string; patch: Partial<Vehicle> } | null {
  const mmsi = msg.MetaData?.MMSI;
  if (!mmsi) return null;
  const id = String(mmsi);
  const type = msg.MessageType;

  // Positions: Class A reports, plus the two Class B reports used by smaller vessels.
  if (type && (POSITION_TYPES as readonly string[]).includes(type)) {
    const pos = msg.Message?.[type as (typeof POSITION_TYPES)[number]];
    if (!pos || typeof pos.Latitude !== 'number' || typeof pos.Longitude !== 'number') return null;
    // AIS uses out-of-range values for "not available": lat 91, lon 181, SOG 102.3, COG 360, heading 511.
    if (Math.abs(pos.Latitude) > 90 || Math.abs(pos.Longitude) > 180) return null;
    const sog = pos.Sog !== undefined && pos.Sog < 102.3 ? pos.Sog : 0;
    const cog = pos.Cog !== undefined && pos.Cog < 360 ? pos.Cog : 0;
    const heading = pos.TrueHeading !== undefined && pos.TrueHeading < 360 ? pos.TrueHeading : cog;
    const extended = type === 'ExtendedClassBPositionReport' ? msg.Message?.ExtendedClassBPositionReport : undefined;
    return {
      id,
      patch: {
        lat: pos.Latitude,
        lon: pos.Longitude,
        heading,
        speed: sog * KNOTS_TO_MS,
        updatedAt: now,
        name: cleanAisText(extended?.Name) ?? cleanAisText(msg.MetaData?.ShipName),
        ...typeFields(extended?.Type),
      },
    };
  }

  // Class A static and voyage data (name, type, destination, ETA), sent about every 6 minutes.
  const st = msg.Message?.ShipStaticData;
  if (type === 'ShipStaticData' && st) {
    return {
      id,
      patch: {
        name: cleanAisText(st.Name) ?? cleanAisText(msg.MetaData?.ShipName),
        ...typeFields(st.Type),
        destination: places.matchDestination(st.Destination),
        etaAt: parseAisEta(st.Eta, new Date(now)),
      },
    };
  }

  // Class B static data: name (part A) and ship type (part B). No destination or ETA.
  const sd = msg.Message?.StaticDataReport;
  if (type === 'StaticDataReport' && sd) {
    const patch: Partial<Vehicle> = {
      name: sd.ReportA?.Valid === false ? undefined : cleanAisText(sd.ReportA?.Name),
      ...(sd.ReportB?.Valid === false ? {} : typeFields(sd.ReportB?.ShipType)),
    };
    return Object.values(patch).some((v) => v !== undefined) ? { id, patch } : null;
  }
  return null;
}

/** Streams AIS messages over WebSocket. Reconnects with exponential backoff. */
export class AisStreamIngestor implements Ingestor {
  private ws?: WebSocket;
  private stopped = false;
  private attempt = 0;
  private received = 0;
  private gotData = false;
  private statsTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private store: VehicleStore, private places: PlaceIndex) {}

  start() {
    if (!config.ais.apiKey) {
      console.warn('[ais] AISSTREAM_API_KEY not set; ship ingest disabled');
      setSource('ships', 'off', 'no AISSTREAM_API_KEY set');
      return;
    }
    setSource('ships', 'connecting', regionText());
    console.log(`[ais] subscribing to ${config.ais.boundingBoxes.length} region(s): ${regionText()}`);
    this.connect();
    // A heartbeat in the log makes it obvious whether data is actually flowing.
    this.statsTimer = setInterval(() => {
      console.log(`[ais] ${this.received} messages in the last 30s, ${this.store.size} vehicles tracked`);
      this.received = 0;
    }, 30_000);
  }

  stop() {
    this.stopped = true;
    clearInterval(this.statsTimer);
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private connect() {
    const ws = new WebSocket(config.ais.url);
    this.ws = ws;
    ws.on('open', () => {
      this.attempt = 0;
      this.gotData = false;
      // AISStream closes the socket if no subscription arrives within 3 seconds, so send it immediately.
      ws.send(
        JSON.stringify({
          APIKey: config.ais.apiKey,
          BoundingBoxes: config.ais.boundingBoxes,
          FilterMessageTypes: [...SUBSCRIBED_MESSAGE_TYPES],
        }),
      );
      console.log('[ais] connected, subscription sent');
    });
    ws.on('message', (data) => {
      let parsed: AisMessage & { error?: unknown };
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return; // ignore malformed message
      }
      if (parsed.error) {
        console.error('[ais] server error:', parsed.error);
        setSource('ships', 'error', String(parsed.error));
        return;
      }
      this.received++;
      if (!this.gotData) {
        this.gotData = true;
        setSource('ships', 'live', regionText());
      }
      const u = parseAisMessage(parsed, this.places);
      if (u) this.store.upsert(u.id, 'sea', u.patch);
    });
    ws.on('error', (err) => {
      console.error('[ais] error:', err.message);
      setSource('ships', 'error', err.message);
    });
    ws.on('close', (code, reason) => {
      if (this.stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
      setSource('ships', 'error', `disconnected, retrying in ${delay / 1000}s`);
      console.warn(`[ais] disconnected (code ${code}${reason.length ? `, ${reason.toString()}` : ''}); retrying in ${delay / 1000}s`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }
}
