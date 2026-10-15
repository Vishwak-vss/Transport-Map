import callsigns from '../../../../data/freight-callsigns.json';

type CallsignInfo = { operator: string; category: string };
const table = callsigns.operators as Record<string, CallsignInfo>;

/** Heuristic: ICAO airline prefix (first 3 letters of callsign) -> known freight operator. */
export function freightFromCallsign(callsign?: string): CallsignInfo | null {
  if (!callsign) return null;
  const cs = callsign.trim().toUpperCase();
  // callsigns look like FDX123: 3 letters then a flight number
  if (!/^[A-Z]{3}\d/.test(cs)) return null;
  return table[cs.slice(0, 3)] ?? null;
}

/** AIS ship type codes (ITU-R M.1371). Categories only; never exact cargo. */
export function shipTypeInfo(code?: number): { label: string; isFreight: boolean; category?: string } {
  if (code === undefined) return { label: 'Unknown vessel', isFreight: false };
  if (code >= 70 && code <= 79) return { label: 'Cargo ship', isFreight: true, category: 'general / container cargo' };
  if (code >= 80 && code <= 89) return { label: 'Tanker', isFreight: true, category: 'tanker (oil / chemicals / gas)' };
  if (code >= 60 && code <= 69) return { label: 'Passenger ship', isFreight: false };
  if (code === 30) return { label: 'Fishing vessel', isFreight: false };
  if (code === 31 || code === 32 || code === 52) return { label: 'Tug', isFreight: false };
  if (code === 35) return { label: 'Military', isFreight: false };
  if (code === 36 || code === 37) return { label: 'Pleasure craft', isFreight: false };
  return { label: `Vessel (type ${code})`, isFreight: false };
}
