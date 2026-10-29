import 'dotenv/config';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../server/config.js';
import { legacyEvents, replayEvents } from '../shared/events.js';
import { canonicalJson } from '../server/workbench/events.js';

const apply=process.argv.includes('--apply');
const reportArg=process.argv.find(arg=>arg.startsWith('--report='));
const reportPath=reportArg?.slice('--report='.length);
if(config.db.database!=='diaphragm_wall_monitor') throw new Error('安全检查：仅允许迁移 diaphragm_wall_monitor；不会清空或修改 cw_record。');
const db=await mysql.createConnection({...config.db,user:process.env.DB_ADMIN_USER||config.db.user,password:process.env.DB_ADMIN_PASSWORD||config.db.password,multipleStatements:true,dateStrings:true,decimalNumbers:true});
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const decodeSlot=r=>({...parse(r.properties),id:r.id});
const decodeRecord=r=>({id:r.id,slotId:r.slot_id,truckNo:Number(r.truck_no),startedAt:r.started_at,endedAt:r.ended_at,volume:Number(r.volume_m3),
  measurementPoints:[1,2,3,4,5,6].map(i=>Number(r[`point_${i}`])),tremiePulls:parse(r.tremie_pulls),jointPulls:parse(r.joint_pulls),createdAt:String(r.created_at).slice(0,19)});
const rawRecordHash=rows=>createHash('sha256').update(canonicalJson(rows.map(r=>({id:r.id,slotId:r.slot_id,truckNo:Number(r.truck_no),startedAt:r.started_at,endedAt:r.ended_at,
  volume:Number(r.volume_m3),measurementPoints:[1,2,3,4,5,6].map(i=>Number(r[`point_${i}`])),tremiePulls:parse(r.tremie_pulls),jointPulls:parse(r.joint_pulls)})))).digest('hex');
const currentRows=async(connection,slotId)=>(await connection.execute(`SELECT e.* FROM cw_event e JOIN
  (SELECT slot_id,id,MAX(version) version FROM cw_event WHERE slot_id=? GROUP BY slot_id,id) c
  ON c.slot_id=e.slot_id AND c.id=e.id AND c.version=e.version WHERE e.slot_id=? ORDER BY e.occurred_at,e.id`,[slotId,slotId]))[0];
const decodeEvent=r=>({id:r.id,slotId:r.slot_id,type:r.type,occurredAt:String(r.occurred_at).slice(0,19),receivedAt:String(r.received_at).slice(0,19),
  source:r.source,deviceId:r.device_id,externalId:r.external_id,batchId:r.batch_id,legacyRecordId:r.legacy_record_id,
  version:Number(r.version),status:r.status,payload:parse(r.payload),schemaVersion:1,timezone:'Asia/Shanghai'});
const migrationKey=id=>`migration:manual-split:v2:${createHash('sha256').update(String(id)).digest('hex')}`;
try {
  await db.query("SET time_zone='+08:00'");
  const [[eventSchema]]=await db.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cw_event'");
  const eventTableReady=Number(eventSchema.n)===1;
  const [slots]=await db.query('SELECT * FROM cw_slot ORDER BY id');
  const report=[]; let totalRecords=0,totalEvents=0,totalLegacyCurrent=0; const overall=createHash('sha256'),beforeRaw=new Map();
  for(const row of slots){
    const [records]=await db.execute('SELECT * FROM cw_record WHERE slot_id=? ORDER BY ended_at,id',[row.id]);
    const events=legacyEvents(decodeSlot(row),records.map(decodeRecord)); replayEvents(decodeSlot(row),events); totalRecords+=records.length;totalEvents+=events.length;
    const recordHash=rawRecordHash(records);beforeRaw.set(row.id,recordHash);
    const hash=createHash('sha256').update(canonicalJson(events)).digest('hex');overall.update(`${row.id}:${hash}\n`);
    const current=eventTableReady?await currentRows(db,row.id):[];
    const batchCounts=new Map();for(const e of current.filter(e=>e.source==='manual'))batchCounts.set(e.batch_id,(batchCounts.get(e.batch_id)||0)+1);
    const legacyCurrent={n:current.filter(e=>e.source==='legacy').length};
    const linkedManual=current.filter(e=>e.source==='manual'&&(batchCounts.get(e.batch_id)||0)>1).length;
    totalLegacyCurrent+=Number(legacyCurrent.n);
    report.push({slotId:row.id,records:records.length,events:events.length,eventHash:hash,recordHash,
      legacyCurrentEvents:Number(legacyCurrent.n),linkedManualEvents:linkedManual,workflowVersion:Number(parse(row.properties).eventWorkflowVersion||0)});
  }
  const summary={mode:apply?'apply':'dry-run',slots:slots.length,records:totalRecords,events:totalEvents,
    legacyCurrentEventsToVersion:totalLegacyCurrent,eventHash:overall.digest('hex'),details:report};
  console.log(JSON.stringify(summary,null,2));
  if(reportPath) await fs.writeFile(reportPath,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  if(!apply){console.log('未写入。确认报告后使用 --apply；脚本把旧按车记录转换为四条人工事件，并以新版本替换现有 legacy 当前版本；cw_record 与旧事件版本保持不变。');process.exit(0);}
  const [[schema]]=await db.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cw_event','cw_event_request','cw_device_event_request','cw_event_audit')");
                                                                           
                                                                         
  if(Number(schema.n)!==4) await db.query(await fs.readFile(new URL('../database/events.sql',import.meta.url),'utf8'));
  for(const row of slots){
    await db.beginTransaction();
    try{
      const [[locked]]=await db.execute('SELECT * FROM cw_slot WHERE id=? FOR UPDATE',[row.id]); const slot=decodeSlot(locked);
      const [records]=await db.execute('SELECT * FROM cw_record WHERE slot_id=? ORDER BY ended_at,id',[row.id]);
      const events=legacyEvents(slot,records.map(decodeRecord));
      replayEvents(slot,events);
      const initialCurrent=await currentRows(db,row.id),byId=new Map(initialCurrent.map(e=>[e.id,e]));
      const [deletedRows]=await db.execute("SELECT event_id FROM cw_event_audit WHERE slot_id=? AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.status'))='void'",[row.id]);
      const deletedIds=new Set(deletedRows.map(r=>r.event_id));
      for(const desired of events){
        const current=byId.get(desired.id);
        if(current){
          if(current.slot_id!==row.id||current.type!==desired.type) throw new Error(`确定性事件 ID 冲突 ${desired.id}；未覆盖现有事件`);
          continue;                              
        }
        if(deletedIds.has(desired.id))continue;                         
        await db.execute(`INSERT INTO cw_event(id,version,slot_id,type,occurred_at,received_at,source,device_id,external_id,batch_id,legacy_record_id,status,payload)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[desired.id,1,row.id,desired.type,desired.occurredAt,desired.receivedAt,'manual',null,null,desired.batchId,desired.legacyRecordId,'active',canonicalJson(desired.payload)]);
        await db.execute(`INSERT INTO cw_event_audit
          (id,request_key,slot_id,event_id,before_version,after_version,reason,before_data,after_data) VALUES(UUID(),?,?,?,?,?,?,?,?)`,
        [migrationKey(desired.id),row.id,desired.id,null,1,'旧按车记录拆分为独立人工事件；cw_record 保持不变',null,canonicalJson(desired)]);
      }
      const beforeSplit=await currentRows(db,row.id),manualBatchCounts=new Map();
      for(const e of beforeSplit.filter(e=>e.source==='manual'))manualBatchCounts.set(e.batch_id,(manualBatchCounts.get(e.batch_id)||0)+1);
      let changed=events.some(e=>!byId.has(e.id)&&!deletedIds.has(e.id));
      for(const raw of beforeSplit){
        const needsSource=raw.source==='legacy',needsSplit=raw.source==='manual'&&(manualBatchCounts.get(raw.batch_id)||0)>1;
        if(!needsSource&&!needsSplit) continue;
        if(raw.source==='device') continue;
        const before=decodeEvent(raw),after={...before,version:before.version+1,source:'manual',deviceId:null,externalId:null,
          batchId:`event:${before.id}`,receivedAt:before.receivedAt};
        await db.execute(`INSERT INTO cw_event(id,version,slot_id,type,occurred_at,received_at,source,device_id,external_id,batch_id,legacy_record_id,status,payload)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[after.id,after.version,row.id,after.type,after.occurredAt,after.receivedAt,after.source,null,null,after.batchId,after.legacyRecordId,after.status,canonicalJson(after.payload)]);
        await db.execute(`INSERT INTO cw_event_audit
          (id,request_key,slot_id,event_id,before_version,after_version,reason,before_data,after_data) VALUES(UUID(),?,?,?,?,?,?,?,?)`,
        [migrationKey(after.id),row.id,after.id,before.version,after.version,'仅将旧来源和统一批次转换为独立人工事件；业务数据、时间与状态保持不变',canonicalJson(before),canonicalJson(after)]);
        changed=true;
      }
      const verified=await currentRows(db,row.id);replayEvents(slot,verified.map(decodeEvent));
      const nextRevision=Number(slot.dataRevision||0)+(changed||Number(slot.eventWorkflowVersion||0)<2?1:0);
      await db.execute("UPDATE cw_slot SET properties=JSON_SET(properties,'$.eventWorkflowVersion',2,'$.dataRevision',?) WHERE id=?",[nextRevision,row.id]);
      const [afterRecords]=await db.execute('SELECT * FROM cw_record WHERE slot_id=? ORDER BY ended_at,id',[row.id]);
      if(rawRecordHash(afterRecords)!==beforeRaw.get(row.id)) throw new Error(`cw_record 原始字段哈希变化，迁移已回滚 ${row.id}`);
      await db.commit();
    }catch(error){await db.rollback();throw error;}
  }
  console.log(JSON.stringify({applied:true,records:totalRecords,events:totalEvents,note:'cw_record and historical cw_event versions unchanged'},null,2));
}finally{await db.end();}
