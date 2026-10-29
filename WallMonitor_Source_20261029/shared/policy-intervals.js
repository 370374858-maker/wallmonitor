export const POLICY_INTERVALS = Object.freeze([
  Object.freeze({name:'浇筑导管埋深',max:100,
    normalMin:'tremieNormalMin',normalMax:'tremieNormalMax',warningMin:'tremieWatchMin',warningMax:'tremieWatchMax'}),
  Object.freeze({name:'浇筑上升速度',max:1000,
    normalMin:'speedWatchBelow',normalMax:'speedNormalMax',warningMin:'speedDangerBelow',warningMax:'speedWatchMax'})
]);

export function policyIntervalIssues(values) {
  const issues={};
  for(const group of POLICY_INTERVALS){
    const {name,max,normalMin,normalMax,warningMin,warningMax}=group;
    const labels={[normalMin]:'正常区间下限',[normalMax]:'正常区间上限',[warningMin]:'预警区间下限',[warningMax]:'预警区间上限'};
    for(const [key,label] of Object.entries(labels)){
      if(!Number.isFinite(values[key])||values[key]<0||values[key]>max)issues[key]=`${name}：${label}须为 0～${max} 之间的数字`;
    }
    if(Object.keys(labels).some(key=>issues[key]))continue;
    if(values[normalMin]>values[normalMax])issues[normalMin]=`${name}：正常区间下限不能大于上限`;
    if(values[warningMin]>values[warningMax])issues[warningMin]=`${name}：预警区间下限不能大于上限`;
    if(values[normalMin]<values[warningMin])issues[normalMin]=`${name}：正常区间下限不能低于预警区间下限`;
    if(values[normalMax]>values[warningMax])issues[normalMax]=`${name}：正常区间上限不能超过预警区间上限`;
  }
  return issues;
}
