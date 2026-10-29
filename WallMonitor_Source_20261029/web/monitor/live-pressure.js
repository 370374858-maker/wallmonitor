import {esc} from '../workbench/format.js';

export function livePressureDisplay(snapshot,{elapsedMs=0,mode='active',jointLayout='both'}={}){
  const out={};
  for(const side of ['left','right']){
    const configured=jointLayout==='both'||jointLayout===side,item=snapshot?.[side];
    const stale=item?.status==='live'&&((item.ageSeconds??0)*1000+elapsedMs>=(snapshot.ttlSeconds??60)*1000);
    const waiting=mode!=='active'||stale||item?.status==='stale';
    const valid=configured&&Number.isFinite(item?.value)&&['live','stale'].includes(item.status);
    out[side]=valid?{...item,label:(item.label||'已接入')+(waiting?' · 待更新':''),pendingUpdate:waiting,sourceAt:item.observedAt,backfilled:false}
      :{value:null,key:'muted',label:!configured?'未配置':'等待接入',sourceAt:null,backfilled:false};
  }
  return out;
}
export function livePressureStatusHtml(display){
  return ['left','right'].map(side=>{
    const item=display[side],label=side==='left'?'左接头管':'右接头管';
    return `<span title="${esc(item.sourceAt?'观测时间 '+item.sourceAt:'尚未收到实时压力')}"><small>${label} · 实时</small><b class="${esc(item.key)}">${esc(item.label)}</b></span>`;
  }).join('');
}
export function createLivePressureController({getContext,fetchSnapshot,onChange,now=()=>performance.now(),pollMs=2000}){
  let contextKey='',snapshot=null,receivedAt=0,nextPoll=0,pending=null,controller=null,disposed=false,offline=false,lastView='';
  const context=()=>getContext();
  const view=()=>{
    const ctx=context();
    return livePressureDisplay(snapshot,{elapsedMs:Math.max(0,now()-receivedAt),mode:ctx.paused?'paused':offline?'offline':'active',jointLayout:ctx.jointLayout});
  };
  const publish=()=>{const value=view(),key=JSON.stringify(value);if(key!==lastView){lastView=key;onChange(value);}};
  function reset(){controller?.abort();controller=null;pending=null;snapshot=null;offline=false;nextPoll=0;receivedAt=now();lastView='';}
  async function tick(){
    if(disposed)return;
    const ctx=context(),key=JSON.stringify([ctx.slotId,ctx.jointLayout]);
    if(key!==contextKey){contextKey=key;reset();}
    if((!ctx.active||ctx.paused)&&pending){controller?.abort();pending=null;nextPoll=0;}
    publish();
    if(!ctx.active||!ctx.slotId||ctx.paused||pending||now()<nextPoll)return;
    controller=new AbortController();const own=controller,requestKey=contextKey;
    nextPoll=now()+pollMs;pending=own;
    try{
      const data=await fetchSnapshot(ctx.slotId,own.signal);
      if(disposed||own.signal.aborted||requestKey!==contextKey||data.slotId!==context().slotId)return;
      snapshot=data;receivedAt=now();offline=false;publish();
    }catch(error){if(!disposed&&!own.signal.aborted&&requestKey===contextKey){offline=true;publish();}}
    finally{if(pending===own)pending=null;}
  }
  return {tick,view,reset,dispose(){disposed=true;reset();}};
}
