export type Mode = 'air' | 'sea';

export type Place = {
  /** IATA/ICAO for airports, UN/LOCODE for ports */
  code: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
};

/** One tracked ship or aircraft. Only `id`..`updatedAt` are guaranteed. */
export type Vehicle = {
  /** icao24 (air) or MMSI (sea) */
  id: string;
  mode: Mode;
  lat: number;
  lon: number;
  /** degrees clockwise from north */
  heading: number;
  /** metres per second */
  speed: number;
  /** epoch ms of the last real position report */
  updatedAt: number;
  name?: string;
  /** aircraft type (e.g. B77L) or ship type label (e.g. Container ship) */
  model?: string;
  isFreight: boolean;
  /** category only, e.g. "container", "tanker", "express parcel". Never exact cargo contents. */
  cargoCategory?: string;
  origin?: Place;
  destination?: Place;
  /** epoch ms */
  etaAt?: number;
};

/** Compact record sent over the WebSocket for every moving vehicle. */
export type VehicleDelta = Pick<
  Vehicle,
  'id' | 'mode' | 'lat' | 'lon' | 'heading' | 'speed' | 'updatedAt' | 'isFreight'
>;

export type RouteGeometry = {
  vehicleId: string;
  /** [lon, lat] pairs, split at the antimeridian into separate lines */
  lines: [number, number][][];
  distanceKm: number;
  kind: 'great-circle' | 'sea-lane';
};

export type StreamMessage =
  | { type: 'snapshot'; vehicles: VehicleDelta[]; at: number }
  | { type: 'delta'; vehicles: VehicleDelta[]; removed: string[]; at: number };
