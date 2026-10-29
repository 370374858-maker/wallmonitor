import {calculateSlot,ValidationError} from './construction.js';
import {replayEvents} from './events.js';
import {timeMs,beijingTime} from './monitoring.js';

export function planSlotSurvey(slot,events,input,{now=Date.now()}={}){
 const issues={},stamp=timeMs(input.observedAt);
 if(!Number.isFinite(input.depth)||input.depth<=0||input.depth>10000)issues.depth='实测槽深必须是大于0且不超过10000米的有效数字';
 if(input.rawDepth!=null&&(!Number.isFinite(input.rawDepth)||input.rawDepth<=0||Math.abs(input.rawDepth-input.depth)>.000050001))issues.rawDepth='原始槽深与四位小数槽深不一致';
 if(!Number.isFinite(stamp)||!/[TZ]|[+-]\d\d:\d\d$/.test(input.observedAt||'')||stamp>now+30000)issues.observedAt='实测槽深时间须为有效带时区时间，且不得超前超过30秒';
 if(input.sourceRow&&(!/^DA1_\d+_\d+_\d{8}$/.test(input.sourceRow.table??'')||!/^\d{1,20}$/.test(input.sourceRow.id??'')))issues.sourceRow='实测槽深源行标识无效';
 if(Object.keys(issues).length)throw new ValidationError(issues);
 const previous=slot.slotDepthSurvey;
 if(input.depth===previous?.depth)return {next:slot,changed:false,stateChanged:false,reason:null,skippedReason:'source-unchanged'};
 const sameTable=previous?.sourceRow?.table&&previous.sourceRow.table===input.sourceRow?.table;
 if(previous&&(stamp<timeMs(previous.observedAt)||sameTable&&BigInt(input.sourceRow.id)<=BigInt(previous.sourceRow.id)))return {next:slot,changed:false,stateChanged:false,reason:null,skippedReason:'older-source-row'};
 const changed=input.depth!==slot.depth;
 const next={...slot,...(changed?calculateSlot({...slot,depth:input.depth}):{}),slotDepthSurvey:{rawDepth:input.rawDepth??input.depth,depth:input.depth,observedAt:beijingTime(stamp),sourceRow:input.sourceRow??null}};
                                                                             
                                                                                
 replayEvents(next,events);
 const source=input.sourceRow?`；源表 ${input.sourceRow.table}，记录 Id ${input.sourceRow.id}`:'';
 return {next,changed,stateChanged:true,reason:`自动更新槽深 R31：${slot.depth} → ${input.depth} m；源数据时间 ${beijingTime(stamp)}${source}`};
}
