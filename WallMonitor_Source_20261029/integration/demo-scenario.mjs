import {calculateSlot} from '../shared/construction.js';

export function createDemoScenario({now=Date.now(),requestId,code='DEMO-1024'}={}){
  if(!code.startsWith('DEMO-')||typeof requestId!=='string')throw Error('An explicit demo code and request identity are required');
  const base=Math.floor(now/1000)*1000-35*60000;
  const zoned=stamp=>new Date(stamp+8*3600000).toISOString().slice(0,19)+'+08:00';
  const slotRequest={requestId,code,width:6,depth:100,thickness:1.8,tremieCount:2,tremieInitialDepths:[58,58],jointLayout:'both',jointDiameter:.93,jointInitialDepths:{left:100,right:100},initialConcreteHeight:45,initialObservedAt:zoned(base).slice(0,19).replace('T',' ')};
  const geometry=calculateSlot(slotRequest),requests=[];
  for(let i=1;i<=6;i++){
    const endedAt=zoned(base+i*5*60000),depth=55-i*.5;
    const measurementPoints=i<=3?Array(6).fill(depth):[-.02,.02,-.01,.01,0,0].map(v=>Number((depth+v).toFixed(2)));
    requests.push({route:'/api/v2/device-events',body:{deviceId:'demo-pouring-1024',externalId:`demo-pour-${i}`,event:{type:'pouring',occurredAt:endedAt,payload:{truckNo:i,volume:Number((geometry.area*.5*1.02).toFixed(10)),startedAt:zoned(base+(i-1)*5*60000),endedAt}}}});
    requests.push({route:'/api/v2/device-events',body:{deviceId:'demo-surface-1024',externalId:`demo-surface-${i}`,event:{type:'measurement',occurredAt:endedAt,payload:{measurementPoints}}}});
  }
  for(const [pipeId,minute,pullLength,maxPressure]of [['left',12,.15,27.2],['right',22,.2,23.4]])requests.push({route:'/api/v2/joint-operations',body:{deviceId:'demo-joint-1024',operationId:`demo-${pipeId}-001`,pipeId,startedAt:zoned(base+(minute-2)*60000),endedAt:zoned(base+minute*60000),pullLength,maxPressure}});
  const occurredAt=zoned(base+24*60000);
  requests.push({route:'/api/v2/device-events',body:{deviceId:'demo-tremie-1024',externalId:'demo-tremie-001',event:{type:'tremie',occurredAt,payload:{pulls:[{pipeId:'t1',mode:'delta',value:.25},{pipeId:'t2',mode:'delta',value:.25}]}}}});
  requests.sort((a,b)=>Date.parse(a.body.endedAt??a.body.event.occurredAt)-Date.parse(b.body.endedAt??b.body.event.occurredAt));
  return {format:1,code,createdAt:new Date(now).toISOString(),slotRequest,requests,expected:{events:15,measurements:6,pours:6,jointOperations:2,tremieEvents:1,finalDepth:52,finalHeight:48,actualSpeed:6,fillCoefficient:1.02,jointDepths:{left:99.85,right:99.8}}};
}
