export const limits = Object.freeze({
  fill: { min: 1, max: 1.2 },
  tremie: { normalMin: 2, normalMax: 6, watchMin: 1, watchMax: 10 },
  joint: { minExclusive: 0, max: 0.5 },
  speed: { dangerBelow: 2, watchBelow: 3 },
  pressure: { watchAbove: 1.1, dangerAbove: 1.2 }
});

export function pipeStatus(pipe) {
  if (pipe.diff === null || pipe.diff === undefined || !Number.isFinite(Number(pipe.depth))) {
    return { key: 'muted', label: '未配置' };
  }
  const value = Number(pipe.diff);
  if (pipe.kind === 'tremie') {
    if (value >= limits.tremie.normalMin && value <= limits.tremie.normalMax) {
      return { key: 'ok', label: '正常' };
    }
    if (
      (value >= limits.tremie.watchMin && value < limits.tremie.normalMin) ||
      (value > limits.tremie.normalMax && value <= limits.tremie.watchMax)
    ) {
      return { key: 'warn', label: '关注' };
    }
    return { key: 'danger', label: '告警' };
  }
  if (value > limits.joint.minExclusive && value <= limits.joint.max) {
    return { key: 'ok', label: '正常' };
  }
  return { key: 'danger', label: '告警' };
}

export function fillStatus(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return { key: 'muted', label: '无数据' };
  if (numeric >= limits.fill.min && numeric <= limits.fill.max) return { key: 'ok', label: '正常' };
  return { key: 'danger', label: numeric < limits.fill.min ? '充盈不足' : '超出上限' };
}

export function speedStatus(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { key: 'muted', label: '无数据' };
  if (numeric < limits.speed.dangerBelow) return { key: 'danger', label: '速度偏低' };
  if (numeric < limits.speed.watchBelow) return { key: 'warn', label: '重点关注' };
  return { key: 'ok', label: '速度稳定' };
}

export function healthFrom(data) {
  if (data.health) return data.health;
  const statuses = data.pipes.map((pipe) => pipe.status || pipeStatus(pipe));
  statuses.push(fillStatus(data.concrete.fillCoefficient));
  statuses.push(speedStatus(data.speed.actual));
  const danger = statuses.filter((status) => status.key === 'danger').length;
  const warn = statuses.filter((status) => status.key === 'warn').length;
  const completeness = Number(data.quality?.dataIntegrity || 0);
  const score = Math.max(0, Math.round(100 - danger * 12 - warn * 4 - (100 - completeness) * .5));
  return {
    score,
    danger,
    warn,
    state: danger ? 'danger' : warn ? 'warn' : 'ok',
    label: danger ? '存在告警' : warn ? '重点关注' : '运行正常'
  };
}
