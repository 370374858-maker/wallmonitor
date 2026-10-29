import {randomUUID} from 'node:crypto';
import {planSlotSurvey} from '../../shared/slot-survey.js';
import {dataRevision} from '../../shared/revisions.js';
import {transaction,readSlot,checkDataRevision,requestKey,hash,json,problem} from './repository.js';
import {readEventHistory} from './events.js';

export async function applySlotSurvey(slotId,input){
 const key=requestKey(input.requestId),digest=hash({slotId,kind:'slot-depth-survey',baseRevision:input.baseRevision,depth:input.depth,rawDepth:input.rawDepth??null,observedAt:input.observedAt,sourceRow:input.sourceRow??null});
 return transaction(async connection=>{
  const slot=await readSlot(connection,slotId,true);
  const [old]=await connection.execute('SELECT * FROM cw_revision WHERE request_key=?',[key]);
  if(old[0]){if(old[0].payload_hash!==digest)throw problem(409,'同一实测槽深请求标识对应不同内容');return {...json(old[0].result),replayed:true};}
  const [receipts]=await connection.execute('SELECT payload_hash,result FROM cw_event_request WHERE request_key=?',[key]);
  if(receipts[0]){if(receipts[0].payload_hash!==digest)throw problem(409,'同一实测槽深请求标识对应不同内容');return {...json(receipts[0].result),replayed:true};}
  checkDataRevision(slot,input.baseRevision);
  const history=await readEventHistory(connection,slot);if(history.migrationRequired)throw problem(503,'事件表迁移尚未完成，暂不能更新实测槽深');
  const plan=planSlotSurvey(slot,history.events,input);
  if(!plan.changed){
   if(plan.stateChanged)await connection.execute("UPDATE cw_slot SET properties=JSON_SET(properties,'$.slotDepthSurvey',CAST(? AS JSON)) WHERE id=?",[JSON.stringify(plan.next.slotDepthSurvey),slotId]);
   const result={slotId,depth:slot.depth,observedDepth:input.depth,changed:false,baseRevision:dataRevision(slot),replayed:false,skippedReason:plan.skippedReason??'geometry-unchanged'};
   await connection.execute('INSERT INTO cw_event_request(request_key,slot_id,operation,payload_hash,result) VALUES(?,?,?,?,?)',[key,slotId,'survey-depth',digest,JSON.stringify(result)]);
   return result;
  }
  const version=dataRevision(slot)+1,revisionId=randomUUID(),result={slotId,revisionId,depth:plan.next.depth,observedDepth:input.depth,changed:true,baseRevision:version,rawChanged:0,replayed:false,origin:'device',operation:'slot-depth-survey',observedAt:plan.next.slotDepthSurvey.observedAt,sourceRow:input.sourceRow??null};
  const {id,createdAt,recordCount,lastRecordAt,...properties}=plan.next;properties.dataRevision=version;
  await connection.execute(`INSERT INTO cw_revision
   (id,slot_id,request_key,payload_hash,kind,target_id,reason,base_revision,result,slot_before,slot_after)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[revisionId,slotId,key,digest,'slot',slotId,plan.reason,dataRevision(slot),JSON.stringify(result),JSON.stringify(slot),JSON.stringify({...plan.next,dataRevision:version})]);
  await connection.execute('UPDATE cw_slot SET depth_m=?,properties=? WHERE id=?',[plan.next.depth,JSON.stringify(properties),slotId]);
  return result;
 });
}
