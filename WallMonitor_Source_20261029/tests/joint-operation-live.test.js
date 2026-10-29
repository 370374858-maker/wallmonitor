import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSlot} from '../shared/construction.js';
import {jointOperationRequest} from '../shared/joint-operation.js';
import {normalizeEvent,replayEvents} from '../shared/events.js';
import {createLivePressureStore} from '../server/workbench/live-pressure.js';
import {livePressureDisplay,createLivePressureController,livePressureStatusHtml} from '../web/monitor/live-pressure.js';
import {latestDataTime} from '../web/monitor/data-status.js';

const slot={...calculateSlot({code:'QA',width:6,depth:100,thickness:1.8,tremieCount:2,jointLayout:'both',jointDiameter:.93,initialConcreteHeight:0,initialObservedAt:'2026-10-24 08:00:00',tremieInitialDepths:[100,100],jointInitialDepths:{left:100,right:100}}),id:'qa-slot'};
const operation={slotId:'qa-slot',deviceId:'machine-1',operationId:'operation-1',pipeId:'left',startedAt:'2026-10-24T09:00:00+08:00',endedAt:'2026-10-24T09:03:00+08:00',pullLength:.15,maxPressure:25};
test('one completed pull retains its interval, centimetre-scale length and process maximum',()=>{
  const request=jointOperationRequest(operation),event=normalizeEvent(slot,{...request.event,source:'device',deviceId:request.deviceId,externalId:request.externalId});
  assert.equal(request.externalId,'joint-operation:operation-1');
  assert.deepEqual(event.payload.operation,{operationId:'operation-1',startedAt:'2026-10-24 09:00:00',endedAt:'2026-10-24 09:03:00',pressureKind:'maximum'});
  const replay=replayEvents(slot,[event]);
  assert.equal(replay.latest.metrics.jointDepths.left,99.85);assert.equal(replay.latest.metrics.jointDepths.right,100);
  assert.equal(replay.latest.metrics.jointPressures.left,25);
});
test('completed-pull contract rejects missing maximum, cumulative ambiguity, bad intervals and zero travel',()=>{
  for(const patch of [{maxPressure:undefined},{maxPressure:null},{maxPressure:'25'},{maxPressure:-1},{pullLength:0},{pullLength:'0.15'},{pipeId:'1'},{endedAt:operation.startedAt},{startedAt:'2026-02-30T08:00:00+08:00'},{startedAt:'2026-10-24 09:00:00'}])assert.throws(()=>jointOperationRequest({...operation,...patch}));
  const request=jointOperationRequest({...operation,pullLength:101}),event=normalizeEvent(slot,{...request.event,source:'device',deviceId:request.deviceId,externalId:request.externalId});assert.throws(()=>replayEvents(slot,[event]),/剩余管底/);
});
test('completed pull cannot silently clamp an impossible remaining depth or precede baseline',()=>{
  const first=jointOperationRequest({...operation,pullLength:99}),second=jointOperationRequest({...operation,operationId:'operation-2',startedAt:'2026-10-24T09:04:00+08:00',endedAt:'2026-10-24T09:05:00+08:00',pullLength:2});
  const normalize=request=>normalizeEvent(slot,{...request.event,source:'device',deviceId:request.deviceId,externalId:request.externalId});
  assert.throws(()=>replayEvents(slot,[normalize(first),normalize(second)]),/剩余管底/);
  assert.throws(()=>normalize(jointOperationRequest({...operation,startedAt:'2026-10-24T07:59:59+08:00'})));
});
test('hundreds of real-time samples occupy only two latest entries and never change saved operations',async()=>{
  let now=Date.parse('2026-10-24T01:00:00Z'),loads=0;
  const cache=createLivePressureStore({now:()=>now,loadSlot:async()=>{loads++;return slot;}});
  for(let i=0;i<300;i++){await cache.receive({slotId:slot.id,deviceId:'machine-1',observedAt:new Date(now).toISOString().replace('.000Z','Z'),pressures:{left:i%29,right:10}});now+=2000;}
  assert.equal(cache.size(),2);assert.equal(loads,300);
  let read=await cache.read(slot.id);assert.equal(read.storage,'memory-only');assert.equal(read.left.value,299%29);
  now+=60000;read=await cache.read(slot.id);assert.equal(read.left.value,299%29);assert.equal(read.left.status,'stale');
  assert.equal((await createLivePressureStore({loadSlot:async()=>slot}).read(slot.id)).left.value,null,'restart cannot resurrect a saved maximum');
});
test('live channel treats zero as real, preserves the unreported side and rejects partial corrupt frames',async()=>{
  let now=Date.parse('2026-10-24T01:00:00Z');const cache=createLivePressureStore({now:()=>now,loadSlot:async()=>slot});
  const make=(pressures,time=now)=>({slotId:slot.id,deviceId:'machine-1',observedAt:new Date(time).toISOString().replace('.000Z','Z'),pressures});
  await cache.receive(make({left:0,right:27}));let read=await cache.read(slot.id);assert.equal(read.left.value,0);assert.equal(read.right.key,'danger');
  now+=2000;await cache.receive(make({left:12}));assert.equal((await cache.read(slot.id)).right.value,27);
  assert.equal((await cache.receive(make({left:0},now-2000))).updated,0);
  await assert.rejects(cache.receive(make({left:13,right:10})),e=>e.status===409);
  assert.equal((await cache.read(slot.id)).right.value,27);
  for(const pressures of [{left:null},{left:'2'},{left:-1},{left:12,other:2}])await assert.rejects(cache.receive(make(pressures)),e=>e.status===422);
  await assert.rejects(cache.receive(make({left:12},now+31000)),e=>e.status===422);
});
test('dashboard retains latest pressure through stale, paused and disconnected states with a pending-update label',()=>{
  const snapshot={ttlSeconds:10,left:{value:27,status:'live',key:'danger',label:'预警',ageSeconds:1},right:{value:0,status:'live',key:'ok',label:'正常',ageSeconds:0}};
  assert.equal(livePressureDisplay(snapshot).left.value,27);assert.equal(livePressureDisplay(snapshot).right.value,0);
  const stale=livePressureDisplay(snapshot,{elapsedMs:9000});
  assert.equal(stale.left.value,27);assert.equal(stale.left.label,'预警 · 待更新');assert.equal(stale.left.key,'danger');
  assert.match(livePressureDisplay(snapshot,{mode:'paused'}).left.label,/待更新/);
  assert.equal(livePressureDisplay(snapshot,{mode:'offline'}).left.value,27);
  assert.equal(livePressureDisplay(snapshot,{mode:'offline'}).right.value,0);
  assert.match(livePressureStatusHtml(stale),/预警 · 待更新/);
  assert.doesNotMatch(livePressureStatusHtml(stale),/数据过期/);
  assert.equal(livePressureDisplay(snapshot,{jointLayout:'left'}).right.label,'未配置');
  assert.equal(livePressureDisplay(snapshot,{jointLayout:'left'}).right.value,null);
});

test('default pressure timeout is one minute on server and browser, including the exact boundary',async()=>{
  const start=Date.parse('2026-10-26T03:00:00Z');let now=start;
  const cache=createLivePressureStore({loadSlot:async()=>slot,now:()=>now});
  await cache.receive({slotId:slot.id,deviceId:'machine-1',observedAt:'2026-10-26T03:00:00Z',pressures:{left:0,right:27}});
  for(const age of [10000,59999]){
    now=start+age;const snapshot=await cache.read(slot.id);assert.equal(snapshot.ttlSeconds,60);assert.equal(snapshot.left.status,'live');
    assert.doesNotMatch(livePressureDisplay(snapshot).left.label,/待更新/);
  }
  now=start+60000;const expired=await cache.read(slot.id);assert.equal(expired.left.status,'stale');assert.equal(expired.left.value,0);
  assert.match(livePressureDisplay(expired).left.label,/待更新/);assert.equal(livePressureDisplay(expired).right.value,27);
  const fallback={left:{value:0,status:'live',key:'ok',label:'正常',ageSeconds:50}};
  assert.doesNotMatch(livePressureDisplay(fallback,{elapsedMs:9999}).left.label,/待更新/);
  assert.match(livePressureDisplay(fallback,{elapsedMs:10000}).left.label,/待更新/);
  now=start+61000;const fresh=await cache.receive({slotId:slot.id,deviceId:'machine-1',observedAt:'2026-10-26T03:01:01Z',pressures:{left:12}});
  assert.equal(fresh.left.status,'live');assert.doesNotMatch(livePressureDisplay(fresh).left.label,/待更新/);
});
test('live polling cannot reuse an old slot response and does not run while paused',async()=>{
  let now=0,ctx={slotId:'A',active:true,jointLayout:'both',paused:false,policyRevision:0};const waiters=[],views=[];
  const controller=createLivePressureController({now:()=>now,getContext:()=>ctx,fetchSnapshot:(id,signal)=>new Promise(resolve=>waiters.push({id,signal,resolve})),onChange:v=>views.push(v)});
  const a=controller.tick();assert.equal(waiters[0].id,'A');
  ctx={...ctx,slotId:'B'};const b=controller.tick();assert.equal(waiters[0].signal.aborted,true);
  waiters[0].resolve({slotId:'A',left:{value:99,status:'live',ageSeconds:0},ttlSeconds:10});await a;assert.equal(controller.view().left.value,null);
  waiters[1].resolve({slotId:'B',left:{value:12,status:'live',ageSeconds:0,key:'ok',label:'正常'},ttlSeconds:10});await b;assert.equal(controller.view().left.value,12);
  ctx={...ctx,paused:true};await controller.tick();assert.equal(waiters.length,2);assert.equal(controller.view().left.value,12);assert.match(controller.view().left.label,/待更新/);
  controller.dispose();
});

test('an old latest source sample remains visible after restart, and repeat polls cannot make it fresh',async()=>{
  let now=Date.parse('2026-10-26T02:00:00Z');const cache=createLivePressureStore({now:()=>now,loadSlot:async()=>slot});
  const observedAt='2026-10-26T01:00:00Z',frame={slotId:slot.id,deviceId:'machine-1',observedAt,pressures:{left:0,right:27}};
  const first=await cache.receive(frame);assert.equal(first.updated,2);assert.equal(first.left.value,0);assert.equal(first.right.status,'stale');
  now+=2*86400000;const repeated=await cache.receive(frame);assert.equal(repeated.updated,0);assert.equal(repeated.left.receivedAt,first.left.receivedAt);
  assert.equal(repeated.right.value,27);assert.match(livePressureDisplay(repeated).right.label,/待更新/);assert.equal(cache.size(),2);
});

test('latest-data time includes pressure and all event streams, preserves seconds and normalizes Beijing time',()=>{
  const data={latest:{endedAt:'2026-10-26 09:45:10'},streamTimes:{measurement:'2026-10-26 09:46:12',joint:'2026-10-26 09:47:13'}};
  assert.equal(latestDataTime(data),'2026-10-26 09:47:13');
  assert.equal(latestDataTime(data,{left:{sourceAt:'2026-10-26T01:50:27Z'},right:{sourceAt:'2026-10-26T09:49:00+08:00'}}),'2026-10-26 09:50:27');
  assert.equal(latestDataTime(null,{left:{sourceAt:'2026-10-26T01:50:27Z'}}),null);
  assert.equal(latestDataTime({}),null);
});

test('poll failures and navigation retain this slot reading, recovery replaces it, and a different slot starts empty',async()=>{
  let now=0,failed=false,value=12,ctx={slotId:'A',active:true,jointLayout:'both',paused:false,policyRevision:0};
  const controller=createLivePressureController({now:()=>now,getContext:()=>ctx,onChange:()=>{},fetchSnapshot:async id=>{
    if(failed)throw Error('network');return {slotId:id,ttlSeconds:10,left:{value,status:'live',key:'ok',label:'正常',ageSeconds:0}};
  }});
  await controller.tick();failed=true;now=2000;await controller.tick();assert.equal(controller.view().left.value,12);assert.match(controller.view().left.label,/待更新/);
  ctx={...ctx,active:false};await controller.tick();ctx={...ctx,active:true,policyRevision:1};failed=false;now=4000;value=15;
  await controller.tick();assert.equal(controller.view().left.value,15);assert.equal(controller.view().left.label,'正常');
  ctx={...ctx,slotId:'B'};failed=true;await controller.tick();assert.equal(controller.view().left.value,null);
  controller.dispose();
});
