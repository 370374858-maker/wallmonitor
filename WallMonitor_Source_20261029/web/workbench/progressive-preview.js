import {normalizeTremieLabels} from '../../shared/pipe-labels.js';
                                                                
                                                                             
                                                                                
export function sameLocalTimestamp(left, right) {
  const canonical = value => {
    const text = String(value ?? '').trim().replace('T', ' ');
    return text.length === 16 ? `${text}:00` : text;
  };
  return canonical(left) === canonical(right);
}

export function createPreviewCalculators(domain) {
  const {
    calculateSlot, calculateRecord, makeModel, sidesFor, round, pipeEmbedment,
    DEFAULT_JOINT_DIAMETER, TREMIE_DIAMETER, CALCULATION_VERSION, GEOMETRY_VERSION,
    JOINT_LABELS, parseLocalTime
  } = domain;

  const missing = value => value === null || value === undefined || value === '';
  const precise = value => Math.abs(value * 10000 - Math.round(value * 10000)) <= 0.00001;
  const setIssue = (issues, field, message) => { if (!issues[field]) issues[field] = message; };

  function readNumber(value, field, label, issues, min = 0, max = 1000000, integer = false, preservePrecision = false) {
    if (missing(value)) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      setIssue(issues, field, `${label}必须填写有效数字`);
      return null;
    }
    if (value < min || value > max || (integer && !Number.isInteger(value))) {
      setIssue(issues, field, `${label}应为 ${min}～${max}${integer ? ' 之间的整数' : ' 之间的数值'}`);
      return null;
    }
    if (!integer && !preservePrecision && !precise(value)) {
      setIssue(issues, field, `${label}最多保留四位小数`);
      return null;
    }
    return value;
  }

  function readTime(value, field, issues) {
    if (missing(value)) return null;
    const localIssues = {};
    const parsed = parseLocalTime(value, field, localIssues);
    if (localIssues[field]) {
      setIssue(issues, field, localIssues[field]);
      return null;
    }
    return parsed;
  }

  const validLayout = layout => Object.prototype.hasOwnProperty.call(JOINT_LABELS, layout);
  const finite = value => typeof value === 'number' && Number.isFinite(value);

  function previewSlot(input = {}) {
    const issues = {};
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (code && !/^[\p{L}\p{N}_-]{1,32}$/u.test(code)) {
      issues.code = '槽段编号限 1～32 个中英文、数字、下划线或短横线';
    }
    const width = readNumber(input.width, 'width', '槽段宽度', issues, 0.0001, 10000);
    const depth = readNumber(input.depth, 'depth', '槽段深度', issues, 0.0001, 10000);
    const thickness = readNumber(input.thickness, 'thickness', '槽段厚度', issues, 0.0001, 1000);
    const initialConcreteHeight = readNumber(input.initialConcreteHeight === undefined ? 0 : input.initialConcreteHeight,
      'initialConcreteHeight', '建档时混凝土面高', issues, 0, depth ?? 10000);
    if (thickness !== null && thickness < TREMIE_DIAMETER) {
      issues.thickness = `槽段厚度不能小于浇筑管直径 ${TREMIE_DIAMETER.toFixed(2)} m`;
    }
    const dimensionsReady = width !== null && depth !== null && thickness !== null && initialConcreteHeight !== null &&
      thickness >= TREMIE_DIAMETER;

    const layout = validLayout(input.jointLayout) ? input.jointLayout : null;
    if (!missing(input.jointLayout) && layout === null) {
      issues.jointLayout = '请选择无、单左、单右或双侧接头管';
    }
    const sides = layout === null ? [] : sidesFor(layout);
    let jointDiameter = null;
    if (sides.length) {
      const candidate = input.jointDiameter === undefined ? DEFAULT_JOINT_DIAMETER : input.jointDiameter;
      jointDiameter = readNumber(candidate, 'jointDiameter', '接头管直径', issues, 0.0001,
        thickness ?? 1000);
      if (jointDiameter !== null && thickness !== null && jointDiameter > thickness) {
        issues.jointDiameter = '接头管直径不得超过槽段厚度';
        jointDiameter = null;
      }
    }

    const tremieCount = readNumber(input.tremieCount, 'tremieCount', '浇筑管数量', issues, 1, 3, true);
    const tremieLabels=tremieCount===null?[]:normalizeTremieLabels(input.tremieLabels,tremieCount,issues);
    const tremieInitialDepths = tremieCount === null ? [] : Array.from({ length: tremieCount }, (_, index) =>
      readNumber(input.tremieInitialDepths?.[index], `tremieInitialDepths.${index}`,
        `浇筑管初始埋深 ${index + 1}`, issues, 0.0001, 1000000));
    const jointInitialDepths = Object.fromEntries(sides.map(side => [side,
      readNumber(input.jointInitialDepths?.[side], `jointInitialDepths.${side}`,
        `${side === 'left' ? '左' : '右'}侧接头管初始埋深`, issues, Number.MIN_VALUE, 1000000, false, true)]));

    const grossArea = dimensionsReady ? round(width * thickness) : null;
    let area = null, deductionArea = null;
    if (grossArea !== null && layout !== null && (!sides.length || jointDiameter !== null)) {
      deductionArea = round(sides.length * Math.PI * ((jointDiameter ?? 0) / 2) ** 2 / 2);
      const candidate = round(grossArea - deductionArea);
      if (candidate > 0) area = candidate;
      else issues.width = '有效截面积必须大于 0，请检查尺寸及接头配置';
    }
    const areaStatus = area !== null ? 'effective' : grossArea !== null ? 'gross-reference' : 'unavailable';
    const capacity = area === null ? null : round(area * depth);
    const grossCapacity = grossArea === null ? null : round(grossArea * depth);

    let model = null;
    let pipeLayoutFits = false;
    if (dimensionsReady) {
      const modelLayout = layout !== null && (!sides.length || jointDiameter !== null) ? layout : 'none';
      const modelSides = sidesFor(modelLayout);
      const inset = modelSides.length * (jointDiameter ?? 0) / 2;
      pipeLayoutFits = tremieCount !== null && width - inset >= tremieCount * TREMIE_DIAMETER - 1e-9;
      if (tremieCount !== null && !pipeLayoutFits) {
        setIssue(issues, 'width', `扣除接头半径后，槽宽不足以容纳所配置的 ${TREMIE_DIAMETER.toFixed(2)} m 浇筑管`);
      }
      const modelCount = pipeLayoutFits ? tremieCount : 0;
      const template = makeModel({ width, depth, thickness, initialConcreteHeight, tremieCount: modelCount, tremieLabels,
        tremieInitialDepths: Array(modelCount).fill(0), jointLayout: modelLayout,
        jointInitialDepths: Object.fromEntries(modelSides.map(side => [side, 0])), jointDiameter });
      template.pipes = template.pipes.flatMap(pipe => {
        if (pipe.kind === 'tremie') {
          const index = Number(pipe.id.slice(1)) - 1, initialDepth = tremieInitialDepths[index];
          return initialDepth === null ? [] : [{ ...pipe, initialDepth }];
        }
        const initialDepth = jointInitialDepths[pipe.side];
        return initialDepth === null || initialDepth === undefined ? [] : [{ ...pipe, initialDepth }];
      });
      model = template;
    }

    let completeSlot = null;
    try { completeSlot = calculateSlot(input); } catch {                                                              }
    const tremiesReady = dimensionsReady && tremieCount !== null && pipeLayoutFits &&
      tremieInitialDepths.length === tremieCount && tremieInitialDepths.every(finite);
    const jointsReady = dimensionsReady && layout !== null &&
      (!sides.length || (jointDiameter !== null && sides.every(side => finite(jointInitialDepths[side]))));
    const ready = { dimensions: dimensionsReady, area: area !== null, tremies: tremiesReady,
      joints: jointsReady, complete: completeSlot !== null };

    const notes = [];
    if (grossArea !== null && area === null) {
      notes.push('接头管配置未完成，当前仅提供毛截面积参考，不计算有效面积和理论容量。');
    }
    const slot = completeSlot ?? (dimensionsReady ? {
      code, width, depth, thickness, initialConcreteHeight, tremieCount: tremieCount ?? 0, tremieLabels, tremieInitialDepths,
      jointLayout: layout, jointInitialDepths, jointDiameter, tremieDiameter: TREMIE_DIAMETER,
      area, grossArea, deductionArea, capacity, measurementDatum: 'depth-below-slot-top',
      geometryVersion: GEOMETRY_VERSION, model
    } : null);
    return { slot, area, grossArea, deductionArea, capacity, grossCapacity, areaStatus, ready, issues, notes };
  }

  function previewRecord(slot, input = {}, previous = null) {
    const issues = {}, notes = [];
    const truckNo = readNumber(input.truckNo, 'truckNo', '车号', issues, 1, 1000000, true);
    const volume = readNumber(input.volume, 'volume', '本次方量', issues, 0.0001, 10000000);
    const start = readTime(input.startedAt, 'startedAt', issues);
    const end = readTime(input.endedAt, 'endedAt', issues);
    let durationHours = null;
    if (start && end) {
      if (end.milliseconds <= start.milliseconds) issues.endedAt = '结束浇筑时间必须晚于开始时间';
      else durationHours = (end.milliseconds - start.milliseconds) / 3600000;
    }

    const measurementPoints = Array.from({ length: 6 }, (_, index) =>
      readNumber(input.measurementPoints?.[index], `measurementPoints.${index}`,
        `混凝土面测深 ${index + 1}`, issues, 0, slot.depth));
    const measurementReady = Array.isArray(input.measurementPoints) && input.measurementPoints.length === 6 &&
      measurementPoints.every(finite);

    const previousCumulative = previous ? previous?.metrics?.cumulativeVolume : 0;
    const initialConcreteHeight = finite(slot.initialConcreteHeight) ? slot.initialConcreteHeight : 0;
    const cumulativeVolume = volume !== null && finite(previousCumulative) ? round(previousCumulative + volume) : null;
    const currentRise = volume !== null && finite(slot.area) && slot.area > 0 ? round(volume / slot.area) : null;
    const theoreticalDepth = cumulativeVolume !== null && finite(slot.area) && slot.area > 0
      ? round(slot.depth - initialConcreteHeight - cumulativeVolume / slot.area) : null;
    if (theoreticalDepth !== null && theoreticalDepth < 0) {
      notes.push('累计方量超过设计容积，理论等效面深为负；保留原始计算值，请核对尺寸与方量。');
    }
    const actualDepth = measurementReady
      ? round(measurementPoints.reduce((sum, value) => sum + value, 0) / 6) : null;
    const actualHeight = actualDepth === null ? null : round(slot.depth - actualDepth);
    const actualRiseFromInitial = actualHeight === null ? null : round(actualHeight - initialConcreteHeight);
    const measurementVolume = actualRiseFromInitial === null || !finite(slot.area)
      ? null : round(actualRiseFromInitial * slot.area);
    if (measurementVolume !== null && measurementVolume <= 0) notes.push(measurementVolume === 0
      ? '相对建档初始面的实测新增高度为 0，暂不能计算充盈系数。'
      : '实测面高低于建档初始面，保留负的新增高度和测深折算方量，充盈系数留空。');

    let intervalHours = null;
    if (previous && end) {
      const previousEnd = readTime(previous.endedAt, 'previous', issues);
      if (previousEnd) {
        intervalHours = (end.milliseconds - previousEnd.milliseconds) / 3600000;
        if (intervalHours <= 0) {
          issues.endedAt = '结束时间必须晚于前序记录，不能与其他车的结束时间相同；补录较早数据请通过历史修订核对顺序';
          notes.push('当前结束时间不晚于前序记录，完整提交时需通过历史修订重新核对顺序。');
          intervalHours = null;
        }
      }
    }
    const previousActualDepth = previous?.metrics?.actualDepth;
    const actualSpeed = previous
      ? actualDepth !== null && intervalHours !== null && finite(previousActualDepth)
        ? round((previousActualDepth - actualDepth) / intervalHours) : null
      : actualRiseFromInitial !== null && durationHours !== null
        ? round(actualRiseFromInitial / durationHours) : null;
    if (actualSpeed !== null && actualSpeed < 0) {
      notes.push(previous ? '实测混凝土面低于上次，请核对六个测点及施工情况。'
        : '首车结束实测面高低于建档初始面高，请核对初始面高及六个测点。');
    }

    const previousTremie = previous?.metrics?.tremieDepths ?? slot.tremieInitialDepths;
    const tremiePulls = Array.from({ length: slot.tremieCount }, (_, index) =>
      readNumber(input.tremiePulls?.[index], `tremiePulls.${index}`,
        `本次浇筑管拔出长度 ${index + 1}`, issues, 0, 1000000));
    const tremieDepths = tremiePulls.map((pull, index) => pull !== null && finite(previousTremie?.[index])
      ? round(Math.max(0, previousTremie[index] - pull)) : null);
    tremiePulls.forEach((pull, index) => {
      if (pull !== null && finite(previousTremie?.[index]) && pull > previousTremie[index]) {
        notes.push(`浇筑管 ${index + 1} 拔出量超过剩余管深；原始拔出量保留，剩余管深按 0 m 计算。`);
      }
    });

    const jointSides = sidesFor(slot.jointLayout);
    const previousJoint = previous?.metrics?.jointDepths ?? slot.jointInitialDepths;
    const jointPulls = Object.fromEntries(jointSides.map(side => [side,
      readNumber(input.jointPulls?.[side], `jointPulls.${side}`,
        `本次${side === 'left' ? '左' : '右'}侧接头管拔出长度`, issues, -1000000, 1000000)]));
    const jointDepths = Object.fromEntries(jointSides.map(side => [side,
      jointPulls[side] !== null && finite(previousJoint?.[side])
        ? round(Math.max(0, previousJoint[side] - jointPulls[side])) : null]));
    for (const side of jointSides) {
      if(jointDepths[side]!==null&&jointDepths[side]>slot.depth+1e-7){setIssue(issues,`jointPulls.${side}`,'接头管回落后管底测深不得超过槽深');jointDepths[side]=null;}
      if (jointPulls[side] !== null && finite(previousJoint?.[side]) && jointPulls[side] > previousJoint[side]) {
        notes.push(`${side === 'left' ? '左' : '右'}接头管拔出量超过剩余管深；原始拔出量保留，剩余管深按 0 m 计算。`);
      }
    }

    const tremieEmbedments = tremieDepths.map(value => pipeEmbedment(value, actualDepth));
    const jointSurfaceDifferences = Object.fromEntries(jointSides.map(side =>
      [side, pipeEmbedment(jointDepths[side], actualDepth)]));
    const tremieTheoreticalEmbedments = tremieDepths.map(value => pipeEmbedment(value, theoreticalDepth));
    const jointTheoreticalEmbedments = Object.fromEntries(jointSides.map(side =>
      [side, pipeEmbedment(jointDepths[side], theoreticalDepth)]));
    const theoreticalSpeed = currentRise !== null && durationHours !== null
      ? round(currentRise / durationHours) : null;
    const fillCoefficient = cumulativeVolume !== null && measurementVolume !== null && measurementVolume > 0
      ? round(cumulativeVolume / measurementVolume) : null;
    const progressPercent = actualHeight === null ? null : round(actualHeight / slot.depth * 100);

    const metrics = {
      calculationVersion: CALCULATION_VERSION, geometryVersion: slot.geometryVersion,
      measurementDatum: slot.measurementDatum, evaluatedAt: end?.text ?? null,
      initialConcreteHeight,
      area: slot.area, durationHours: durationHours === null ? null : round(durationHours),
      currentRise, cumulativeVolume, theoreticalDepth, theoreticalSpeed,
      actualDepth, actualHeight, actualRiseFromInitial, actualSpeed, measurementVolume, fillCoefficient, progressPercent,
      tremieDepths, jointDepths, tremieEmbedments, jointSurfaceDifferences,
      tremieTheoreticalEmbedments, jointTheoreticalEmbedments, notes
    };
    const timingReady = durationHours !== null;
    const tremieReady = Array.isArray(input.tremiePulls) && input.tremiePulls.length === slot.tremieCount &&
      tremiePulls.every(finite);
    const jointReady = input.jointPulls && typeof input.jointPulls === 'object' &&
      jointSides.every(side => finite(jointPulls[side]));
    let official = null;
    try { official = calculateRecord(slot, input, previous); } catch {                                                 }
    const ready = { volume: volume !== null, timing: timingReady, measurement: measurementReady,
      tremies: tremieReady, joints: Boolean(jointReady), actualSpeed: actualSpeed !== null,
      fillCoefficient: fillCoefficient !== null, complete: official !== null };

    if (official) {
      return { raw: official.raw, metrics: {
        ...official.metrics,
        tremieTheoreticalEmbedments: official.metrics.tremieDepths.map(value =>
          pipeEmbedment(value, official.metrics.theoreticalDepth)),
        jointTheoreticalEmbedments: Object.fromEntries(Object.entries(official.metrics.jointDepths).map(
          ([side, value]) => [side, pipeEmbedment(value, official.metrics.theoreticalDepth)]))
      }, ready, issues: {} };
    }
    return { raw: { truckNo, startedAt: start?.text ?? null, endedAt: end?.text ?? null, volume,
      measurementPoints, tremiePulls, jointPulls }, metrics, ready, issues };
  }

  return { previewSlot, previewRecord };
}
