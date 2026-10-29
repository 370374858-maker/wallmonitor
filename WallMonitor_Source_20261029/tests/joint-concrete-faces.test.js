import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSlot} from '../shared/construction.js';
import {buildEventMonitor} from '../shared/event-monitor.js';
import {DEFAULT_POLICY,evaluateRecord,timeMs} from '../shared/monitoring.js';
import {pipeSafetyTable} from '../web/monitor/views.js';

const slot={...calculateSlot({code:'QA-JOINT-FACES',width:6,depth:100,thickness:1.8,tremieCount:1,tremieInitialDepths:[100],jointLayout:'both',jointInitialDepths:{left:100,right:98}}),id:'joint-face-test',monitoringPolicy:{...DEFAULT_POLICY,confirmed:true}};
const event=(id,type,occurredAt,payload)=>({id,slotId:slot.id,type,occurredAt,receivedAt:occurredAt,payload,status:'active',version:1,source:'manual'});
const events=[
  event('pour','pouring','2026-10-25 09:00:00',{truckNo:1,volume:slot.area*60,startedAt:'2026-10-25 08:00:00',endedAt:'2026-10-25 09:00:00'}),
  event('measure','measurement','2026-10-25 09:00:00',{measurementPoints:Array(6).fill(60)})
];
const evaluate=(extra={},settingDepth=99,policy=DEFAULT_POLICY)=>evaluateRecord(slot,[{metrics:{jointDepths:{left:98,right:100},tremieDepths:[100],actualDepth:50,theoreticalDepth:40,...extra}}],timeMs('2026-10-25 09:00:00'),policy,{depth:settingDepth});

test('both concrete faces use the same inclusive joint limits and independent verdicts',()=>{
  const e=evaluate(),left=e.joints[0];
  assert.equal(left.actualStatus.value,48);assert.equal(left.actualStatus.key,'ok');
  assert.equal(left.theoryStatus.value,58);assert.equal(left.theoryStatus.key,'danger');
  assert.equal(left.theoryStatus.kind,'joint');
  assert.equal(e.indicators.filter(i=>i.kind==='joint').length,4);
  assert.equal(evaluate({theoreticalDepth:50}).joints[0].theoryStatus.key,'ok');
  assert.equal(evaluate({theoreticalDepth:49.9999}).joints[0].theoryStatus.key,'danger');
  assert.equal(evaluate({actualDepth:49.9999}).joints[0].actualStatus.key,'danger');
});

test('missing one concrete face never borrows the other face or setting estimate',()=>{
  const missingTheory=evaluate({theoreticalDepth:null}).joints[0];
  assert.equal(missingTheory.actualStatus.key,'ok');assert.equal(missingTheory.theoryStatus.value,null);assert.equal(missingTheory.theoryStatus.key,'muted');
  const missingActual=evaluate({actualDepth:null}).joints[0];
  assert.equal(missingActual.actualStatus.key,'muted');assert.equal(missingActual.theoryStatus.key,'danger');
  for(const settingDepth of [99,70,10,null]){
    const j=evaluate({},settingDepth).joints[0];
    assert.deepEqual([j.actualStatus.value,j.actualStatus.key,j.theoryStatus.value,j.theoryStatus.key],[48,'ok',58,'danger']);
  }
});

test('event replay, overview evaluation, counts and action list agree on theoretical concrete alarms',()=>{
  const before=JSON.stringify({slot,events});
  const monitor=buildEventMonitor(slot,events,timeMs('2026-10-25 09:01:00'));
  for(const side of ['left','right']){
    const e=monitor.evaluation.joints.find(j=>j.side===side),d=monitor.displayEvaluation.joints.find(j=>j.side===side);
    assert.equal(e.actualStatus.key,'ok');assert.equal(e.theoryStatus.key,'danger');
    assert.equal(d.theoryStatus.key,e.theoryStatus.key);assert.equal(d.theoryStatus.value,e.theoryStatus.value);
    assert(monitor.actions.some(a=>a.id===`j-${side}-theory`&&a.kind==='joint'&&a.key==='danger'));
  }
  assert(monitor.evaluation.counts.danger>=2);
  const changed=buildEventMonitor({...slot,monitoringPolicy:{...slot.monitoringPolicy,jointMax:65}},events,timeMs('2026-10-25 09:01:00'));
  assert(changed.evaluation.joints.every(j=>j.actualStatus.key==='ok'&&j.theoryStatus.key==='ok'));
  assert(!changed.actions.some(a=>a.kind==='joint'));
  const aged=buildEventMonitor(slot,events,timeMs('2026-10-25 18:00:00'));
  assert.notEqual(aged.modelSetting.depth,monitor.modelSetting.depth);
  assert.deepEqual(aged.evaluation.joints.map(j=>[j.actualStatus.key,j.theoryStatus.key]),monitor.evaluation.joints.map(j=>[j.actualStatus.key,j.theoryStatus.key]));
  assert.equal(JSON.stringify({slot,events}),before);
});

test('unfinished pouring cannot turn an incomplete theoretical concrete face into a current alarm',()=>{
  const pending=event('pending','pouring','2026-10-25 10:00:00',{truckNo:2,volume:slot.area*5,startedAt:'2026-10-25 09:10:00',endedAt:'2026-10-25 10:00:00'});
  const m=buildEventMonitor(slot,[...events,pending],timeMs('2026-10-25 09:30:00'));
  assert.equal(m.latest.metrics.theoryComplete,false);
  for(const j of m.evaluation.joints){assert.equal(j.actualStatus.key,'ok');assert.equal(j.theoryStatus.value,null);assert.equal(j.theoryStatus.key,'muted');}
  assert(m.displayEvaluation.joints.every(j=>j.theoryStatus.key==='muted'));
  assert(!m.actions.some(a=>a.id.endsWith('-theory')&&a.kind==='joint'));
});

test('the safety table has two concrete embedments and two verdicts, with no setting-face column',()=>{
  const html=pipeSafetyTable(evaluate());
  assert.doesNotMatch(html,/初凝|龄期|仅供参考/);
  assert.equal((html.match(/<th scope="col"/g)||[]).length,6);
  const rows=[...html.matchAll(/<tr><th scope="row">([\s\S]*?)<\/tr>/g)];assert.equal(rows.length,5);
  for(const row of rows){const cells=[...row[1].matchAll(/<td(?: [^>]*)?>([\s\S]*?)<\/td>/g)];assert([4,5].includes(cells.length));}
  const jointRow=rows.find(row=>row[1].includes('左接头管'))[1];
  assert.match(jointRow,/status-label ok/);assert.match(jointRow,/status-label danger/);
});
