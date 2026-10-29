import {pool} from '../db.js';
import {policyFor,classify} from '../../shared/monitoring.js';
import {sidesFor} from '../../shared/construction.js';
import {observationTime} from '../../shared/joint-operation.js';

const issue=(status,message)=>Object.assign(new Error(message),{status});
async function readSlot(id){
  const [rows]=await pool.execute('SELECT id,joint_layout,properties FROM cw_slot WHERE id=?',[id]);
  if(!rows[0])throw issue(404,'槽段不存在');
  const row=rows[0],properties=typeof row.properties==='string'?JSON.parse(row.properties):row.properties;
  return {...properties,id:row.id,jointLayout:row.joint_layout};
}
                                                                              
export function createLivePressureStore({loadSlot=readSlot,now=Date.now,ttlMs=60000,capacity=4096}={}){
  const latest=new Map();
  const key=(slotId,side)=>`${slotId}:${side}`;
  const snapshot=(slot,stamp=now())=>{
    const configured=new Set(sidesFor(slot.jointLayout)),policy=policyFor(slot);
    const result={slotId:slot.id,serverTime:new Date(stamp).toISOString(),ttlSeconds:ttlMs/1000,storage:'memory-only'};
    for(const side of ['left','right']){
      const item=latest.get(key(slot.id,side));
      const age=item?Math.max(stamp-item.observedMs,stamp-item.receivedMs,0):null;
      const status=!configured.has(side)?'not-configured':!item?'waiting':age>=ttlMs?'stale':'live';
      const value=configured.has(side)&&item?item.value:null;
      result[side]={value,status,observedAt:item?.observedAt??null,receivedAt:item?.receivedAt??null,deviceId:item?.deviceId??null,ageSeconds:age===null?null:age/1000,
        ...classify(value,`pressure-${side}`,policy)};
    }
    return result;
  };
  return {
    async receive(input){
      if(typeof input?.slotId!=='string'||!input.slotId.trim()||input.slotId.length>36)throw issue(422,'slotId 无效');
      if(typeof input?.deviceId!=='string'||!input.deviceId.trim()||input.deviceId!==input.deviceId.trim()||input.deviceId.length>128)throw issue(422,'deviceId 无效');
      const observedMs=observationTime(input.observedAt),values=input.pressures;
      if(!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).length||Object.keys(values).some(side=>!['left','right'].includes(side)))throw issue(422,'pressures 只接受 left 和 right，至少提供一侧');
      for(const value of Object.values(values))if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)throw issue(422,'实时压力必须是非负数字，单位 MPa；缺失不能填 null 或字符串');
      const slot=await loadSlot(input.slotId),configured=new Set(sidesFor(slot.jointLayout));
      if(Object.keys(values).some(side=>!configured.has(side)))throw issue(422,'该槽段未配置所提交的接头管');
      const stamp=now();if(observedMs>stamp+30000)throw issue(422,'压力观测时间超过服务器时间 30 秒，请校准时钟');
                                                                                                  
      for(const [side,value]of Object.entries(values)){
        const prior=latest.get(key(slot.id,side));
        if(prior&&prior.observedMs===observedMs&&(prior.value!==value||prior.deviceId!==input.deviceId))throw issue(409,'同一侧同一观测时间对应不同实时压力或设备');
      }
      const updates=[];
      for(const [side,value]of Object.entries(values)){
        const prior=latest.get(key(slot.id,side));
        if(prior&&observedMs<=prior.observedMs)continue;
        updates.push([key(slot.id,side),{value,observedMs,observedAt:input.observedAt,receivedMs:stamp,receivedAt:new Date(stamp).toISOString(),deviceId:input.deviceId}]);
      }
      if(latest.size+updates.filter(([id])=>!latest.has(id)).length>capacity)throw issue(503,'实时压力通道已满，请联系平台维护人员');
      for(const [id,item]of updates)latest.set(id,item);
      return {updated:updates.length,storedRows:0,...snapshot(slot,stamp)};
    },
    async read(slotId){return snapshot(await loadSlot(slotId));},
    size(){return latest.size;}
  };
}
export const livePressure=createLivePressureStore();
