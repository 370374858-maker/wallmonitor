import { esc } from './format.js';

export const minuteTime = value => String(value ?? '').replace(' ', 'T').slice(0,16);
                                                                          
export const recordTimeForSave = (value, original) => original && value === minuteTime(original)
  ? String(original).replace(' ', 'T') : value;

export function recordTruckField(editing, choices, nextTruckNo) {
  if (!editing) return `<label class="field">车号 · 自动编号<input name="truckNo" type="number" min="1" max="1000000" step="1" value="${nextTruckNo}" readonly aria-readonly="true" required></label>`;
  const records = choices.some(row => row.id === editing.id) ? choices : [editing, ...choices];
  return `<label class="field">车号 · 选择记录<select name="truckNo" data-record-choice aria-label="车号 · 选择记录">${records.map(row => `<option value="${esc(row.truckNo)}" ${row.id === editing.id ? 'selected' : ''}>${esc(row.truckNo)}</option>`).join('')}</select></label>`;
}

export async function loadRecordChoices(request, slotId) {
  const choices = new Map(); let offset = 0;
  while (true) {
    const page = await request(`/slots/${encodeURIComponent(slotId)}/records?limit=100&offset=${offset}`, { activity:false });
    for (const row of page.rows) choices.set(row.id, { id:row.id, truckNo:row.truckNo });
    offset += page.rows.length;
    if (offset >= page.total) break;
    if (!page.rows.length) throw new Error('记录列表读取不完整，请刷新后重试。');
  }
  return [...choices.values()].sort((a,b)=>a.truckNo-b.truckNo);
}
