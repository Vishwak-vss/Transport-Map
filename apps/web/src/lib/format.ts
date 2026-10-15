export const msToKnots = (ms: number) => ms * 1.943844;
export const msToKmh = (ms: number) => ms * 3.6;

export function formatSpeed(ms: number, mode: 'air' | 'sea') {
  return mode === 'sea'
    ? `${msToKnots(ms).toFixed(1)} kn`
    : `${Math.round(msToKmh(ms))} km/h`;
}

export function formatEta(etaAt?: number) {
  if (!etaAt) return 'Not reported';
  return new Date(etaAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatCoord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}
