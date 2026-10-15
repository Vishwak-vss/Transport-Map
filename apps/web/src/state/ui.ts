import { create } from 'zustand';
import type { RouteGeometry, Vehicle } from '@tm/shared';

type Status = 'connecting' | 'live' | 'reconnecting';
export type SourceInfo = { state: 'off' | 'connecting' | 'live' | 'error'; detail: string };
export type Region = { name: string; box: [[number, number], [number, number]] };
export type Sources = { mode: 'live' | 'fixtures'; ships: SourceInfo; planes: SourceInfo };

type UiState = {
  showShips: boolean;
  showPlanes: boolean;
  freightOnly: boolean;
  status: Status;
  counts: { sea: number; air: number; freight: number };
  sources: Sources | null;
  /** sea areas being watched (live mode), for the jump-to buttons */
  regions: Region[];
  /** a request for the map to move; `nonce` makes repeated requests for the same place work */
  viewRequest: { region?: string; bounds?: [[number, number], [number, number]]; nonce: number } | null;
  selectedId: string | null;
  details: Vehicle | null;
  route: RouteGeometry | null;
  /** where the selected vehicle has been: [lon, lat, epoch ms], oldest first */
  track: [number, number, number][] | null;
  detailsError: string | null;
  setFilter: (k: 'showShips' | 'showPlanes' | 'freightOnly', v: boolean) => void;
  setStatus: (s: Status) => void;
  setCounts: (c: UiState['counts']) => void;
  setSources: (s: Sources) => void;
  setRegions: (r: Region[]) => void;
  jumpTo: (region: string) => void;
  fitBounds: (bounds: [[number, number], [number, number]]) => void;
  select: (id: string | null) => void;
};

export const useUi = create<UiState>((set, get) => ({
  showShips: true,
  showPlanes: true,
  freightOnly: false,
  status: 'connecting',
  counts: { sea: 0, air: 0, freight: 0 },
  sources: null,
  regions: [],
  viewRequest: null,
  selectedId: null,
  details: null,
  route: null,
  track: null,
  detailsError: null,

  setFilter: (k, v) => set({ [k]: v } as Partial<UiState>),
  setStatus: (status) => set({ status }),
  setCounts: (counts) => set({ counts }),
  setSources: (sources) => set({ sources }),
  setRegions: (regions) => set({ regions }),
  jumpTo: (region) => set({ viewRequest: { region, nonce: Date.now() } }),
  fitBounds: (bounds) => set({ viewRequest: { bounds, nonce: Date.now() } }),

  select: (id) => {
    window.clearInterval(refreshTimer);
    set({ selectedId: id, details: null, route: null, track: null, detailsError: null });
    if (!id) return;
    const stillCurrent = () => get().selectedId === id;

    // Refreshed every few seconds so a ship's identity, route and path fill in without re-clicking.
    const load = () => {
      fetch(`/api/vehicles/${id}`)
        .then(async (r) => {
          if (!r.ok) throw new Error('This vehicle is no longer being tracked.');
          return (await r.json()) as Vehicle;
        })
        .then((details) => stillCurrent() && set({ details, detailsError: null }))
        .catch((e: Error) => stillCurrent() && !get().details && set({ detailsError: e.message }));

      // Route is optional: it only exists when the destination is known.
      fetch(`/api/vehicles/${id}/route`)
        .then((r) => (r.ok ? (r.json() as Promise<RouteGeometry>) : null))
        .then((route) => stillCurrent() && set({ route }))
        .catch(() => undefined);

      fetch(`/api/vehicles/${id}/track`)
        .then((r) => (r.ok ? (r.json() as Promise<{ points: [number, number, number][] }>) : null))
        .then((t) => stillCurrent() && t && set({ track: t.points }))
        .catch(() => undefined);
    };
    load();
    refreshTimer = window.setInterval(load, 10_000);
  },
}));

let refreshTimer: number | undefined;
