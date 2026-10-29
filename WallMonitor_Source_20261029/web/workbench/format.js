export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (value, digits = 2) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const timeText = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—';
export function numericField(name, label, { value = '', max = 10000, min = 0, integer = false, help = '', step = integer ? 1 : .01 } = {}) {
                                                                          
                                                                    
  return `<label class="field">${esc(label)}<div class="unit-input"><input name="${esc(name)}" type="number" value="${esc(value)}" min="${min}" max="${max}" step="${step}" required inputmode="decimal"><span>${integer ? '' : 'm'}</span></div>${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}

export { requestJson as api } from '../ui/request.js';
