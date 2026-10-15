import type { VehicleDelta } from '@tm/shared';

const M_PER_DEG = 111_320;
const MAX_PROJECT_S = 600;

/**
 * Dead reckoning: feeds update every few seconds (or minutes for planes), so between reports
 * we slide each vehicle along its heading at its reported speed.
 */
export function project(v: VehicleDelta, serverNow: number): [number, number] {
  const dt = Math.min(Math.max((serverNow - v.updatedAt) / 1000, 0), MAX_PROJECT_S);
  const d = v.speed * dt;
  const rad = (v.heading * Math.PI) / 180;
  const lat = Math.max(-85, Math.min(85, v.lat + (d * Math.cos(rad)) / M_PER_DEG));
  let lon = v.lon + (d * Math.sin(rad)) / (M_PER_DEG * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return [lon, lat];
}
