import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manualPullDraft, eventFromDraft } from '../web/workbench/event-ui.js';
const slot = {tremieCount:2,jointLayout:'both',tremieInitialDepths:[20,19],jointInitialDepths:{left:20,right:20}};
const event = (id,at,pulls,status='active') => ({id,type:'tremie',occurredAt:at,status,payload:{pulls}});
test('manual new and revised entries expose pull distances, not a mode selector',()=>{
  const src=readFileSync(new URL('../web/workbench/event-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/name="mode-\$\{id\}"|<span>记录方式<\/span>/);
  assert.match(src,/d\.modes\[id\]='delta'/);
  assert.match(src,/aria-label="本次拔出量，可只填一根"/);
  assert.match(src,/class="unit-input"/);
  assert.match(src,/manualPullDraft\(e,state\.slot,state\.data\.events\)/);
});
test('absolute history is converted from the prior position without changing original events',()=>{
  const prior=event('a','2026-09-15 08:00:00',[{pipeId:'t1',mode:'delta',value:2}]);
  const target=event('b','2026-09-15 09:00:00',[{pipeId:'t1',mode:'absolute',value:16.5},{pipeId:'t2',mode:'delta',value:0}]);
  const voided=event('void','2026-09-15 08:30:00',[{pipeId:'t1',mode:'delta',value:10}],'void');
  const future=event('future','2026-09-15 10:00:00',[{pipeId:'t1',mode:'delta',value:10}]);
  const events=[future,target,voided,prior],original=JSON.stringify(events);
  const d=manualPullDraft(target,slot,events);
  assert.deepEqual(d,{pulls:{t1:1.5,t2:0},modes:{t1:'delta',t2:'delta'}});
  assert.deepEqual(eventFromDraft('tremie',{...d,occurredAt:'2026-09-15T09:00'},slot).payload.pulls,
    [{pipeId:'t1',mode:'delta',value:1.5},{pipeId:'t2',mode:'delta',value:0}]);
  assert.equal(JSON.stringify(events),original);
});
test('joint conversion handles earlier absolute positions and retains downward movement as a negative pull',()=>{
  const prior={...event('a','2026-09-15 08:00:00',[{pipeId:'left',mode:'absolute',value:18}]),type:'joint'};
  const target={...event('b','2026-09-15 09:00:00',[{pipeId:'left',mode:'absolute',value:16.8}]),type:'joint'};
  assert.deepEqual(manualPullDraft(target,slot,[prior]).pulls,{left:1.2});
  target.payload.pulls[0].value=19;
  assert.deepEqual(manualPullDraft(target,slot,[prior]).pulls,{left:-1});
});
test('event fields use slot-form label-above template and wider save actions',()=>{
  const css=readFileSync(new URL('../web/workbench/event-ui.css',import.meta.url),'utf8');
  assert.match(css,/\.event-workspace \.event-field\{display:flex;flex-direction:column/);
  assert.match(css,/grid-template-columns:minmax\(86px,1fr\) minmax\(0,4fr\)/);
  assert.match(css,/\.event-workspace \.event-field input\{height:40px;font-size:var\(--font-section\)/);
  assert.doesNotMatch(css,/flex-basis:54px|flex-basis:84px/);
});
