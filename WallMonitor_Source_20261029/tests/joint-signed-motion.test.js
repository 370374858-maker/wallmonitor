import test from 'node:test';import assert from 'node:assert/strict';
import {calculateSlot,calculateRecord} from '../shared/construction.js';
import {normalizeEvent,replayEvents} from '../shared/events.js';
import {jointOperationRequest} from '../shared/joint-operation.js';
import {validateDraft,eventFromDraft,manualPullDraft} from '../web/workbench/event-ui.js';
import {validateChangeConfig,initialChangeState,planSourceChange} from '../shared/change-sync.js';
const at='2026-10-27 09:00:00';
const slot={...calculateSlot({code:'SIGNED',width:6,depth:100,thickness:1.8,tremieCount:1,tremieInitialDepths:[100],jointLayout:'both',jointInitialDepths:{left:80.123456789,right:80},jointDiameter:.93,initialConcreteHeight:0,initialObservedAt:'2026-10-27 08:00:00'}),id:'12345678-1234-4234-8234-123456789012'};
const event=(value,changes={})=>({type:'joint',occurredAt:at,payload:{pulls:[{pipeId:'left',mode:'delta',value,pressure:12}]},...changes});
test('joint lowering is accepted on the manual common API path and moves pipe bottom down',()=>{
 const draft={occurredAt:'2026-10-27T09:00',pulls:{left:'-0.2'},pressures:{left:'12'},modes:{left:'delta'}};
 assert.deepEqual(validateDraft('joint',draft,slot),{});
 const normalized=normalizeEvent(slot,eventFromDraft('joint',draft,slot));assert.equal(normalized.payload.pulls[0].value,-.2);
 const replay=replayEvents(slot,[normalized]);assert(Math.abs(replay.latest.metrics.jointDepths.left-80.323456789)<1e-7);
 assert.equal(manualPullDraft(normalized,slot,[]).pulls.left,-.2);
 const absolute=normalizeEvent(slot,event(-.2,{payload:{pulls:[{pipeId:'left',mode:'absolute',value:80.323456789,pressure:12}]}}));
 assert(Math.abs(manualPullDraft(absolute,slot,[]).pulls.left+.2)<1e-7);
 assert.throws(()=>normalizeEvent(slot,{type:'tremie',occurredAt:at,payload:{pulls:[{pipeId:'t1',mode:'delta',value:-.2}]}}));
 assert.throws(()=>normalizeEvent(slot,event(-1,{payload:{pulls:[{pipeId:'left',mode:'absolute',value:-1,pressure:12}]}})));
 assert(Math.abs(replayEvents(slot,[normalizeEvent(slot,event(-20))]).latest.metrics.jointDepths.left-100.123456789)<1e-7);
});
test('completed operation accepts a negative lowering distance and keeps maximum pressure contract',()=>{
 const request=jointOperationRequest({slotId:slot.id,deviceId:'machine-1',operationId:'lower-1',pipeId:'left',startedAt:'2026-10-27T09:00:00+08:00',endedAt:'2026-10-27T09:01:00+08:00',pullLength:-.15,maxPressure:25});
 const normalized=normalizeEvent(slot,{...request.event,source:'device',deviceId:request.deviceId,externalId:request.externalId});
 assert.equal(normalized.payload.pulls[0].value,-.15);assert(Math.abs(replayEvents(slot,[normalized]).latest.metrics.jointDepths.left-80.273456789)<1e-7);
});
test('negative total-depth convention preserves signed pull and prevents duplicate lowering events',()=>{
 const c=validateChangeConfig({collectorId:'signed-test',slotId:slot.id,source:{host:'127.0.0.1',port:3307,database:'wm_source_sim_test'},project:'895',machine:'1',startDate:'2026-10-27',initialPosition:'earliest',pollMs:2000,mapping:{surface:{field:'R32',kind:'depthFromTop',scale:1},joints:[{side:'left',depthField:'R3',pullField:'R2',pressureField:'R1',lengthScale:1,pressureScale:1,depthSign:-1},{side:'right',depthField:'R18',pullField:'R17',pressureField:'R16',lengthScale:1,pressureScale:1,depthSign:-1}]},platform:{baseUrl:'https://127.0.0.1:8443',token:'test',caFile:'test.pem'},stateFile:'test.json'});
 const first={Id:'1',ServerTimeStamp:String(Date.parse('2026-10-27T09:00:00+08:00')/1000),R3:-80.123456789,R2:.1,R1:12,R18:-80,R17:0,R16:0};
 const prior=planSourceChange(c,slot,'DA2',first,initialChangeState(c).comparison);
 const row={...first,Id:'2',R3:-80.323456789,R2:-.2};const plan=planSourceChange(c,slot,'DA2',row,prior.comparison);
 assert.equal(plan.event.payload.pulls[0].value,-.2);assert.equal(plan.event.payload.pulls[0].pressure,12);
 assert.equal(planSourceChange(c,slot,'DA2',row,plan.comparison).event,null);
 assert(Math.abs(replayEvents(slot,[normalizeEvent(slot,{...plan.event,source:'manual'})]).latest.metrics.jointDepths.left-80.323456789)<1e-7);
});
test('legacy record calculations and revisions preserve lowering and independent pipe depths below the slot bottom',()=>{
 const record={truckNo:1,startedAt:'2026-10-27 08:00:00',endedAt:at,volume:5,measurementPoints:Array(6).fill(90),tremiePulls:[0],jointPulls:{left:-.2,right:0}};
 assert.equal(calculateRecord(slot,record).raw.jointPulls.left,-.2);
 assert(Math.abs(calculateRecord(slot,record).metrics.jointDepths.left-80.323456789)<1e-7);
 assert(Math.abs(calculateRecord(slot,{...record,jointPulls:{left:-20,right:0}}).metrics.jointDepths.left-100.123456789)<1e-7);
});
