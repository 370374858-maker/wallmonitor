import test from 'node:test';import assert from 'node:assert/strict';
import {calculateSlot} from '../shared/construction.js';
import {planSlotSurvey} from '../shared/slot-survey.js';
import {revisionHistoryDetails,slotChanges} from '../shared/slot-revision-history.js';
import {renderRevisionHistory} from '../web/workbench/revision-history.js';
import {renderSlotLedger} from '../web/workbench/slot-ledger.js';
import {sceneSpec} from '../web/models/model-spec.js';
const base=()=>calculateSlot({code:'QA-HISTORY',width:6,depth:200,thickness:1.8,tremieCount:2,tremieInitialDepths:[200,200],jointLayout:'both',jointInitialDepths:{left:200,right:200},jointDiameter:.93});
test('automatic survey history identifies exact source row/time and only the changed physical fields',()=>{
 const before=base(),input={depth:12.0887,observedAt:'2026-10-27T08:50:22Z',sourceRow:{table:'DA1_895_1_20261027',id:'30083075384502902'}};
 const plan=planSlotSurvey(before,[],input),details=revisionHistoryDetails({reason:plan.reason,slotBefore:before,slotAfter:plan.next});
 assert.equal(details.origin,'device');assert.equal(details.observedAt,'2026-10-27 16:50:22');assert.deepEqual(details.sourceRow,input.sourceRow);assert.deepEqual(details.changes,[{field:'depth',label:'槽深',before:200,after:12.0887,unit:'m'}]);
 assert.match(plan.reason,/16:50:22/);assert.match(plan.reason,/30083075384502902/);
 const html=renderRevisionHistory({offset:0,total:1,rows:[{...details,id:'r1',reason:plan.reason,created_at:'2026-10-27 17:52:37'}]},'s1');
 for(const text of ['自动修改','16:50:22','DA1_895_1_20261027','30083075384502902','200','12.0887'])assert(html.includes(text));
 assert.match(renderSlotLedger([{...before,id:'s1'}]),/data-slot-history="s1"/);
});
test('manual history keeps its origin even when the slot retains a prior source survey; escapes all source text',()=>{
 const slot=base(),next={...slot,depth:199,slotDepthSurvey:{depth:198,observedAt:'2026-10-27 10:00:00',sourceRow:{table:'old',id:'1'}}};
 const details=revisionHistoryDetails({result:{origin:'manual'},slotBefore:{...slot,slotDepthSurvey:next.slotDepthSurvey},slotAfter:next});assert.equal(details.origin,'manual');assert.equal(details.sourceRow,null);
 const html=renderRevisionHistory({offset:0,total:1,rows:[{id:'x',reason:'<script>bad</script>',origin:'device',observedAt:'<b>',sourceRow:{table:'<img>',id:'<svg>'},changes:slotChanges(slot,next)}]},'s');assert.doesNotMatch(html,/<script>|<img>|<svg>/);assert.match(html,/&lt;script&gt;/);
});
test('shallow and deep slots keep fixed 3D height, horizontal geometry and viewport bounds; physical ruler changes',()=>{
 const specs=[.5,2,12.0887,200,1000,10000].map(depth=>sceneSpec(calculateSlot({...base(),depth})));
 for(const s of specs){assert(Math.abs(s.height-specs[0].height)<1e-7);assert(Math.abs(s.slot.depth*s.layout.verticalScale-804)<1e-7);assert.equal(s.layout.top,26);assert.equal(s.layout.bottom,830);assert.equal(s.slot.width,6);assert.equal(s.soilWidth,specs[0].soilWidth);assert(s.pipes.every(p=>p.length<=s.slot.depth));}
 assert.notEqual(specs[1].ratio,specs[3].ratio);assert.equal(specs[3].slot.depth,200);
});
