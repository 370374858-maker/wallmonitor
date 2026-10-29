import {inTransaction} from '../db.js';
import {dataRevision} from '../../shared/revisions.js';
const problem=(status,message)=>Object.assign(new Error(message),{status});

                                                                          
                                                              
export async function deleteWorkbenchSlot(id,input={}) {
  if(input.confirmation!=='确认删除') throw problem(422,'请输入“确认删除”四个字');
  if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0) throw problem(422,'缺少槽段版本，请重新确认删除');
  return inTransaction(async connection=>{
    const [[row]]=await connection.execute('SELECT id,slot_code,properties FROM cw_slot WHERE id=? FOR UPDATE',[id]);
    if(!row) throw problem(404,'槽段已不存在，请刷新台账');
    const slot=typeof row.properties==='string'?JSON.parse(row.properties):row.properties;
    if(dataRevision(slot)!==input.baseRevision) throw problem(409,'确认期间槽段数据已变化，请刷新并重新确认删除');
    const [[bridgeTable]]=await connection.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bridge_binding'");
    if(Number(bridgeTable.n)){
      const [[bound]]=await connection.execute('SELECT COUNT(*) AS n FROM bridge_binding WHERE slot_id=?',[id]);
      if(Number(bound.n))throw problem(409,'该槽段关联设备采集及原始采样，请先由维护人员解除绑定并归档数据');
    }
    const counts={};
    async function remove(table,sql,params=[id]){const [result]=await connection.execute(sql,params);counts[table]=result.affectedRows;}
    await remove('cw_revision_record',`DELETE rr FROM cw_revision_record rr JOIN cw_revision r ON r.id=rr.revision_id WHERE r.slot_id=?`);
    for(const table of ['cw_revision','cw_event_audit','cw_device_event_request','cw_event_request','cw_event'])
      await remove(table,`DELETE FROM ${table} WHERE slot_id=?`);
                                                                   
    await connection.execute('UPDATE cw_record SET previous_record_id=NULL WHERE slot_id=?',[id]);
    await remove('cw_record','DELETE FROM cw_record WHERE slot_id=?');
    await remove('cw_slot','DELETE FROM cw_slot WHERE id=?');
    return {id,code:row.slot_code,deleted:true,counts};
  });
}
