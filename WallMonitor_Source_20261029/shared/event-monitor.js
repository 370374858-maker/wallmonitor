import { replayEvents } from './events.js';
import { beijingTime, timeMs, policyFor, evaluateRecord } from './monitoring.js';
import { round } from './construction.js';

export const EVENT_LABELS = Object.freeze({ pouring: '浇筑', measurement: '测量', tremie: '浇筑管拔管', joint: '接头管拔管' });

                                                                             
                                                                                 
                                                                           
export function estimateEventSetting(slot, events, asOfMs, policy = policyFor(slot)) {
  const initial = slot.initialConcreteHeight ?? 0;
  const cutoff = asOfMs - policy.settingHours * 3600000;
  const common = { method: 'independent-measurement-delayed-front', settingHours: policy.settingHours,
    cutoffAt: beijingTime(cutoff), estimated: true, recordId: null, truckNo: null, fraction: null };
  const baseline = { ...common, key: initial > 0 ? 'initial' : 'pending', estimated: false,
    height: initial, depth: slot.depth - initial,
    reason: initial > 0 ? '建档初始高度按已初凝基线展示；其上仅采用龄期截止前的有效实测面'
      : '尚无龄期截止前的有效实测面，已初凝高度暂为 0' };
  if (!Number.isFinite(initial) || initial < 0 || initial > slot.depth) return { ...common,
    key: 'unknown', height: null, depth: null, reason: '初始混凝土面高无效' };
  const measurements = events.filter(e => e.type === 'measurement' && e.status !== 'void' && timeMs(e.occurredAt) <= asOfMs)
    .sort((a,b) => timeMs(a.occurredAt) - timeMs(b.occurredAt));
  let previousHeight = initial, chosen = null;
  for (const event of measurements) {
    const points = event.payload.measurementPoints;
    const height = slot.depth - points.reduce((a,b) => a+b, 0) / points.length;
    if (!Number.isFinite(height) || height < previousHeight - 1e-7 || height > slot.depth) return { ...common,
      key: 'unknown', depth: null, height: null, reason: '实测面存在回落或无效值，暂停其上的初凝推算，请复核测量记录' };
    previousHeight = height;
    if (timeMs(event.occurredAt) <= cutoff) chosen = { event, height };
  }
  if (!chosen || chosen.height <= initial) return baseline;
  return { ...common, key: 'estimated', height: round(chosen.height), depth: round(slot.depth - chosen.height),
    recordId: chosen.event.id, observedAt: chosen.event.occurredAt,
    reason: '采用龄期截止前最近一次已测高度；观测间隔不插值，不向最新实测面以上外推' };
}

export function buildEventMonitor(slot, allEvents, asOfMs = Date.now()) {
  const policy = policyFor(slot), asOf = beijingTime(asOfMs);
  const active = allEvents.filter(e => e.status !== 'void');
  const eligible = active.filter(e => timeMs(e.occurredAt) <= asOfMs);
  const futureCount = active.length - eligible.length;
  const replay = replayEvents(slot, allEvents, { asOf });
  const latest = replay.latest;
  const measurementAt = latest?.metrics.measurementAt ?? null;
  const setting = estimateEventSetting(slot, eligible, asOfMs, policy);
                                                                             
                                                                           
  const evaluationRow = latest ? { ...latest, metrics: { ...latest.metrics,
    tremieDepths: latest.metrics.tremieDepths ?? slot.tremieInitialDepths,
    jointDepths: latest.metrics.jointDepths ?? slot.jointInitialDepths,
    actualDepth: latest.metrics.actualDepth,
    actualSpeed: latest.metrics.actualSpeed,
    theoreticalSpeed: latest.metrics.theoreticalSpeedCurrent === false ? null : latest.metrics.theoreticalSpeed,
    theoreticalDepth: latest.metrics.theoryComplete === false ? null : latest.metrics.theoreticalDepth,
    fillCoefficient: latest.metrics.fillCoefficient } } : null;
  const evaluation = evaluateRecord(slot, evaluationRow ? [evaluationRow] : [], asOfMs, policy,
    setting);
                                                                               
                                                                           
  for (const item of evaluation.indicators) {
    if (item.key !== 'muted') continue;
    if (item.id === 'fill') item.label = latest?.metrics.measurementAt ? '暂不可计算' : '待实测数据';
  }
  const displayEvaluation = evaluateRecord(slot, latest ? [latest] : [], asOfMs, policy, setting);
  for (const item of displayEvaluation.indicators) {
    const live = evaluation.indicators.find(other => other.id === item.id);
    if (live) { item.key = live.key; item.label = live.label; }
  }
  displayEvaluation.counts = { ...evaluation.counts };
  displayEvaluation.overall = { ...evaluation.overall };
  const issues = [...(replay.issues ?? []), ...(latest?.metrics.notes ?? [])];
  if (!policy.confirmed) issues.push('当前为旧版规则试运行，阈值与入槽后初凝时长尚待现场校准。');
  if (!measurementAt) issues.push('尚无有效实测记录；实际面、速度及实际埋深待判定。');
  if (futureCount) issues.push(`${futureCount} 条未来事件未纳入当前评价，可在台账中核对实际发生时间。`);
  const actions = evaluation.indicators.filter(v => ['danger','warn'].includes(v.key)).map(v => ({ ...v,
    action: v.kind.startsWith('pressure-')?'核对液压压力表与本次接头管拔管记录，按本槽段已设置阈值复核。':v.kind === 'tremie' ? '复测混凝土面及管底位置，核对该管独立拔管记录；由现场负责人按批准方案处置。'
      : v.kind === 'joint' ? '复核当前混凝土面、接头管底位置与埋深上限。'
      : v.kind === 'fill' ? `核对最新实测面、已录入浇筑方量及有效截面积，检查是否漏录。${latest?.metrics.fillCoefficientTimeGapExceeded ? '浇筑与实测时间差超过 1 小时。' : ''}`
      : '核对独立测量间隔或浇筑起止时段；显示的是区间平均上升速度，不是瞬时流速。' }));
  const status = !latest || !measurementAt ? { key: 'muted', label: '等待测量' }
    : !policy.confirmed ? { key: 'warn', label: '规则待校准' } : evaluation.overall;
  const byEventId=new Map(eligible.map(event=>[event.id,event]));
  const pourPoints=s=>{
    const pours=(s.eventIds||[]).map(id=>byEventId.get(id)).filter(e=>e?.type==='pouring');
    let volume=s.metrics.cumulativeVolume-pours.reduce((sum,e)=>sum+e.payload.volume,0);
    return pours.map(e=>{volume+=e.payload.volume;return {id:e.id,truckNo:e.payload.truckNo,endedAt:e.occurredAt,
      cumulativeVolume:volume,fillCoefficient:s.metrics.measurementVolume>0?volume/s.metrics.measurementVolume:null};});
  };
  const trend = replay.snapshots.map(s => ({ id: s.id, eventIds: s.eventIds, eventTypes: s.eventTypes,pouringEvents:pourPoints(s),
    label: (s.eventTypes ?? []).map(t => EVENT_LABELS[t] || t).join(' / '),
    truckNo: s.truckNo ?? null, endedAt: s.occurredAt ?? s.endedAt, volume: s.volume ?? null,
    ...Object.fromEntries(['actualDepth','theoreticalDepth','actualHeight','actualSpeed','theoreticalSpeed','cumulativeVolume',
      'measurementVolume','measurementVolumeAt','fillCoefficient','fillCoefficientAt','fillCoefficientCurrent','fillCoefficientReason',
      'fillCoefficientPouringAt','fillCoefficientMeasurementAt','fillCoefficientTimeGapHours','fillCoefficientTimeGapExceeded',
      'actualSpeedAt','actualSpeedStartedAt','actualSpeedIntervalHours','theoreticalSpeedAt','theoreticalSpeedStartedAt',
      'measurementAt','theoryComplete','jointPressures','jointPressureAt','jointPressureBackfilled'].map(k => [k,s.metrics[k] ?? null])),
    ...Object.fromEntries([0,1,2].flatMap(i => [
      [`t${i+1}ActualEmbedment`,s.metrics.tremieEmbedments?.[i] ?? null],
      [`t${i+1}TheoreticalEmbedment`,s.metrics.tremieTheoreticalEmbedments?.[i] ?? null]
    ])),
    ...Object.fromEntries(['left','right'].flatMap(side => [
      [`${side}ActualEmbedment`,s.metrics.jointSurfaceDifferences?.[side] ?? null],
      [`${side}TheoreticalEmbedment`,s.metrics.jointTheoreticalEmbedments?.[side] ?? null]
    ])),
    leftPressure:s.metrics.jointPressures?.left??null,rightPressure:s.metrics.jointPressures?.right??null,
    leftPressureAt:s.metrics.jointPressureAt?.left??null,rightPressureAt:s.metrics.jointPressureAt?.right??null,
    points: s.measurementPoints ?? [] }));
  return { slot, asOf, workflow: 'independent-events-v1', displayMode: 'current', latest, evaluation, displayEvaluation, modelSetting: setting,
    status, issues: [...new Set(issues)], actions, freshness: { futureCount, invalidTimeCount: 0, measurementAt },
    total: active.length, displayedCount: replay.snapshots.length, eligibleCount: eligible.length,
    pouringCount: eligible.filter(e => e.type === 'pouring').length,
    streamTimes: Object.fromEntries(Object.keys(EVENT_LABELS).map(type => [type,
      eligible.filter(e => e.type === type).sort((a,b) => timeMs(a.occurredAt)-timeMs(b.occurredAt)).at(-1)?.occurredAt ?? null])),
    trend, provenance: { tables: ['cw_slot','cw_event'], mode: '独立事件按实际发生时间回放；人工与设备同一计算链；未来数据不纳入当前状态',
      datum: '测深自槽口向下；面高自槽底向上', timezone: 'Asia/Shanghai' } };
}
