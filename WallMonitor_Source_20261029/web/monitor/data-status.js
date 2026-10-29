export function dataStatus(data, { offline = false, paused = false } = {}) {
  if (offline) return { text: '连接中断 · 历史画面', tone: 'danger' };
  if (paused) return { text: '刷新暂停 · 非实时', tone: 'warn' };
  if (!data?.latest) return { text: '等待施工数据', tone: 'muted' };
  if (data.displayMode === 'future-preview') return { text: '未来时间预览 · 非实时', tone: 'warn' };
  return { text: '已加载最新记录', tone: 'ok' };
}

export function latestDataTime(data, pressures = {}) {
  if (!data) return null;
  const values = [data.latest?.endedAt, data.latest?.occurredAt, data.freshness?.measurementAt,
    ...Object.values(data.streamTimes ?? {}), ...['left','right'].map(side => pressures[side]?.sourceAt)];
  const times = values.filter(value => typeof value === 'string').map(value =>
    Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(' ', 'T') + '+08:00')).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times) + 8 * 3600000).toISOString().slice(0,19).replace('T',' ') : null;
}
