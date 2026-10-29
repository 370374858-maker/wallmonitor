import {tremieLabel,normalizeTremieLabels} from './pipe-labels.js';
                                                                              
export const GEOMETRY_VERSION = 'semicircle-joints-v2';
export const DEFAULT_JOINT_DIAMETER = 0.93;
export const TREMIE_DIAMETER = 0.3;
export const CALCULATION_VERSION = 'construction-record-v3-slot-baseline';
export const JOINT_LABELS = Object.freeze({ none: '无接头管', left: '单左', right: '单右', both: '双侧' });

export class ValidationError extends Error {
  constructor(issues) {
    super(Object.values(issues)[0] || '请检查输入');
    this.name = 'ValidationError';
    this.status = 422;
    this.issues = issues;
  }
}

export const sidesFor = layout => layout === 'both' ? ['left', 'right'] : layout === 'none' ? [] : [layout];
export const round = (value, places = 8) => Number(value.toFixed(places));
export function nextTruckNo(records = []) {
  const maximum = records.reduce((max, record) => {
    const value = typeof record === 'number' ? record : record?.truckNo;
    return Number.isInteger(value) && value > max ? value : max;
  }, 0);
  return maximum + 1;
}
                                                                              
                                                                           
export const pipeEmbedment = (depth, surface) => Number.isFinite(depth) && Number.isFinite(surface)
  ? depth <= 0 ? 0 : round(Math.max(0, depth - surface)) : null;

function number(value, field, label, issues, min = 0, max = 1000000, integer = false, preservePrecision = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues[field] = `${label}必须填写有效数字`;
    return 0;
  }
  if (value < min || value > max || (integer && !Number.isInteger(value))) {
    issues[field] = `${label}应为 ${min}～${max}${integer ? ' 之间的整数' : ' 之间的数值'}`;
  } else if (!integer && !preservePrecision && Math.abs(value * 10000 - Math.round(value * 10000)) > 0.00001) {
    issues[field] = `${label}最多保留四位小数`;
  }
  return value;
}

function list(values, count, field, label, issues, maximum) {
  if (!Array.isArray(values) || values.length !== count) {
    issues[field] = `${label}需完整填写 ${count} 个数值`;
    return Array(count).fill(0);
  }
  return values.map((value, i) => number(value, `${field}.${i}`, `${label} ${i + 1}`, issues, 0, maximum));
}

function jointValues(values, layout, field, label, issues, maximum, minimum = 0, preservePrecision = false) {
  const sides = sidesFor(layout);
  if (!values || typeof values !== 'object' || Array.isArray(values) ||
      Object.keys(values).sort().join(',') !== [...sides].sort().join(',')) {
    issues[field] = `${label}必须与接头管配置一致；未配置的管道不提交数值`;
    return {};
  }
  return Object.fromEntries(sides.map(side => [side, number(values[side], `${field}.${side}`,
    `${side === 'left' ? '左' : '右'}侧${label}`, issues, minimum, maximum, false, preservePrecision)]));
}

function fail(issues) { if (Object.keys(issues).length) throw new ValidationError(issues); }

export function calculateSlot(input, { requireJointDiameter = false } = {}) {
  const issues = {};
  const code = typeof input?.code === 'string' ? input.code.trim() : '';
  if (!/^[\p{L}\p{N}_-]{1,32}$/u.test(code)) issues.code = '槽段编号限 1～32 个中英文、数字、下划线或短横线';
  const width = number(input?.width, 'width', '槽段宽度', issues, 0.0001, 10000);
  const depth = number(input?.depth, 'depth', '槽段深度', issues, 0.0001, 10000);
  const thickness = number(input?.thickness, 'thickness', '槽段厚度', issues, 0.0001, 1000);
                                                                         
  const initialConcreteHeight = number(input?.initialConcreteHeight === undefined ? 0 : input.initialConcreteHeight, 'initialConcreteHeight',
    '建档时混凝土面高', issues, 0, depth);
                                                                               
                                                                         
  const initialObservedAt = input?.initialObservedAt == null || input.initialObservedAt === '' ? null
    : parseLocalTime(input.initialObservedAt, 'initialObservedAt', issues).text;
  const tremieCount = number(input?.tremieCount, 'tremieCount', '浇筑管数量', issues, 1, 3, true);
  const jointLayout = input?.jointLayout;
  if (!Object.prototype.hasOwnProperty.call(JOINT_LABELS, jointLayout)) issues.jointLayout = '请选择无、单左、单右或双侧接头管';
  fail(issues);
  const tremieLabels=normalizeTremieLabels(input.tremieLabels,tremieCount,issues);
  const count = sidesFor(jointLayout).length;
                                                                              
                                                                                 
  const jointDiameter = count ? number(input.jointDiameter === undefined && !requireJointDiameter ? DEFAULT_JOINT_DIAMETER : input.jointDiameter,
    'jointDiameter', '接头管直径', issues, 0.0001, thickness) : null;
  if (count && jointDiameter > thickness) issues.jointDiameter = '接头管直径不得超过槽段厚度';
  if (thickness < TREMIE_DIAMETER) issues.thickness = '槽段厚度不能小于浇筑管直径 0.30 m';
  const clearWidth = width - count * (jointDiameter ?? 0) / 2;
  if (clearWidth < tremieCount * TREMIE_DIAMETER - 1e-9) issues.width = '扣除接头半径后，槽宽不足以容纳所配置的 0.30 m 浇筑管';
  const tremieInitialDepths = list(input.tremieInitialDepths, tremieCount, 'tremieInitialDepths', '浇筑管初始埋深', issues, 1000000);
  tremieInitialDepths.forEach((v, i) => { if (v === 0) issues[`tremieInitialDepths.${i}`] = '已配置浇筑管的初始埋深必须大于 0'; });
  const jointInitialDepths = jointValues(input.jointInitialDepths, jointLayout, 'jointInitialDepths', '接头管初始埋深', issues, 1000000, 0, true);
  for (const side of sidesFor(jointLayout)) if (jointInitialDepths[side] === 0) issues[`jointInitialDepths.${side}`] = '已配置接头管的初始埋深必须大于 0';
  const grossArea = width * thickness;
  const deductionArea = count * Math.PI * ((jointDiameter ?? 0) / 2) ** 2 / 2;
  const area = round(grossArea - deductionArea);
  if (area <= 0) issues.width = '有效截面积必须大于 0，请检查尺寸及接头配置';
  fail(issues);
  return {
    code, width, depth, thickness, initialConcreteHeight, initialObservedAt, tremieCount, tremieLabels, tremieInitialDepths, jointLayout, jointInitialDepths,
    jointDiameter, tremieDiameter: TREMIE_DIAMETER,
    area, grossArea: round(grossArea), deductionArea: round(deductionArea), capacity: round(area * depth),
    measurementDatum: 'depth-below-slot-top', geometryVersion: GEOMETRY_VERSION,
    model: makeModel({ width, depth, thickness, initialConcreteHeight, tremieCount, tremieLabels, tremieInitialDepths,
      jointLayout, jointInitialDepths, jointDiameter })
  };
}

export function makeModel(slot) {
  const { width: w, thickness: t, depth, jointLayout } = slot;
  const r = (slot.jointDiameter ?? DEFAULT_JOINT_DIAMETER) / 2, center = t / 2;
  const sides = sidesFor(jointLayout);
                                                                                    
  const profile = [[0, 0], [w, 0]];
  if (sides.includes('right')) {
    profile.push([w, round(center - r)]);
    for (let i = 1; i <= 48; i++) {
      const angle = -Math.PI / 2 - i * Math.PI / 48;
      profile.push([round(w + r * Math.cos(angle)), round(center + r * Math.sin(angle))]);
    }
  }
  profile.push([w, t]);
  profile.push([0, t]);
  if (sides.includes('left')) {
    profile.push([0, round(center + r)]);
    for (let i = 1; i <= 48; i++) {
      const angle = Math.PI / 2 - i * Math.PI / 48;
      profile.push([round(r * Math.cos(angle)), round(center + r * Math.sin(angle))]);
    }
  }
  const leftInset = sides.includes('left') ? r : 0;
  const rightInset = sides.includes('right') ? r : 0;
  const innerWidth = w - leftInset - rightInset;
  const gap = Math.max(0, (innerWidth - slot.tremieCount * TREMIE_DIAMETER) / (slot.tremieCount + 1));
  const pipes = slot.tremieInitialDepths.map((initialDepth, index) => ({
    id: `t${index + 1}`, kind: 'tremie', label: `浇筑管 ${tremieLabel(slot,index)}`, initialDepth,
    diameter: TREMIE_DIAMETER,
    x: round(leftInset + gap * (index + 1) + TREMIE_DIAMETER * (index + .5)), z: center
  }));
  for (const side of sides) pipes.push({
    id: side, kind: 'joint', label: `${side === 'left' ? '左' : '右'}接头管`, side,
    initialDepth: slot.jointInitialDepths[side], diameter: slot.jointDiameter ?? DEFAULT_JOINT_DIAMETER,
    x: side === 'left' ? 0 : w, z: center
  });
  return { version: GEOMETRY_VERSION, dimensions: { width: w, depth, thickness: t },
    initialConcreteHeight: slot.initialConcreteHeight ?? 0, profile, pipes,
    note: '横截面与管径同比例；纵向深度仅在展示时压缩。接头每侧扣半圆，浇筑管不扣减截面积。' };
}

export function parseLocalTime(value, field, issues) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    issues[field] = '请填写完整的北京时间（年、月、日、时、分）';
    return { text: '', milliseconds: 0 };
  }
  const text = value.replace('T', ' ') + (value.length === 16 ? ':00' : '');
  const n = text.match(/\d+/g).map(Number);
  const time = new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5]));
  if (n[0] < 2000 || n[0] > 2100 || time.getUTCFullYear() !== n[0] || time.getUTCMonth() !== n[1] - 1 ||
      time.getUTCDate() !== n[2] || time.getUTCHours() !== n[3] || time.getUTCMinutes() !== n[4] || time.getUTCSeconds() !== n[5]) {
    issues[field] = '日期或时间无效';
  }
  return { text, milliseconds: time.getTime() };
}

export function calculateRecord(slot, input, previous = null) {
  const issues = {};
  const truckNo = number(input?.truckNo, 'truckNo', '车号', issues, 1, 1000000, true);
  const volume = number(input?.volume, 'volume', '本次方量', issues, 0.0001, 10000000);
  const start = parseLocalTime(input?.startedAt, 'startedAt', issues);
  const end = parseLocalTime(input?.endedAt, 'endedAt', issues);
  if (end.milliseconds <= start.milliseconds) issues.endedAt = '结束浇筑时间必须晚于开始时间';
  const measurementPoints = list(input?.measurementPoints, 6, 'measurementPoints', '混凝土面测深', issues, slot.depth);
  const tremiePulls = list(input?.tremiePulls, slot.tremieCount, 'tremiePulls', '本次浇筑管拔出长度', issues, 1000000);
  const jointPulls = jointValues(input?.jointPulls, slot.jointLayout, 'jointPulls', '本次接头管拔出长度', issues, 1000000, -1000000);
  const previousTremie = previous?.metrics.tremieDepths ?? slot.tremieInitialDepths;
  const previousJoint = previous?.metrics.jointDepths ?? slot.jointInitialDepths;
  const tremieDepths = tremiePulls.map((pull, i) => {
    return round(Math.max(0, previousTremie[i] - pull));
  });
  const jointDepths = Object.fromEntries(sidesFor(slot.jointLayout).map(side => {
    return [side, round(Math.max(0, previousJoint[side] - jointPulls[side]))];
  }));
  let intervalHours = null;
  if (previous) {
    const previousEnd = parseLocalTime(previous.endedAt, 'previous', issues);
    intervalHours = (end.milliseconds - previousEnd.milliseconds) / 3600000;
    if (intervalHours <= 0) issues.endedAt = '结束时间必须晚于前序记录，不能与其他车的结束时间相同；补录较早数据请通过历史修订核对顺序';
  }
  fail(issues);
  const durationHours = (end.milliseconds - start.milliseconds) / 3600000;
  const initialConcreteHeight = Number.isFinite(slot.initialConcreteHeight) ? slot.initialConcreteHeight : 0;
  const actualDepth = round(measurementPoints.reduce((a, b) => a + b, 0) / 6);
  const actualHeight = round(slot.depth - actualDepth);
  const actualRiseFromInitial = round(actualHeight - initialConcreteHeight);
  const cumulativeVolume = round((previous?.metrics.cumulativeVolume ?? 0) + volume);
  const currentRise = round(volume / slot.area);
  const theoreticalDepth = round(slot.depth - initialConcreteHeight - cumulativeVolume / slot.area);
  const measurementVolume = round(actualRiseFromInitial * slot.area);
  const actualSpeed = previous ? round((previous.metrics.actualDepth - actualDepth) / intervalHours)
    : round(actualRiseFromInitial / durationHours);
  const notes = [];
  tremiePulls.forEach((pull,i) => { if (pull > previousTremie[i]) notes.push(`浇筑管 ${i+1} 拔出量超过剩余管深；原始拔出量保留，剩余管深按 0 m 计算。`); });
  for (const side of sidesFor(slot.jointLayout)) if (jointPulls[side] > previousJoint[side]) notes.push(`${side==='left'?'左':'右'}接头管拔出量超过剩余管深；原始拔出量保留，剩余管深按 0 m 计算。`);
  if (actualSpeed < 0) notes.push(previous
    ? '实测混凝土面低于上次，请核对六个测点及施工情况。'
    : '首车结束实测面高低于初始面高，请核对初始面高及六个测点。');
  if (theoreticalDepth < 0) notes.push('累计方量超过设计容积，理论等效面深为负；保留原始计算值，请核对尺寸与方量。');
  if (measurementVolume <= 0) notes.push(measurementVolume === 0
    ? '相对建档初始面的实测新增高度为 0，暂不能计算充盈系数。'
    : '实测面高低于建档初始面，保留负的新增高度和测深折算方量，充盈系数留空。');
  return {
    raw: { truckNo, startedAt: start.text, endedAt: end.text, volume, measurementPoints, tremiePulls, jointPulls },
    metrics: {
      calculationVersion: CALCULATION_VERSION, geometryVersion: slot.geometryVersion,
      measurementDatum: slot.measurementDatum, evaluatedAt: end.text,
      initialConcreteHeight,
      area: slot.area, durationHours: round(durationHours), currentRise, cumulativeVolume,
      theoreticalDepth, theoreticalSpeed: round(currentRise / durationHours),
      actualDepth, actualHeight, actualRiseFromInitial, actualSpeed, measurementVolume,
      fillCoefficient: measurementVolume > 0 ? round(cumulativeVolume / measurementVolume) : null,
      progressPercent: round(actualHeight / slot.depth * 100),
      tremieDepths, jointDepths,
      tremieEmbedments: tremieDepths.map(d => pipeEmbedment(d, actualDepth)),
      jointSurfaceDifferences: Object.fromEntries(Object.entries(jointDepths).map(([side, d]) => [side, pipeEmbedment(d, actualDepth)])),
      notes
    }
  };
}
