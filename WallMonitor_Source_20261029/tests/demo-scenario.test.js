import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createDemoScenario} from '../integration/demo-scenario.mjs';import {runDemoPressureFeed} from '../integration/demo-live-feed.mjs';
import {calculateSlot} from '../shared/construction.js';import {jointOperationRequest} from '../shared/joint-operation.js';import {normalizeEvent,replayEvents} from '../shared/events.js';import {isDemoSlot,dataModeText} from '../web/monitor/demo-label.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
test('visible scenario contains six concrete surveys and completed pulls with coherent model metrics',()=>{
  const now=Date.parse('2026-10-24T10:00:00Z'),scenario=createDemoScenario({now,requestId:randomUUID()});
  const slot={...calculateSlot(scenario.slotRequest),id:'demo-slot'};
  const events=scenario.requests.map((request,index)=>{
    const input=request.route.endsWith('joint-operations')?jointOperationRequest({...request.body,slotId:slot.id}):{...request.body,slotId:slot.id};
    return normalizeEvent(slot,{...input.event,id:'demo-'+index,deviceId:input.deviceId,externalId:input.externalId,source:'device',receivedAt:new Date(now).toISOString()});
  });
  assert.equal(events.length,15);assert.equal(events.filter(e=>e.type==='measurement').length,6);assert.equal(events.filter(e=>e.type==='joint').length,2);
  const first=events.find(e=>e.type==='measurement');assert.deepEqual(first.payload.measurementPoints,Array(6).fill(54.5));
  const metrics=replayEvents(slot,events).latest.metrics;assert.equal(metrics.actualDepth,52);assert.equal(metrics.actualHeight,48);assert.equal(metrics.actualSpeed,6);assert(Math.abs(metrics.fillCoefficient-1.02)<1e-8);assert.equal(metrics.jointDepths.left,99.85);assert.equal(metrics.jointDepths.right,99.8);
  assert(events.every(e=>Date.parse(e.occurredAt.replace(' ','T')+'+08:00')<now));
});
test('continuous demo program can only issue ephemeral pressure requests and never survey or pull events',async()=>{
  const requests=[],controller=new AbortController();let stamp=Date.parse('2026-10-24T10:00:00Z');
  const result=await runDemoPressureFeed({config:{slotId:'test',slotCode:'DEMO-1024',intervalMs:2000},signal:controller.signal,now:()=>stamp,wait:async ms=>{stamp+=ms;if(requests.length===4)controller.abort();},post:async(route,body)=>{requests.push({route,body});return{status:200,body:{data:{storedRows:0}}};}});
  assert.equal(result.sent,4);assert.equal(result.businessEventsWritten,0);assert(requests.every(r=>r.route==='/api/v2/live-pressure'&&r.body.slotId==='test'&&r.body.pressures.left>0));
  await assert.rejects(runDemoPressureFeed({config:{slotCode:'CG01',slotId:'real',intervalMs:2000},signal:controller.signal}),/DEMO/);
});
test('demo marking is explicit and normal slots retain their normal status text',()=>{
  assert.equal(isDemoSlot({code:'DEMO-1024'}),true);assert.equal(dataModeText({code:'DEMO-1024'},'已加载最新记录'),'模拟数据 · 已加载最新记录');assert.equal(dataModeText({code:'CG01'},'已加载最新记录'),'已加载最新记录');
});
test('demo executable validates its configuration and really enters the CLI branch',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wm-demo-cli-'));
  const config=path.join(temporary,'config.json');
  try{
    fs.writeFileSync(config,JSON.stringify({slotCode:'DEMO-TEST',slotId:'test-slot',intervalMs:2000}));
    const output=execFileSync(process.execPath,[fileURLToPath(new URL('../integration/demo-live-feed.mjs',import.meta.url)),config,'--allow-demo-pressure','--check-config'],{encoding:'utf8',timeout:10000});
    assert.equal(JSON.parse(output).configurationValid,true);
  }finally{fs.unlinkSync(config);fs.rmdirSync(temporary);}
});
