import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {validateChangeConfig,initialChangeState,planSourceChange,pressureFrame,normalizeChangeRow,configurationIdentity} from '../shared/change-sync.js';
import {ChangeSyncEngine} from '../integration/change-sync-engine.mjs';
import {AtomicStateStore} from '../integration/change-sync-runtime.mjs';
const timestamp=String(Date.parse('2026-10-25T08:00:00+08:00')/1000);
const config=()=>validateChangeConfig({collectorId:'test-change-sync',slotId:'f435f47c-1473-435b-ad05-283745962c32',source:{host:'127.0.0.1',port:3307,database:'wm_source_sim_test'},project:'895',machine:'1',startDate:'2026-10-25',initialPosition:'earliest',pollMs:2000,batchSize:2,maxBatchesPerRound:4,mapping:{surface:{field:'R32',kind:'depthFromTop',scale:1},joints:[{side:'left',depthField:'R3',pullField:'R2',pressureField:'R1',lengthScale:1,pressureScale:1},{side:'right',depthField:'R18',pullField:'R17',pressureField:'R16',lengthScale:1,pressureScale:1}]},platform:{baseUrl:'https://127.0.0.1:8443',token:'qa-only',caFile:'test.pem'},stateFile:'qa-state.json'});
const slot={depth:100},empty=()=>initialChangeState(config()).comparison;
const face=(id,value,seconds=Number(id))=>({Id:String(id),ServerTimeStamp:String(Number(timestamp)+seconds),R32:value});
const pipes=(id,values={})=>({Id:String(id),ServerTimeStamp:String(Number(timestamp)+Number(id)),R3:80,R2:.2,R1:12,R18:80,R17:.15,R16:11,...values});
function fixture(c=config()){
 const tables=[{name:'DA1_895_1_20261025',stream:'DA1'},{name:'DA2_895_1_20261025',stream:'DA2'}],data=new Map(tables.map(t=>[t.name,[]]));
 let saved=null,revision=0;const records=[],receipts=new Map(),live=[];
 const store={load:async()=>structuredClone(saved),save:async value=>{saved=structuredClone(value);}};
 const source={tables:async()=>tables,latest:async name=>data.get(name).at(-1),rows:async(name,id,limit)=>data.get(name).filter(r=>BigInt(r.Id)>BigInt(id)).slice(0,limit),latestPressure:async()=>data.get(tables.filter(t=>t.stream==='DA2').at(-1).name).at(-1)};
 const api={context:async()=>({slot,baseRevision:revision,readOnly:false}),submit:async(id,body)=>{
   if(receipts.has(body.requestId))return receipts.get(body.requestId);
   if(body.baseRevision!==revision)throw Object.assign(Error('槽段事件已更新，请刷新后重试；本次没有写入'),{status:409});
   const result={events:[body.events[0]],baseRevision:++revision};records.push(body.events[0]);receipts.set(body.requestId,result);return result;
 },live:async value=>{live.push(value);return {updated:Object.keys(value.pressures).length,storedRows:0};}};
 return {c,tables,data,store,source,api,records,receipts,live,engine:()=>new ChangeSyncEngine({config:c,source,api,store}),manualChange:()=>revision++};
}
test('concrete changes return to an earlier value are saved; identical rows do not create events',()=>{
 let previous=empty();const events=[];
 for(const [id,value]of [[1,60],[2,60],[3,59.5],[4,59.5],[5,60]]){const plan=planSourceChange(config(),slot,'DA1',face(id,value),previous);previous=plan.comparison;if(plan.event)events.push(plan.event);}
 assert.deepEqual(events.map(e=>e.payload.measurementPoints),[Array(6).fill(60),Array(6).fill(59.5),Array(6).fill(60)]);
 assert.equal(events[1].occurredAt,'2026-10-25T00:00:03Z');
});
test('two equal pull lengths are separate operations when total depth changes; held pull and changing pressure are not',()=>{
 let comparison=planSourceChange(config(),slot,'DA2',pipes(1),empty()).comparison;const events=[];
 for(const row of [pipes(2,{R1:25}),pipes(3,{R3:79.8,R2:.2,R1:26}),pipes(4,{R3:79.8,R2:.2,R1:10}),pipes(5,{R3:79.6,R2:.2,R1:27})]){
   const result=planSourceChange(config(),slot,'DA2',row,comparison);comparison=result.comparison;if(result.event)events.push(result.event);
 }
 assert.deepEqual(events.map(e=>e.payload.pulls),[[{pipeId:'left',mode:'delta',value:.2,pressure:26}],[{pipeId:'left',mode:'delta',value:.2,pressure:27}]]);
 assert.equal(events[1].occurredAt,'2026-10-25T00:00:05Z');
});
test('left and right trigger independently and the row pull is used instead of deriving it from total depth',()=>{
 const previous=planSourceChange(config(),slot,'DA2',pipes(1),empty()).comparison;
 const result=planSourceChange(config(),slot,'DA2',pipes(2,{R3:79.9,R2:.2,R18:79.85,R17:.15}),previous);
 assert.deepEqual(result.event.payload.pulls.map(p=>[p.pipeId,p.value]),[['left',.2],['right',.15]]);
 assert.equal(planSourceChange(config(),slot,'DA2',pipes(3,{R3:79.9,R2:.5,R18:79.85,R17:.5}),result.comparison).event,null);
});

test('explicit negative-below-mouth mapping changes only total depths, not pull amount, pressure or source row',()=>{
 const c=config();for(const joint of c.mapping.joints)joint.depthSign=-1;
 const validated=validateChangeConfig(c),first=pipes(1,{R3:-80,R18:-75}),original=structuredClone(first);
 let comparison=planSourceChange(validated,slot,'DA2',first,empty()).comparison;
 assert.equal(comparison.joints.left.depth,80);assert.equal(comparison.joints.right.depth,75);assert.deepEqual(first,original);
 const next=pipes(2,{R3:-79.8,R18:-74.85,R2:.2,R17:.15,R1:31.655});
 const result=planSourceChange(validated,slot,'DA2',next,comparison);
 assert.deepEqual(result.event.payload.pulls,[{pipeId:'left',mode:'delta',value:.2,pressure:31.655},{pipeId:'right',mode:'delta',value:.15,pressure:11}]);
 assert.deepEqual(pressureFrame(validated,next).pressures,{left:31.655,right:11});
 assert.equal(planSourceChange(validated,slot,'DA2',next,result.comparison).event,null);
 for(const value of [80,-101,null])assert.throws(()=>planSourceChange(validated,slot,'DA2',pipes(3,{R3:value,R18:-75}),comparison));
 assert.throws(()=>planSourceChange(config(),slot,'DA2',first,empty()),/总深度超出范围/);
 assert.notEqual(configurationIdentity(validated),configurationIdentity(config()));
 for(const value of [0,2,'-1']){const bad=config();bad.mapping.joints[0].depthSign=value;assert.throws(()=>validateChangeConfig(bad),/正负方向/);}
});
test('missing and invalid data stop a row; zero and historical original timestamps remain valid',()=>{
 assert.equal(planSourceChange(config(),slot,'DA1',face(1,0),empty()).event.payload.measurementPoints[0],0);
 for(const value of [null,NaN,101,-1])assert.throws(()=>planSourceChange(config(),slot,'DA1',face(1,value),empty()));
 assert.throws(()=>normalizeChangeRow({...face(1,60),Id:30080365394037791},'DA1'),/精度/);
 assert.equal(planSourceChange(config(),slot,'DA1',face(1,60),empty()).event.occurredAt,'2026-10-25T00:00:01Z');
});
test('cursor consumes every new row across pages and repeated polls do not grow event history',async()=>{
 const f=fixture();f.data.get(f.tables[0].name).push(...[60,59.8,59.5,59.5,59].map((v,i)=>face(i+1,v)));f.data.get(f.tables[1].name).push(pipes(1),pipes(2,{R3:79.8}),pipes(3,{R3:79.6}));
 const engine=f.engine();await engine.archiveOnce();assert.equal(f.records.length,6);assert.equal(engine.state.rowsProcessed,8);
 const before=structuredClone(f.records);await engine.archiveOnce();assert.deepEqual(f.records,before);
 assert.equal(engine.state.cursors[f.tables[0].name],'5');assert.equal(engine.state.cursors[f.tables[1].name],'3');
});
test('reply lost after commit survives restart and retries the original UUID and body exactly once',async()=>{
 const f=fixture();f.data.get(f.tables[0].name).push(face(1,60));const original=f.api.submit;let lost=true,first;
 f.api.submit=async(id,body)=>{first??=structuredClone(body);const result=await original(id,body);if(lost){lost=false;throw Error('network lost after commit');}assert.deepEqual(body,first);return result;};
 const engine=f.engine();await assert.rejects(engine.archiveOnce(),/network lost/);assert.equal(f.records.length,1);
 const restarted=f.engine();await restarted.archiveOnce();assert.equal(f.records.length,1);assert.equal(restarted.state.eventsSaved,1);assert.equal(restarted.state.pending,null);assert.equal(restarted.state.cursors[f.tables[0].name],'1');
});
test('explicit manual revision conflict reloads revision without losing the source row',async()=>{
 const f=fixture();f.data.get(f.tables[0].name).push(face(1,60));const original=f.api.submit;let interfere=true;
 f.api.submit=async(id,body)=>{if(interfere){f.manualChange();interfere=false;}return original(id,body);};
 const engine=f.engine();await engine.archiveOnce();assert.equal(f.records.length,1);assert.equal(engine.state.eventsSaved,1);
});
test('a business conflict does not advance the cursor or silently discard the pending record',async()=>{
 const f=fixture();f.data.get(f.tables[0].name).push(face(1,60));f.api.submit=async()=>{throw Object.assign(Error('same-second conflict'),{status:409});};
 const engine=f.engine();await assert.rejects(engine.archiveOnce(),/same-second/);assert.equal(engine.state.cursors[f.tables[0].name],'0');assert.equal(engine.state.pending.source.id,'1');
 await assert.rejects(f.engine().archiveOnce(),/same-second/);assert.equal(f.records.length,0);
});
test('day rollover starts new table at zero but compares against the previous day',async()=>{
 const f=fixture();f.data.get(f.tables[0].name).push(face(1,60));const engine=f.engine();await engine.archiveOnce();
 const t={name:'DA1_895_1_20261026',stream:'DA1'};f.tables.push(t);f.data.set(t.name,[face(1,60,86400),face(2,59.5,86401)]);
 await engine.archiveOnce();assert.equal(f.records.length,2);assert.equal(f.records[1].payload.measurementPoints[0],59.5);assert.equal(engine.state.cursors[t.name],'2');
});
test('latest bootstrap reads the current row once; subsequent rows are all consumed',async()=>{
 const c=config();c.initialPosition='latest';const f=fixture(c);f.data.get(f.tables[0].name).push(face(1,70),face(2,65),face(3,60));
 const engine=f.engine();await engine.archiveOnce();assert.equal(f.records.length,1);assert.equal(f.records[0].payload.measurementPoints[0],60);
 f.data.get(f.tables[0].name).push(face(4,59.5),face(5,59));await engine.archiveOnce();assert.equal(f.records.length,3);
});
test('live pressure uses the newest row and original sample time without touching archival state',async()=>{
 const f=fixture();f.data.get(f.tables[1].name).push(pipes(1,{R1:2,R16:5}),pipes(2,{R1:3,R16:6}));
 const engine=f.engine();await engine.load();const before=structuredClone(engine.state);await engine.liveOnce();
 assert.deepEqual(engine.state,before);assert.equal(f.records.length,0);assert.deepEqual(f.live[0].pressures,{left:3,right:6});assert.equal(f.live[0].observedAt,'2026-10-25T00:00:02Z');
 assert.deepEqual(pressureFrame(config(),pipes(3,{R1:null,R16:0})).pressures,{right:0});
});
test('atomic progress store preserves BigInt IDs and prevents a second writer',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'wm-change-state-'));try{
  const store=new AtomicStateStore(path.join(folder,'state.json')),release=await store.lock();
  await assert.rejects(store.lock(),/已有同步程序/);const state=initialChangeState(config());state.cursors.a='30080365394037791';await store.save(state);assert.deepEqual(await store.load(),state);await release();
  const releaseAgain=await store.lock();await releaseAgain();
 }finally{await rm(folder,{recursive:true,force:true});}
});
