import type { StreamMessage, VehicleDelta } from '@tm/shared';
import { useUi, type Region, type Sources } from '../state/ui';

/** Latest known state of every vehicle, mutated in place (the map reads it every frame). */
export const live = {
  vehicles: new Map<string, VehicleDelta>(),
  /** client clock minus server clock, so dead reckoning uses server time */
  skewMs: 0,
};

function publishCounts() {
  let sea = 0;
  let air = 0;
  let freight = 0;
  for (const v of live.vehicles.values()) {
    if (v.mode === 'sea') sea++;
    else air++;
    if (v.isFreight) freight++;
  }
  useUi.getState().setCounts({ sea, air, freight });
}

/** Which feeds are on, off or failing (for example no OpenSky credentials). Polled gently. */
export function pollSources(): () => void {
  const load = () =>
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ mode: Sources['mode']; sources: Pick<Sources, 'ships' | 'planes'>; regions?: Region[] }>)
      .then((h) => {
        const ui = useUi.getState();
        ui.setSources({ mode: h.mode, ships: h.sources.ships, planes: h.sources.planes });
        // only update when the list changed, so the buttons do not re-render every poll
        const next = h.regions ?? [];
        if (JSON.stringify(next) !== JSON.stringify(ui.regions)) ui.setRegions(next);
      })
      .catch(() => undefined);
  void load();
  const t = window.setInterval(load, 10_000);
  return () => window.clearInterval(t);
}

/** Opens the WebSocket and keeps it open. Returns a cleanup function. */
export function connectLive(): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: number | undefined;

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/stream`);

    ws.onopen = () => {
      attempt = 0;
      useUi.getState().setStatus('live');
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as StreamMessage;
      live.skewMs = Date.now() - msg.at;
      if (msg.type === 'snapshot') live.vehicles.clear();
      for (const v of msg.vehicles) live.vehicles.set(v.id, v);
      if (msg.type === 'delta') for (const id of msg.removed) live.vehicles.delete(id);
      publishCounts();
    };
    ws.onclose = () => {
      if (closed) return;
      useUi.getState().setStatus('reconnecting');
      timer = window.setTimeout(open, Math.min(15_000, 1000 * 2 ** attempt++));
    };
  };

  open();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
