import { round, sidesFor, ValidationError, pipeEmbedment } from './construction.js';
import {tremieLabel} from './pipe-labels.js';
import {policyIntervalIssues} from './policy-intervals.js';

export const MONITORING_VERSION = 'measured-front-monitor-v5-joint-concrete-faces';
                                                                              
                                                                                
export const DEFAULT_POLICY = Object.freeze({
  revision: 0, settingHours: 8, emptyAtStart: false,
  tremieWatchMin: 0, tremieNormalMin: 0, tremieNormalMax: 6, tremieWatchMax: 6,
  jointReference: 'actual', jointMin: 0, jointMax: 48, fillMin: .98, fillMax: 1.1,
  speedDangerBelow: 4, speedWatchBelow: 5, speedNormalMax: 7, speedWatchMax: 8,
  leftPressureWatchAbove:0,leftPressureDangerAbove:26,rightPressureWatchAbove:0,rightPressureDangerAbove:26,
  confirmed: false, basis: '2026-10-21 项目默认值：导管埋深≤6 m、接头管相对当前混凝土面埋深≤48 m、龄期8 h、起拔压力≤26 MPa；速度5～7正常，4～5及7～8预报，其余预警；扩孔（充盈）系数0.98～1.10', changedAt: null
});

export const timeMs = value => typeof value === 'string'
  ? Date.parse(value.includes('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : value.replace(' ', 'T') + '+08:00') : NaN;
export const beijingTime = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const finite = Number.isFinite;
const difference = pipeEmbedment;

function initialSettingBaseline(slot, common) {
  const height = slot?.initialConcreteHeight ?? 0;
  if (!finite(height) || !finite(slot?.depth) || height < 0 || height > slot.depth) return null;
  if (height === 0) return false;
  return { ...common, key:'initial', estimated:false, depth:round(slot.depth-height), height:round(height),
    reason:'槽段建档已确认的初始混凝土，按已初凝基线展示；不推算其上的新浇段' };
}

export function policyFor(slot) {
  const saved = slot?.monitoringPolicy || {};
  const p=Object.fromEntries(Object.entries(DEFAULT_POLICY).map(([key,value]) => [key,
    ['speedNormalMax','speedWatchMax'].includes(key)&&Object.hasOwn(saved,key)?saved[key]:saved[key]??value]));
                                                                           
                                                                              
                                                                             
  if(saved.jointReference!=='actual'){p.jointMin=DEFAULT_POLICY.jointMin;p.jointMax=DEFAULT_POLICY.jointMax;}
  p.jointReference='actual';
                                                                            
  if(!Object.hasOwn(saved,'speedNormalMax')&&!Object.hasOwn(saved,'speedWatchMax')&&(Object.hasOwn(saved,'speedDangerBelow')||Object.hasOwn(saved,'speedWatchBelow'))){p.speedNormalMax=null;p.speedWatchMax=null;}
  return p;
}

export function validatePolicy(input) {
  const issues = {}, out = {};
  const ranges = { settingHours: [.01, 168],
    tremieWatchMin: [0, 100], tremieNormalMin: [0, 100], tremieNormalMax: [0, 100], tremieWatchMax: [0, 100],
    jointMin: [-100, 100], jointMax: [-100, 100], fillMin: [.01, 10], fillMax: [.01, 10],
    speedDangerBelow: [0, 1000], speedWatchBelow: [0, 1000],
    leftPressureWatchAbove:[0,1000000],leftPressureDangerAbove:[0,1000000],rightPressureWatchAbove:[0,1000000],rightPressureDangerAbove:[0,1000000] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const v = key.includes('Pressure')?(input[key]??DEFAULT_POLICY[key]):input[key];
    if (!finite(v) || v < min || v > max) issues[key] = `${key} 必须为 ${min}～${max} 之间的数字`;
    out[key] = v;
  }
  out.jointReference='actual';
  if(input.jointReference!=null&&input.jointReference!=='actual')issues.jointReference='接头管埋深统一以当前混凝土面为准，请刷新页面后重新设置';
  if (!(out.jointMin < out.jointMax)) issues.jointMax = '接头管下限必须小于上限';
  if (!(out.fillMin < out.fillMax)) issues.fillMax = '充盈系数下限必须小于上限';
  out.speedNormalMax=input.speedNormalMax??null;out.speedWatchMax=input.speedWatchMax??null;
  Object.assign(issues,policyIntervalIssues(out));
  for(const side of ['left','right']){
    const watch=out[side+'PressureWatchAbove'],danger=out[side+'PressureDangerAbove'];
    if(!(watch===0&&danger>=0)&&!(watch>0&&danger>watch))issues[side+'PressureDangerAbove']='预报填 0 时可只设置最大允许压力；两级阈值须满足预警上限大于预报上限，均为 0 表示未设置';
  }
  for (const key of ['confirmed', 'emptyAtStart']) {
    if (typeof input[key] !== 'boolean') issues[key] = '确认选项必须为布尔值';
    out[key] = input[key];
  }
  out.basis = typeof input.basis === 'string' ? input.basis.trim() : '';
  if (out.basis.length < 4 || out.basis.length > 500) issues.basis = '请填写 4～500 字的参数依据／修改说明';
  if (Object.keys(issues).length) throw new ValidationError(issues);
  return out;
}

const state = (key, label) => ({ key, label });
export function classify(value, kind, p = DEFAULT_POLICY) {
  if (!finite(value)) return state('muted', '待判定');
  if(kind.startsWith('pressure-')){
    const side=kind.slice(9),watch=p[side+'PressureWatchAbove'],danger=p[side+'PressureDangerAbove'];
                                                                           
                                                                                
    if(watch===0&&danger>0)return value>danger?state('danger','预警'):state('ok','正常');
    if(!(watch>0&&danger>watch))return state('muted','阈值待设置');
    return value>=danger?state('danger','预警'):value>=watch?state('warn','预报'):state('ok','正常');
  }
  if (kind === 'tremie') {
    if (value >= p.tremieNormalMin && value <= p.tremieNormalMax) return state('ok', '正常');
    if (value >= p.tremieWatchMin && value <= p.tremieWatchMax) return state('warn', '预报');
    return state('danger', '预警');
  }
  if (kind === 'joint') return value >= p.jointMin && value <= p.jointMax ? state('ok', '正常') : state('danger', '预警');
  if (kind === 'fill') return value >= p.fillMin && value <= p.fillMax ? state('ok', '正常') : state('danger', '预警');
  if (kind === 'speed') {
    if(finite(p.speedNormalMax)&&finite(p.speedWatchMax))return value<p.speedDangerBelow||value>p.speedWatchMax?state('danger','预警')
      :value<p.speedWatchBelow||value>p.speedNormalMax?state('warn','预报'):state('ok','正常');
    return value < p.speedDangerBelow ? state('danger', '预警') : value < p.speedWatchBelow ? state('warn', '预报') : state('ok', '正常');
  }
  return state('muted', '参考值');
}

                                                                                      
                                                                               
                                                                                 
   
export function estimateSetting(slot, records, asOfMs, p = policyFor(slot)) {
  const cutoff = asOfMs - p.settingHours * 3600000;
  const common = { method: 'measured-depth-delayed-front', settingHours: p.settingHours,
    cutoffAt: beijingTime(cutoff), estimated: true, depth: null, height: null, recordId: null, truckNo: null, fraction: null };
  const unknown = (key, reason) => ({ ...common, key, reason });
  const baseline = initialSettingBaseline(slot, common);
  if (baseline === null) return unknown('unknown', '初始混凝土高度无效，无法定位初凝基线');
  if (!records.length) return baseline || unknown('unknown', '没有可展示的完整施工记录');
  let previousHeight = baseline ? baseline.height : 0, previousEnd = null, candidate = null;
  for (let i = 0; i < records.length; i++) {
    const row = records[i], end = timeMs(row.endedAt), start = timeMs(row.startedAt);
    const height = row.metrics.actualHeight;
    if (!finite(height) || height < 0 || height > slot.depth || !finite(end) || !finite(start) || end <= start ||
        (previousEnd !== null && end <= previousEnd)) return unknown('unknown', '历史测量或时间无效，无法定位初凝面');
    if (height < previousHeight - 1e-7) return unknown('unknown', '历史实测面曾回落，层序不再单调，需复核后才能估算初凝面');
    const intervalStart = Math.max(start, previousEnd ?? start);
    if (cutoff >= end) candidate = { height, fraction: 1, row, intervalStart, end, held: true };
    else if (cutoff >= intervalStart) {
      if (i === 0 && !p.emptyAtStart) return baseline || unknown('unknown', '首车尚缺槽底零高度基线确认，不推算首车内初凝面');
      const fraction = (cutoff - intervalStart) / (end - intervalStart);
      candidate = { height: previousHeight + (height - previousHeight) * fraction, fraction, row, intervalStart, end, held: false };
    }
    previousHeight = height;
    previousEnd = end;
  }
  if (!candidate || candidate.height <= (baseline ? baseline.height : 0)) return baseline || unknown('pending', '按入槽后龄期规则尚未形成可定位的初凝面');
  return { ...common, key: 'estimated', depth: round(slot.depth - candidate.height), height: round(candidate.height),
    recordId: candidate.row.id, truckNo: candidate.row.truckNo, fraction: round(candidate.fraction),
    intervalStart: beijingTime(candidate.intervalStart), intervalEnd: beijingTime(candidate.end),
    reason: candidate.held ? '采用已测得的面高；停浇间隔内保持，不向上外推' : '在相邻实测面之间按有效浇筑时段线性插值' };
}

                                                                                
                                                                                
                                                                     
   
export function createSettingHistory(slot) {
  const intervals = [];
  const initialHeight = slot?.initialConcreteHeight ?? 0;
  const validInitial = finite(initialHeight) && finite(slot?.depth) && initialHeight >= 0 && initialHeight <= slot.depth;
  let count = 0, invalid = validInitial ? null : { index:-1, reason:'初始混凝土高度无效，无法定位初凝基线' };
  let previousHeight = validInitial ? initialHeight : 0, previousEnd = null;
  return {
    append(row) {
      const index = count++;
      if (invalid) return;
      const end = timeMs(row.endedAt), start = timeMs(row.startedAt), height = row.metrics.actualHeight;
      if (!finite(height) || height < 0 || height > slot.depth || !finite(end) || !finite(start) || end <= start ||
          (previousEnd !== null && end <= previousEnd)) invalid = { index, reason: '历史测量或时间无效，无法定位初凝面' };
      else if (height < previousHeight - 1e-7) invalid = { index, reason: '历史实测面曾回落，层序不再单调，需复核后才能估算初凝面' };
      if (invalid) return;
      intervals.push({ row, height, previousHeight, end, intervalStart: Math.max(start, previousEnd ?? start) });
      previousHeight = height; previousEnd = end;
    },
    estimate(asOfMs, p = policyFor(slot)) {
      const cutoff = asOfMs - p.settingHours * 3600000;
      const common = { method:'measured-depth-delayed-front', settingHours:p.settingHours,
        cutoffAt:beijingTime(cutoff), estimated:true, depth:null, height:null, recordId:null, truckNo:null, fraction:null };
      const unknown = (key, reason) => ({ ...common, key, reason });
      const baseline = initialSettingBaseline(slot, common);
      if (baseline === null) return unknown('unknown', '初始混凝土高度无效，无法定位初凝基线');
      if (!count) return baseline || unknown('unknown', '没有可展示的完整施工记录');
      const first = intervals[0];
                                                                                  
                                                                  
      if (first && !p.emptyAtStart && cutoff >= first.intervalStart && cutoff < first.end) {
        return baseline || unknown('unknown', '首车尚缺槽底零高度基线确认，不推算首车内初凝面');
      }
      if (invalid) return unknown('unknown', invalid.reason);
      let low = 0, high = intervals.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (intervals[middle].intervalStart <= cutoff) low = middle + 1; else high = middle;
      }
      const segment = intervals[low - 1];
      if (!segment) return baseline || unknown('pending', '按入槽后龄期规则尚未形成可定位的初凝面');
      const held = cutoff >= segment.end;
      const fraction = held ? 1 : (cutoff - segment.intervalStart) / (segment.end - segment.intervalStart);
      const height = held ? segment.height : segment.previousHeight + (segment.height - segment.previousHeight) * fraction;
      if (height <= (baseline ? baseline.height : 0)) return baseline || unknown('pending', '按入槽后龄期规则尚未形成可定位的初凝面');
      return { ...common, key:'estimated', depth:round(slot.depth-height), height:round(height),
        recordId:segment.row.id, truckNo:segment.row.truckNo, fraction:round(fraction),
        intervalStart:beijingTime(segment.intervalStart), intervalEnd:beijingTime(segment.end),
        reason:held ? '采用已测得的面高；停浇间隔内保持，不向上外推' : '在相邻实测面之间按有效浇筑时段线性插值' };
    }
  };
}

export function evaluateRecord(slot, records, asOfMs, p = policyFor(slot), settingEstimate = null) {
  if(p.jointReference!=='actual')p=policyFor({monitoringPolicy:p});
  const row = records.at(-1), m = row?.metrics;
  const setting = settingEstimate ?? estimateSetting(slot, records, asOfMs, p), indicators = [];
  const add = (id, label, value, kind, unit = 'm') => {
    const item = { id, name: label, value: finite(value) ? value : null, unit, kind, ...classify(value, kind, p) };
    indicators.push(item); return item;
  };
  const tremies = Array.from({ length: slot.tremieCount }, (_, i) => ({
    index: i + 1, label:tremieLabel(slot,i), depth: m?.tremieDepths[i] ?? null,
    actual: add(`t${i + 1}-actual`, `浇筑管 ${tremieLabel(slot,i)} · 实测埋深`, difference(m?.tremieDepths[i], m?.actualDepth), 'tremie'),
    theory: add(`t${i + 1}-theory`, `浇筑管 ${tremieLabel(slot,i)} · 理论埋深`, difference(m?.tremieDepths[i], m?.theoreticalDepth), 'tremie')
  }));
  const joints = sidesFor(slot.jointLayout).map(side => {
    const label=side==='left'?'左接头管':'右接头管',depth=m?.jointDepths[side]??null;
    const actual=difference(depth,m?.actualDepth),theory=difference(depth,m?.theoreticalDepth),settingValue=difference(depth,setting.depth);
    return {side,label,depth,actual,theory,reference:'actual',
      actualStatus:add(`j-${side}`,`${label} · 实测混凝土埋深`,actual,'joint'),
      theoryStatus:add(`j-${side}-theory`,`${label} · 理论混凝土埋深`,theory,'joint'),
      setting:{value:settingValue,unit:'m',kind:'reference',key:'muted',label:'龄期参考'}};
  });
  const speed = { actual: add('speed-actual', '实测上升速度', m?.actualSpeed, 'speed', 'm/h'),
    theory: add('speed-theory', '理论上升速度', m?.theoreticalSpeed, 'speed', 'm/h') };
  const fill = add('fill', '扩孔系数', m?.fillCoefficient, 'fill', '');
  const jointPressure=Object.fromEntries(sidesFor(slot.jointLayout).map(side=>{
    const pressure=add(`pressure-${side}`,`${side==='left'?'左':'右'}接头管拔管压力`,m?.jointPressures?m.jointPressures[side]:(m?1:null),`pressure-${side}`,'MPa');
    pressure.sourceAt=m?.jointPressureAt?.[side]??null;pressure.backfilled=m?.jointPressureBackfilled?.[side]??true;return [side,pressure];
  }));
  const counts = Object.fromEntries(['danger', 'warn', 'ok', 'muted'].map(key => [key, indicators.filter(v => v.key === key).length]));
  const overall = counts.danger ? state('danger', '存在预警') : counts.warn ? state('warn', '存在预报') : counts.muted ? state('muted', '指标待判定') : state('ok', '阈值内');
  return { version: MONITORING_VERSION, evaluatedAt: beijingTime(asOfMs), policy: p,
    setting, tremies, joints, speed, fill, jointPressure, indicators, counts, overall };
}

export function buildMonitor(slot, allRecords, asOfMs = Date.now()) {
  const p = policyFor(slot);
  const records = allRecords.filter(r => finite(timeMs(r.endedAt))).sort((a, b) => timeMs(a.endedAt) - timeMs(b.endedAt));
  const futureCount = records.filter(r => timeMs(r.endedAt) > asOfMs).length;
  const invalidTimeCount = allRecords.length - records.length;
  const latest = records.at(-1) ?? null;
                                                                                 
                                                                                   
  const preview = futureCount > 0;
  const evaluationAt = preview ? timeMs(latest.endedAt) : asOfMs;
  const evaluation = evaluateRecord(slot, records, evaluationAt, p);
  const issues = [];
  if (!p.confirmed) issues.push('当前为旧版规则试运行，阈值与入槽后初凝时长尚待现场校准。');
  if (!latest) issues.push('该槽段没有可展示的完整记录，未用演示值补齐。');
  if (futureCount) issues.push(`${futureCount} 条未来时间记录已展示；按最新记录时刻 ${latest.endedAt} 预览评价，不代表当前现场状态。`);
  if (invalidTimeCount) issues.push(`${invalidTimeCount} 条记录时间无法解析，已排除当前评价。`);
  if (records.some(r => r.metrics.actualSpeed < 0 && r.metrics.actualSpeed !== null)) issues.push('历史存在实测面回落；初凝估算已停止，需核查测量记录。');
  if (records.some((r, i) => i > 0 && timeMs(r.startedAt) < timeMs(records[i - 1].endedAt))) issues.push('存在跨车时段重叠；初凝插值从前一测量时刻开始，不能细分各车混合物。');
  for (const note of latest?.metrics.notes ?? []) issues.push(note);
  const status = preview ? state('muted', '未来时间预览') : !latest || invalidTimeCount ? state('muted', '等待数据')
    : !p.confirmed ? state('warn', '规则待校准') : evaluation.overall;
  const actions = evaluation.indicators.filter(v => v.key === 'danger' || v.key === 'warn').map(v => ({ ...v,
    action: v.kind === 'tremie' ? '复测混凝土面与管底位置，核对累计拔管记录；由技术负责人按批准方案处置。'
      : v.kind === 'joint' ? '复核当前混凝土面、接头管底位置与埋深上限。'
      : v.kind === 'fill' ? '复核本车／累计方量、六点测深和有效截面积，排查记录偏差及施工异常。'
      : '核对起止时刻、方量和相邻测量间隔，结合供料与现场工况判断；不是瞬时流速。' }));
  const trend = records.map(r => ({ id: r.id, truckNo: r.truckNo, endedAt: r.endedAt, volume: r.volume,
    actualDepth: r.metrics.actualDepth, theoreticalDepth: r.metrics.theoreticalDepth,
    actualHeight: r.metrics.actualHeight, actualSpeed: r.metrics.actualSpeed, theoreticalSpeed: r.metrics.theoreticalSpeed,
    cumulativeVolume: r.metrics.cumulativeVolume, measurementVolume: r.metrics.measurementVolume,
    fillCoefficient: r.metrics.fillCoefficient, points: r.measurementPoints }));
  return { slot, asOf: beijingTime(asOfMs), displayMode: preview ? 'future-preview' : 'current', latest, evaluation, status, issues: [...new Set(issues)], actions,
    freshness: { futureCount, invalidTimeCount }, total: allRecords.length,
    displayedCount: records.length, eligibleCount: records.length - futureCount,
    trend, provenance: { database: 'diaphragm_wall_monitor', tables: ['cw_slot', 'cw_record'],
      mode: '最新保存记录按当前策略只读复算；未来时间按记录时刻预览；新提交附带提交时评价快照', datum: '从槽口向下测深', timezone: 'Asia/Shanghai' } };
}
