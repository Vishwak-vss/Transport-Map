import { useEffect } from 'react';
import { MapView } from './map/MapView';
import { Controls } from './panel/Controls';
import { DetailPanel } from './panel/DetailPanel';
import { connectLive, pollSources } from './lib/live';

export function App() {
  useEffect(() => connectLive(), []);
  useEffect(() => pollSources(), []);
  return (
    <div className="app">
      <MapView />
      <Controls />
      <DetailPanel />
    </div>
  );
}
