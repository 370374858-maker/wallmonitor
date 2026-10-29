import { createHash, randomUUID } from 'node:crypto';
import { pool, inTransaction } from '../db.js';
import { normalizeEvent, replayEvents, legacyEvents } from '../../shared/events.js';
import { dataRevision } from '../../shared/revisions.js';
import { beijingTime } from '../../shared/monitoring.js';
import { planPouringChange } from '../../shared/pouring-order.js';
const problem = (status,message) => Object.assign(new Error(message),{status});
const transaction = work => inTransaction(async connection => { await connection.query("SET time_zone='+08:00'"); return work(connection); });
async function readSlot(connection,id,lock=false) {
  const [rows]=await connection.execute(`SELECT * FROM cw_slot WHERE id=?${lock?' FOR UPDATE':''}`,[id]);
  if(!rows[0]) throw problem(404,'槽段不存在，请刷新槽段列表');
  const properties=parseJson(rows[0].properties);
  return {...properties,id:rows[0].id,createdAt:rows[0].created_at};
}

const MAX_EVENTS = 20000;
const TYPES = new Set(['pouring', 'measurement', 'tremie', 'joint']);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};
export const canonicalJson = value => JSON.stringify(canonical(value));
const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
const receivedNowIso = () => new Date(Date.now()+8*3600000).toISOString().slice(0,19) + '+08:00';
const requiredText = (value, field, max = 128) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw problem(422, `${field} 无效`);
  return value.trim();
};
const requestId = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw problem(422, '缺少有效 requestId');
  return value.toLowerCase();
};
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const decode = row => ({ id: row.id, slotId: row.slot_id, type: row.type, occurredAt: row.occurred_at,
  source: row.source, originSource: row.source, currentVersionSource: Number(row.version)>1 ? 'manual' : row.source,
  deviceId: row.device_id, externalId: row.external_id, batchId: row.batch_id,
  legacyRecordId: row.legacy_record_id, version: Number(row.version), status: row.status,
                                                                              
                                                                              
  payload: parseJson(row.payload), receivedAt: String(row.received_at).slice(0,19), schemaVersion: 1, timezone: 'Asia/Shanghai' });
const currentSql = `SELECT e.* FROM cw_event e JOIN
 (SELECT slot_id,id,MAX(version) version FROM cw_event WHERE slot_id=? GROUP BY slot_id,id) c
 ON c.slot_id=e.slot_id AND c.id=e.id AND c.version=e.version
 WHERE e.slot_id=?`;
const readiness = error => {
  if (error.code === 'ER_NO_SUCH_TABLE') throw problem(503, '事件表尚未初始化，请先执行 scripts/migrate-events.js；旧施工记录未被修改');
  throw error;
};
const ensureRevision = (slot, value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw problem(422, '缺少有效 baseRevision');
  if (value !== dataRevision(slot)) throw problem(409, '槽段事件已更新，请刷新后重试；本次没有写入');
};
const publicSlot = slot => slot;

async function currentEvents(connection, slotId, includeVoid = true) {
  try {
    const [rows] = await connection.execute(`${currentSql}${includeVoid ? '' : " AND e.status='active'"} ORDER BY e.occurred_at,e.id`, [slotId, slotId]);
    if (rows.length > MAX_EVENTS) throw problem(422, `槽段事件超过 ${MAX_EVENTS} 条，拒绝静默截断`);
    return rows.map(decode);
  } catch (error) { return readiness(error); }
}
async function assertMigrated(connection,slot) {
  const [[row]]=await connection.execute('SELECT COUNT(*) n FROM cw_record WHERE slot_id=?',[slot.id]);
  if(Number(row.n)>0 && Number(slot.eventWorkflowVersion||0)<2) throw problem(503,'该槽段旧按车记录尚未拆分为独立人工事件，请先执行 scripts/migrate-events.js --apply');
}
async function eventTableExists(connection){
  const [[row]]=await connection.execute("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cw_event'");
  return Number(row.n)===1;
}
const decodeLegacyRecord=row=>({id:row.id,slotId:row.slot_id,truckNo:Number(row.truck_no),startedAt:row.started_at,endedAt:row.ended_at,
  volume:Number(row.volume_m3),measurementPoints:[1,2,3,4,5,6].map(i=>Number(row[`point_${i}`])),tremiePulls:parseJson(row.tremie_pulls),
  jointPulls:parseJson(row.joint_pulls),createdAt:String(row.created_at).slice(0,19)});
async function readableEvents(connection,slot,includeVoid=true){
  const [[count]]=await connection.execute('SELECT COUNT(*) n FROM cw_record WHERE slot_id=?',[slot.id]);
  const oldCount=Number(count.n),marked=Number(slot.eventWorkflowVersion||0)>=2,tableReady=await eventTableExists(connection);
  if(marked){
    if(!tableReady) throw problem(503,'事件迁移标记已生效但事件表缺失；为避免旧数据复活，未执行回退读取');
    return {events:await currentEvents(connection,slot.id,includeVoid),readOnly:false,migrationRequired:false};
  }
  if(oldCount>0){
    const [rows]=await connection.execute('SELECT * FROM cw_record WHERE slot_id=? ORDER BY ended_at,id',[slot.id]);
    const events=legacyEvents(slot,rows.map(decodeLegacyRecord));
    return {events,readOnly:true,migrationRequired:true};
  }
  if(!tableReady) return {events:[],readOnly:true,migrationRequired:true};
  return {events:await currentEvents(connection,slot.id,includeVoid),readOnly:false,migrationRequired:false};
}
export async function readEventHistory(connection, slotOrId, {replay=true}={}) {
  const slot = typeof slotOrId === 'string' ? await readSlot(connection, slotOrId) : slotOrId;
  const readable=await readableEvents(connection,slot,false);
  return { slot, events:readable.events, ...(replay?replayEvents(slot,readable.events):{}),readOnly:readable.readOnly,migrationRequired:readable.migrationRequired };
}
async function replayCurrent(connection, slot) {
  const readable=await readableEvents(connection,slot,true);
  return readable;
}
async function bump(connection, slot) {
  const revision = dataRevision(slot) + 1;
  await connection.execute("UPDATE cw_slot SET properties=JSON_SET(properties,'$.dataRevision',?) WHERE id=?", [revision, slot.id]);
  return revision;
}
async function existingRequest(connection, key, hash) {
  const [rows] = await connection.execute('SELECT payload_hash,result FROM cw_event_request WHERE request_key=?', [key]);
  if (!rows[0]) return null;
  if (rows[0].payload_hash !== hash) throw problem(409, '同一 requestId 对应不同内容');
  return { ...parseJson(rows[0].result), replayed: true };
}
async function insertEvent(connection, event) {
  await connection.execute(`INSERT INTO cw_event
    (id,version,slot_id,type,occurred_at,received_at,source,device_id,external_id,batch_id,legacy_record_id,status,payload)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [event.id,event.version,event.slotId,event.type,event.occurredAt,event.receivedAt,event.source,
    event.deviceId,event.externalId,event.batchId,event.legacyRecordId,event.status,canonicalJson(event.payload)]);
}
function orderedMutation(old,candidate,options){
  const plan=planPouringChange(old,candidate,options),byId=new Map(old.map(e=>[e.id,e]));
  const changes=[];
  const events=plan.events.map(event=>{
    const before=byId.get(event.id);
    if(event.id===candidate.id){changes.push({before,after:event,automatic:false});return event;}
    if(before&&event.type==='pouring'&&event.payload.truckNo!==before.payload.truckNo){
      const after={...event,version:before.version+1};
      changes.push({before,after,automatic:true});return after;
    }
    return event;
  });
  return {...plan,events,changes};
}
async function writeEventChanges(connection,key,slotId,changes,reason=null){
  for(const {before,after,automatic} of changes){
    await insertEvent(connection,after);
    const note=automatic?`浇筑时间顺序调整：车号 ${before.payload.truckNo} → ${after.payload.truckNo}；原始时段和方量不变`:reason;
    await connection.execute(`INSERT INTO cw_event_audit
      (id,request_key,slot_id,event_id,before_version,after_version,reason,before_data,after_data) VALUES(?,?,?,?,?,?,?,?,?)`,
      [randomUUID(),key,slotId,after.id,before?.version??null,after.version,note,before?canonicalJson(before):null,canonicalJson(after)]);
  }
}
function normalize(slot, input, fixed) {
                                                                               
                                                                                
                                            
  const trusted = {...fixed}, canonicalInput=trusted.canonicalInput===true, beijingInput=trusted.beijingInput===true;
  delete trusted.canonicalInput; delete trusted.beijingInput;
  if(trusted.source==='device' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(trusted.receivedAt||'')) trusted.receivedAt=trusted.receivedAt.replace(' ','T')+'+08:00';
  let occurredAt=input?.occurredAt;
  if((canonicalInput||beijingInput) && trusted.source==='device' && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(occurredAt||'')) occurredAt=occurredAt.replace(' ','T')+'+08:00';
  let payload=input?.payload;
  if(!canonicalInput&&input?.type==='joint'&&Array.isArray(payload?.pulls)&&payload.pulls.some(p=>!Object.hasOwn(p||{},'pressure')))throw problem(422,'每次接头管拔管必须同时填写液压压力（MPa）');
  if((canonicalInput||beijingInput) && trusted.source==='device' && input?.type==='pouring' && payload) {
    payload={...payload};
    for(const key of ['startedAt','endedAt']) if(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(payload[key]||'')) payload[key]=payload[key].replace(' ','T')+'+08:00';
  }
  const event = normalizeEvent(slot, { type: input?.type, occurredAt, payload, ...trusted });
  return { ...event, payload: canonical(event.payload) };
}

export async function listEvents(slotId, query = {}) {
  const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
  if (query.type && !TYPES.has(query.type)) throw problem(422, '事件类型无效');
  try {
    const slot=await readSlot(pool, slotId),readable=await readableEvents(pool,slot,true);
    if(readable.readOnly){
      const filtered=readable.events.filter(e=>!query.type||e.type===query.type).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||b.id.localeCompare(a.id));
      return {rows:filtered.slice(offset,offset+limit),total:filtered.length,limit,offset,readOnly:true,migrationRequired:true};
    }
    const params = [slotId, slotId], filter = query.type ? ' AND e.type=?' : '';
    if (query.type) params.push(query.type);
    const [[count]] = await pool.execute(`SELECT COUNT(*) n FROM (${currentSql}${filter}) x`, params);
    const [rows] = await pool.query(`${currentSql}${filter} ORDER BY e.occurred_at DESC,e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { rows: rows.map(decode), total: Number(count.n), limit, offset,readOnly:false,migrationRequired:false };
  } catch (error) { return readiness(error); }
}
export async function getEventState(slotId) {
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId); const { events,readOnly,migrationRequired } = await replayCurrent(connection, slot);
                                                                            
                                                                             
    const {full,current}=buildEventStateReplay(slot,events);
    const truckNos = events.filter(e => e.status==='active'&&e.type === 'pouring').map(e => Number(e.payload.truckNo)).filter(Number.isFinite);
    return { slot: publicSlot(slot), events, latest: current.latest ?? null,
      snapshots:full.snapshots,nextTruckNo: truckNos.length ? Math.max(...truckNos) + 1 : 1, baseRevision: dataRevision(slot),readOnly,migrationRequired };
  });
}

export function buildEventStateReplay(slot,events,nowMs=Date.now()){
  const full=replayEvents(slot,events);
  const asOf=beijingTime(nowMs);
                                                                         
                                                               
  return {full,current:full.snapshots.some(s=>(s.occurredAt??s.endedAt)>asOf)?replayEvents(slot,events,{asOf}):full};
}

export function planBatchIds(inputBatchId,events){
  if(inputBatchId!=null) throw problem(422,'已取消统一批次录入，batchId 不再接受；请分别提交单条事件');
  if(!Array.isArray(events)||events.length!==1) throw problem(422,'独立录入每次必须且只能提交一条事件');
  return events.map(()=>randomUUID());
}
export async function previewEvents(slotId, input) {
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId); const readable=await readableEvents(connection,slot,false),existing=readable.events;
    if (!Array.isArray(input.events) || input.events.length !== 1) throw problem(422, '独立预览每次必须且只能包含一条事件');
    const replace = new Set(input.replaceIds || []);
    if (replace.size !== (input.replaceIds || []).length || [...replace].some(id => !existing.some(e => e.id === id))) throw problem(422, 'replaceIds 含无效或重复事件');
    if (replace.size && replace.size !== input.events.length) throw problem(422, 'replaceIds 必须与替换事件逐项对应');
    const replaceIds = input.replaceIds || [];
    const additions = input.events.map((e, i) => {
      const before = replaceIds[i] ? existing.find(row => row.id === replaceIds[i]) : null;
      const fixed = before ? { canonicalInput:true,id:before.id,slotId,version:before.version+1,status:'active',source:before.source,
        deviceId:before.deviceId,externalId:before.externalId,legacyRecordId:before.legacyRecordId,batchId:before.batchId,
        receivedAt:before.receivedAt } : { id:`preview:${i}`,slotId,version:1,status:'active',source:'manual',deviceId:null,
        externalId:null,legacyRecordId:null,receivedAt:e.occurredAt,batchId:'preview' };
      return normalize(slot,e,fixed);
    });
    const plan=planPouringChange(existing,additions[0],{preview:true});
    const replay = replayEvents(slot, plan.events);
    const additionIds = new Set(additions.map(event => event.id));
    const previewSnapshot = replay.snapshots.filter(snapshot => snapshot.eventIds.some(id => additionIds.has(id))).at(-1) ?? null;
    return { latest: replay.latest ?? null, previewSnapshot, snapshots: replay.snapshots, insertion:plan.insertion,renumbered:plan.renumbered,issues: replay.issues || [],readOnly:true,migrationRequired:readable.migrationRequired };
  });
}
async function appendEvent(connection,slot,input,{key,source,deviceId=null,externalId=null,batchId=null,allowInsertion=false,beijingInput=false}) {
  const event=normalize(slot,input,{id:randomUUID(),slotId:slot.id,version:1,status:'active',source,deviceId,externalId,
    legacyRecordId:null,batchId,receivedAt:receivedNowIso(),beijingInput});
  const old=await currentEvents(connection,slot.id,false);
  const plan=orderedMutation(old,event,{confirmed:allowInsertion});
  const replay=replayEvents(slot,plan.events);
  await writeEventChanges(connection,key,slot.id,plan.changes,plan.insertion?'确认插入历史浇筑数据':null);
  const baseRevision=await bump(connection,slot);
  return {events:plan.changes.filter(c=>!c.automatic).map(c=>c.after),renumbered:plan.renumbered,insertion:plan.insertion,
    latest:replay.latest??null,baseRevision,replayed:false};
}
                                                                              
                                                                               
                                                                                 
export async function createEvents(slotId, input, {source='manual'}={}) {
  if(!['manual','device'].includes(source))throw problem(422,'事件来源无效');
  const key = requestId(input.requestId), hash = digest({ slotId, baseRevision: input.baseRevision, events: input.events, batchId: input.batchId,...(input.allowInsertion===true?{allowInsertion:true}:{}),...(source==='device'?{source}:{}) });
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId, true); await assertMigrated(connection,slot); const duplicate = await existingRequest(connection, key, hash);
    if (duplicate) return duplicate;
    ensureRevision(slot, input.baseRevision);
    if (!Array.isArray(input.events) || input.events.length !== 1) throw problem(422, '独立录入每次必须且只能提交一条事件');
    for(const e of input.events) if(!e||(e.source!=null&&e.source!=='manual')||e.deviceId!=null||e.externalId!=null||e.legacyRecordId!=null||e.version!=null||e.status!=null) {
      throw problem(422,'新增事件不得注入设备、旧数据、版本或状态元数据；来源由登录凭据确定');
    }
    const batchIds=planBatchIds(input.batchId,input.events);
    const result=await appendEvent(connection,slot,input.events[0],{key,source,batchId:batchIds[0],
      deviceId:source==='device'?'external-api':null,externalId:source==='device'?key:null,
      allowInsertion:input.allowInsertion===true,beijingInput:true});
    await connection.execute('INSERT INTO cw_event_request(request_key,slot_id,operation,payload_hash,result) VALUES(?,?,?,?,?)', [key,slotId,'create',hash,canonicalJson(result)]);
    return result;
  });
}
export async function reviseEvents(slotId, input) {
  const key = requestId(input.requestId), hash = digest({ slotId, baseRevision: input.baseRevision, reason: input.reason, changes: input.changes,...(input.allowInsertion===true?{allowInsertion:true}:{}) });
  return transaction(async connection => {
    const slot = await readSlot(connection, slotId, true); await assertMigrated(connection,slot); const duplicate = await existingRequest(connection, key, hash);
    if (duplicate) return duplicate;
    ensureRevision(slot, input.baseRevision);
    const reason = requiredText(input.reason, 'reason', 500);
    if (!Array.isArray(input.changes) || input.changes.length !== 1) throw problem(422, '独立修订每次必须且只能修改一条事件');
    const all = await currentEvents(connection, slotId), byId = new Map(all.map(e => [e.id, e])), seen = new Set(), changed = [];
    for (const change of input.changes) {
      if (!change || seen.has(change.id)) throw problem(422, '同一事件不能在一次请求中重复修改');
      seen.add(change.id); const before = byId.get(change.id);
      if (!before) throw problem(404, '待修改事件不存在');
      if (before.version !== change.version) throw problem(409, `事件 ${change.id} 已有新版本`);
      if ((change.void === true) === Boolean(change.event)) throw problem(422, '每项修改必须且只能指定 event 或 void');
      if(change.event && change.event.type !== before.type) throw problem(422,'修订不得改变事件类型；请作废后按正确类型新增');
      const fixed = { canonicalInput:true,id: before.id, slotId, version: before.version + 1, status: change.void ? 'void' : 'active', source: before.source,
        deviceId: before.deviceId, externalId: before.externalId, legacyRecordId: before.legacyRecordId, batchId: before.batchId,
        receivedAt: receivedNowIso() };
      const after = change.void ? { ...before, ...fixed } : normalize(slot, change.event, fixed);
      changed.push({ before, after }); byId.set(after.id, after);
    }
    const plan=orderedMutation(all,changed[0].after,{confirmed:input.allowInsertion===true});
    const replay = replayEvents(slot, plan.events.filter(e=>e.status==='active'));
    await writeEventChanges(connection,key,slotId,plan.changes,reason);
                                                                              
                                                                                   
    const deletedEventIds=plan.changes.filter(c=>c.after.status==='void').map(c=>c.after.id);
    for(const id of deletedEventIds)await connection.execute('DELETE FROM cw_event WHERE slot_id=? AND id=?',[slotId,id]);
    const baseRevision = await bump(connection, slot), result = { events: plan.changes.filter(c=>!c.automatic).map(c=>c.after),deletedEventIds,renumbered:plan.renumbered,latest: replay.latest ?? null, baseRevision, replayed: false };
    await connection.execute('INSERT INTO cw_event_request(request_key,slot_id,operation,payload_hash,result) VALUES(?,?,?,?,?)', [key,slotId,'revise',hash,canonicalJson(result)]);
    return result;
  });
}
export async function receiveDeviceEvent(input) {
  return transaction(connection => receiveDeviceEventInTransaction(connection,input));
}
                                                                                   
export async function receiveDeviceEventInTransaction(connection,input) {
  const slotId = requiredText(input.slotId, 'slotId', 36), deviceId = requiredText(input.deviceId, 'deviceId'), externalId = requiredText(input.externalId, 'externalId');
  const hash = digest({ slotId, deviceId, externalId, event: input.event });
    const slot = await readSlot(connection, slotId, true); await assertMigrated(connection,slot);
    const [duplicate] = await connection.execute('SELECT payload_hash,result FROM cw_device_event_request WHERE device_id=? AND external_id=?', [deviceId,externalId]);
    if (duplicate[0]) {
      if (duplicate[0].payload_hash !== hash) throw problem(409, '同一设备 externalId 对应不同数据');
      return { ...parseJson(duplicate[0].result), replayed: true };
    }
    const batchId=`device:${digest({deviceId,externalId}).slice(0,48)}`;
    const result=await appendEvent(connection,slot,input.event,{key:batchId,source:'device',deviceId,externalId,batchId});
    const event=result.events[0];
    await connection.execute(`INSERT INTO cw_device_event_request
      (device_id,external_id,slot_id,payload_hash,event_id,event_version,result,received_at) VALUES(?,?,?,?,?,?,?,?)`,
    [deviceId,externalId,slotId,hash,event.id,event.version,canonicalJson(result),event.receivedAt]);
    return result;
}
export async function getEvent(slotId,eventId) {
  return transaction(async connection => {
    const slot = await readSlot(connection,slotId),readable=await readableEvents(connection,slot,true);
    const events=readable.events,event = events.find(e => e.id === eventId); if (!event) throw problem(404,'事件不存在');
    const replay=replayEvents(slot,events),snapshots=replay.snapshots;
    const snapshot = snapshots.find(s => s.eventIds?.includes(eventId)) ?? null;
    if(readable.readOnly) return {event,snapshot,versions:[event],audit:[],readOnly:true,migrationRequired:true};
    const [versionRows]=await connection.execute('SELECT * FROM cw_event WHERE slot_id=? AND id=? ORDER BY version',[slotId,eventId]);
    const [auditRows]=await connection.execute('SELECT * FROM cw_event_audit WHERE slot_id=? AND event_id=? ORDER BY created_at,id',[slotId,eventId]);
    const audit=auditRows.map(row=>({id:row.id,requestId:row.request_key,beforeVersion:row.before_version==null?null:Number(row.before_version),
      afterVersion:Number(row.after_version),reason:row.reason,before:row.before_data?parseJson(row.before_data):null,after:parseJson(row.after_data),createdAt:row.created_at}));
    return { event, snapshot, versions:versionRows.map(decode), audit,readOnly:false,migrationRequired:false };
  });
}
