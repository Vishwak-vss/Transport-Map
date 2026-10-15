import type { FastifyInstance } from 'fastify';
import type { VehicleStore } from '../store/vehicleStore';
import { greatCircleRoute } from '../routing/greatCircle';
import { seaRoute } from '../routing/seaRoute';
import { config } from '../config';
import { sources } from '../status';

export function registerRoutes(app: FastifyInstance, store: VehicleStore) {
  app.get('/api/health', async () => ({
    ok: true,
    vehicles: store.size,
    mode: config.dataMode,
    sources,
    // the sea areas being watched (live mode), so the UI can offer "jump to" buttons
    regions:
      config.dataMode === 'live'
        ? config.ais.regionNames.map((name, i) => ({ name, box: config.ais.boundingBoxes[i] }))
        : [],
  }));

  app.get('/api/vehicles', async () => ({ vehicles: store.snapshot(), at: Date.now() }));

  app.get<{ Params: { id: string } }>('/api/vehicles/:id', async (req, reply) => {
    const v = store.get(req.params.id);
    if (!v) return reply.code(404).send({ error: 'Vehicle not found (it may have expired)' });
    return v;
  });

  // Where the vehicle has been since we started watching it.
  app.get<{ Params: { id: string } }>('/api/vehicles/:id/track', async (req, reply) => {
    if (!store.get(req.params.id)) return reply.code(404).send({ error: 'Vehicle not found' });
    return { vehicleId: req.params.id, points: store.track(req.params.id) };
  });

  // Route from the vehicle's current position to its destination (if known).
  app.get<{ Params: { id: string } }>('/api/vehicles/:id/route', async (req, reply) => {
    const v = store.get(req.params.id);
    if (!v) return reply.code(404).send({ error: 'Vehicle not found' });
    if (!v.destination) return reply.code(404).send({ error: 'Destination unknown for this vehicle' });
    const from: [number, number] = [v.lon, v.lat];
    const to: [number, number] = [v.destination.lon, v.destination.lat];
    return v.mode === 'sea' ? seaRoute(v.id, from, to) : greatCircleRoute(v.id, from, to);
  });
}
