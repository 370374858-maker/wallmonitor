import {
  getAlerts,
  getLatestCuring,
  getLatestJointPipe,
  getLatestMeasurement,
  getLatestPouring,
  getLatestPressure,
  getLatestTremie,
  getMeasurementHistory,
  getPouringHistory,
  getPressureHistory,
  getSlot
} from './repository.js';
import {
  calculateHealthScore,
  classifyFillCoefficient,
  classifyJointClearance,
  classifyPressure,
  classifySpeed,
  classifyTremieEmbedment
} from './domain/safety-rules.js';

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timeLabel(value) {
  if (!value) return '--:--';
  const match = String(value).match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : String(value);
}

function dateTimeLabel(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

function calculateCuringHeight(curing) {
  if (!curing) return null;
  const theory = finite(curing.theoreticalHeight);
  const current = finite(curing.currentHeight);
  const sequence = finite(curing.sequenceNo);
  const rise = finite(curing.riseHeight);
  if ([theory, current, sequence, rise].some((value) => value === null)) return null;
  return theory + current - (sequence - 1) * 0.1 - rise;
}

function calculateCompleteness(parts) {
  const present = parts.filter(Boolean).length;
  return Number((present / parts.length * 100).toFixed(1));
}

function makePipes(tremie, joint, actualHeight, curingHeight) {
  const tremieValues = tremie ? [tremie.pipe1, tremie.pipe2, tremie.pipe3] : [null, null, null];
  const jointValues = joint ? [joint.pipe1, joint.pipe2] : [null, null];
  const pipes = tremieValues.map((depth, index) => {
    const numericDepth = finite(depth);
    const diff = numericDepth === null || actualHeight === null ? null : numericDepth - actualHeight;
    return {
      id: 't' + (index + 1),
      name: '浇筑管 ' + (index + 1),
      kind: 'tremie',
      depth: numericDepth,
      diff,
      status: classifyTremieEmbedment(diff)
    };
  });
  jointValues.forEach((depth, index) => {
    const numericDepth = finite(depth);
    const diff = numericDepth === null || curingHeight === null ? null : numericDepth - curingHeight;
    pipes.push({
      id: 'j' + (index + 1),
      name: '接头管 ' + (index + 1),
      kind: 'joint',
      depth: numericDepth,
      diff,
      status: classifyJointClearance(diff)
    });
  });
  return pipes;
}

function formatAlerts(rows) {
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    category: row.category,
    time: timeLabel(row.occurredAt),
    occurredAt: row.occurredAt,
    desc: row.description,
    value: row.value === null ? row.unit || '—' : Number(row.value).toFixed(2) + (row.unit ? ' ' + row.unit : ''),
    status: row.status
  }));
}

export async function getDashboardSnapshot(slotCode) {
  const slot = await getSlot(slotCode);
  if (!slot) {
    const error = new Error('Slot not found');
    error.status = 404;
    throw error;
  }

  const [
    pouring,
    measurement,
    tremie,
    joint,
    pressure,
    curing,
    pouringHistory,
    measurementHistory,
    pressureHistory,
    alerts
  ] = await Promise.all([
    getLatestPouring(slotCode),
    getLatestMeasurement(slotCode),
    getLatestTremie(slotCode),
    getLatestJointPipe(slotCode),
    getLatestPressure(slotCode),
    getLatestCuring(slotCode),
    getPouringHistory(slotCode, 24),
    getMeasurementHistory(slotCode, 24),
    getPressureHistory(slotCode, 24),
    getAlerts({ slotCode, limit: 24 })
  ]);

  const theoryHeight = finite(pouring?.theoreticalHeight, 0);
  const actualHeight = finite(measurement?.actualHeight, 0);
  const curingHeight = calculateCuringHeight(curing) ?? Math.max(0, actualHeight - 0.8);
  const actualVolume = finite(pouring?.cumulativeVolume, 0);
  const theoryVolume = finite(measurement?.theoreticalCumulativeVolume, 0);
  const fillCoefficient = theoryVolume > 0 ? actualVolume / theoryVolume : 0;
  const actualSpeed = finite(measurement?.speed, 0);
  const theorySpeed = finite(pouring?.speed, 0);
  const pressureValue = finite(pressure?.value, 0);
  const pipes = makePipes(tremie, joint, actualHeight, curingHeight);
  const dataIntegrity = calculateCompleteness([pouring, measurement, tremie, joint, pressure, curing]);
  const health = calculateHealthScore({
    pipes,
    fillCoefficient,
    speed: actualSpeed,
    pressure: pressureValue,
    dataIntegrity
  });

  const pouringByTime = pouringHistory.map((row) => ({
    time: timeLabel(row.endedAt),
    theoryHeight: finite(row.theoreticalHeight, 0),
    theorySpeed: finite(row.speed, 0),
    actualVolume: finite(row.cumulativeVolume, 0)
  }));
  const measurementByTime = measurementHistory.map((row) => ({
    time: timeLabel(row.measuredAt),
    actualHeight: finite(row.actualHeight, 0),
    actualSpeed: finite(row.speed, 0),
    theoryVolume: finite(row.theoreticalCumulativeVolume, 0)
  }));

  return {
    id: slot.id,
    status: slot.status,
    profile: {
      type: slot.type,
      category: slot.category,
      depth: finite(slot.depth, 0),
      width: finite(slot.width, 0),
      thickness: finite(slot.thickness, 0),
      tremieCount: finite(slot.tremieCount, 0),
      jointCount: finite(slot.jointCount, 0),
      start: dateTimeLabel(slot.start),
      duration: '实时统计'
    },
    progress: { theory: theoryHeight, actual: actualHeight, curing: curingHeight },
    concrete: {
      actual: actualVolume,
      theory: theoryVolume,
      fillCoefficient,
      status: classifyFillCoefficient(fillCoefficient)
    },
    speed: {
      theory: theorySpeed,
      actual: actualSpeed,
      status: classifySpeed(actualSpeed),
      times: measurementByTime.map((row) => row.time),
      actualSeries: measurementByTime.map((row) => row.actualSpeed),
      theorySeries: measurementByTime.map((row, index) => pouringByTime[index]?.theorySpeed ?? theorySpeed)
    },
    pressure: {
      value: pressureValue,
      time: timeLabel(pressure?.measuredAt),
      status: classifyPressure(pressureValue),
      times: pressureHistory.map((row) => timeLabel(row.measuredAt)),
      values: pressureHistory.map((row) => finite(row.value, 0))
    },
    volume: {
      times: measurementByTime.map((row) => row.time),
      theorySeries: measurementByTime.map((row) => row.theoryVolume),
      actualSeries: measurementByTime.map((row, index) => pouringByTime[index]?.actualVolume ?? actualVolume)
    },
    pipes,
    quality: { dataIntegrity },
    health,
    alarms: formatAlerts(alerts),
    history: {
      pouring: pouringHistory,
      measurement: measurementHistory,
      pressure: pressureHistory
    },
    updatedAt: new Date().toISOString()
  };
}
