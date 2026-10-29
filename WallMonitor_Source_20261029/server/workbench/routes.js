import { Router } from 'express';
import { pool } from '../db.js';
import { deleteWorkbenchSlot } from './delete-slot.js';
import { listWorkbenchSlots, createWorkbenchSlot, getWorkbenchState, getWorkbenchRecords,
  getWorkbenchRecord, getWorkbenchMonitor, updateMonitoringPolicy } from './repository.js';
import { getRevisionContext, previewRevision, commitRevision, listRevisions, getRevision } from './revisions.js';
import { listEvents, getEventState, previewEvents, createEvents, reviseEvents, receiveDeviceEvent, getEvent } from './events.js';
import {receiveTelemetry,telemetryStatus} from './telemetry.js';
import {jointOperationRequest} from '../../shared/joint-operation.js';
import {livePressure} from './live-pressure.js';
import {initializeJointBaseline} from './joint-baseline.js';
import {applySlotSurvey} from './slot-survey.js';

export const workbenchRouter = Router();
const wrap = action => (req, res, next) => Promise.resolve(action(req, res)).catch(next);
workbenchRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
workbenchRouter.get('/health', wrap(async (_req, res) => {
  await pool.query('SELECT id FROM cw_slot LIMIT 1');
  await pool.query('SELECT id FROM cw_record LIMIT 1');
  const [[eventTables]]=await pool.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cw_event','cw_event_request','cw_device_event_request','cw_event_audit')");
  const [[pending]]=await pool.query(`SELECT COUNT(*) n FROM cw_slot s WHERE
    COALESCE(JSON_EXTRACT(s.properties,'$.eventWorkflowVersion'),0)<2
    AND EXISTS (SELECT 1 FROM cw_record r WHERE r.slot_id=s.id)`);
  res.json({ status: 'ok', storage: 'mysql', workflow: 'independent-events-v1', workflowVersion: 2,
    eventTablesReady:Number(eventTables.n)===4, pendingMigrationSlots:Number(pending.n),
    migrationReady:Number(eventTables.n)===4 && Number(pending.n)===0, measurementDatum: 'depth-below-slot-top' });
}));
workbenchRouter.get('/slots', wrap(async (_req, res) => res.json({ data: await listWorkbenchSlots() })));
workbenchRouter.delete('/slots/:id', wrap(async(req,res)=>res.json({data:await deleteWorkbenchSlot(req.params.id,req.body||{})})));
workbenchRouter.post('/slots', wrap(async (req, res) => {
  const result = await createWorkbenchSlot(req.body || {});
  res.status(result.replayed ? 200 : 201).json({ data: result });
}));
workbenchRouter.get('/slots/:id/state', wrap(async (req, res) => res.json({ data: await getWorkbenchState(req.params.id) })));
workbenchRouter.get('/slots/:id/events', wrap(async (req,res)=>res.json({data:await listEvents(req.params.id,req.query)})));
workbenchRouter.get('/slots/:id/event-state', wrap(async (req,res)=>res.json({data:await getEventState(req.params.id)})));
workbenchRouter.post('/slots/:id/joint-depth-baseline',wrap(async(req,res)=>res.json({data:await initializeJointBaseline(req.params.id,req.body||{},{source:req.eventSource||'manual'})})));
workbenchRouter.post('/slots/:id/survey-depth',wrap(async(req,res)=>res.json({data:await applySlotSurvey(req.params.id,req.body||{})})));
workbenchRouter.post('/slots/:id/events/preview', wrap(async (req,res)=>res.json({data:await previewEvents(req.params.id,req.body||{})})));
workbenchRouter.post('/slots/:id/events', wrap(async (req,res)=>{const out=await createEvents(req.params.id,req.body||{},{source:req.eventSource||'manual'});res.status(out.replayed?200:201).json({data:out});}));
workbenchRouter.post('/slots/:id/events/revise', wrap(async (req,res)=>res.json({data:await reviseEvents(req.params.id,req.body||{})})));
workbenchRouter.get('/slots/:id/events/:eventId', wrap(async (req,res)=>res.json({data:await getEvent(req.params.id,req.params.eventId)})));
workbenchRouter.post('/device-events', wrap(async (req,res)=>{const out=await receiveDeviceEvent(req.body||{});res.status(out.replayed?200:201).json({data:out});}));
workbenchRouter.post('/joint-operations',wrap(async(req,res)=>{const out=await receiveDeviceEvent(jointOperationRequest(req.body||{}));res.status(out.replayed?200:201).json({data:out});}));
workbenchRouter.post('/live-pressure',wrap(async(req,res)=>res.json({data:await livePressure.receive(req.body||{})})));
workbenchRouter.get('/slots/:id/live-pressure',wrap(async(req,res)=>res.json({data:await livePressure.read(req.params.id)})));
workbenchRouter.post('/telemetry',wrap(async(req,res)=>res.json({data:await receiveTelemetry(req.body||{})})));
workbenchRouter.get('/telemetry/status',wrap(async(_req,res)=>res.json({data:await telemetryStatus()})));
workbenchRouter.get('/slots/:id/edit-context', wrap(async (req, res) => res.json({ data: await getRevisionContext(req.params.id, req.query.recordId || null) })));
workbenchRouter.post('/slots/:id/revisions/preview', wrap(async (req, res) => res.json({ data: await previewRevision(req.params.id, req.body || {}) })));
workbenchRouter.post('/slots/:id/revisions', wrap(async (req, res) => res.json({ data: await commitRevision(req.params.id, req.body || {}) })));
workbenchRouter.get('/slots/:id/revisions', wrap(async (req, res) => res.json({ data: await listRevisions(req.params.id, Math.max(0, parseInt(req.query.offset, 10) || 0),req.query.kind??null) })));
workbenchRouter.get('/slots/:id/revisions/:revisionId', wrap(async (req, res) => res.json({ data: await getRevision(req.params.id, req.params.revisionId) })));
workbenchRouter.get('/slots/:id/monitor', wrap(async (req, res) => res.json({ data: await getWorkbenchMonitor(req.params.id) })));
workbenchRouter.put('/slots/:id/monitoring-policy', wrap(async (req, res) => res.json({ data: await updateMonitoringPolicy(req.params.id, req.body || {}) })));
workbenchRouter.get('/slots/:id/records', wrap(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  res.json({ data: await getWorkbenchRecords(req.params.id, limit, offset, req.query.order) });
}));
workbenchRouter.get('/slots/:id/records/:recordId', wrap(async (req, res) => res.json({ data: await getWorkbenchRecord(req.params.id, req.params.recordId) })));
workbenchRouter.post('/slots/:id/records', wrap(async (req, res) => {
  res.status(410).json({ error: '按车统一录入接口已永久停用；请通过独立事件接口分别录入' });
}));
workbenchRouter.use((error, _req, res, _next) => {
  if (error.code === 'ER_NO_SUCH_TABLE' && /cw_event/.test(error.sql || '')) {
    return res.status(503).json({ error: '事件表尚未初始化，请由管理员执行 scripts/migrate-events.js；旧施工记录未被修改' });
  }
  if (error.code === 'ER_NO_SUCH_TABLE' && /cw_revision/.test(error.sql || '')) {
    return res.status(503).json({ error: '修订备份表尚未初始化，请由管理员执行 database/workbench.sql；本次未修改任何历史数据' });
  }
  const unavailable = ['ER_NO_SUCH_TABLE', 'ECONNREFUSED', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR'].includes(error.code);
  const status = unavailable ? 503 : Number(error.status) || 500;
  if (status >= 500) console.error('[workbench]', error.code || error.message);
  res.status(status).json({ error: unavailable ? '数据库暂不可用或新流程未初始化，未切换到演示数据。请检查服务后重试。'
    : status >= 500 ? '保存或读取失败，请重试；请勿重复更换提交内容。' : error.message,
  issues: error.issues || undefined });
});
