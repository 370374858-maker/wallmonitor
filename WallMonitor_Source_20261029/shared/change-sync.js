import {createHash} from 'node:crypto';
import {sourceId,sourceTimestamp,sourceTable} from './telemetry.js';
import {jointDepthPending} from './joint-depth-state.js';

const fail=message=>{throw new Error(message);};
const numeric=(value,label)=>typeof value==='number'&&Number.isFinite(value)?value:fail(label+'缺失或不是数字');
const bounded=(value,min,max,label)=>{numeric(value,label);if(value<min||value>max)fail(label+'超出范围');return value;};
export const CHANGE_FIELDS={DA1:['R30','R31','R32'],DA2:['R1','R2','R3','R16','R17','R18']};
export function validateChangeConfig(input){
  const c=structuredClone(input);
  if(!c||!/^[-a-zA-Z0-9_]{1,64}$/.test(c.collectorId||''))fail('collectorId 无效');
  if(!/^[0-9a-f-]{36}$/i.test(c.slotId||''))fail('slotId 无效');
  if(!c.source||c.source.host!=='127.0.0.1'||![3306,3307].includes(c.source.port)||!/^\w{1,64}$/.test(c.source.database||''))fail('源库必须是本机明确指定的数据库');
  if(!/^\d{1,10}$/.test(String(c.project))||!/^\d{1,10}$/.test(String(c.machine)))fail('项目和设备编号无效');
  sourceTable(`DA1_${c.project}_${c.machine}_${String(c.startDate).replaceAll('-','')}`,c.project,c.machine);
  if(!/^\d{4}-\d\d-\d\d$/.test(c.startDate||''))fail('startDate 无效');
  if(!['earliest','latest'].includes(c.initialPosition))fail('initialPosition 无效');
  if(c.initializeJointDepths!=null&&typeof c.initializeJointDepths!=='boolean')fail('initializeJointDepths 无效');
  if(c.jointDepthRole!=null&&c.jointDepthRole!=='change-marker')fail('jointDepthRole 无效');
  if(c.jointDepthRole==='change-marker'&&c.initializeJointDepths)fail('变化标记不能用于初始化平台管深');
  if(!Number.isSafeInteger(c.pollMs)||c.pollMs<200||c.pollMs>60000)fail('pollMs 无效');
  c.batchSize??=500;c.maxBatchesPerRound??=4;
  if(!Number.isInteger(c.batchSize)||c.batchSize<1||c.batchSize>500||!Number.isInteger(c.maxBatchesPerRound)||c.maxBatchesPerRound<1||c.maxBatchesPerRound>100)fail('批读取数量无效');
  if(!['R30','R32'].includes(c.mapping?.surface?.field)||!['depthFromTop','heightFromBottom'].includes(c.mapping.surface.kind)||!Number.isFinite(c.mapping.surface.scale)||c.mapping.surface.scale<=0)fail('混凝土面映射无效');
  if(c.mapping.slotDepth&&(c.mapping.slotDepth.field!=='R31'||!Number.isFinite(c.mapping.slotDepth.scale)||c.mapping.slotDepth.scale<=0))fail('实测槽深映射无效');
  const sides=new Set();
  if(!Array.isArray(c.mapping.joints)||!c.mapping.joints.length)fail('接头管映射缺失');
  for(const j of c.mapping.joints){
    if(!['left','right'].includes(j.side)||sides.has(j.side))fail('接头管左右映射重复或无效');sides.add(j.side);
    if(![['R3','R2','R1'],['R18','R17','R16']].some(fields=>fields.join(',')===[j.depthField,j.pullField,j.pressureField].join(',')))fail('接头管字段映射无效');
    for(const name of ['lengthScale','pressureScale'])if(!Number.isFinite(j[name])||j[name]<=0)fail('单位倍率无效');
    if(j.depthSign!=null&&![1,-1].includes(j.depthSign))fail('管深正负方向必须为 1 或 -1');
  }
  const endpoint=new URL(c.platform.baseUrl);
  if(endpoint.protocol!=='https:'||!['127.0.0.1','localhost'].includes(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)fail('平台必须使用固定的本机 HTTPS 地址');
  if(typeof c.platform.token!=='string'||!c.platform.token||!c.platform.caFile||!c.stateFile)fail('认证、证书或进度文件缺失');
  return c;
}
export function configurationIdentity(c){
  return createHash('sha256').update(JSON.stringify({collectorId:c.collectorId,slotId:c.slotId,source:{host:c.source.host,port:c.source.port,database:c.source.database},project:c.project,machine:c.machine,startDate:c.startDate,initialPosition:c.initialPosition,mapping:c.mapping,...(c.initializeJointDepths?{initializeJointDepths:true}:{}),...(c.jointDepthRole?{jointDepthRole:c.jointDepthRole}:{})})).digest('hex');
}
export function initialChangeState(c){return {format:1,identity:configurationIdentity(c),initialized:false,cursors:{},comparison:{surface:null,joints:{}},rowsProcessed:0,eventsSaved:0,pending:null};}
export function normalizeChangeRow(row,stream){
  if(typeof row.Id==='number'&&!Number.isSafeInteger(row.Id))fail('源 Id 已丢失精度');
  const id=sourceId(String(row.Id)),timestamp=sourceTimestamp(row.ServerTimeStamp==null?null:String(row.ServerTimeStamp));
  if(!timestamp.raw)fail('源时间戳缺失');
  return {id,timestamp:timestamp.raw,occurredAt:new Date(Number(timestamp.raw)*1000).toISOString().replace('.000Z','Z'),
    values:Object.fromEntries(CHANGE_FIELDS[stream].map(field=>[field,row[field]??null]))};
}
export function planSourceChange(c,slot,stream,raw,comparison){
  const row=normalizeChangeRow(raw,stream),next=structuredClone(comparison),initialDepths={};let event=null,surveyDepth=null;
  if(stream==='DA1'){
    const survey=c.mapping.slotDepth,rawDepth=survey?row.values[survey.field]:null;
    if(typeof rawDepth==='number'&&Number.isFinite(rawDepth)&&rawDepth>0){
      const depth=Number((rawDepth*survey.scale).toFixed(4));
      if(depth<.0001||depth>10000)fail('实测槽深超出平台允许范围');
      const previous=next.slotDepth?.depth??slot.slotDepthSurvey?.depth;
      if(depth!==previous)surveyDepth={depth,rawDepth:rawDepth*survey.scale};
      next.slotDepth={depth,rawDepth:rawDepth*survey.scale,timestamp:row.timestamp};
    }
    if(surveyDepth)return {row,comparison:next,event:null,initialDepths,surveyDepth};
    const m=c.mapping.surface,value=numeric(row.values[m.field],'混凝土测深')*m.scale;
    const depth=bounded(m.kind==='heightFromBottom'?slot.depth-value:value,0,slot.depth,'混凝土测深');
    if(next.surface===null||next.surface.depth!==depth)event={type:'measurement',occurredAt:row.occurredAt,payload:{measurementPoints:Array(6).fill(depth)}};
    next.surface={depth,timestamp:row.timestamp};
  }else{
    const pulls=[];
    for(const m of c.mapping.joints){
      if(c.initializeJointDepths&&jointDepthPending(slot,m.side)&&row.values[m.depthField]==null)continue;
      const markerOnly=c.jointDepthRole==='change-marker';
      const signedDepth=numeric(row.values[m.depthField],m.side+'管总深度')*m.lengthScale*(markerOnly?1:(m.depthSign??1));
      const depth=markerOnly?numeric(signedDepth,m.side+'管变化标记'):bounded(signedDepth===0?0:signedDepth,0,slot.depth,m.side+'管总深度');
      const previous=next.joints[m.side];
      if(c.initializeJointDepths&&jointDepthPending(slot,m.side)){
        if(depth>0)initialDepths[m.side]=depth;
                                                                          
        continue;
      }
                                                                                
                                                                                 
      if(previous&&previous.depth!==depth){
        const value=bounded(numeric(row.values[m.pullField],'本次拔出量')*m.lengthScale,-1000000,1000000,'本次拔出量');
        if(value!==0)pulls.push({pipeId:m.side,mode:'delta',value,pressure:bounded(numeric(row.values[m.pressureField],'记录压力')*m.pressureScale,0,1000000,'记录压力')});
      }
      next.joints[m.side]={depth,timestamp:row.timestamp};
    }
    if(pulls.length)event={type:'joint',occurredAt:row.occurredAt,payload:{pulls}};
  }
  return {row,comparison:next,event,initialDepths,surveyDepth};
}
export function pressureFrame(c,raw){
  const row=normalizeChangeRow(raw,'DA2'),pressures={};
  for(const m of c.mapping.joints){const value=row.values[m.pressureField];if(value!==null)pressures[m.side]=bounded(numeric(value,'实时压力')*m.pressureScale,0,1000000,'实时压力');}
  if(!Object.keys(pressures).length)fail('实时压力两侧均缺测');
  return {slotId:c.slotId,deviceId:c.collectorId,observedAt:row.occurredAt,pressures};
}
