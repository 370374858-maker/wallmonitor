import { pool } from '../db.js';
import { dataRevision } from '../../shared/revisions.js';
import { transaction, readSlot, json, problem } from './repository.js';
import {revisionHistoryDetails} from '../../shared/slot-revision-history.js';

export async function getRevisionContext(slotId, recordId = null) {
  if (recordId) throw problem(409, '施工记录已改为独立事件，请在 05 中按类型或批次选择修改');
  const { readEventHistory } = await import('./events.js');
  const { replayEvents } = await import('../../shared/events.js');
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId);
    const { events } = await readEventHistory(connection, slot);
    const replay = replayEvents(slot, events);
    return { slot, baseRevision: dataRevision(slot), latest: replay.latest, eventCount: events.length,
      records: [], nextTruckNo: Math.max(0, ...events.filter(e => e.type === 'pouring' && e.status !== 'void').map(e => e.payload.truckNo)) + 1 };
  });
}

export async function previewRevision(slotId, input) {
  if (input.kind === 'slot') {
    const { previewEventSlotRevision } = await import('./event-slot-revisions.js');
    return previewEventSlotRevision(slotId,input);
  }
  throw problem(410, '按车覆盖修改接口已永久停用，请使用独立事件修订接口');
}

export async function commitRevision(slotId, input) {
  if (input.kind === 'slot') {
    const { commitEventSlotRevision } = await import('./event-slot-revisions.js');
    return commitEventSlotRevision(slotId,input);
  }
  throw problem(410, '按车覆盖修改接口已永久停用，请使用独立事件修订接口');
}

export async function listRevisions(slotId, offset = 0, kind = null) {
  await readSlot(pool, slotId);
  if(kind!=null&&!['slot','record'].includes(kind))throw problem(422,'修订类型无效');
  const where='slot_id=?'+(kind?' AND kind=?':''),params=kind?[slotId,kind]:[slotId];
  const [[{ n }]] = await pool.execute('SELECT COUNT(*) AS n FROM cw_revision WHERE '+where, params);
  const [rows] = await pool.query('SELECT id,kind,target_id,reason,base_revision,result,created_at,slot_before,slot_after FROM cw_revision WHERE '+where+' ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET ?', [...params,offset]);
  return { total: Number(n), offset, rows: rows.map(({slot_before,slot_after,...row}) => {
    const result=json(row.result);return {...row,result,...revisionHistoryDetails({result,reason:row.reason,slotBefore:json(slot_before),slotAfter:json(slot_after)})};
  }) };
}
export async function getRevision(slotId, revisionId) {
  return transaction(async connection => {
    const [rows] = await connection.execute('SELECT * FROM cw_revision WHERE id=? AND slot_id=?', [revisionId, slotId]);
    if (!rows[0]) throw problem(404, '修改版本不存在');
    const row = rows[0];
    const [records] = await connection.execute('SELECT record_id,before_data,after_data FROM cw_revision_record WHERE revision_id=?', [revisionId]);
    return { id: row.id, kind: row.kind, reason: row.reason, createdAt: row.created_at, result: json(row.result),...revisionHistoryDetails({result:json(row.result),reason:row.reason,slotBefore:json(row.slot_before),slotAfter:json(row.slot_after)}),
      slotBefore: json(row.slot_before), slotAfter: json(row.slot_after), records: records.map(r => ({ recordId: r.record_id, before: json(r.before_data), after: json(r.after_data) })) };
  });
}
