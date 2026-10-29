                                                                                 
                                                           
const time=value=>typeof value==='string'?Date.parse(value.replace(' ','T')+'+08:00'):NaN;
const pours=rows=>rows.flatMap(row=>row.pouringEvents||[]).filter(p=>Number.isFinite(time(p.endedAt))&&Number.isFinite(p.cumulativeVolume));
export function heightVolumeRows(slot,rows,allRows=rows){
  const theory=pours(rows).map(p=>({...p,kind:'theory',theoreticalHeight:slot.area>0?(slot.initialConcreteHeight??0)+p.cumulativeVolume/slot.area:null}));
                                                                                   
  const byTime=new Map();
  for(const p of pours(allRows)){
    const at=time(p.endedAt),previous=byTime.get(at);
    if(!previous||p.cumulativeVolume>previous.cumulativeVolume)byTime.set(at,{...p,at});
  }
  const anchors=[...byTime.values()].sort((a,b)=>a.at-b.at);
  const measured=[],unmapped=[],seen=new Set();
  for(const row of rows){
                                                                                   
    if(row.endedAt!==row.measurementAt||!Number.isFinite(row.actualHeight)||seen.has(row.measurementAt))continue;
    const at=time(row.measurementAt);if(!Number.isFinite(at))continue;
    seen.add(row.measurementAt);
    let lo=0,hi=anchors.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(anchors[mid].at<at)lo=mid+1;else hi=mid;}
    const after=anchors[lo],before=anchors[lo-1];
    const point={kind:'measured',measurementAt:row.measurementAt,actualHeight:row.actualHeight,cumulativeVolume:null,volumeInterpolated:false};
    if(after?.at===at){
      point.cumulativeVolume=after.cumulativeVolume;
      point.pourStart=point.pourEnd=after.endedAt;
    }else if(before&&after){
      point.cumulativeVolume=before.cumulativeVolume+(after.cumulativeVolume-before.cumulativeVolume)*(at-before.at)/(after.at-before.at);
      point.pourStart=before.endedAt;point.pourEnd=after.endedAt;point.volumeInterpolated=true;
    }
    if(point.cumulativeVolume===null)unmapped.push(point);else measured.push(point);
  }
  measured.sort((a,b)=>time(a.measurementAt)-time(b.measurementAt));
  return {theory,measured,unmapped};
}
export function heightVolumeTooltip(point){
  if(!point)return '';
  const number=v=>Number.isFinite(v)?v.toFixed(2):'—';
  if(point.kind==='measured')return [
    `测量时间：${point.measurementAt}`,
    `实测高度：${number(point.actualHeight)} m（原始实测值）`,
    `${point.volumeInterpolated?'等效浇筑方量（按时间插值）':'已浇筑方量'}：${number(point.cumulativeVolume)} m³`,
    point.volumeInterpolated?`方量插值区间：${point.pourStart} 至 ${point.pourEnd}`:''
  ].filter(Boolean).join('\n');
  return [`浇筑车号：${point.truckNo??'—'}`,`浇筑时间：${point.endedAt}`,
    `已浇筑方量：${number(point.cumulativeVolume)} m³`,`理论高度：${number(point.theoreticalHeight)} m`].join('\n');
}
