import { useUi } from '../state/ui';

const STATE_TEXT = { off: 'off', connecting: 'connecting', live: 'live', error: 'problem' } as const;

const STATUS_TEXT = { connecting: 'Connecting…', live: 'Receiving updates', reconnecting: 'Connection lost, retrying…' };

export function Controls() {
  const { showShips, showPlanes, freightOnly, status, counts, sources, regions, jumpTo, setFilter } = useUi();
  return (
    <section className="card controls" aria-label="Map controls">
      <h1>Transport Map</h1>
      <p className={`status status-${status}`}>{STATUS_TEXT[status]}</p>

      {sources && (
        <div className="feeds">
          <p className="feed-mode">{sources.mode === 'fixtures' ? 'Sample data (offline)' : 'Live data'}</p>
          {sources.mode === 'live' && (
            <>
              <FeedLine label="Ships" info={sources.ships} />
              <FeedLine label="Planes" info={sources.planes} />
            </>
          )}
        </div>
      )}

      <label className="toggle">
        <input type="checkbox" checked={showShips} onChange={(e) => setFilter('showShips', e.target.checked)} />
        Ships <span className="count">{counts.sea}</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showPlanes} onChange={(e) => setFilter('showPlanes', e.target.checked)} />
        Planes <span className="count">{counts.air}</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={freightOnly} onChange={(e) => setFilter('freightOnly', e.target.checked)} />
        Freight only <span className="count">{counts.freight}</span>
      </label>

      {regions.length > 0 && (
        <div className="jump" role="group" aria-label="Jump to a sea area">
          <p className="jump-label">Jump to</p>
          {regions.filter((r) => r.name !== 'world').map((r) => (
            <button key={r.name} type="button" onClick={() => jumpTo(r.name)}>
              {prettyRegion(r.name)}
            </button>
          ))}
          <button type="button" onClick={() => jumpTo('world')}>
            World
          </button>
        </div>
      )}

      <p className="legend">
        <span className="swatch swatch-freight" /> Freight
        <span className="swatch swatch-other" /> Other traffic
      </p>
    </section>
  );
}

const prettyRegion = (name: string) => name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function FeedLine({ label, info }: { label: string; info: { state: keyof typeof STATE_TEXT; detail: string } }) {
  return (
    <p className={`feed feed-${info.state}`}>
      {label}: {STATE_TEXT[info.state]}
      {info.detail ? `, ${info.detail}` : ''}
    </p>
  );
}
