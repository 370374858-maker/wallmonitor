                                                                         
export const tremieLabel=(slot,index)=>String(slot?.tremieLabels?.[index]??index+1);
export const pipeLabel=(slot,id)=>/^t[1-3]$/.test(id)?`浇筑管 ${tremieLabel(slot,Number(id.slice(1))-1)}`:id==='left'?'左接头管':'右接头管';
export function normalizeTremieLabels(values,count,issues){
 const raw=values==null?Array.from({length:count},(_,i)=>String(i+1)):Array.isArray(values)?values.map(v=>String(v).trim()):[];
 if(raw.length!==count)issues.tremieLabels='每个浇筑管位置必须填写一个序号';
 const labels=raw.map((v,i)=>{
   if(!/^\d{1,16}$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<=0){issues[`tremieLabels.${i}`]='浇筑管序号必须为正整数';return v;}
   return String(Number(v));
 });
 const positions=new Map();
 labels.forEach((v,i)=>{if(positions.has(v)){issues.tremieLabels='同一槽段的浇筑管序号不能重复';issues[`tremieLabels.${i}`]=issues.tremieLabels;issues[`tremieLabels.${positions.get(v)}`]=issues.tremieLabels;}else positions.set(v,i);});
 return labels;
}
