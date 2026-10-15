import type { FastifyInstance } from 'fastify';
import type { StreamMessage } from '@tm/shared';
import type { VehicleStore } from '../store/vehicleStore';

/** WebSocket at /stream: a full snapshot on connect, then small deltas. */
export function registerStream(app: FastifyInstance, store: VehicleStore, broadcastMs: number) {
  app.get('/stream', { websocket: true }, (socket) => {
    const snapshot: StreamMessage = { type: 'snapshot', vehicles: store.snapshot(), at: Date.now() };
    socket.send(JSON.stringify(snapshot));
  });

  const timer = setInterval(() => {
    const { changed, removed } = store.drain();
    if (changed.length === 0 && removed.length === 0) return;
    const msg: StreamMessage = { type: 'delta', vehicles: changed, removed, at: Date.now() };
    const payload = JSON.stringify(msg);
    for (const client of app.websocketServer.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }, broadcastMs);
  app.addHook('onClose', async () => clearInterval(timer));
}
