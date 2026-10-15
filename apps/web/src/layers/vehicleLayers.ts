import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { RouteGeometry, VehicleDelta } from '@tm/shared';
import { project } from '../lib/motion';
import { splitAtAntimeridian } from '../lib/geo';
import { PLANE_ICON, SHIP_ICON } from './icons';

export type Filters = { showShips: boolean; showPlanes: boolean; freightOnly: boolean };
/** The part of the world currently on screen, used to skip drawing what cannot be seen. */
export type View = { west: number; south: number; east: number; north: number };

type Drawn = { id: string; mode: 'air' | 'sea'; position: [number, number]; heading: number; isFreight: boolean };

// Design tokens mirrored from styles.css (deck needs RGBA arrays).
const FREIGHT: [number, number, number, number] = [232, 118, 30, 255];
const QUIET: [number, number, number, number] = [112, 134, 154, 200];
const SELECTED: [number, number, number, number] = [23, 50, 77, 255];
const ROUTE: [number, number, number, number] = [47, 111, 159, 230];
const TRACK: [number, number, number, number] = [23, 50, 77, 235];

export type LayerInput = {
  vehicles: Iterable<VehicleDelta>;
  serverNow: number;
  filters: Filters;
  selectedId: string | null;
  route: RouteGeometry | null;
  track: [number, number, number][] | null;
  view: View | null;
  /** current map zoom; icons shrink when zoomed far out so crowded areas stay readable */
  zoom: number;
};

function inView(lat: number, lon: number, v: View): boolean {
  const padLat = (v.north - v.south) * 0.1;
  const padLon = (v.east - v.west) * 0.1;
  if (lat < v.south - padLat || lat > v.north + padLat) return false;
  // the map can show repeated copies of the world, so test the longitude shifted by whole turns too
  for (const shift of [0, 360, -360]) {
    const x = lon + shift;
    if (x >= v.west - padLon && x <= v.east + padLon) return true;
  }
  return false;
}

export function buildLayers({ vehicles, serverNow, filters, selectedId, route, track, view, zoom }: LayerInput) {
  const k = zoom < 3 ? 0.45 : zoom < 5 ? 0.7 : 1;
  const data: Drawn[] = [];
  let selectedPos: [number, number] | null = null;
  for (const v of vehicles) {
    const isSelected = v.id === selectedId;
    if (!isSelected) {
      if (v.mode === 'sea' && !filters.showShips) continue;
      if (v.mode === 'air' && !filters.showPlanes) continue;
      if (filters.freightOnly && !v.isFreight) continue;
      if (view && !inView(v.lat, v.lon, view)) continue; // off screen: skip
    }
    const position = project(v, serverNow);
    if (isSelected) selectedPos = position;
    data.push({ id: v.id, mode: v.mode, position, heading: v.heading, isFreight: v.isFreight });
  }

  const layers = [];

  if (route) {
    layers.push(
      new PathLayer<[number, number][]>({
        id: 'route',
        data: route.lines,
        getPath: (d) => d,
        getColor: ROUTE,
        getWidth: 3,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
    );
    // mark where the route ends
    const lastLine = route.lines[route.lines.length - 1];
    const end = lastLine?.[lastLine.length - 1];
    if (end) {
      layers.push(
        new ScatterplotLayer<[number, number]>({
          id: 'destination',
          data: [end],
          getPosition: (d) => d,
          getRadius: 7,
          radiusUnits: 'pixels',
          getFillColor: [255, 255, 255, 255],
          getLineColor: ROUTE,
          getLineWidth: 3,
          lineWidthUnits: 'pixels',
          stroked: true,
        }),
      );
    }
  }

  if (track && track.length > 0) {
    const points = track.map(([lon, lat]) => [lon, lat] as [number, number]);
    if (selectedPos) points.push(selectedPos); // join the path to where the vehicle is now
    layers.push(
      new PathLayer<[number, number][]>({
        id: 'track',
        data: splitAtAntimeridian(points),
        getPath: (d) => d,
        getColor: TRACK,
        getWidth: 3,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
    );
  }

  layers.push(
    new IconLayer<Drawn>({
      id: 'vehicles',
      data,
      pickable: true,
      getIcon: (d) => (d.mode === 'air' ? PLANE_ICON : SHIP_ICON),
      getPosition: (d) => d.position,
      getAngle: (d) => -d.heading, // deck angles run counter-clockwise; headings run clockwise
      getSize: (d) => (d.id === selectedId ? 30 : (d.isFreight ? 22 : 15) * k),
      sizeUnits: 'pixels',
      getColor: (d) => (d.id === selectedId ? SELECTED : d.isFreight ? FREIGHT : QUIET),
      updateTriggers: { getSize: [selectedId, k], getColor: [selectedId] },
    }),
  );
  return layers;
}
