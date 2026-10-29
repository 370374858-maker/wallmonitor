import test from 'node:test';import assert from 'node:assert/strict';
import {calculateSlot} from '../shared/construction.js';
import {planJointBaseline} from '../shared/joint-baseline.js';
import {initialJointDepth} from '../shared/joint-depth-state.js';
import {replayEvents} from '../shared/events.js';
import {sceneSpec} from '../web/models/model-spec.js';
import {sceneGeometryKey} from '../web/models/scene-update.js';
import {validateChangeConfig,initialChangeState,planSourceChange,configurationIdentity} from '../shared/change-sync.js';
import {ChangeSyncEngine} from '../integration/change-sync-engine.mjs';
const at='2026-10-25T08:00:00+08:00',epoch=Date.parse(at)/1000;
const base=()=>({...calculateSlot({code:'BASELINE',width:6,depth:200,thickness:1.8,tremieCount:1,tremieInitialDepths:[200],jointLayout:'both',jointInitialDepths:{left:200,right:200},jointDiameter:.93}),id:'f435f47c-1473-435b-ad05-283745962c32'});
const arm=slot=>planJointBaseline(slot,[],{action:'arm'},{source:'manual'}).next;
const config=()=>validateChangeConfig({collectorId:'baseline-test',slotId:base().id,source:{host:'127.0.0.1',port:3307,database:'wm_source_sim_test'},project:'895',machine:'1',startDate:'2026-10-25',initialPosition:'earliest',pollMs:2000,initializeJointDepths:true,mapping:{surface:{field:'R32',kind:'depthFromTop',scale:1},joints:[{side:'left',depthField:'R3',pullField:'R2',pressureField:'R1',lengthScale:1,pressureScale:1},{side:'right',depthField:'R18',pullField:'R17',pressureField:'R16',lengthScale:1,pressureScale:1}]},platform:{baseUrl:'https://127.0.0.1:8443',token:'test',caFile:'test.pem'},stateFile:'test.json'});
const row=(id,values={})=>({Id:String(id),ServerTimeStamp:String(epoch+id),R3:0,R2:.2,R1:12,R18:0,R17:.15,R16:11,...values});

test('pending equipment stays visible schematically without inventing measured depths or permitting pulls',()=>{
 const slot=base(),pending=arm(slot);
 assert.throws(()=>planJointBaseline(slot,[],{action:'arm'},{source:'device'}));
 assert.equal(initialJointDepth(pending,'left'),null);
 assert(sceneSpec(pending).pipes.filter(p=>p.kind==='joint').every(p=>p.instances>0&&p.depth===null&&p.depthPending&&p.length===pending.depth));
 assert.notEqual(sceneGeometryKey(pending),sceneGeometryKey(slot));
 const events=[{id:'m',type:'measurement',occurredAt:at,source:'manual',status:'active',version:1,payload:{measurementPoints:[150]}}];
 assert.equal(replayEvents(pending,events).latest.metrics.jointDepths.left,null);
 assert(sceneSpec(pending,replayEvents(pending,events).latest.metrics).pipes.filter(p=>p.kind==='joint').every(p=>p.instances>0&&p.depth===null));
 const operation={id:'j',type:'joint',occurredAt:at,source:'manual',status:'active',version:1,payload:{pulls:[{pipeId:'left',mode:'delta',value:.2,pressure:10}]}};
 assert.throws(()=>planJointBaseline(slot,[operation],{action:'arm'},{source:'manual'}));
 assert.throws(()=>replayEvents(pending,[operation]),/尚未初始化/);
});

test('first positive total depth is initialization, not a retained pull; zeros/missing sides wait independently',()=>{
 const c=config(),slot=arm(base()),comparison=initialChangeState(c).comparison;
 const zero=planSourceChange(c,slot,'DA2',row(1),comparison);assert.equal(zero.event,null);assert.deepEqual(zero.initialDepths,{});
 const first=planSourceChange(c,slot,'DA2',row(2,{R3:80,R18:null}),comparison);
 assert.deepEqual(first.initialDepths,{left:80});assert.equal(first.event,null);
 const left=planJointBaseline(slot,[],{depths:first.initialDepths,observedAt:at}).next;
 assert.equal(initialJointDepth(left,'left'),80);assert.equal(initialJointDepth(left,'right'),null);
 assert.equal(sceneSpec(left).pipes.find(p=>p.id==='left').depth,80);
 assert.equal(sceneSpec(left).pipes.find(p=>p.id==='left').length,80);
 assert.equal(sceneSpec(left).pipes.find(p=>p.id==='right').depth,null);
 assert.equal(sceneSpec(left).pipes.find(p=>p.id==='right').length,200);
 assert.throws(()=>planJointBaseline(left,[],{depths:{left:79},observedAt:at}),/已经确定/);
 for(const value of [0,-1,1000001,NaN])assert.throws(()=>planJointBaseline(slot,[],{depths:{left:value},observedAt:at}));
});

function fixture(){
 const c=config(),table={name:'DA2_895_1_20261025',stream:'DA2'},rows=[],savedEvents=[],receipts=new Map(),initializations=[];
 let slot=arm(base()),state=null,revision=1;
 const store={load:async()=>structuredClone(state),save:async value=>{state=structuredClone(value);}};
 const source={tables:async()=>[table],rows:async(_t,id,limit)=>rows.filter(r=>BigInt(r.Id)>BigInt(id)).slice(0,limit),latestPressure:async()=>rows.at(-1)};
 const api={context:async()=>({slot:structuredClone(slot),baseRevision:revision}),
  initialize:async(_id,body)=>{if(receipts.has(body.requestId))return receipts.get(body.requestId);
   if(body.baseRevision!==revision)throw Object.assign(Error('槽段或历史数据已被其他页面修改，请重新加载并核对后再提交；本次没有覆盖任何数据'),{status:409});
   const plan=planJointBaseline(slot,savedEvents,body);slot=plan.next;initializations.push(structuredClone(body));
   const result={initializedDepths:plan.initializedDepths,baseRevision:++revision};receipts.set(body.requestId,result);return result;},
  submit:async(_id,body)=>{if(receipts.has(body.requestId))return receipts.get(body.requestId);savedEvents.push(...body.events);const result={events:body.events,baseRevision:++revision};receipts.set(body.requestId,result);return result;},live:async()=>({updated:2})};
 return {c,rows,savedEvents,initializations,store,source,api,engine:()=>new ChangeSyncEngine({config:c,source,api,store}),slot:()=>slot,manualChange:()=>revision++};
}

test('one side initializes while the other waits; a mixed row initializes right and still records the left pull',async()=>{
 const f=fixture();f.rows.push(row(1),row(2,{R3:80}),row(3,{R3:79.8}),row(4,{R3:79.6,R18:75}));
 const engine=f.engine();await engine.archiveOnce();
 assert.deepEqual(f.initializations.map(b=>b.depths),[{left:80},{right:75}]);
 assert.deepEqual(f.savedEvents.flatMap(e=>e.payload.pulls).map(p=>[p.pipeId,p.mode,p.value]),[['left','delta',.2],['left','delta',.2]]);
 const replay=replayEvents(f.slot(),f.savedEvents.map((e,i)=>({...e,id:'j'+i,source:'manual',version:1,status:'active'})));
 assert.equal(replay.latest.metrics.jointDepths.left,79.6);assert.equal(replay.latest.metrics.jointDepths.right,75);
 assert.equal(engine.state.eventsSaved,2);assert.equal(engine.state.rowsProcessed,4);
 await f.engine().archiveOnce();assert.equal(f.initializations.length,2);assert.equal(f.savedEvents.length,2);
 f.rows.push(row(5,{R3:79.6,R18:74.85}));await f.engine().archiveOnce();assert.equal(f.savedEvents.at(-1).payload.pulls[0].value,.15);
});

test('negative source depths resume the blocked row, initialize once and retain later real pulls without duplicates',async()=>{
 const f=fixture();for(const mapping of f.c.mapping.joints)mapping.depthSign=-1;
 const first=row(1,{R3:-3.563174247741699,R2:.06864261627197266,R1:31.654998779296875});
 f.rows.push(first,...Array.from({length:100},(_,i)=>({...first,Id:String(i+2),ServerTimeStamp:String(epoch+i+2)})));
 const engine=f.engine();await engine.archiveOnce();
 assert.equal(f.initializations.length,1);assert.equal(f.initializations[0].depths.left,3.563174247741699);
 assert.equal(f.savedEvents.length,0);assert.equal(engine.state.rowsProcessed,101);
 assert.equal(f.slot().jointDepthInitialization.sides.right.state,'pending');
 f.rows.push(row(102,{R3:-3.4945316314697266,R2:.06864261627197266,R1:31.654998779296875}));
 const restarted=f.engine();await restarted.archiveOnce();assert.equal(f.savedEvents.length,1);
 const operation=f.savedEvents[0];assert.equal(operation.payload.pulls[0].value,.06864261627197266);assert.equal(operation.payload.pulls[0].pressure,31.654998779296875);
 const replay=replayEvents(f.slot(),[{...operation,id:'negative-source-pull',source:'device',deviceId:'baseline-test',externalId:'source-row-102',status:'active',version:1}]);
 assert(Math.abs(replay.latest.metrics.jointDepths.left-3.49453163)<1e-7);
 await f.engine().archiveOnce();assert.equal(f.savedEvents.length,1);assert.equal(f.initializations.length,1);
});

test('a lost initialization reply retries its original UUID after restart without a duplicate revision or fake pull',async()=>{
 const f=fixture();f.rows.push(row(1,{R3:80}));const original=f.api.initialize;let lost=true,first;
 f.api.initialize=async(id,body)=>{first??=structuredClone(body);assert.deepEqual(body,first);const result=await original(id,body);if(lost){lost=false;throw Error('lost baseline reply');}return result;};
 const engine=f.engine();await assert.rejects(engine.archiveOnce(),/lost baseline/);assert.equal(engine.state.pending.kind,'joint-baseline');assert.equal(f.initializations.length,1);
 const restarted=f.engine();await restarted.archiveOnce();assert.equal(restarted.state.pending,null);assert.equal(f.initializations.length,1);assert.equal(f.savedEvents.length,0);assert.equal(restarted.state.rowsProcessed,1);
});

test('baseline revision conflict retries safely; pressure polling never waits for initialization',async()=>{
 const f=fixture();f.rows.push(row(1,{R3:80}));const original=f.api.initialize;let interfere=true;
 f.api.initialize=async(id,body)=>{if(interfere){interfere=false;f.manualChange();}return original(id,body);};
 const engine=f.engine();await engine.archiveOnce();assert.equal(f.initializations.length,1);assert.equal(f.savedEvents.length,0);
 assert.deepEqual(await engine.liveOnce(),{updated:2});
});

test('legacy/mock collector identities and baseline behavior remain unchanged unless explicitly enabled',()=>{
 const c=config(),legacy={...c};delete legacy.initializeJointDepths;
 assert.equal(configurationIdentity(legacy),configurationIdentity({...legacy,initializeJointDepths:false}));
 const plan=planSourceChange(legacy,base(),'DA2',row(1,{R3:80,R18:75}),initialChangeState(legacy).comparison);
 assert.deepEqual(plan.initialDepths,{});assert.equal(plan.event,null);
});
