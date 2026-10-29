export const LIMITS = Object.freeze({
  fillCoefficient: { min: 1, max: 1.2 },
  tremieEmbedment: { normalMin: 2, normalMax: 6, watchMin: 1, watchMax: 10 },
  jointClearance: { minExclusive: 0, max: 0.5 },
  pouringSpeed: { dangerBelow: 2, watchBelow: 3 },
  pressure: { watchAbove: 1.1, dangerAbove: 1.2 }
});

export function classifyFillCoefficient(value) {
  if (!Number.isFinite(value) || value <= 0) return { key: 'muted', label: '无数据' };
  if (value >= LIMITS.fillCoefficient.min && value <= LIMITS.fillCoefficient.max) {
    return { key: 'ok', label: '正常' };
  }
  return { key: 'danger', label: value < LIMITS.fillCoefficient.min ? '充盈不足' : '超出上限' };
}

export function classifyTremieEmbedment(value) {
  if (!Number.isFinite(value)) return { key: 'muted', label: '未配置' };
  if (value >= LIMITS.tremieEmbedment.normalMin && value <= LIMITS.tremieEmbedment.normalMax) {
    return { key: 'ok', label: '正常' };
  }
  if (
    (value >= LIMITS.tremieEmbedment.watchMin && value < LIMITS.tremieEmbedment.normalMin) ||
    (value > LIMITS.tremieEmbedment.normalMax && value <= LIMITS.tremieEmbedment.watchMax)
  ) {
    return { key: 'warn', label: '关注' };
  }
  return { key: 'danger', label: '告警' };
}

export function classifyJointClearance(value) {
  if (!Number.isFinite(value)) return { key: 'muted', label: '未配置' };
  if (value > LIMITS.jointClearance.minExclusive && value <= LIMITS.jointClearance.max) {
    return { key: 'ok', label: '正常' };
  }
  return { key: 'danger', label: '告警' };
}

export function classifySpeed(value) {
  if (!Number.isFinite(value)) return { key: 'muted', label: '无数据' };
  if (value < LIMITS.pouringSpeed.dangerBelow) return { key: 'danger', label: '速度偏低' };
  if (value < LIMITS.pouringSpeed.watchBelow) return { key: 'warn', label: '重点关注' };
  return { key: 'ok', label: '速度稳定' };
}

export function classifyPressure(value) {
  if (!Number.isFinite(value)) return { key: 'muted', label: '无数据' };
  if (value > LIMITS.pressure.dangerAbove) return { key: 'danger', label: '压力告警' };
  if (value > LIMITS.pressure.watchAbove) return { key: 'warn', label: '压力偏高' };
  return { key: 'ok', label: '压力稳定' };
}

export function calculateHealthScore({ pipes, fillCoefficient, speed, pressure, dataIntegrity }) {
  const statuses = [
    ...pipes.map((pipe) => pipe.status),
    classifyFillCoefficient(fillCoefficient),
    classifySpeed(speed),
    classifyPressure(pressure)
  ];
  const danger = statuses.filter((item) => item.key === 'danger').length;
  const warn = statuses.filter((item) => item.key === 'warn').length;
  const missing = statuses.filter((item) => item.key === 'muted').length;
  const completenessPenalty = Math.max(0, 100 - Number(dataIntegrity || 0)) * 0.5;
  const score = Math.max(0, Math.round(100 - danger * 12 - warn * 4 - missing * 2 - completenessPenalty));
  return {
    score,
    danger,
    warn,
    state: danger ? 'danger' : warn ? 'warn' : 'ok',
    label: danger ? '存在告警' : warn ? '重点关注' : '运行正常'
  };
}
