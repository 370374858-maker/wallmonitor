import test from 'node:test';import assert from 'node:assert/strict';
import {calculateSlot} from '../shared/construction.js';
import {planSlotSurvey} from '../shared/slot-survey.js';
import {normalizeEvent,replayEvents} from '../shared/events.js';
import {configurationIdentity,initialChangeState,validateChangeConfig,planSourceChange} from '../shared/change-sync.js';
import {ChangeSyncEngine} from '../integration/change-sync-engine.mjs';
import {sceneSpec} from '../web/models/model-spec.js';
const at='2026-10-27T08:00:00Z',epoch=Date.parse(at)/1000;
const base=()=>({...calculateSlot({code:'SURVEY',width:6,depth:200,thickness:1.8,tremieCount:2,tremieInitialDepths:[200,200],jointLayout:'both',jointInitialDepths:{left:200,right:200},jointDiameter:.93}),id:'f435f47c-1473-435b-ad05-283745962c32'});
const config=()=>validateChangeConfig({collectorId:'surface-survey-test',slotId:base().id,source:{host:'127.0.0.1',port:3307,database:'wm_source_sim_test'},project:'895',machine:'1',startDate:'2026-10-27',initialPosition:'earliest',pollMs:2000,jointDepthRole:'change-marker',mapping:{surface:{field:'R30',kind:'depthFromTop',scale:1},slotDepth:{field:'R31',scale:1},joints:[{side:'left',depthField:'R3',pullField:'R2',pressureField:'R1',lengthScale:1,pressureScale:1},{side:'right',depthField:'R18',pullField:'R17',pressureField:'R16',lengthScale:1,pressureScale:1}]},platform:{baseUrl:'https://127.0.0.1:8443',token:'qa',caFile:'qa.pem'},stateFile:'qa.json'});
const row=(id,depth,slotDepth)=>({Id:String(id),ServerTimeStamp:String(epoch+id),R30:depth,R31:slotDepth,R32:0});

function fixture(){
 const c=config(),rows=[],events=[normalizeEvent(base(),{type:'joint',occurredAt:at,payload:{pulls:[{pipeId:'left',mode:'delta',value:.0686426,pressure:31.655}]}})],receipts=new Map(),surveys=[];let slot=base(),state=null,revision=0;
 const store={load:async()=>structuredClone(state),save:async s=>{state=structuredClone(s);}};
 const source={tables:async()=>[{name:'DA1_895_1_20261027',stream:'DA1'}],rows:async(_t,id,limit)=>rows.filter(r=>BigInt(r.Id)>BigInt(id)).slice(0,limit)};
 const api={context:async()=>({slot:structuredClone(slot),baseRevision:revision}),survey:async(_id,body)=>{
  if(receipts.has(body.requestId))return {...receipts.get(body.requestId),replayed:true};
  if(body.baseRevision!==revision)throw Object.assign(Error('槽段或历史数据已被其他页面修改，请重新加载并核对后再提交；本次没有覆盖任何数据'),{status:409});
  const plan=planSlotSurvey(slot,events,body);slot=plan.next;surveys.push(structuredClone(body));
  if(plan.changed)revision++;const result={depth:slot.depth,observedDepth:body.depth,changed:plan.changed,baseRevision:revision};receipts.set(body.requestId,result);return result;
 },submit:async(_id,body)=>{
  if(receipts.has(body.requestId))return receipts.get(body.requestId);
  if(body.baseRevision!==revision)throw Object.assign(Error('槽段事件已更新，请刷新后重试；本次没有写入'),{status:409});
  const event=normalizeEvent(slot,body.events[0]);replayEvents(slot,[...events,event]);events.push(event);
  const result={events:[event],baseRevision:++revision};receipts.set(body.requestId,result);return result;
 }};
 return {c,rows,events,surveys,store,source,api,engine:()=>new ChangeSyncEngine({config:c,source,api,store}),slot:()=>slot,state:()=>state,manualChange:()=>revision++,manualDepth:depth=>{slot={...slot,...calculateSlot({...slot,depth})};revision++;}};
}

test('R30 is depth below mouth; positive R31 changes geometry before measurement while retaining all pipe datums and raw pulls',async()=>{
 const f=fixture();f.rows.push(row(1,12.0887,12.0887));await f.engine().archiveOnce();
 assert.equal(f.slot().depth,12.0887);assert.equal(f.slot().capacity,Number((f.slot().area*12.0887).toFixed(8)));
 assert.deepEqual(f.slot().tremieInitialDepths,[200,200]);assert.deepEqual(f.slot().jointInitialDepths,{left:200,right:200});
 const replay=replayEvents(f.slot(),f.events);assert.equal(replay.latest.metrics.actualDepth,12.0887);assert.equal(replay.latest.metrics.actualHeight,0);
 assert.equal(replay.latest.metrics.jointDepths.left,199.9313574);assert.equal(f.events[1].occurredAt,'2026-10-27 16:00:01');
 const pipes=sceneSpec(f.slot(),replay.latest.metrics).pipes;assert.equal(pipes.find(p=>p.id==='left').depth,199.9313574);assert(pipes.every(p=>p.length===12.0887));
 for(let id=2;id<=101;id++)f.rows.push(row(id,12.0887,12.0887));await f.engine().archiveOnce();assert.equal(f.surveys.length,1);assert.equal(f.events.length,2);
 f.rows.push(row(102,12.0887,13));await f.engine().archiveOnce();assert.equal(f.surveys.length,2);assert.equal(f.events.length,2);assert.equal(replayEvents(f.slot(),f.events).latest.metrics.actualHeight,13-12.0887);
});

test('zero, negative, missing and nonnumeric R31 never replace geometry or block valid R30 changes',async()=>{
 const f=fixture();for(const [i,value]of [0,-1,null,undefined,'12',NaN].entries())f.rows.push(row(i+1,150-i,value));
 await f.engine().archiveOnce();assert.equal(f.slot().depth,200);assert.equal(f.surveys.length,0);assert.equal(f.events.filter(e=>e.type==='measurement').length,6);
 for(const depth of [0,-1,Infinity,10001])assert.throws(()=>planSlotSurvey(base(),[],{depth,observedAt:at}));
 assert.throws(()=>planSlotSurvey(base(),[],{depth:12.0887,rawDepth:99,observedAt:at}));
});

test('lost survey response and process restart replay one receipt before advancing cursor or saving measurement',async()=>{
 const f=fixture();f.rows.push(row(1,12.0887,12.0887));const original=f.api.survey;let lost=true,exact;
 f.api.survey=async(id,body)=>{exact??=structuredClone(body);assert.deepEqual(body,exact);const result=await original(id,body);if(lost){lost=false;throw Error('lost survey reply');}return result;};
 await assert.rejects(f.engine().archiveOnce(),/lost survey/);assert.equal(f.state().pending.kind,'slot-survey');assert.equal(f.state().cursors.DA1_895_1_20261027,'0');assert.equal(f.events.length,1);
 await f.engine().archiveOnce();assert.equal(f.state().pending,null);assert.equal(f.surveys.length,1);assert.equal(f.events.length,2);assert.equal(f.state().slotDepthUpdates,1);assert.equal(f.state().cursors.DA1_895_1_20261027,'1');
});

test('survey optimistic revision conflict reloads safely and incompatible past measurements remain intact',async()=>{
 const f=fixture();f.rows.push(row(1,12.0887,12.0887));const original=f.api.survey;let conflict=true;
 f.api.survey=async(id,body)=>{if(conflict){conflict=false;f.manualChange();}return original(id,body);};await f.engine().archiveOnce();assert.equal(f.surveys.length,1);
 const measured=normalizeEvent(base(),{type:'measurement',occurredAt:at,payload:{measurementPoints:Array(6).fill(150)}});
 assert.throws(()=>planSlotSurvey(base(),[measured],{depth:100,observedAt:at}),/150|测点|measurement|100/);
});

test('zero-motion source marker changes advance without producing same-second conflicting joint records',()=>{
 const c=config(),slot=base(),comparison=initialChangeState(c).comparison;
 const initial={Id:'1',ServerTimeStamp:String(epoch),R3:-3,R2:.1,R1:12,R18:0,R17:0,R16:0};
 const first=planSourceChange(c,slot,'DA2',initial,comparison);
 const reset=planSourceChange(c,slot,'DA2',{...initial,Id:'2',R3:0,R2:0,R1:0},first.comparison);assert.equal(reset.event,null);assert.equal(reset.comparison.joints.left.depth,0);
 const another=planSourceChange(c,slot,'DA2',{...initial,Id:'3',R3:-5,R2:0},reset.comparison);assert.equal(another.event,null);assert.equal(another.comparison.joints.left.depth,-5);
 const operation=planSourceChange(c,slot,'DA2',{...initial,Id:'4',R3:-4.9,R2:.1},another.comparison);assert.equal(operation.event.payload.pulls[0].value,.1);
 const legacy=structuredClone(c);delete legacy.mapping.slotDepth;legacy.mapping.surface.field='R32';assert.notEqual(configurationIdentity(c),configurationIdentity(legacy));
});

test('manual slot depth survives held R31 values, invalid placeholders and collector restarts; a real source change updates again',async()=>{
 const f=fixture();f.rows.push(row(1,12.0887,12.0887));await f.engine().archiveOnce();f.manualDepth(13);
 f.rows.push(row(2,12.0887,12.0887),row(3,12.0887,0),row(4,12.0887,-1),row(5,12.0887,12.0887));
 await f.engine().archiveOnce();assert.equal(f.slot().depth,13);assert.equal(f.surveys.length,1);assert.equal(f.state().comparison.slotDepth.depth,12.0887);
 const repeated=planSlotSurvey(f.slot(),f.events,{depth:12.0887,observedAt:'2026-10-27T08:00:05Z'});assert.equal(repeated.changed,false);assert.equal(repeated.next.depth,13);assert.equal(repeated.skippedReason,'source-unchanged');
 f.rows.push(row(6,12.0887,14));await f.engine().archiveOnce();assert.equal(f.slot().depth,14);assert.equal(f.surveys.length,2);
 f.rows.push(row(7,12.0887,12.0887));await f.engine().archiveOnce();assert.equal(f.slot().depth,12.0887);assert.equal(f.surveys.length,3,'return to a prior value is a real change after an intervening survey');
});

test('manual correction after committed survey and lost reply survives the exact retry and same-row replay',async()=>{
 const f=fixture();f.rows.push(row(1,12.0887,12.0887));const original=f.api.survey;let lost=true;
 f.api.survey=async(id,body)=>{const result=await original(id,body);if(lost){lost=false;throw Error('lost survey reply');}return result;};
 await assert.rejects(f.engine().archiveOnce(),/lost survey/);f.manualDepth(13);await f.engine().archiveOnce();assert.equal(f.slot().depth,13);assert.equal(f.surveys.length,1);assert.equal(f.state().pending,null);
 assert.equal(f.events.at(-1).payload.measurementPoints[0],12.0887);
});
