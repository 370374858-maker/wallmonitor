import { randomUUID } from 'node:crypto';
import { calculateSlot } from '../../shared/construction.js';
import { replayEvents } from '../../shared/events.js';
import { dataRevision } from '../../shared/revisions.js';
import { transaction, readSlot, checkDataRevision, requestKey, hash, json, problem } from './repository.js';
import { readEventHistory } from './events.js';

const payload = input => ({ kind: 'slot', values: input.values, baseRevision: input.baseRevision });
const token = (slotId,input) => hash({ slotId, ...payload(input) });
async function prepare(connection, slotId, input) {
  const slot = await readSlot(connection, slotId, true);
  checkDataRevision(slot, input.baseRevision);
  if (input.recordPatches?.length) throw problem(422, '事件模式不按车补造拔管量；请在 05 中修正对应的独立拔管记录');
  const geometry = calculateSlot(input.values, { requireJointDiameter: true });
  if (hash(geometry) === hash(calculateSlot(slot))) throw problem(422, '未检测到槽段参数变化');
  const readable = await readEventHistory(connection, slot);
  if (readable.migrationRequired) throw problem(503, '事件表迁移尚未完成，暂不能保存槽段修改；旧数据未改动');
  const { events } = readable;
  const next = { ...slot, ...geometry };
                                                                           
                                                                               
  const before = replayEvents(slot, events), after = replayEvents(next, events);
  const [duplicates] = await connection.execute('SELECT id FROM cw_slot WHERE slot_code=? AND id<>?', [next.code,slotId]);
  if (duplicates.length) throw problem(409, '槽段编号已存在');
  const summary = { kind: 'slot', targetId: slotId, total: events.length, hasInputChanges: true,
    recalculated: after.snapshots.length, changed: after.snapshots.length, rawChanged: 0, orderChanged: false,
    configurationChanged: slot.tremieCount !== next.tremieCount || slot.jointLayout !== next.jointLayout,
    unit: '个时刻',
    before: { area: slot.area, latestTruckNo: before.latest?.truckNo ?? null, metrics: before.latest?.metrics ?? null },
    after: { area: next.area, latestTruckNo: after.latest?.truckNo ?? null, metrics: after.latest?.metrics ?? null } };
  return { slot, next, summary };
}

export async function previewEventSlotRevision(slotId,input) {
  return transaction(async connection => {
    const { summary } = await prepare(connection,slotId,input);
    const [[{ n }]] = await connection.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cw_revision'");
    return { ...summary, previewToken: token(slotId,input), storageReady: Number(n) === 1 };
  });
}

export async function commitEventSlotRevision(slotId,input) {
  const key = requestKey(input.requestId), reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw problem(422,'请填写槽段修改原因，以便追溯参数及计算基线变化');
  if (reason.length > 500) throw problem(422,'修改原因不能超过 500 字');
  if (input.previewToken !== token(slotId,input)) throw problem(409,'修改内容与预览不一致，请重新预览');
  const payloadHash = hash({ slotId, ...payload(input), reason });
  return transaction(async connection => {
    await readSlot(connection,slotId,true);
    const [existing] = await connection.execute('SELECT * FROM cw_revision WHERE request_key=?',[key]);
    if (existing[0]) {
      if (existing[0].payload_hash !== payloadHash) throw problem(409,'同一修订标识对应不同内容');
      return { ...json(existing[0].result), replayed: true };
    }
    const { slot,next,summary } = await prepare(connection,slotId,input);
    const revisionId = randomUUID(), version = dataRevision(slot)+1;
    const { id, createdAt, recordCount, lastRecordAt, ...properties } = next;
    properties.dataRevision = version;
    const result = { ...summary, revisionId, slotId, baseRevision: version, replayed: false,origin:'manual',operation:'slot-edit' };
    await connection.execute(`INSERT INTO cw_revision
      (id,slot_id,request_key,payload_hash,kind,target_id,reason,base_revision,result,slot_before,slot_after)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [revisionId,slotId,key,payloadHash,'slot',slotId,reason,dataRevision(slot),
      JSON.stringify(result),JSON.stringify(slot),JSON.stringify({...next,dataRevision:version})]);
    await connection.execute(`UPDATE cw_slot SET slot_code=?,width_m=?,depth_m=?,thickness_m=?,tremie_count=?,joint_layout=?,properties=? WHERE id=?`,
      [properties.code,properties.width,properties.depth,properties.thickness,properties.tremieCount,properties.jointLayout,JSON.stringify(properties),slotId]);
    return result;
  });
}
