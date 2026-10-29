                                                                                        
const ms=value=>Date.parse(/[Zz]$|[+-]\d\d:\d\d$/.test(value||'')?value:String(value||'').replace(' ','T')+'+08:00');
const start=e=>ms(e.payload?.startedAt),end=e=>ms(e.payload?.endedAt||e.occurredAt);
export function inspectPouringInsertion(events,candidate){
  const pours=events.filter(e=>e.type==='pouring'&&e.status!=='void'&&e.id!==candidate.id);
  const from=start(candidate),to=end(candidate);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)throw Object.assign(new Error('浇筑开始时间必须早于结束时间'),{status:422});
  const latestEnd=pours.reduce((max,e)=>Math.max(max,end(e)),-Infinity);
  const conflicts=pours.filter(e=>from<end(e)&&to>start(e));
  const insertion=from<latestEnd;
  const position=pours.filter(e=>start(e)<from).length+1;
  return {insertion,position,conflicts,latestEnd:latestEnd===-Infinity?null:latestEnd};
}
export function pouringConflictMessage(conflicts){
  return '浇筑时间与'+conflicts.map(e=>`第 ${e.payload.truckNo} 车（${e.payload.startedAt} 至 ${e.payload.endedAt||e.occurredAt}）`).join('、')+'重叠，请调整开始或结束时间。';
}
export function planPouringChange(events,candidate,{confirmed=false,preview=false}={}){
  const before=new Map(events.map(e=>[e.id,e]));
  if(candidate.type!=='pouring')return {events:[...events.filter(e=>e.id!==candidate.id),candidate],renumbered:[],insertion:false};
  const original=before.get(candidate.id);
  const timeChanged=!original||start(original)!==start(candidate)||end(original)!==end(candidate);
  const info=candidate.status==='void'?{insertion:false,conflicts:[]}:inspectPouringInsertion(events,candidate);
  if(info.insertion&&timeChanged&&!confirmed&&!preview)throw Object.assign(new Error('检测到历史浇筑插入，请确认插入后再保存；本次未写入。'),{status:409});
  if(info.conflicts.length)throw Object.assign(new Error(pouringConflictMessage(info.conflicts)),{status:422});
  const next=[...events.filter(e=>e.id!==candidate.id),candidate];
  const sorted=next.filter(e=>e.type==='pouring'&&e.status!=='void').sort((a,b)=>start(a)-start(b)||end(a)-end(b)||String(a.id).localeCompare(String(b.id)));
  const numbers=new Map(sorted.map((e,i)=>[e.id,i+1]));
  const renumbered=[];
  const ordered=next.map(e=>{
    if(!numbers.has(e.id)||e.payload.truckNo===numbers.get(e.id))return e;
    const old=before.get(e.id),after={...e,payload:{...e.payload,truckNo:numbers.get(e.id)}};
    if(old)renumbered.push({id:e.id,from:old.payload.truckNo,to:after.payload.truckNo});
    return after;
  });
  return {events:ordered,renumbered,insertion:info.insertion,position:numbers.get(candidate.id)||null};
}
