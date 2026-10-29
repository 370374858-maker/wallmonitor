import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSlot} from '../shared/construction.js';
import {planJointBaseline} from '../shared/joint-baseline.js';
import {initialJointDepth} from '../shared/joint-depth-state.js';
import {validateChangeConfig,configurationIdentity,initialChangeState} from '../shared/change-sync.js';
import {ChangeSyncEngine} from '../integration/change-sync-engine.mjs';
import {replayEvents} from '../shared/events.js';
import {sceneSpec} from '../web/models/model-spec.js';
const slot={...calculateSlot({code:'MARKER',width:6,depth:200,thickness:1.8,tremieCount:1,tremieInitialDepths:[200],jointLayout:'both',jointInitialDepths:{left:200,right:200},jointDiameter:.93}),id:'f435f47c-1473-435b-ad05-283745962c32'};
const config=()=>validateChangeConfig({collectorId:'marker-test',slotId:slot.id,source:{host:'127.0.0.1',port:3307,database:'wm_source_sim_test'},project:'895',machine:'1',startDate:'2026-10-27',initialPosition:'earliest',pollMs:2000,jointDepthRole:'change-marker',mapping:{surface:{field:'R32',kind:'depthFromTop',scale:1},joints:[{side:'left',depthField:'R3',pullField:'R2',pressureField:'R1',lengthScale:1,pressureScale:1},{side:'right',depthField:'R18',pullField:'R17',pressureField:'R16',lengthScale:1,pressureScale:1}]},platform:{baseUrl:'https://127.0.0.1:8443',token:'qa',caFile:'test.pem'},stateFile:'qa-state.json'});
const row=(id,values={})=>({Id:String(id),ServerTimeStamp:String(1793066154+id),R3:0,R2:0,R1:0,R18:0,R17:0,R16:0,...values});

test('raw depth is only a change marker; archive signed row deltas and replay against platform 200 m',async()=>{
 const c=config(),rows=[row(0),row(1,{R3:-3.56317,R2:.0686426,R1:31.655})],events=[];let state=null;
 const store={load:async()=>structuredClone(state),save:async s=>{state=structuredClone(s);}};
 const source={tables:async()=>[{name:'DA2_895_1_20261027',stream:'DA2'}],rows:async(_t,id,limit)=>rows.filter(r=>BigInt(r.Id)>BigInt(id)).slice(0,limit)};
                                                                              
 for(const r of rows)r.Id=String(Number(r.Id)+1);
 const api={context:async()=>({slot,baseRevision:events.length}),submit:async(_id,body)=>{events.push(...body.events);return {events:body.events};},initialize:async()=>{throw Error('Source marker must never initialize platform depth');}};
 const engine=()=>new ChangeSyncEngine({config:c,source,api,store});
 await engine().archiveOnce();assert.equal(events.length,1);assert.equal(events[0].occurredAt,'2026-10-27T01:55:55Z');
 assert.deepEqual(events[0].payload.pulls,[{pipeId:'left',mode:'delta',value:.0686426,pressure:31.655}]);
 const replay=()=>replayEvents(slot,events.map((e,i)=>({...e,id:'event-'+i,source:'manual',status:'active',version:1})));
 assert.equal(replay().latest.metrics.jointDepths.left,199.9313574);
 assert.equal(replay().latest.metrics.jointDepths.right,200);
 assert.equal(sceneSpec(slot,replay().latest.metrics).pipes.find(p=>p.id==='left').depth,199.9313574);
 for(let id=3;id<=502;id++)rows.push(row(id,{R3:-3.56317,R2:.0686426,R1:12}));
 for(let i=0;i<3;i++)await engine().archiveOnce();assert.equal(events.length,1);
 rows.push(row(503,{R3:-3.4945274,R2:.0686426,R1:19}));await engine().archiveOnce();assert.equal(events.length,2);
 rows.push(row(504,{R3:-3.5145274,R2:-.02,R1:9}));await engine().archiveOnce();assert.equal(events.length,3);
 assert(Math.abs(replay().latest.metrics.jointDepths.left-(200-.0686426-.0686426+.02))<1e-7);
 rows.push(row(505,{R3:-9000,R2:0,R1:10}));await engine().archiveOnce();assert.equal(events.length,3,'zero travel only advances its independent source marker');
 assert.equal(slot.jointInitialDepths.left,200);assert.equal(state.comparison.joints.left.depth,-9000);
 rows.push(row(506,{R3:null,R2:.1,R1:10}));await assert.rejects(engine().archiveOnce(),/缺失/);assert.equal(state.cursors.DA2_895_1_20261027,'505');
});

test('changing marker mode requires a state migration, while legacy simulation identities stay stable',()=>{
 const c=config(),legacy=structuredClone(c);delete legacy.jointDepthRole;
 assert.notEqual(configurationIdentity(c),configurationIdentity(legacy));
 assert.equal(configurationIdentity(legacy),configurationIdentity({...legacy,initializeJointDepths:false}));
 assert.throws(()=>validateChangeConfig({...c,initializeJointDepths:true}),/不能用于初始化/);
 assert.throws(()=>validateChangeConfig({...c,jointDepthRole:'absolute-position'}),/jointDepthRole/);
 assert.equal(initialChangeState(c).comparison.joints.left,undefined);
});

test('manual audited restoration clears source pending state and recalculates existing signed operations',()=>{
 const pending=planJointBaseline(slot,[],{action:'arm'},{source:'manual'}).next;
 const wrong=planJointBaseline(pending,[],{depths:{left:3.56317},observedAt:'2026-10-27T01:55:55Z'}).next;
 const event={id:'real-pull',source:'manual',status:'active',version:1,type:'joint',occurredAt:'2026-10-27T01:55:55Z',payload:{pulls:[{pipeId:'left',mode:'delta',value:.0686426,pressure:31.655}]}};
 const body={action:'use-platform-depths',depths:{left:200,right:200}};
 assert.throws(()=>planJointBaseline(wrong,[event],body,{source:'device'}),/管理员/);
 for(const depths of [{left:200},{left:1000001,right:200},{left:200,right:-1},{left:200,right:200,other:1}])assert.throws(()=>planJointBaseline(wrong,[event],{...body,depths},{source:'manual'}));
 const restored=planJointBaseline(wrong,[event],body,{source:'manual'});
 assert.deepEqual(restored.pendingSides,[]);assert.equal(initialJointDepth(restored.next,'right'),200);
 assert.equal(replayEvents(restored.next,[event]).latest.metrics.jointDepths.left,199.9313574);
 assert.equal(wrong.jointInitialDepths.left,3.56317,'original metadata remains available for the audit revision');
});
