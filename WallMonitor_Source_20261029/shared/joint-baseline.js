import {calculateSlot,sidesFor,ValidationError} from './construction.js';
import {beijingTime,timeMs} from './monitoring.js';
import {jointDepthPending} from './joint-depth-state.js';

export function planJointBaseline(slot,events,input,{source='device',now=Date.now()}={}){
  const issues={},sides=sidesFor(slot.jointLayout),initialization=structuredClone(slot.jointDepthInitialization??{});
  const activeOperations=side=>events.some(e=>e.status!=='void'&&e.type==='joint'&&e.payload.pulls.some(p=>p.pipeId===side));
  if(!sides.length)issues.depths='槽段未配置接头管';
  const depths={...slot.jointInitialDepths};let reason,initializedDepths={};
  if(input.action==='use-platform-depths'){
    if(source==='device')issues.action='平台初始管深只能由管理员设置';
    if(!input.depths||typeof input.depths!=='object'||Array.isArray(input.depths)||Object.keys(input.depths).length!==sides.length)issues.depths='须填写所有已配置接头管的初始管深';
    for(const [side,value]of Object.entries(input.depths??{})){
      if(!sides.includes(side)||!Number.isFinite(value)||value<=0||value>1000000)issues[`depths.${side}`]='初始管深必须大于0且不超过1000000米';
      else depths[side]=initializedDepths[side]=value;
    }
    initialization.mode='platform-initial-depth';
    initialization.sides=Object.fromEntries(sides.map(side=>[side,{state:'ready',depth:depths[side]}]));
    reason='按平台初始管深与累计拔管记录计算管底位置；源库管深仅判断动作变化';
  }else if(input.action==='arm'){
    if(source==='device')issues.action='自动初始化只能由管理员启用';
    if(initialization.mode)issues.action='该槽段已启用自动初始化，不可重复重置';
    if(sides.some(activeOperations))issues.action='已有接头管操作，不能重置初始管底位置';
    initialization.mode='source-first-depth';initialization.sides=Object.fromEntries(sides.map(side=>[side,{state:'pending'}]));
    reason='启用设备首次有效管底测深自动初始化；等待期间不采用暂定初始管深';
  }else{
    if(input.action!=null&&input.action!=='initialize')issues.action='初始化操作无效';
    if(initialization.mode!=='source-first-depth')issues.depths='槽段未启用设备初始管底测深接入';
    if(!input.depths||typeof input.depths!=='object'||Array.isArray(input.depths)||!Object.keys(input.depths).length)issues.depths='缺少初始管底测深';
    const stamp=timeMs(input.observedAt);
    if(!Number.isFinite(stamp)||!/[TZ]|[+-]\d\d:\d\d$/.test(input.observedAt||'')||stamp>now+30000)issues.observedAt='初始管深时间须为有效带时区时间，且不得超前超过30秒';
    for(const [side,value]of Object.entries(input.depths??{})){
      if(!sides.includes(side))issues[`depths.${side}`]='接头管未配置';
      else if(!jointDepthPending(slot,side))issues[`depths.${side}`]='该侧初始管深已经确定，不能自动覆盖';
      else if(activeOperations(side))issues[`depths.${side}`]='该侧已有拔管操作，不能覆盖初始位置';
      if(!Number.isFinite(value)||value<=0||value>1000000)issues[`depths.${side}`]='首次有效管底测深必须大于0且不超过1000000米';
      if(!Object.keys(issues).length||!issues[`depths.${side}`]){
        depths[side]=value;initializedDepths[side]=value;
        initialization.sides??={};initialization.sides[side]={state:'ready',depth:value,observedAt:Number.isFinite(stamp)?beijingTime(stamp):null};
      }
    }
    reason='设备首次有效管底测深自动初始化：'+Object.entries(initializedDepths).map(([side,depth])=>`${side}=${depth} m`).join('，');
  }
  if(Object.keys(issues).length)throw new ValidationError(issues);
  const next={...slot,...calculateSlot({...slot,jointInitialDepths:depths}),jointDepthInitialization:initialization};
  return {next,reason,initializedDepths,pendingSides:sides.filter(side=>jointDepthPending(next,side))};
}
