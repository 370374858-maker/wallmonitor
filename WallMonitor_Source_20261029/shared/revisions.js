import { calculateSlot, calculateRecord, ValidationError } from './construction.js';
import { evaluateRecord, policyFor, timeMs, createSettingHistory } from './monitoring.js';

export const RECORD_FIELDS = ['truckNo', 'startedAt', 'endedAt', 'volume', 'measurementPoints', 'tremiePulls', 'jointPulls'];
export const rawRecord = row => Object.fromEntries(RECORD_FIELDS.map(key => [key, structuredClone(row[key])]));
export const dataRevision = slot => Number(slot.dataRevision || 0);
                                                                  
const equalData = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' &&
  Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every(key => Object.hasOwn(b, key) && equalData(a[key], b[key])));

                                                                           
                                                                               
                                                                                 
   
export function planRevision(slot, records, { kind, targetId, values, recordPatches = [] }) {
  if (!['slot', 'record'].includes(kind)) throw new ValidationError({ kind: '请选择槽段或施工记录修改' });
  if (!values || typeof values !== 'object') throw new ValidationError({ values: '缺少修改内容' });
  if (!Array.isArray(recordPatches) || (kind === 'record' && recordPatches.length)) {
    throw new ValidationError({ recordPatches: '历史管道补录仅用于槽段配置修订' });
  }
  const geometry = calculateSlot(kind === 'slot' ? values : slot);
  const nextSlot = { ...slot, ...geometry };
  const source = records.map(row => ({ ...row, ...rawRecord(row) }));
  if (kind === 'record') {
    const row = source.find(row => row.id === targetId);
    if (!row) throw new ValidationError({ targetId: '待修改的记录不属于当前槽段' });
    Object.assign(row, rawRecord(values));
  }
  const seenPatches = new Set();
  const byId = new Map(source.map(row => [row.id, row]));
  for (const patch of recordPatches) {
    if (!patch || typeof patch !== 'object') throw new ValidationError({ recordPatches: '历史拔管补录内容无效' });
    const row = byId.get(patch.id);
    if (!row || seenPatches.has(patch.id) || Object.keys(patch).some(key => !['id', 'tremiePulls', 'jointPulls'].includes(key))) {
      throw new ValidationError({ recordPatches: '历史补录必须对应本槽段的唯一记录，且只能修改拔管量' });
    }
    seenPatches.add(patch.id);
    row.tremiePulls = structuredClone(patch.tremiePulls);
    row.jointPulls = structuredClone(patch.jointPulls);
  }
  source.sort((a, b) => timeMs(a.endedAt) - timeMs(b.endedAt) || a.id.localeCompare(b.id));
  const truckNos = new Set(), replayed = [];
  const settingHistory = createSettingHistory(nextSlot);
  for (const row of source) {
    try {
      if (truckNos.has(row.truckNo)) throw new ValidationError({ truckNo: '同一槽段的车号不能重复' });
      truckNos.add(row.truckNo);
      const previous = replayed.at(-1) ?? null;
      const { raw, metrics } = calculateRecord(nextSlot, row, previous);
                                                                                
      const policy = row.metrics?.monitoring?.policy ?? policyFor(row.slotSnapshot ?? slot);
      const slotSnapshot = { ...row.slotSnapshot, ...geometry, monitoringPolicy: policy };
      const updated = { ...row, ...raw, metrics, slotSnapshot, previousRecordId: previous?.id ?? null };
      replayed.push(updated);
      settingHistory.append(updated);
      metrics.monitoring = evaluateRecord(nextSlot, replayed, timeMs(raw.endedAt), policy, settingHistory.estimate(timeMs(raw.endedAt), policy));
    } catch (error) {
      if (!error.issues) throw error;
      throw new ValidationError(Object.fromEntries(Object.entries(error.issues).map(([key, message]) =>
        [`records.${row.id}.${key}`, `车号 ${row.truckNo}：${message}`])));
    }
  }
  const original = new Map(records.map(row => [row.id, row]));
  const changed = replayed.filter(row => !equalData(row, original.get(row.id)));
  const rawChanged = replayed.filter(row => !equalData(rawRecord(row), rawRecord(original.get(row.id))));
  const latestBefore = records.at(-1) ?? null, latestAfter = replayed.at(-1) ?? null;
  return { slot: nextSlot, records: replayed, changed,
    summary: { kind, targetId: kind === 'slot' ? slot.id : targetId, total: records.length,
      hasInputChanges: rawChanged.length > 0 || !equalData(geometry, calculateSlot(slot)),
      recalculated: replayed.length, changed: changed.length, rawChanged: rawChanged.length,
      orderChanged: replayed.some((row, i) => records[i]?.id !== row.id),
      configurationChanged: slot.tremieCount !== geometry.tremieCount || slot.jointLayout !== geometry.jointLayout,
      before: { area: slot.area, latestTruckNo: latestBefore?.truckNo ?? null, metrics: latestBefore?.metrics ?? null },
      after: { area: geometry.area, latestTruckNo: latestAfter?.truckNo ?? null, metrics: latestAfter?.metrics ?? null } } };
}
