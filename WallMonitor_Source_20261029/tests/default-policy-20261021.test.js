import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_POLICY,policyFor,validatePolicy,classify,timeMs,evaluateRecord} from '../shared/monitoring.js';
import {estimateEventSetting} from '../shared/event-monitor.js';
import {pressureGaugeOption,speedGaugeOption} from '../web/monitor/charts.js';

test('project defaults use eight-hour age, inclusive 0.98–1.10 fill and 26 MPa pressure maximum',()=>{
  const p=validatePolicy(DEFAULT_POLICY);
  assert.equal(p.settingHours,8);assert.equal(p.fillMin,.98);assert.equal(p.fillMax,1.1);
  for(const side of ['left','right']){
    assert.equal(p[side+'PressureWatchAbove'],0);assert.equal(p[side+'PressureDangerAbove'],26);
    for(const [value,key] of [[0,'ok'],[25.999,'ok'],[26,'ok'],[26.001,'danger'],[null,'muted']])assert.equal(classify(value,'pressure-'+side,p).key,key);
  }
  for(const [value,key] of [[.97999,'danger'],[.98,'ok'],[1.1,'ok'],[1.10001,'danger'],[null,'muted']])assert.equal(classify(value,'fill',p).key,key);
  assert.equal(p.confirmed,false);
});

test('a saved slot policy overrides defaults without changing its history',()=>{
  const slot={monitoringPolicy:{settingHours:6,fillMin:1,fillMax:1.2,jointMax:.5,speedDangerBelow:2,speedWatchBelow:3,leftPressureWatchAbove:20,leftPressureDangerAbove:24}};
  const before=JSON.stringify(slot),p=policyFor(slot);
  assert.equal(p.settingHours,6);assert.equal(p.fillMax,1.2);
  assert.equal(p.leftPressureDangerAbove,24);assert.equal(p.rightPressureDangerAbove,26);
  assert.equal(p.jointReference,'actual');assert.equal(p.jointMin,0);assert.equal(p.jointMax,48);
  assert.equal(p.speedNormalMax,null);assert.equal(p.speedWatchMax,null);assert.equal(classify(20,'speed',p).key,'ok');
  assert.equal(classify(20,'pressure-left',p).key,'warn');assert.equal(classify(24,'pressure-left',p).key,'danger');
  assert.equal(JSON.stringify(slot),before);
});

test('pipe maxima are inclusive at 6 and 48 metres and are not a minimum-depth alarm',()=>{
  assert.equal(DEFAULT_POLICY.jointReference,'actual');assert.doesNotThrow(()=>validatePolicy(DEFAULT_POLICY));
  for(const [kind,limit] of [['tremie',6],['joint',48]]){
    for(const [value,key] of [[0,'ok'],[limit-.001,'ok'],[limit,'ok'],[limit+.001,'danger'],[null,'muted']])assert.equal(classify(value,kind).key,key);
  }
});

test('speed has red/yellow/green/yellow/red zones with inclusive 4, 5, 7 and 8 boundaries',()=>{
  for(const [value,key] of [[3.999,'danger'],[4,'warn'],[4.999,'warn'],[5,'ok'],[6,'ok'],[7,'ok'],[7.001,'warn'],[8,'warn'],[8.001,'danger'],[null,'muted']])assert.equal(classify(value,'speed').key,key);
  const gauge=speedGaugeOption({actual:{value:7.5},theory:{value:5}},DEFAULT_POLICY).series[0];
  assert.equal(gauge.max,10);assert.deepEqual(gauge.axisLine.lineStyle.color.map(stop=>stop[0]),[.4,.5,.7,.8,1]);
  for(const invalid of [{speedNormalMax:4},{speedWatchMax:6},{speedNormalMax:null,speedWatchMax:8}])assert.throws(()=>validatePolicy({...DEFAULT_POLICY,...invalid}),{status:422});
});

test('joint warnings separately follow measured and theoretical concrete faces, never the setting face',()=>{
  const slot={depth:100,initialConcreteHeight:0,tremieCount:1,jointLayout:'left'};
  const metrics={tremieDepths:[51],jointDepths:{left:98},actualDepth:50,theoreticalDepth:40,jointPressures:{left:26},actualSpeed:6,theoreticalSpeed:6,fillCoefficient:1};
  const setting={depth:20,height:80,key:'estimated'};
  const evaluate=values=>evaluateRecord(slot,[{metrics:{...metrics,...values}}],timeMs('2026-10-21 18:00:00'),DEFAULT_POLICY,setting);
  const e=evaluate({}),j=e.joints[0];
  assert.equal(j.actualStatus.value,48);assert.equal(j.actualStatus.key,'ok');
  assert.equal(j.theory,58);assert.equal(j.theoryStatus.key,'danger');assert.equal(j.setting.value,78);assert.equal(j.setting.key,'muted');
  assert.equal(e.indicators.filter(item=>item.kind==='joint').length,2);
  assert.equal(evaluate({actualDepth:49.99}).joints[0].actualStatus.key,'danger');
  assert.equal(evaluate({actualDepth:null}).joints[0].actualStatus.key,'muted');
});

test('legacy joint clearances are read as current-face defaults, without rewriting the saved policy',()=>{
  for(const jointReference of ['setting',undefined]){
    const saved={revision:3,jointMin:0,jointMax:.5,settingHours:6,...(jointReference?{jointReference}:{})};
    const slot={monitoringPolicy:saved},before=JSON.stringify(slot),p=policyFor(slot);
    assert.equal(p.jointReference,'actual');assert.equal(p.jointMin,0);assert.equal(p.jointMax,48);
    assert.equal(p.revision,3);assert.equal(p.settingHours,6);assert.equal(JSON.stringify(slot),before);
  }
  const current=policyFor({monitoringPolicy:{jointReference:'actual',jointMin:1,jointMax:35}});
  assert.equal(current.jointMin,1);assert.equal(current.jointMax,35);
});

test('policy writes fix the joint basis and reject stale clients trying to restore setting-face alarms',()=>{
  const {jointReference,...form}=DEFAULT_POLICY;
  assert.equal(validatePolicy(form).jointReference,'actual');
  assert.throws(()=>validatePolicy({...form,jointReference:'setting'}),error=>error.status===422&&/当前混凝土面/.test(error.issues.jointReference));
});

test('even a directly supplied legacy policy cannot use the setting plane for live joint alarms',()=>{
  const slot={depth:100,initialConcreteHeight:0,tremieCount:0,jointLayout:'left'};
  const legacy={...DEFAULT_POLICY,jointReference:'setting',jointMax:.5};
  const row={metrics:{jointDepths:{left:98},actualDepth:49,theoreticalDepth:98,jointPressures:{left:1}}};
  for(const depth of [98,97.75,20,null]){
    const e=evaluateRecord(slot,[row],0,legacy,{depth}),j=e.joints[0];
    assert.equal(e.policy.jointReference,'actual');assert.equal(e.policy.jointMax,48);
    assert.equal(j.reference,'actual');assert.equal(j.actualStatus.value,49);assert.equal(j.actualStatus.key,'danger');
    assert.equal(j.setting.key,'muted');assert.equal(e.indicators.filter(i=>i.kind==='joint').length,2);
  }
});

test('eight-hour age cutoff is used by the live event setting estimate',()=>{
  const slot={depth:100,initialConcreteHeight:0};
  const events=[{id:'m',type:'measurement',status:'active',occurredAt:'2026-10-21 10:00:00',payload:{measurementPoints:[90]}}];
  assert.equal(estimateEventSetting(slot,events,timeMs('2026-10-21 17:59:59')).height,0);
  assert.equal(estimateEventSetting(slot,events,timeMs('2026-10-21 18:00:00')).height,10);
});

test('single pressure maximum can be saved, disabled, or replaced with valid two-tier limits',()=>{
  assert.doesNotThrow(()=>validatePolicy(DEFAULT_POLICY));
  const disabled={...DEFAULT_POLICY,leftPressureWatchAbove:0,leftPressureDangerAbove:0};
  assert.equal(classify(26,'pressure-left',disabled).key,'muted');
  for(const overrides of [{leftPressureWatchAbove:27},{leftPressureWatchAbove:26},{leftPressureWatchAbove:1,leftPressureDangerAbove:0}])assert.throws(()=>validatePolicy({...DEFAULT_POLICY,...overrides}),{status:422});
});

test('26 MPa is visible within the gauge and has a green maximum with no invented pre-alarm',()=>{
  const option=pressureGaugeOption({left:{value:26},right:{value:26.1}},DEFAULT_POLICY);
  for(const gauge of option.series){assert.equal(gauge.max,30);assert.equal(gauge.axisLine.lineStyle.color.length,2);assert.equal(gauge.axisLine.lineStyle.color[0][0],26/30);}
  assert.equal(option.series[0].data[0].value,26);
  assert.equal(option.series[1].detail.formatter(),'26.10');
});
