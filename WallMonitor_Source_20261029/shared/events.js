import { ValidationError, pipeEmbedment, sidesFor } from './construction.js';
import { beijingTime, timeMs } from './monitoring.js';
import {initialJointDepth} from './joint-depth-state.js';

export const EVENT_TYPES = Object.freeze(['pouring', 'measurement', 'tremie', 'joint']);
export const EVENT_SOURCES = Object.freeze(['manual', 'device', 'legacy']);
export const EVENT_STATUSES = Object.freeze(['active', 'void']);
export const EVENT_SCHEMA_VERSION = 1;
export const EVENT_TIMEZONE = 'Asia/Shanghai';

const finite = Number.isFinite;
const own = (value, key) => value != null && Object.hasOwn(value, key);
const fail = issues => { if (Object.keys(issues).length) throw new ValidationError(issues); };
const text = (value, field, issues, { required = false, max = 200 } = {}) => {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    issues[field] = `${field} 必须是${required ? '非空' : ''}字符串`;
    return null;
  }
  return value.trim();
};
const number = (value, field, issues, min, max, integer = false) => {
  if (typeof value !== 'number' || !finite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    issues[field] = `${field} 必须是 ${min}～${max} 的${integer ? '整数' : '有限数字'}`;
  }
  return value;
};
const deterministicId = value => {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `preview:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

function eventTime(value, field, issues, source, canonicalDevice = false) {
  if (typeof value !== 'string') { issues[field] = `${field} 必须是带时区 ISO 时间或北京时间`; return null; }
  const plain = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/;
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (source === 'device' && plain.test(value) && !canonicalDevice) {
    issues[field] = '设备时间必须使用带明确时区的 ISO 格式'; return null;
  }
  if (!plain.test(value) && !zoned.test(value)) { issues[field] = `${field} 格式无效或缺少时区`; return null; }
  const parts = value.slice(0, 19).match(/\d+/g)?.map(Number);
  if (!parts || parts[0] < 2000 || parts[0] > 2100 ||
      new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] ?? 0)).toISOString().slice(0, 19) !==
        `${String(parts[0]).padStart(4, '0')}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}T${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}:${String(parts[5] ?? 0).padStart(2, '0')}`) {
    issues[field] = `${field} 日期或时间无效`; return null;
  }
  const ms = timeMs(value);
  if (!finite(ms)) { issues[field] = `${field} 日期或时间无效`; return null; }
  const canonical = beijingTime(ms);
  if (timeMs(canonical) !== ms) { issues[field] = `${field} 必须精确到整秒`; return null; }
  return canonical;
}

function normalizePulls(slot, type, payload, issues,source,canonicalDevice,occurredAt) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.pulls)) {
    issues['payload.pulls'] = 'pulls 必须是数组'; return { pulls: [] };
  }
  const configured = type === 'tremie'
    ? new Set(Array.from({ length: slot.tremieCount }, (_, i) => `t${i + 1}`))
    : new Set(sidesFor(slot.jointLayout));
  if (type === 'tremie' && payload.pulls.length < 1) issues['payload.pulls'] = '浇筑管事件至少包含一根管';
  if (type === 'joint' && configured.size && payload.pulls.length < 1) issues['payload.pulls'] = '已配置接头管时至少包含一根管';
  const seen = new Set();
  const pulls = payload.pulls.map((pull, index) => {
    const prefix = `payload.pulls.${index}`;
    const pipeId = text(pull?.pipeId, `${prefix}.pipeId`, issues, { required: true, max: 16 });
    if (pipeId && !configured.has(pipeId)) issues[`${prefix}.pipeId`] = `${pipeId} 不是本槽段已配置的${type === 'tremie' ? '浇筑' : '接头'}管`;
    if (pipeId && seen.has(pipeId)) issues[`${prefix}.pipeId`] = `同一事件不得重复操作管道 ${pipeId}`;
    seen.add(pipeId);
    const mode = pull?.mode;
    if (mode !== 'delta' && mode !== 'absolute') issues[`${prefix}.mode`] = 'mode 只能是 delta 或 absolute';
    const value = number(pull?.value, `${prefix}.value`, issues, type==='joint'&&mode==='delta'?-1000000:0, type === 'tremie' || type === 'joint' ? 1000000 : slot.depth);
    if(type==='joint'){
      const missing=!own(pull,'pressure');
      const pressure=number(missing?1:pull.pressure,`${prefix}.pressure`,issues,0,1000000);
      return {pipeId,mode,value,pressure,...(missing||pull.pressureBackfilled===true?{pressureBackfilled:true}:{})};
    }
    return { pipeId, mode, value };
  });
  const result={pulls};
  if(type==='joint'&&own(payload,'operation')){
    const operation=payload.operation;
    if(!operation||typeof operation!=='object'||Array.isArray(operation)){issues['payload.operation']='起拔过程信息无效';return result;}
    const operationId=text(operation.operationId,'payload.operation.operationId',issues,{required:true,max:100});
    const startedAt=eventTime(operation.startedAt,'payload.operation.startedAt',issues,source,canonicalDevice);
    const endedAt=eventTime(operation.endedAt,'payload.operation.endedAt',issues,source,canonicalDevice);
    if(startedAt&&endedAt&&timeMs(endedAt)<=timeMs(startedAt))issues['payload.operation.endedAt']='起拔结束时间必须晚于开始时间';
    if(endedAt&&occurredAt!==endedAt)issues.occurredAt='起拔事件时刻必须等于起拔结束时间';
    if(startedAt&&timeMs(startedAt)<timeMs(slot.initialObservedAt))issues['payload.operation.startedAt']='起拔开始时间不得早于槽段初始观测时间';
    if(operation.pressureKind!=='maximum')issues['payload.operation.pressureKind']='起拔汇总必须提供过程最大压力';
    if(pulls.length!==1||pulls.some(p=>p.mode!=='delta'||p.value===0||p.pressureBackfilled))issues['payload.pulls']='每条管道操作汇总仅包含一根管的本次非零位移和真实最大压力；正数上拔、负数回落';
    result.operation={operationId,startedAt,endedAt,pressureKind:'maximum'};
  }
  return result;
}

export function normalizeEvent(slot, input) {
  const issues = {};
  if (!slot || typeof slot !== 'object') throw new ValidationError({ slot: '槽段配置不能为空' });
  let id = text(input?.id, 'id', issues, { max: 200 });
  const slotId = text(input?.slotId ?? String(slot.id), 'slotId', issues, { required: true, max: 200 });
  if (slotId && String(slot.id) !== slotId) issues.slotId = '事件 slotId 与槽段不一致';
  const type = input?.type;
  if (!EVENT_TYPES.includes(type)) issues.type = 'type 只能是 pouring、measurement、tremie 或 joint';
  const source = input?.source ?? 'manual';
  if (!EVENT_SOURCES.includes(source)) issues.source = 'source 只能是 manual、device 或 legacy';
  const status = input?.status ?? 'active';
  if (!EVENT_STATUSES.includes(status)) issues.status = 'status 只能是 active 或 void';
  const version = number(input?.version ?? 1, 'version', issues, 1, 1000000, true);
  const canonicalDevice = source === 'device' && input?.timezone === EVENT_TIMEZONE && input?.schemaVersion === EVENT_SCHEMA_VERSION;
  const occurredAt = eventTime(input?.occurredAt, 'occurredAt', issues, source, canonicalDevice);
  const receivedAt = eventTime(input?.receivedAt ?? input?.occurredAt, 'receivedAt', issues, source, canonicalDevice);
  const deviceId = text(input?.deviceId, 'deviceId', issues, { max: 200 });
  const externalId = text(input?.externalId, 'externalId', issues, { max: 200 });
  if (source === 'device' && (!deviceId || !externalId)) issues.deviceId = '设备事件必须同时提供 deviceId 和 externalId';
  if (source !== 'device' && (deviceId || externalId)) issues.deviceId = '仅设备事件可提供 deviceId/externalId';
  const batchId = text(input?.batchId, 'batchId', issues, { max: 200 });
  const legacyRecordId = text(input?.legacyRecordId, 'legacyRecordId', issues, { max: 200 });
  if (source === 'legacy' && !legacyRecordId) issues.legacyRecordId = '旧记录事件必须提供 legacyRecordId';
  let payload;
  if (status === 'void') {
    payload = input?.payload == null ? null : structuredClone(input.payload);
  } else if (type === 'pouring') {
    const truckNo = number(input?.payload?.truckNo, 'payload.truckNo', issues, 1, 1000000, true);
    const volume = number(input?.payload?.volume, 'payload.volume', issues, Number.MIN_VALUE, 10000000);
    const startedAt = eventTime(input?.payload?.startedAt, 'payload.startedAt', issues, source, canonicalDevice);
    const endedAt = eventTime(input?.payload?.endedAt, 'payload.endedAt', issues, source, canonicalDevice);
    if (startedAt && endedAt && timeMs(endedAt) <= timeMs(startedAt)) issues['payload.endedAt'] = '结束时间必须晚于开始时间';
    if (occurredAt && endedAt && occurredAt !== endedAt) issues.occurredAt = '浇筑事件 occurredAt 必须等于 endedAt';
    payload = { truckNo, volume, startedAt, endedAt };
  } else if (type === 'measurement') {
    const points = input?.payload?.measurementPoints;
    if (!Array.isArray(points) || points.length < 1 || points.length > 64) issues['payload.measurementPoints'] = '测深须包含 1～64 个测点';
    payload = { measurementPoints: Array.isArray(points) ? points.map((v, i) => number(v, `payload.measurementPoints.${i}`, issues, 0, slot.depth)) : [] };
  } else if (type === 'tremie' || type === 'joint') payload = normalizePulls(slot, type, input?.payload, issues,source,canonicalDevice,occurredAt);
  const baselineMs = timeMs(slot.initialObservedAt);
  if (status === 'active' && finite(baselineMs)) {
    if (occurredAt && timeMs(occurredAt) < baselineMs) {
      issues.occurredAt = '活动事件时间不得早于槽段初始混凝土面观测时间';
    }
    if (type === 'pouring' && payload?.startedAt && timeMs(payload.startedAt) < baselineMs) {
      issues['payload.startedAt'] = '浇筑开始时间不得早于槽段初始混凝土面观测时间，避免重复计入基线前方量';
    }
  }
  fail(issues);
  id ??= deterministicId({ slotId, type, occurredAt, source, deviceId, externalId, batchId, legacyRecordId, version, status, payload, receivedAt });
  return { id, slotId, type, occurredAt, source, deviceId, externalId, batchId, legacyRecordId,
    version, status, payload, receivedAt, schemaVersion: EVENT_SCHEMA_VERSION, timezone: EVENT_TIMEZONE };
}

export function legacyEvents(slot, records) {
  if (!Array.isArray(records)) throw new ValidationError({ records: 'records 必须是数组' });
  const issues = {};
  records.forEach((record, i) => { if (record?.id == null || !String(record.id).trim()) issues[`records.${i}.id`] = '旧记录必须有确定性 id'; });
  fail(issues);
  return records.flatMap(record => {
    const common = { slotId: String(slot.id), source: 'manual', version: 1, status: 'active',
      receivedAt: record.receivedAt ?? record.createdAt ?? record.endedAt, deviceId: null, externalId: null,
      legacyRecordId: String(record.id) };
    const make = (type, payload) => normalizeEvent(slot, { ...common, id: `${record.id}:${type}`,
      batchId: `record:${record.id}:${type}`, type, occurredAt: record.endedAt, payload });
    return [
      make('pouring', { truckNo: record.truckNo, volume: record.volume, startedAt: record.startedAt, endedAt: record.endedAt }),
      make('measurement', { measurementPoints: record.measurementPoints }),
      make('tremie', { pulls: Array.isArray(record.tremiePulls)
        ? record.tremiePulls.map((value, i) => ({ pipeId: `t${i + 1}`, mode: 'delta', value })) : record.tremiePulls }),
      make('joint', { pulls: record.jointPulls && typeof record.jointPulls === 'object'
        ? sidesFor(slot.jointLayout).map(pipeId => ({ pipeId, mode: 'delta', value: record.jointPulls[pipeId] })) : record.jointPulls })
    ];
  });
}

const average = values => values.every(value=>value===values[0])?values[0]:values.reduce((sum, value) => sum + value, 0) / values.length;
const cloneDepths = state => ({ tremie: { ...state.tremie }, joint: { ...state.joint } });

export function replayEvents(slot, inputs, { asOf } = {}) {
  if (!Array.isArray(inputs)) throw new ValidationError({ events: 'events 必须是数组' });
  const normalized = inputs.map(event => normalizeEvent(slot, event));
  const ids = new Set(), idIssues = {};
  normalized.forEach((event, i) => { if (ids.has(event.id)) idIssues[`events.${i}.id`] = `事件 id 重复：${event.id}`; ids.add(event.id); });
  fail(idIssues);
  const asOfMs = asOf === undefined ? Infinity : timeMs(asOf);
  if (asOf !== undefined && !finite(asOfMs)) throw new ValidationError({ asOf: 'asOf 时间无效' });
  normalized.sort((a, b) => timeMs(a.occurredAt) - timeMs(b.occurredAt) || a.id.localeCompare(b.id));
  const trucks = new Map(), truckIssues = {};
  normalized.filter(event => event.status === 'active' && event.type === 'pouring').forEach(event => {
    const prior = trucks.get(event.payload.truckNo);
    if (prior) truckIssues[`truckNo.${event.payload.truckNo}`] = `车号 ${event.payload.truckNo} 在活动浇筑事件 ${prior} 与 ${event.id} 中重复`;
    trucks.set(event.payload.truckNo, event.id);
  });
  fail(truckIssues);
  const eligible = normalized.filter(event => event.status === 'active' && timeMs(event.occurredAt) <= asOfMs);
  const groups = [];
  for (const event of eligible) {
    const last = groups.at(-1);
    if (last?.occurredAt === event.occurredAt) last.events.push(event); else groups.push({ occurredAt: event.occurredAt, events: [event] });
  }
  const pipe = { tremie: Object.fromEntries(slot.tremieInitialDepths.map((v, i) => [`t${i + 1}`, v])), joint: Object.fromEntries(sidesFor(slot.jointLayout).map(side=>[side,initialJointDepth(slot,side)])) };
  const jointPressures=Object.fromEntries(sidesFor(slot.jointLayout).map(side=>[side,null]));
  const jointPressureAt={},jointPressureBackfilled=Object.fromEntries(sidesFor(slot.jointLayout).map(side=>[side,false]));
  let cumulativeVolume = 0, latestMeasurement = null, previousMeasurement = null;
  let latestActualSpeed = null, actualSpeedAt = null, actualSpeedStartedAt = null, actualSpeedIntervalHours = null;
  let latestTheoreticalSpeed = null, theoreticalSpeedAt = null, theoreticalSpeedStartedAt = null, latestPourAt = null;
  const snapshots = [], measurements = [], pours = [], issues = [];
  for (const group of groups) {
    const measurementsHere = group.events.filter(e => e.type === 'measurement');
    if (measurementsHere.length > 1) throw new ValidationError({ occurredAt: `${group.occurredAt} 存在多条测量事件，无法确定同刻结果` });
    const operations = new Map();
    for (const event of group.events.filter(e => e.type === 'tremie' || e.type === 'joint')) for (const pull of event.payload.pulls) {
      if (operations.has(pull.pipeId)) throw new ValidationError({ occurredAt: `${group.occurredAt} 管道 ${pull.pipeId} 存在同刻冲突操作（含 absolute/delta 冲突）` });
      operations.set(pull.pipeId, { event, pull });
    }
    const groupPours = group.events.filter(e => e.type === 'pouring');
    for (const event of groupPours) { cumulativeVolume += event.payload.volume; pours.push(event); }
    for (const { event, pull } of operations.values()) {
      const kind = event.type;
      if(kind==='joint'){jointPressures[pull.pipeId]=pull.pressure;jointPressureAt[pull.pipeId]=event.occurredAt;jointPressureBackfilled[pull.pipeId]=pull.pressureBackfilled===true;}
      const prior = pipe[kind][pull.pipeId];
      if(kind==='joint'&&pull.mode==='delta'&&!Number.isFinite(prior))throw new ValidationError({jointDepth:'接头管初始管底测深尚未初始化，不能累计拔管量'});
      if(event.payload.operation&&pull.mode==='delta'&&pull.value>prior)throw new ValidationError({pullLength:'本次起拔长度超过该时刻剩余管底测深，请核对单位、基准或重复记录'});
      if (pull.mode === 'absolute') pipe[kind][pull.pipeId] = pull.value;
      else {
        pipe[kind][pull.pipeId] = Math.max(0, prior - pull.value);
        if (pull.value > prior) issues.push(`${group.occurredAt} ${pull.pipeId} 拔出量超过剩余管深；原始值保留，管底测深按 0 m。`);
      }
    }
    if (measurementsHere.length) {
      previousMeasurement = latestMeasurement;
      const event = measurementsHere[0], actualDepth = average(event.payload.measurementPoints);
      latestMeasurement = { event, actualDepth, actualHeight: slot.depth - actualDepth };
      measurements.push(event);
    }
    const groupMs = timeMs(group.occurredAt);
    const measurementAt = latestMeasurement?.event.occurredAt ?? null;
    const aligned = measurementAt === group.occurredAt;
    const actualDepth = latestMeasurement?.actualDepth ?? null;
    const actualHeight = latestMeasurement?.actualHeight ?? null;
    let calculatedSpeed = null;
    if (aligned) {
      const priorAt = previousMeasurement?.event.occurredAt ?? slot.initialObservedAt ?? null;
      const priorHeight = previousMeasurement?.actualHeight ?? (slot.initialObservedAt ? (slot.initialConcreteHeight ?? 0) : null);
      const hours = priorAt ? (groupMs - timeMs(priorAt)) / 3600000 : null;
      if (finite(priorHeight) && finite(hours) && hours > 0) {
        calculatedSpeed = (actualHeight - priorHeight) / hours;
        latestActualSpeed = calculatedSpeed; actualSpeedAt = group.occurredAt; actualSpeedStartedAt = priorAt; actualSpeedIntervalHours = hours;
      }
    }
    const theoreticalDepth = slot.depth - (slot.initialConcreteHeight ?? 0) - cumulativeVolume / slot.area;
    const currentVolume = groupPours.reduce((sum, event) => sum + event.payload.volume, 0);
    const currentRise = groupPours.length ? currentVolume / slot.area : null;
    const durations = groupPours.map(event => (timeMs(event.payload.endedAt) - timeMs(event.payload.startedAt)) / 3600000);
    if (groupPours.length) latestPourAt = group.occurredAt;
    if (groupPours.length === 1) {
      latestTheoreticalSpeed = currentRise / durations[0];
      theoreticalSpeedAt = group.occurredAt;
      theoreticalSpeedStartedAt = groupPours[0].payload.startedAt;
    }
    const unfinished = normalized.filter(event => event.status === 'active' && event.type === 'pouring' &&
      timeMs(event.payload.startedAt) <= groupMs && timeMs(event.payload.endedAt) > groupMs);
    const theoryComplete = unfinished.length === 0;
                                                                           
                                                                              
    const measurementVolume = actualHeight === null ? null :
      (actualHeight - (slot.initialConcreteHeight ?? 0)) * slot.area;
    const fillCoefficient = measurementVolume > 0 ? cumulativeVolume / measurementVolume : null;
    const fillCoefficientCurrent = Number.isFinite(fillCoefficient);
    const fillCoefficientTimeGapHours = latestPourAt && measurementAt
      ? Math.abs(timeMs(latestPourAt)-timeMs(measurementAt))/3600000 : null;
    const fillCoefficientTimeGapExceeded = fillCoefficientTimeGapHours !== null && fillCoefficientTimeGapHours > 1;
    const fillCoefficientReason = !latestMeasurement ? '尚无实测面' : measurementVolume <= 0
      ? '最新测量相对初始面的折算方量非正，当前比例不可计算'
      : fillCoefficientTimeGapExceeded ? '浇筑与实测时间差超过 1 小时，按最新已录入数据计算'
      : !latestPourAt ? '尚无浇筑记录，累计已录入方量按 0 计算' : '';
    const metricNotes = [];
    if (!latestMeasurement) metricNotes.push('尚无实测混凝土面。');
    else if (!aligned) metricNotes.push('沿用最近实测面及测量区间速度，测量时间未改变。');
    if (fillCoefficientReason) metricNotes.push(fillCoefficientReason);
    if (!theoryComplete) metricNotes.push('评估时刻存在未完成浇筑，理论累计方量不完整。');
    const tremieDepths = Array.from({ length: slot.tremieCount }, (_, i) => pipe.tremie[`t${i + 1}`]);
    const jointDepths = Object.fromEntries(sidesFor(slot.jointLayout).map(side => [side, pipe.joint[side]]));
    const reliableSurface = latestMeasurement ? actualDepth : null;
    const durationHours = groupPours.length === 1 ? durations[0] : null;
    const typeComplete = Object.fromEntries(EVENT_TYPES.map(type => [type, group.events.some(event => event.type === type)]));
    const metrics = { calculationVersion: 'event-replay-v3-latest-fill', geometryVersion: slot.geometryVersion,
      measurementDatum: slot.measurementDatum, timezone: EVENT_TIMEZONE, evaluatedAt: group.occurredAt,
      initialConcreteHeight: slot.initialConcreteHeight ?? 0, area: slot.area,
      actualDepth, actualHeight, actualRiseFromInitial: actualHeight === null ? null : actualHeight - (slot.initialConcreteHeight ?? 0),
      actualSpeed: latestActualSpeed, actualSpeedAt, actualSpeedStartedAt, actualSpeedIntervalHours,
      theoreticalDepth, theoreticalSpeed: latestTheoreticalSpeed, theoreticalSpeedAt, theoreticalSpeedStartedAt,
      theoreticalSpeedCurrent: theoreticalSpeedAt !== null && theoreticalSpeedAt === latestPourAt && theoryComplete,
      durationHours, cumulativeVolume, cumulativeVolumeAt: latestPourAt, currentRise, measurementVolume, measurementVolumeAt: measurementAt,
      fillCoefficient, fillCoefficientAt: fillCoefficientCurrent ? [latestPourAt,measurementAt].filter(Boolean).sort().at(-1) : null,
      fillCoefficientCumulativeVolume: cumulativeVolume,
      fillCoefficientMeasurementVolume: measurementVolume,
      fillCoefficientPouringAt: latestPourAt, fillCoefficientMeasurementAt: measurementAt,
      fillCoefficientCurrent, fillCoefficientReason, fillCoefficientTimeGapHours, fillCoefficientTimeGapExceeded,
      progressPercent: actualHeight === null ? null : actualHeight / slot.depth * 100,
      tremieDepths, jointDepths, jointPressures:{...jointPressures},jointPressureAt:{...jointPressureAt},jointPressureBackfilled:{...jointPressureBackfilled},
      tremieEmbedments: tremieDepths.map(depth => pipeEmbedment(depth, reliableSurface)),
      jointSurfaceDifferences: Object.fromEntries(Object.entries(jointDepths).map(([side, depth]) => [side, pipeEmbedment(depth, reliableSurface)])),
      tremieTheoreticalEmbedments: tremieDepths.map(depth => pipeEmbedment(depth, theoreticalDepth)),
      jointTheoreticalEmbedments: Object.fromEntries(Object.entries(jointDepths).map(([side, depth]) => [side, pipeEmbedment(depth, theoreticalDepth)])),
      measurementAt, alignment: aligned ? 'aligned' : latestMeasurement ? 'unaligned' : 'missing',
      theoryComplete, typeComplete, notes: metricNotes };
    const pouring = groupPours.length === 1 ? groupPours[0].payload : null;
    snapshots.push({ id: group.events[0].id, eventIds: group.events.map(e => e.id), eventTypes: [...new Set(group.events.map(e => e.type))],
      occurredAt: group.occurredAt, endedAt: group.occurredAt, startedAt: pouring?.startedAt ?? null,
      truckNo: pouring?.truckNo ?? null, volume: pouring?.volume ?? null,
      measurementPoints: latestMeasurement?.event.payload.measurementPoints ?? null, metrics });
  }
  const latest = snapshots.length ? structuredClone(snapshots.at(-1)) : null;
  if (latest && finite(asOfMs)) {
    const crossingAsOf = normalized.some(event => event.status === 'active' && event.type === 'pouring' &&
      timeMs(event.payload.startedAt) <= asOfMs && timeMs(event.payload.endedAt) > asOfMs);
    if (crossingAsOf) {
      latest.metrics.theoryComplete = false;
      latest.metrics.theoreticalSpeedCurrent = false;
      latest.metrics.notes = [...latest.metrics.notes, '评估时刻存在未完成浇筑，未插值方量，理论累计不完整。'];
    }
  }
  return { events: normalized, snapshots, latest, measurements, pours, issues: [...new Set(issues)] };
}
