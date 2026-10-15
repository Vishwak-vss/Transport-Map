import { useUi } from '../state/ui';
import { formatCoord, formatEta, formatSpeed } from '../lib/format';
import { live } from '../lib/live';
import { project } from '../lib/motion';
import { boundsOf } from '../lib/geo';

const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function DetailPanel() {
  const { selectedId, details: v, route, track, detailsError, select, fitBounds } = useUi();
  if (!selectedId) return null;

  // a ship we have a position for but no identity broadcast from yet
  const waiting = v?.mode === 'sea' && !v.model;

  const zoomToPath = () => {
    const live1 = live.vehicles.get(selectedId);
    const points: [number, number][] = [];
    for (const line of route?.lines ?? []) points.push(...line);
    for (const [lon, lat] of track ?? []) points.push([lon, lat]);
    if (live1) points.push(project(live1, Date.now() - live.skewMs));
    const box = boundsOf(points);
    if (!box) return;
    // a very short path would zoom in absurdly far, so keep a minimum extent
    const [[w, s], [e, n]] = box;
    const pad = Math.max(0, 0.05 - (e - w), 0.05 - (n - s)) / 2;
    fitBounds([[w - pad, s - pad], [e + pad, n + pad]]);
  };

  const trackPoints = track && track.length > 1 ? track.length : 0;
  const hasPath = Boolean(route) || trackPoints > 0;

  return (
    <aside className="card detail" aria-label="Vehicle details">
      <button className="close" onClick={() => select(null)} aria-label="Close details">
        ×
      </button>

      {detailsError && <p className="error">{detailsError}</p>}
      {!v && !detailsError && <p className="muted">Loading…</p>}

      {v && (
        <>
          <h2>{v.name || (v.mode === 'air' ? 'Unidentified aircraft' : 'Unnamed vessel')}</h2>
          <p className="kind">{v.mode === 'air' ? 'Aircraft' : 'Ship'}{v.isFreight ? ', freight' : ''}</p>

          {waiting && (
            <p className="muted note">
              Waiting for this ship's identity broadcast. Ships send their name, type and destination roughly every
              6 minutes, so this fills in shortly. Small boats may never send a destination.
            </p>
          )}

          <dl>
            <dt>Destination</dt>
            <dd>{waiting ? 'Not received yet' : v.destination ? v.destination.name : 'Not given or not recognised'}</dd>
            <dt>Origin</dt>
            <dd>{v.mode === 'sea' ? 'Not broadcast by ships' : 'Not available'}</dd>
            {route && (
              <>
                <dt>Distance to go</dt>
                <dd>
                  {Math.round(route.distanceKm).toLocaleString()} km
                  <span className="muted"> ({route.kind === 'sea-lane' ? 'along sea lanes, approximate' : 'straight line'})</span>
                </dd>
              </>
            )}
            <dt>{v.mode === 'air' ? 'Operator' : 'Vessel type'}</dt>
            <dd>{v.model ?? (waiting ? 'Not received yet' : 'Not reported')}</dd>
            <dt>Cargo</dt>
            <dd>{v.cargoCategory ?? (waiting ? 'Not received yet' : 'Not reported')}</dd>
            <dt>Speed</dt>
            <dd>{formatSpeed(v.speed, v.mode)}</dd>
            <dt>ETA</dt>
            <dd>{waiting ? 'Not received yet' : formatEta(v.etaAt)}</dd>
            <dt>Position</dt>
            <dd>{formatCoord(v.lat, v.lon)}</dd>
            <dt>Path so far</dt>
            <dd>
              {track && track.length > 1
                ? `since ${time(track[0]![2])}`
                : 'Appears once it has moved (history starts when this app started watching)'}
            </dd>
          </dl>

          {hasPath && (
            <>
              <p className="path-legend">
                {trackPoints > 0 && (
                  <span><i className="line line-track" /> Path so far</span>
                )}
                {route && (
                  <span><i className="line line-route" /> Route to destination</span>
                )}
              </p>
              <button className="zoom-btn" type="button" onClick={zoomToPath}>
                Zoom to path
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}
