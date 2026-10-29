import { sidesFor } from '/workbench-domain.js';
import { api, esc, fmt, timeText } from './format.js';
import { dialog, showDialogNotice } from './dialog.js';
import {renderRevisionHistory} from './revision-history.js';
const closeButton = '<button type="button" class="secondary-button" data-close>取消</button>';
function showError(node, error) {
  showDialogNotice(node, error.issues ? Object.values(error.issues).join('；') : error.message);
}

                                                                                   
export function reconcilePipes(slot, records) {
  const columns = [...Array.from({ length: slot.tremieCount }, (_, i) => ({ kind: 'tremie', id: i, label: `浇筑管 ${i + 1}` })),
    ...sidesFor(slot.jointLayout).map(side => ({ kind: 'joint', id: side, label: side === 'left' ? '左接头管' : '右接头管' }))];
  const patches = records.map(row => ({ id: row.id,
    tremiePulls: Array.from({ length: slot.tremieCount }, (_, i) => row.tremiePulls[i] ?? null),
    jointPulls: Object.fromEntries(sidesFor(slot.jointLayout).map(side => [side, row.jointPulls[side] ?? null])) }));
  return new Promise(resolve => {
    const node = dialog('核对历史拔管量', `<p>每格为该车实际拔出长度（m）。新增管道留空待补齐，未拔管请明确填 0；移除管道的旧输入仍保存在修改备份中。</p><div class="pipe-reconciliation"></div><div class="reconcile-pages"></div>`,
      `${closeButton}<button type="button" class="primary-button" data-next>全部核对完毕 · 开始重算</button>`);
    let page = 0;
    const finish = value => { node.remove(); resolve(value); };
    const render = () => {
      node.querySelector('.pipe-reconciliation').innerHTML = `<table><thead><tr><th>车号</th>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr></thead><tbody>${records.slice(page * 8, page * 8 + 8).map((row, index) => {
        const i = page * 8 + index;
        return `<tr><th>${row.truckNo}</th>${columns.map((col, j) => `<td><input type="number" min="${col.kind==='joint'?-1000000:0}" max="1000000" step="0.01" data-row="${i}" data-col="${j}" value="${patches[i][col.kind + 'Pulls'][col.id] ?? ''}" aria-label="车号 ${row.truckNo} ${col.label} 拔出长度"></td>`).join('')}</tr>`;
      }).join('')}</tbody></table>`;
      node.querySelector('.reconcile-pages').innerHTML = `<button type="button" class="secondary-button" data-page="-1" ${page === 0 ? 'disabled' : ''}>上一页</button><span>${page + 1} / ${Math.ceil(records.length / 8)} · 共 ${records.length} 车</span><button type="button" class="secondary-button" data-page="1" ${(page + 1) * 8 >= records.length ? 'disabled' : ''}>下一页</button>`;
    };
    node.addEventListener('input', event => {
      const input = event.target;
      if (!input.matches('[data-row]')) return;
      const col = columns[Number(input.dataset.col)];
      patches[Number(input.dataset.row)][col.kind + 'Pulls'][col.id] = input.value === '' ? null : Number(input.value);
    });
    node.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    node.addEventListener('click', event => {
      const b = event.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-close')) finish(null);
      if (b.dataset.page) { page += Number(b.dataset.page); render(); }
      if (b.hasAttribute('data-next')) {
        const invalid = patches.findIndex(patch => columns.some(col => { const v = patch[col.kind + 'Pulls'][col.id]; return !Number.isFinite(v) || v < 0 || v > 1000000 || Math.abs(v * 10000 - Math.round(v * 10000)) > .00001; }));
        if (invalid >= 0) { page = Math.floor(invalid / 8); render(); showError(node, new Error(`请补齐车号 ${records[invalid].truckNo} 的非负有效拔管量（最多四位小数）`)); return; }
        finish(patches);
      }
    });
    render();
  });
}

const comparison = (label, before, after, unit, digits = 2) => `<tr><th>${label}</th><td>${fmt(before, digits === 0 ? 0 : 2)} ${unit}</td><td>${fmt(after, digits === 0 ? 0 : 2)} ${unit}</td></tr>`;
export async function submitRevision(slotId, payload, onPreview = () => {}) {
  const preview = await api(`/slots/${slotId}/revisions/preview`, { method: 'POST', body: JSON.stringify(payload) });
  onPreview(preview);
  const before = preview.before.metrics, after = preview.after.metrics;
  return new Promise(resolve => {
    const node = dialog('确认修改与整槽重算', `<div class="revision-counts"><div><small>重算时刻</small><b>${preview.recalculated} <em>${esc(preview.unit || '个时刻')}</em></b></div><div><small>更新快照</small><b>${preview.changed} <em>条</em></b></div><div><small>原始记录变更</small><b>${preview.rawChanged} <em>条</em></b></div></div>
      <p>仅影响当前槽段。旧槽段参数保留修订备份；任一事件校验失败将全部取消。${preview.orderChanged ? '发生时间已改变事件先后顺序。' : ''}</p>
      <table><thead><tr><th>整槽 / 最新车指标</th><th>修改前</th><th>修改后</th></tr></thead><tbody>${comparison('有效截面积', preview.before.area, preview.after.area, 'm²', 2)}${comparison('最新车号', preview.before.latestTruckNo, preview.after.latestTruckNo, '', 0)}${comparison('累计浇筑方量', before?.cumulativeVolume, after?.cumulativeVolume, 'm³')}${comparison('理论面深', before?.theoreticalDepth, after?.theoreticalDepth, 'm')}${comparison('实测面深', before?.actualDepth, after?.actualDepth, 'm')}${comparison('充盈系数', before?.fillCoefficient, after?.fillCoefficient, '', 2)}</tbody></table>
      <p class="revision-policy-note">事件原始输入保持不变，按修改后的槽段参数重放；旧槽段参数可从修订日志查阅。大屏使用当前规则评价，计算结果不能手动填写。</p>
      <label class="field">修改原因<input name="revisionReason" required maxlength="500" placeholder="例如：现场复测后更正初始混凝土面高"></label>`,
      `${closeButton}<button type="button" class="primary-button" data-commit ${preview.storageReady === false ? 'disabled' : ''}>确认修改并重算</button>`);
    if (preview.storageReady === false) showError(node, new Error('修订备份表尚未初始化，请由管理员执行 database/workbench.sql 后重新预览。为保护历史数据，暂不允许覆盖保存；新建记录不受影响。'));
    let saving = false, requestId = crypto.randomUUID();
    const finish = value => { node.remove(); resolve(value); };
    node.addEventListener('cancel', event => { event.preventDefault(); if (!saving) finish(null); });
    node.querySelector('[name=revisionReason]').addEventListener('input', () => { requestId = crypto.randomUUID(); });
    node.addEventListener('click', async event => {
      const b = event.target.closest('button'); if (!b || b.disabled || saving) return;
      if (b.hasAttribute('data-close')) { finish(null); return; }
      if (!b.hasAttribute('data-commit')) return;
      const reason = node.querySelector('[name=revisionReason]');
      if (!reason.reportValidity()) return;
      saving = true; for (const control of node.querySelectorAll('button,input')) control.disabled = true;
      b.textContent = '正在备份与重算…'; b.dataset.working = 'true'; node.setAttribute('aria-busy', 'true');
      try {
        const result = await api(`/slots/${slotId}/revisions`, { method: 'POST', body: JSON.stringify({ ...payload, requestId, previewToken: preview.previewToken, reason: reason.value }) });
        finish(result);
      } catch (error) { showError(node, error); }
      finally { saving = false; node.setAttribute('aria-busy', 'false'); for (const control of node.querySelectorAll('button,input')) control.disabled = false; delete b.dataset.working; b.textContent = '确认修改并重算'; }
    });
  });
}

export async function showRevisionHistory(slotId,{slotOnly=false}={}) {
  const node = dialog(slotOnly?'槽段修改历史':'修订日志', '<div class="revision-log">正在读取…</div>', '<button type="button" class="secondary-button" data-close>关闭</button>');
  let offset = 0;
  const render = async () => {
    try {
      const data = await api(`/slots/${slotId}/revisions?offset=${offset}${slotOnly?'&kind=slot':''}`);
      if(node.isConnected)node.querySelector('.revision-log').innerHTML=renderRevisionHistory(data,slotId);
    } catch (error) { showError(node, error); }
  };
  node.addEventListener('cancel', () => node.remove());
  node.addEventListener('click', event => { const b = event.target.closest('button'); if (!b || b.disabled) return; if (b.hasAttribute('data-close')) node.remove(); if (b.hasAttribute('data-offset')) { offset = Number(b.dataset.offset); render(); } });
  await render();
}
