import { api, esc, fmt, timeText } from './format.js';
import { dialog, showDialogNotice } from './dialog.js';

export const EDIT_PICKER_LIMIT = 6;
export function recordChoiceMarkup(data, selectedId) {
  if (!data.rows.length) return '<p>当前槽段暂无施工记录，请先新建一条完整记录。</p>';
  return `<table class="record-picker-table"><thead><tr><th>车号</th><th>浇筑结束时间</th><th>方量 / m³</th><th>操作</th></tr></thead><tbody>${data.rows.map(row => `<tr class="${row.id === selectedId ? 'selected' : ''}"><td><b>${esc(row.truckNo)}</b></td><td>${esc(timeText(row.endedAt))}</td><td>${fmt(row.volume)}</td><td><button type="button" class="secondary-button" data-pick-record="${esc(row.id)}" aria-label="载入第 ${esc(row.truckNo)} 车进行修改">载入修改</button></td></tr>`).join('')}</tbody></table>
    <div class="reconcile-pages"><button type="button" class="secondary-button" data-picker-offset="${Math.max(0, data.offset - EDIT_PICKER_LIMIT)}" ${data.offset === 0 ? 'disabled' : ''}>上一页</button><span>${data.offset + 1}—${data.offset + data.rows.length} / ${data.total}</span><button type="button" class="secondary-button" data-picker-offset="${data.offset + EDIT_PICKER_LIMIT}" ${data.offset + data.rows.length >= data.total ? 'disabled' : ''}>下一页</button></div>`;
}

                                                                                
export function chooseRecordForEdit(slot, selectedId) {
  return new Promise(resolve => {
    const node = dialog(`${slot.code} · 修改历史记录`, '<p>选择一车，将四个模块的原始数据载入输入框。修改后先预览重算，再确认保存。</p><div class="record-picker-list" aria-live="polite">正在读取施工记录…</div>', '<button type="button" class="secondary-button" data-close>取消</button>');
    let closed = false, loading = false, offset = 0, controller = null;
    const finish = id => { if (closed) return; closed = true; controller?.abort(); node.remove(); resolve(id); };
    async function render() {
      if (closed || loading) return;
      loading = true; controller = new AbortController();
      node.setAttribute('aria-busy', 'true');
      for (const button of node.querySelectorAll('[data-pick-record],[data-picker-offset]')) button.disabled = true;
      node.querySelector('[data-dialog-notice]').hidden = true;
      try {
        const data = await api(`/slots/${encodeURIComponent(slot.id)}/records?limit=${EDIT_PICKER_LIMIT}&offset=${offset}`, { signal: controller.signal, label: '正在读取可修改的施工记录' });
        if (!closed) node.querySelector('.record-picker-list').innerHTML = recordChoiceMarkup(data, selectedId);
      } catch (error) {
        if (!closed) {
          showDialogNotice(node, error.message);
          node.querySelector('.record-picker-list').innerHTML = '<button type="button" class="secondary-button" data-picker-retry>重新读取</button>';
        }
      } finally { loading = false; node.setAttribute('aria-busy', 'false'); }
    }
    node.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    node.addEventListener('click', event => {
      const b = event.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-close')) { finish(null); return; }
      if (loading) return;
      if (b.dataset.pickRecord) finish(b.dataset.pickRecord);
      if (b.hasAttribute('data-picker-offset')) { offset = Number(b.dataset.pickerOffset); render(); }
      if (b.hasAttribute('data-picker-retry')) render();
    });
    render();
  });
}
