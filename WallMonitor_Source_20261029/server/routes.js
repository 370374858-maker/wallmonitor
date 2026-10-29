import { Router } from 'express';
import { checkDatabase } from './db.js';
import { getDashboardSnapshot } from './dashboard-service.js';
import {
  acknowledgeAlert,
  getAlerts,
  getMeasurementHistory,
  getPouringHistory,
  getPressureHistory,
  insertRecord,
  listSlots,
  updateSlot
} from './repository.js';

export const apiRouter = Router();

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

apiRouter.get('/health', asyncRoute(async (_request, response) => {
  const database = await checkDatabase();
  response.json({ status: 'ok', service: 'diaphragm-wall-monitor', database });
}));

apiRouter.get('/slots', asyncRoute(async (_request, response) => {
  response.json({ data: await listSlots() });
}));

apiRouter.get('/slots/:slotCode/snapshot', asyncRoute(async (request, response) => {
  response.json({ data: await getDashboardSnapshot(request.params.slotCode) });
}));

apiRouter.get('/slots/:slotCode/history', asyncRoute(async (request, response) => {
  const type = request.query.type || 'pouring';
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
  const readers = {
    pouring: getPouringHistory,
    measurement: getMeasurementHistory,
    pressure: getPressureHistory
  };
  if (!readers[type]) return response.status(400).json({ error: 'Unsupported history type' });
  response.json({ data: await readers[type](request.params.slotCode, limit) });
}));

apiRouter.put('/slots/:slotCode', asyncRoute(async (request, response) => {
  response.json({ data: await updateSlot(request.params.slotCode, request.body || {}) });
}));

apiRouter.post('/slots/:slotCode/records/:type', asyncRoute(async (request, response) => {
  const result = await insertRecord(request.params.type, request.params.slotCode, request.body || {});
  response.status(201).json({ data: result });
}));

apiRouter.get('/alerts', asyncRoute(async (request, response) => {
  response.json({
    data: await getAlerts({
      slotCode: request.query.slotId,
      status: request.query.status,
      limit: Math.min(200, Number(request.query.limit) || 50)
    })
  });
}));

apiRouter.patch('/alerts/:id/acknowledge', asyncRoute(async (request, response) => {
  const updated = await acknowledgeAlert(Number(request.params.id));
  if (!updated) return response.status(404).json({ error: 'Alert not found' });
  response.json({ data: { acknowledged: true } });
}));
