import { randomUUID, createHash } from 'node:crypto';
import { pool, inTransaction } from '../db.js';
import { calculateSlot, calculateRecord, nextTruckNo, ValidationError } from '../../shared/construction.js';
import { buildMonitor, evaluateRecord, policyFor, validatePolicy, timeMs, beijingTime } from '../../shared/monitoring.js';
import { dataRevision } from '../../shared/revisions.js';

const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const problem = (status, message) => Object.assign(new Error(message), { status });
const transaction = work => inTransaction(async connection => {
                                                                                                   
  await connection.query("SET time_zone = '+08:00'");
  return work(connection);
});

function requestKey(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError({ requestId: '缺少有效的提交标识，请刷新页面后重试' });
  }
  return value;
}

function normalizeSlotProperties(value) {
  const properties = json(value);
  const initialConcreteHeight = typeof properties.initialConcreteHeight === 'number' && Number.isFinite(properties.initialConcreteHeight)
    ? properties.initialConcreteHeight : 0;
  return { ...properties, initialConcreteHeight, model: properties.model
    ? { ...properties.model, initialConcreteHeight: properties.model.initialConcreteHeight ?? initialConcreteHeight }
    : properties.model };
}

function decodeSlot(row) {
  return { ...normalizeSlotProperties(row.properties), id: row.id, createdAt: row.created_at,
    recordCount: Number(row.record_count || 0), lastRecordAt: row.last_record_at || null };
}

function decodeRecord(row) {
  const slotSnapshot = normalizeSlotProperties(row.slot_snapshot);
  let metrics = json(row.metrics);
                                                                               
                                                                              
                                              
  if (!Object.hasOwn(metrics, 'initialConcreteHeight')) {
    const initialConcreteHeight = slotSnapshot.initialConcreteHeight;
    const actualRiseFromInitial = Number.isFinite(metrics.actualHeight)
      ? roundForCompatibility(metrics.actualHeight - initialConcreteHeight) : null;
    const measurementVolume = actualRiseFromInitial !== null && Number.isFinite(metrics.area)
      ? roundForCompatibility(actualRiseFromInitial * metrics.area) : null;
    const theoreticalDepth = Number.isFinite(metrics.cumulativeVolume) && Number.isFinite(metrics.area) && metrics.area > 0
      ? roundForCompatibility(slotSnapshot.depth - initialConcreteHeight - metrics.cumulativeVolume / metrics.area)
      : metrics.theoreticalDepth;
    let actualSpeed = metrics.actualSpeed;
    if (row.previous_record_id == null && actualRiseFromInitial !== null) {
      const durationHours = (timeMs(row.ended_at) - timeMs(row.started_at)) / 3600000;
      if (Number.isFinite(durationHours) && durationHours > 0) actualSpeed = roundForCompatibility(actualRiseFromInitial / durationHours);
    }
    const notes = (metrics.notes ?? []).filter(note => !(Number.isFinite(actualSpeed) && note === '首条记录没有前序测量，实测速度保留为空。'));
    metrics = { ...metrics, notes, initialConcreteHeight, actualRiseFromInitial, theoreticalDepth,
      actualSpeed, measurementVolume,
      fillCoefficient: measurementVolume > 0 && Number.isFinite(metrics.cumulativeVolume)
        ? roundForCompatibility(metrics.cumulativeVolume / measurementVolume) : null };
  }
  return {
    id: row.id, slotId: row.slot_id, truckNo: row.truck_no,
    startedAt: row.started_at, endedAt: row.ended_at, volume: Number(row.volume_m3),
    measurementPoints: [1, 2, 3, 4, 5, 6].map(i => Number(row[`point_${i}`])),
    tremiePulls: json(row.tremie_pulls), jointPulls: json(row.joint_pulls),
    metrics, slotSnapshot,
    previousRecordId: row.previous_record_id, createdAt: row.created_at
  };
}

const roundForCompatibility = value => Number(value.toFixed(8));

async function readSlot(connection, id, lock = false) {
  const [rows] = await connection.execute('SELECT * FROM cw_slot WHERE id = ?' + (lock ? ' FOR UPDATE' : ''), [id]);
  if (!rows[0]) throw problem(404, '槽段不存在，请刷新槽段列表');
  return decodeSlot(rows[0]);
}

async function latest(connection, id) {
  const [rows] = await connection.execute('SELECT * FROM cw_record WHERE slot_id = ? ORDER BY ended_at DESC, id DESC LIMIT 1', [id]);
  return rows[0] ? decodeRecord(rows[0]) : null;
}

async function readNextTruckNo(connection, slotId) {
  const [[row]] = await connection.execute('SELECT MAX(truck_no) AS truckNo FROM cw_record WHERE slot_id = ?', [slotId]);
  return nextTruckNo(row?.truckNo == null ? [] : [Number(row.truckNo)]);
}

export async function listWorkbenchSlots() {
  const [[tables]] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cw_event'");
  if (!Number(tables.n)) {
    const [old] = await pool.query(`SELECT s.*,COUNT(r.id)*4 AS record_count,MAX(r.ended_at) AS last_record_at
      FROM cw_slot s LEFT JOIN cw_record r ON r.slot_id=s.id GROUP BY s.id ORDER BY s.created_at DESC,s.id DESC`);
    return old.map(row => ({...decodeSlot(row),readOnly:true,migrationRequired:true}));
  }
  const [rows] = await pool.query(`SELECT s.*, COUNT(e.id) AS record_count, MAX(e.occurred_at) AS last_record_at,
      MAX(r.record_count) AS legacy_record_count, MAX(r.last_record_at) AS legacy_last_record_at
    FROM cw_slot s LEFT JOIN (
      SELECT a.* FROM cw_event a JOIN (SELECT slot_id,id,MAX(version) AS version FROM cw_event GROUP BY slot_id,id) v
        ON a.slot_id=v.slot_id AND a.id=v.id AND a.version=v.version WHERE a.status='active'
    ) e ON e.slot_id = s.id
    LEFT JOIN (SELECT slot_id,COUNT(*) AS record_count,MAX(ended_at) AS last_record_at FROM cw_record GROUP BY slot_id) r ON r.slot_id=s.id
    GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC`);
  return rows.map(row => {
    const slot = decodeSlot(row);
    if (!(slot.eventWorkflowVersion >= 2) && Number(row.legacy_record_count) > 0) {
      return { ...slot, recordCount: Number(row.legacy_record_count)*4,
        lastRecordAt: row.legacy_last_record_at, readOnly: true, migrationRequired: true };
    }
    return slot;
  });
}

export async function createWorkbenchSlot(input) {
  const key = requestKey(input.requestId);
  const slot = calculateSlot(input, { requireJointDiameter: true });
  if (!slot.initialObservedAt) throw new ValidationError({ initialObservedAt: '新建槽段必须填写初始混凝土面的实际观测时间' });
  const payloadHash = hash(slot);
  return transaction(async connection => {
    const [old] = await connection.execute('SELECT * FROM cw_slot WHERE request_key = ?', [key]);
    if (old[0]) {
      if (old[0].payload_hash !== payloadHash) throw problem(409, '同一提交标识对应不同内容，请重新提交');
      return { slot: decodeSlot(old[0]), replayed: true };
    }
    const id = randomUUID();
    try {
      await connection.execute(`INSERT INTO cw_slot
        (id,slot_code,request_key,payload_hash,width_m,depth_m,thickness_m,tremie_count,joint_layout,properties)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, slot.code, key, payloadHash, slot.width, slot.depth, slot.thickness, slot.tremieCount, slot.jointLayout, JSON.stringify(slot)]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw problem(409, '槽段编号已存在，请选择已有槽段或更换编号');
      throw error;
    }
    return { slot: await readSlot(connection, id), replayed: false };
  });
}

export async function getWorkbenchState(id) {
  const { getEventState } = await import('./events.js');
  return getEventState(id);
}

export async function getWorkbenchRecords(id, limit = 50, offset = 0, order = 'time-desc') {
  await readSlot(pool, id);
  const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM cw_record WHERE slot_id = ?', [id]);
                                                                               
  const orderBy = order === 'truck-asc' ? 'truck_no ASC, id ASC' : 'ended_at DESC, id DESC';
  const [rows] = await pool.query(`SELECT * FROM cw_record WHERE slot_id = ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [id, limit, offset]);
  return { rows: rows.map(decodeRecord), total: Number(count.n), limit, offset };
}

export async function getWorkbenchRecord(slotId, recordId) {
  const [rows] = await pool.execute('SELECT * FROM cw_record WHERE id = ? AND slot_id = ?', [recordId, slotId]);
  if (!rows[0]) throw problem(404, '施工记录不存在');
  return decodeRecord(rows[0]);
}

async function history(connection, slotId) {
  const [[{ n }]] = await connection.execute('SELECT COUNT(*) AS n FROM cw_record WHERE slot_id = ?', [slotId]);
                                                                                        
  if (Number(n) > 20000) throw problem(422, '该槽段超过 20000 条记录，请先配置分层历史查询；本次没有截断历史进行评价');
  const [rows] = await connection.execute('SELECT * FROM cw_record WHERE slot_id = ? ORDER BY ended_at, id', [slotId]);
  return rows.map(decodeRecord);
}

export async function getWorkbenchMonitor(slotId, asOfMs = Date.now()) {
  const { readEventHistory } = await import('./events.js');
  const { buildEventMonitor } = await import('../../shared/event-monitor.js');
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId);
    const readable = await readEventHistory(connection, slot, {replay:false});
    const monitor = buildEventMonitor(slot, readable.events, asOfMs);
    if (readable.migrationRequired) {
      monitor.readOnly = true; monitor.migrationRequired = true;
      monitor.provenance.tables = ['cw_slot','cw_record'];
      monitor.provenance.mode = '旧记录只读拆分回放；事件表迁移未完成，暂不允许保存新事件';
      monitor.issues.push('独立事件表尚未初始化或旧数据待迁移，目前为旧记录只读回放。');
    }
    return monitor;
  });
}

export async function updateMonitoringPolicy(slotId, input) {
  const values = validatePolicy(input.policy || {});
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) throw problem(422, '缺少有效规则版本，请重新加载');
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId, true), previous = policyFor(slot);
    if (input.baseRevision !== previous.revision) throw problem(409, '参数已被其他页面更新，请重新加载后再修改');
    const { id, createdAt, recordCount, lastRecordAt, ...properties } = slot;
    properties.monitoringPolicy = { ...values, revision: previous.revision + 1, changedAt: beijingTime(Date.now()) };
    properties.monitoringPolicyHistory = [...(properties.monitoringPolicyHistory || []), previous];
                                                                             
                                                                                 
                                                                               
    await connection.execute('UPDATE cw_slot SET properties = ? WHERE id = ?', [JSON.stringify(properties), slotId]);
    return properties.monitoringPolicy;
  });
}

export async function createWorkbenchRecord(slotId, input) {
  throw problem(409, '按车旧接口已停用；请刷新页面，使用独立录入或按车统一录入（统一提交四类事件）');
}

export function checkDataRevision(slot, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw problem(422, '缺少数据版本，请刷新槽段后提交；输入草稿会保留');
  if (revision !== dataRevision(slot)) throw problem(409, '槽段或历史数据已被其他页面修改，请重新加载并核对后再提交；本次没有覆盖任何数据');
}
export { json, hash, problem, transaction, requestKey, readSlot, readNextTruckNo, history,
  normalizeSlotProperties, decodeRecord };
