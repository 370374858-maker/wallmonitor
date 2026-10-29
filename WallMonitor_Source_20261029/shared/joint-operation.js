const issue = (message) => Object.assign(new Error(message), {status:422});
const text = (value,name,max=128) => {
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max)throw issue(`${name} 必须是 1～${max} 字符且不含首尾空格`);
  return value;
};
export function observationTime(value,name='observedAt') {
  if(typeof value==='string')value=value.replace(/\.000(?=Z|[+-]\d{2}:\d{2}$)/,'');
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw issue(`${name} 必须是精确到秒、带时区的 ISO 时间`);
  const parts=value.slice(0,19).split(/[-T:]/).map(Number);
  const local=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]));
  const offset=value.slice(19);
  if(parts[0]<2000||parts[0]>2100||!Number.isFinite(local.getTime())||local.toISOString().slice(0,19)!==value.slice(0,19)||!Number.isFinite(Date.parse(value))||
    (offset!=='Z'&&(Number(offset.slice(1,3))>14||Number(offset.slice(4,6))>59||(Number(offset.slice(1,3))===14&&Number(offset.slice(4,6))!==0))))throw issue(`${name} 日期、时间或时区无效`);
  return Date.parse(value);
}
export function jointOperationRequest(input) {
  const slotId=text(input?.slotId,'slotId',36),deviceId=text(input?.deviceId,'deviceId');
  const operationId=text(input?.operationId,'operationId',100);
  if(!['left','right'].includes(input?.pipeId))throw issue('pipeId 必须是 left 或 right');
  const start=observationTime(input?.startedAt,'startedAt'),end=observationTime(input?.endedAt,'endedAt');
  if(end<=start)throw issue('结束时间必须晚于开始时间');
  if(typeof input?.pullLength!=='number'||!Number.isFinite(input.pullLength)||input.pullLength===0||Math.abs(input.pullLength)>1000000)throw issue('pullLength 必须是本次非零位移，单位 m；正数上拔、负数回落');
  if(typeof input?.maxPressure!=='number'||!Number.isFinite(input.maxPressure)||input.maxPressure<0||input.maxPressure>1000000)throw issue('maxPressure 必须是本次过程的最大压力，单位 MPa，不能缺失');
  return {slotId,deviceId,externalId:`joint-operation:${operationId}`,event:{type:'joint',occurredAt:input.endedAt,payload:{
    pulls:[{pipeId:input.pipeId,mode:'delta',value:input.pullLength,pressure:input.maxPressure}],
    operation:{operationId,startedAt:input.startedAt,endedAt:input.endedAt,pressureKind:'maximum'}
  }}};
}
