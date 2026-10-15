import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type IControl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { live } from '../lib/live';
import { useUi } from '../state/ui';
import { buildLayers } from '../layers/vehicleLayers';

// MapLibre 6 looks for its worker file next to its own module, which bundlers (including Vite's
// dev server) move elsewhere, leaving the map blank. Pointing it at the file explicitly fixes that.
setWorkerUrl(new URL(workerUrl, location.href).href);

// Free demo style, fine for development. Swap for a fuller basemap (OpenFreeMap, Protomaps, MapTiler) later.
const STYLE = 'https://demotiles.maplibre.org/style.json';
/**
 * How often to redraw. Ships move far less than a pixel per second, so with thousands on screen a
 * slow refresh looks identical and costs far less. A few ships get smooth 30 fps.
 */
const refreshMs = (shown: number) => (shown > 12000 ? 1000 : shown > 5000 ? 500 : shown > 1500 ? 200 : 33);

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    const map = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: [20, 25],
      zoom: 1.6,
      minZoom: 1,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    const overlay = new MapboxOverlay({
      interleaved: false,
      onClick: (info) => {
        const id = info.layer?.id === 'vehicles' ? (info.object as { id: string } | null)?.id ?? null : null;
        useUi.getState().select(id);
      },
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : ''),
    });
    map.addControl(overlay as unknown as IControl);

    // "Jump to" buttons in the controls panel ask the map to move.
    const unsubscribe = useUi.subscribe((state, prev) => {
      const req = state.viewRequest;
      if (!req || req === prev.viewRequest) return;
      if (req.bounds) {
        const narrow = window.innerWidth < 700;
        const detailOpen = state.selectedId !== null;
        map.fitBounds(req.bounds, {
          padding: narrow ? 20 : { top: 60, bottom: 60, left: 320, right: detailOpen ? 340 : 60 },
          maxZoom: 12,
          duration: 900,
        });
        return;
      }
      if (req.region === 'world') {
        map.easeTo({ center: [20, 25], zoom: 1.6, duration: 900 });
        return;
      }
      const region = state.regions.find((r) => r.name === req.region);
      if (!region) return;
      const [[latA, lonA], [latB, lonB]] = region.box;
      const narrow = window.innerWidth < 700;
      map.fitBounds(
        [[Math.min(lonA, lonB), Math.min(latA, latB)], [Math.max(lonA, lonB), Math.max(latA, latB)]],
        { padding: narrow ? 20 : { top: 40, bottom: 40, left: 320, right: 40 }, maxZoom: 9, duration: 900 },
      );
    });

    let raf = 0;
    let last = 0;
    let shown = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < refreshMs(shown)) return;
      last = t;
      const ui = useUi.getState();
      // Skip drawing what is off screen once zoomed in enough for that to matter.
      const b = map.getBounds();
      const view = map.getZoom() >= 3 ? { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } : null;
      const layers = buildLayers({
        vehicles: live.vehicles.values(),
        serverNow: Date.now() - live.skewMs,
        filters: { showShips: ui.showShips, showPlanes: ui.showPlanes, freightOnly: ui.freightOnly },
        selectedId: ui.selectedId,
        route: ui.route,
        track: ui.track,
        view,
        zoom: map.getZoom(),
      });
      shown = (layers[layers.length - 1] as { props: { data: unknown[] } }).props.data.length;
      overlay.setProps({ layers });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      map.remove();
    };
  }, []);

  return <div ref={container} className="map" />;
}
