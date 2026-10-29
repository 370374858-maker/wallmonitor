import {createHash} from 'node:crypto';
import {pool,inTransaction} from '../db.js';
import {sourceId,sourceTable,normalizeSourceRow,convertSourceValues,issue} from '../../shared/telemetry.js';
import {surfaceDecision} from '../../shared/surface-sync.js';
import {receiveDeviceEventInTransaction} from './events.js';
const liveSurface=new Map();
const json=v=>typeof v==='string'?JSON.parse(v):v;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const text=(v,re,name)=>{if(typeof v!=='string'||!re.test(v))throw issue(422,name+'无效');return v;};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function binding(db,collector,lock=false){
  const [[row]]=await db.execute('SELECT * FROM bridge_binding WHERE collector_id=?'+(lock?' FOR UPDATE':''),[collector]);
  if(!row)throw issue(404,'设备采集绑定不存在');
  return {...row,config:json(row.config)};
}
export async function receiveTelemetry(input){
  const collector=text(input?.collectorId,/^[a-zA-Z0-9_-]{1,64}$/,'collectorId');
  if(input.action==='state'){
    const b=await binding(pool,collector);
    const [cursors]=await pool.execute('SELECT * FROM bridge_cursor WHERE collector_id=?',[collector]);
    return {binding:{collectorId:collector,slotId:b.slot_id,mode:b.mode,project:b.project_no,machine:b.machine_no,config:b.config},cursors};
  }
  if(input.action==='surface')return receiveSurface(collector,input);
  if(input.action!=='batch')throw issue(422,'仅支持 state 和 batch');
  const request=text(input.requestId,uuid,'requestId'),lane=text(input.lane,/^(forward|reconcile)$/,'lane');
  const from=sourceId(input.fromId),floor=sourceId(input.floorId);
  if(!Array.isArray(input.rows)||input.rows.length>500)throw issue(422,'每批最多 500 行');
  const fingerprint=hash(input);
  return inTransaction(async db=>{
    await db.query("SET time_zone='+08:00'");
                                                                               
    const b=await binding(db,collector,true);
    if(b.mode==='paused')throw issue(409,'自动采集已暂停');
    const {stream}=sourceTable(input.table,b.project_no,b.machine_no);
    if(stream==='DA1'&&b.config.surfaceSync?.enabled===true)throw issue(409,'混凝土深度已改为按变化接入，请使用 surface 动作');
    const rows=input.rows.map(r=>normalizeSourceRow(r,stream));
    if(rows.some((r,i)=>BigInt(r.id)<=BigInt(from)||(i&&BigInt(r.id)<=BigInt(rows[i-1].id))))throw issue(422,'每批源 Id 须严格递增且晚于当前进度');
    const [[receipt]]=await db.execute('SELECT payload_hash,result FROM bridge_batch WHERE collector_id=? AND request_id=?',[collector,request]);
    if(receipt){if(receipt.payload_hash!==fingerprint)throw issue(409,'同批编号内容变化');return {...json(receipt.result),replayed:true};}
    const [[existingCursor]]=await db.execute('SELECT * FROM bridge_cursor WHERE collector_id=? AND source_table=? AND lane=? FOR UPDATE',[collector,input.table,lane]);
    if(existingCursor&&(existingCursor.last_source_id!==from||existingCursor.lower_bound_id!==floor))throw issue(409,'读取进度已变化，请重新载入');
    if(!existingCursor&&from!==floor)throw issue(409,'首次进度必须从本表起点开始');
    if(BigInt(from)<BigInt(floor))throw issue(422,'当前进度不得早于采集起点');
    let inserted=0;
                                                                                         
    for(const row of rows){
      const digest=hash(row);
      const [[old]]=await db.execute('SELECT payload_hash FROM device_sample WHERE collector_id=? AND source_table=? AND source_id=?',[collector,input.table,row.id]);
      if(old){if(old.payload_hash!==digest)throw issue(409,`原库同一行内容改变：${input.table}/${row.id}`);continue;}
      await db.execute(`INSERT INTO device_sample (binding_id,slot_id,collector_id,stream,source_table,source_id,source_timestamp,source_received_at,payload_hash,raw_values)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,[b.id,b.slot_id,collector,stream,input.table,row.id,row.timestamp,row.sourceReceivedAt,digest,JSON.stringify(row.values)]);
      inserted++;
    }
    const next=rows.length?rows.at(-1).id:(lane==='reconcile'?floor:from);
    await db.execute(`INSERT INTO bridge_cursor (collector_id,source_table,lane,lower_bound_id,last_source_id) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE last_source_id=VALUES(last_source_id),updated_at=CURRENT_TIMESTAMP(3)`,[collector,input.table,lane,floor,next]);
    const result={inserted,duplicates:rows.length-inserted,cursor:next,replayed:false};
    await db.execute('INSERT INTO bridge_batch (collector_id,request_id,payload_hash,result) VALUES (?,?,?,?)',[collector,request,fingerprint,JSON.stringify(result)]);
    return result;
  });
}
async function receiveSurface(collector,input){
  let live;
  const result=await inTransaction(async db=>{
    await db.query("SET time_zone='+08:00'");
    const b=await binding(db,collector,true);
    if(b.mode==='paused')throw issue(409,'自动采集已暂停');
    if(b.config.surfaceSync?.enabled!==true)throw issue(409,'混凝土深度自动接入尚未启用');
    const {stream}=sourceTable(input.table,b.project_no,b.machine_no);
    if(stream!=='DA1')throw issue(422,'混凝土深度必须来自 DA1');
    const row=normalizeSourceRow(input.row,'DA1');
    const [[slot]]=await db.execute('SELECT depth_m FROM cw_slot WHERE id=?',[b.slot_id]);
    const previous=b.config.surfaceState||null;
    const digest=hash(row);
    if(previous?.table===input.table&&previous.id===row.id&&previous.hash!==digest)throw issue(409,'同一源行的内容发生改变');
    const decision=surfaceDecision(row,Number(slot.depth_m),previous);
    live={sourceTable:input.table,sourceId:row.id,sourceTimestamp:row.timestamp,sourceReceivedAt:row.sourceReceivedAt,
      platformReceivedAt:new Date().toISOString(),values:row.values,seenAt:new Date().toISOString(),...decision};
    if(decision.status!=='changed')return {...decision,inserted:0,eventId:previous?.eventId??null};
    const event=await receiveDeviceEventInTransaction(db,{slotId:b.slot_id,deviceId:collector+':surface',externalId:input.table+':'+row.id,
      event:{type:'measurement',occurredAt:row.sourceReceivedAt.replace(' ','T')+'+08:00',payload:{measurementPoints:[decision.depth]}}});
    const [[old]]=await db.execute('SELECT payload_hash FROM device_sample WHERE collector_id=? AND source_table=? AND source_id=?',[collector,input.table,row.id]);
    if(old&&old.payload_hash!==digest)throw issue(409,'已存源行内容不一致');
    if(!old)await db.execute(`INSERT INTO device_sample (binding_id,slot_id,collector_id,stream,source_table,source_id,source_timestamp,source_received_at,payload_hash,raw_values)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,[b.id,b.slot_id,collector,'DA1',input.table,row.id,row.timestamp,row.sourceReceivedAt,digest,JSON.stringify(row.values)]);
    const state={depth:decision.depth,timestamp:row.timestamp,table:input.table,id:row.id,hash:digest,eventId:event.events[0].id,savedAt:new Date().toISOString(),values:row.values};
    await db.execute("UPDATE bridge_binding SET config=JSON_SET(config,'$.surfaceState',CAST(? AS JSON)) WHERE id=?",[JSON.stringify(state),b.id]);
    return {...decision,inserted:event.replayed?0:1,eventId:state.eventId,baseRevision:event.baseRevision};
  });
                                                                                   
  liveSurface.set(collector,live);
  return result;
}
export async function telemetryStatus(){
  const [bindings]=await pool.query('SELECT b.*,s.slot_code,s.depth_m,s.joint_layout FROM bridge_binding b JOIN cw_slot s ON s.id=b.slot_id ORDER BY b.created_at DESC');
  const result=[];
  for(const row of bindings){
    const config=json(row.config),latest={};
    for(const stream of ['DA1','DA2']){
      const [[sample]]=await pool.execute('SELECT * FROM device_sample WHERE collector_id=? AND stream=? ORDER BY source_received_at DESC,id DESC LIMIT 1',[row.collector_id,stream]);
      if(sample){
        const values=json(sample.raw_values);
        latest[stream]={sourceTable:sample.source_table,sourceId:sample.source_id,sourceTimestamp:sample.source_timestamp,sourceReceivedAt:sample.source_received_at,platformReceivedAt:sample.received_at,values,
          converted:convertSourceValues({values},stream,{depth:Number(row.depth_m)},config)};
      }
    }
    const surfaceEnabled=config.surfaceSync?.enabled===true,live=liveSurface.get(row.collector_id);
    if(surfaceEnabled){
      if(live)latest.DA1={...live,converted:{concreteDepth:live.depth??null,issues:live.status==='changed'||live.status==='unchanged'?[]:[live.reason],usable:live.status==='changed'||live.status==='unchanged'}};
      else delete latest.DA1;
    }
    const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM device_sample WHERE collector_id=?',[row.collector_id]);
    const [cursors]=await pool.execute('SELECT source_table,lane,last_source_id,updated_at FROM bridge_cursor WHERE collector_id=?',[row.collector_id]);
    const [[events]]=await pool.execute("SELECT COUNT(*) AS n FROM cw_device_event_request WHERE device_id=? AND slot_id=?",[row.collector_id+':surface',row.slot_id]);
    result.push({collectorId:row.collector_id,slotId:row.slot_id,slotCode:row.slot_code,mode:row.mode,config,project:row.project_no,machine:row.machine_no,total:Number(count.n),latest,cursors,
      surfaceSync:{enabled:surfaceEnabled,lastSaved:config.surfaceState??null,measurementCount:Number(events.n),live:live??null,field:'R32',unit:'m',timeBasis:'source-timestamp-for-commissioning'},
      formalModelEnabled:surfaceEnabled,note:surfaceEnabled?'混凝土深度按变化接入单测点测量；接头管仍为原始值联调':'当前为自动采集联调；原始数据自动保存，字段核对前不参与正式模型和预警'});
  }
  return {asOf:new Date().toISOString(),bindings:result};
}
