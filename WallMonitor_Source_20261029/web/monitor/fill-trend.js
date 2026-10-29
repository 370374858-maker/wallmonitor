const time=value=>typeof value==='string'?Date.parse(value.replace(' ','T')+'+08:00'):NaN;
                                                                                
                                                                              
export function fillTrendRows(slot,rows,allRows=rows){
  const pours=allRows.flatMap(row=>row.pouringEvents||[])
    .filter(p=>Number.isFinite(time(p.endedAt))&&Number.isFinite(p.cumulativeVolume))
    .sort((a,b)=>time(a.endedAt)-time(b.endedAt)||a.cumulativeVolume-b.cumulativeVolume);
  const seen=new Set(),points=[];
  for(const row of rows){
    if(row.endedAt!==row.measurementAt||!Number.isFinite(row.actualHeight)||seen.has(row.measurementAt))continue;
    const at=time(row.measurementAt);if(!Number.isFinite(at))continue;
    seen.add(row.measurementAt);
    let lo=0,hi=pours.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(time(pours[mid].endedAt)<at)lo=mid+1;else hi=mid;}
    const prior=pours[lo-1],initial=slot.initialConcreteHeight??0;
    const measurementVolume=slot.area>0?(row.actualHeight-initial)*slot.area:null;
    const fillCoefficient=prior&&measurementVolume>0?prior.cumulativeVolume/measurementVolume:null;
    points.push({...row,truckNo:prior?.truckNo??null,pouringId:prior?.id??null,
      cumulativeVolume:prior?.cumulativeVolume??null,measurementVolume,
      theoreticalHeight:prior&&slot.area>0?initial+prior.cumulativeVolume/slot.area:null,
      fillCoefficient,fillCoefficientCurrent:Number.isFinite(fillCoefficient),
      fillCoefficientPouringAt:prior?.endedAt??null,fillCoefficientMeasurementAt:row.measurementAt,
      fillCoefficientTimeGapHours:prior?(at-time(prior.endedAt))/3600000:null,
      fillCoefficientTimeGapExceeded:prior?(at-time(prior.endedAt))>3600000:false,
      fillCoefficientReason:!prior?'测量之前暂无已完成浇筑记录':!(measurementVolume>0)?'实测高度相对初始面的折算方量非正，无法计算':''});
  }
  return points.sort((a,b)=>time(a.measurementAt)-time(b.measurementAt));
}

export function fillPointTooltip(row) {
  if (!row) return '';
  const value=(v,unit='')=>Number.isFinite(v)?`${v.toFixed(2)}${unit}`:'暂无有效数据';
  return [`实测时间：${row.measurementAt || '暂无测量'}`,`实际浇筑高度：${value(row.actualHeight,' m')}`,
    `实测深度（槽口向下）：${value(row.actualDepth,' m')}`,`扩孔系数：${value(row.fillCoefficient)}`,`采用浇筑车号：${row.truckNo ?? '—'}`,
    `采用浇筑时间：${row.fillCoefficientPouringAt || '暂无匹配记录'}`,
    `采用累计浇筑方量：${value(row.cumulativeVolume,' m³')}`,`对应理论高度：${value(row.theoreticalHeight,' m')}`,
    row.fillCoefficientReason||''].filter(Boolean).join('\n');
}

export function fillSourceLabel(row) {
  const gap = Number.isFinite(row.fillCoefficientTimeGapHours)
    ? `；时间差 ${row.fillCoefficientTimeGapHours.toFixed(2)} h` : '';
  return `浇筑 ${row.fillCoefficientPouringAt || '暂无记录'}；实测 ${row.fillCoefficientMeasurementAt || row.measurementAt || '暂无记录'}${gap}${row.fillCoefficientTimeGapExceeded ? '（超过 1 小时）' : ''}${row.fillCoefficientReason ? `；${row.fillCoefficientReason}` : ''}`;
}
