import {randomUUID} from 'node:crypto';
import {planJointBaseline} from '../../shared/joint-baseline.js';
import {dataRevision} from '../../shared/revisions.js';
import {replayEvents} from '../../shared/events.js';
import {transaction,readSlot,checkDataRevision,requestKey,hash,json,problem} from './repository.js';
import {readEventHistory} from './events.js';

export async function initializeJointBaseline(slotId,input,{source='device'}={}){
  const key=requestKey(input.requestId),payload={action:input.action??'initialize',depths:input.depths??null,observedAt:input.observedAt??null,baseRevision:input.baseRevision};
  const digest=hash({slotId,kind:'joint-depth-baseline',...payload});
  return transaction(async connection=>{
    const slot=await readSlot(connection,slotId,true);
    const [old]=await connection.execute('SELECT * FROM cw_revision WHERE request_key=?',[key]);
    if(old[0]){
      if(old[0].payload_hash!==digest)throw problem(409,'同一初始化请求标识对应不同内容');
      return {...json(old[0].result),replayed:true};
    }
    checkDataRevision(slot,input.baseRevision);
    const history=await readEventHistory(connection,slot);
    if(history.migrationRequired)throw problem(503,'事件表迁移尚未完成，暂不能初始化管深');
    const plan=planJointBaseline(slot,history.events,input,{source});
    replayEvents(plan.next,history.events);
    const version=dataRevision(slot)+1,revisionId=randomUUID();
    const result={kind:'slot',slotId,revisionId,baseRevision:version,initializedDepths:plan.initializedDepths,pendingSides:plan.pendingSides,rawChanged:0,replayed:false};
    const {id,createdAt,recordCount,lastRecordAt,...properties}=plan.next;properties.dataRevision=version;
    await connection.execute(`INSERT INTO cw_revision
      (id,slot_id,request_key,payload_hash,kind,target_id,reason,base_revision,result,slot_before,slot_after)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[revisionId,slotId,key,digest,'slot',slotId,plan.reason,dataRevision(slot),JSON.stringify(result),JSON.stringify(slot),JSON.stringify({...plan.next,dataRevision:version})]);
    await connection.execute('UPDATE cw_slot SET properties=? WHERE id=?',[JSON.stringify(properties),slotId]);
    return result;
  });
}
