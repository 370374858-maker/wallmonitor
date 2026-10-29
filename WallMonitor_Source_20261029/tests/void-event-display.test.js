import test from 'node:test';import assert from 'node:assert/strict';
import {createEventWorkspace} from '../web/workbench/event-ui.js';
import {renderTimeline} from '../web/workbench/event-ledger.js';

const slot={id:'void-display-test',tremieCount:0,jointLayout:'none'};
const event=(id,status)=>({id,status,version:1,type:'measurement',occurredAt:'2026-10-27 16:50:22',payload:{measurementPoints:Array(6).fill(12)}});
test('ledger omits old void records while retaining active rows',()=>{
 const rows=[event('active','active'),event('removed','void')],html=renderTimeline(rows,rows,slot);
 assert(html.includes('data-audit="active"'));assert(!html.includes('data-audit="removed"'));assert(!html.includes('已作废'));
 assert.equal((html.match(/class="event-row /g)||[]).length,1);
});
test('history pagination counts active records only, even with a cached old void row',async()=>{
 const rows=Array.from({length:11},(_,i)=>event('deleted-'+i,'void')).concat(event('active','active'));
 const host={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],setAttribute(){},removeAttribute(){}};
 const workspace=createEventWorkspace({api:async()=>{throw Error('Provided context should be reused');}});
 await workspace.mount({host,slot,mode:'history',context:{slot,baseRevision:1,events:rows,snapshots:[]}});
 assert(host.innerHTML.includes('1—1 / 1'));assert(!host.innerHTML.includes('data-audit="deleted-'));
 assert(host.innerHTML.includes('data-page="1" disabled'));workspace.clear();
});
