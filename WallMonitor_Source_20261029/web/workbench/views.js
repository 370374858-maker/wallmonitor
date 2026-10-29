import { sidesFor, JOINT_LABELS, pipeEmbedment } from '/workbench-domain.js';
import { esc, fmt, numericField, timeText } from './format.js';
import { createHistoryTable } from './ledger-grid.js';
import { recordTruckField } from './record-controls.js';
export const historyTable = createHistoryTable({ pipeEmbedment });

export const emptyState = (title, text) => `<article class="card empty-card"><div class="empty-number">01</div><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="primary-button" data-go-slot>先建立槽段 →</button></article>`;

export function recordForm(slot, latest, editing = null, choices = []) {
  const tremieDepths = latest?.metrics.tremieDepths ?? slot.tremieInitialDepths;
  const jointDepths = latest?.metrics.jointDepths ?? slot.jointInitialDepths;
  return `<div class="saved-context"><span><strong>${esc(slot.code)}</strong> · 深 ${fmt(slot.depth)} m · ${slot.tremieCount} 根浇筑管 · ${JOINT_LABELS[slot.jointLayout]}</span><span>${latest ? `上一车 #${latest.truckNo}` : '首次施工记录'}</span></div>
  <form id="record-form" class="card" aria-label="${esc(slot.code)} · ${editing ? '修改施工记录' : '新建施工记录'}" data-record-mode="${editing ? 'edit' : 'create'}">
  <div class="form-body"><div class="datum-note">测深基准：槽口向下；测量时间：本车浇筑结束。</div>
  <fieldset class="record-module" aria-label="浇筑数据"><div class="module-header"><h3>浇筑数据</h3></div><div class="fields two">
    ${recordTruckField(editing, choices, (latest?.truckNo ?? 0) + 1)}
    <label class="field">本次浇筑方量<div class="unit-input"><input name="volume" type="number" min="0.01" max="10000000" step="0.01" required placeholder="本车实际浇筑量"><span>m³</span></div></label>
    <div class="field"><div class="now-control"><label for="record-start">开始浇筑时间</label><button type="button" class="text-button" data-now="startedAt" aria-label="开始时间填入现在">填入现在</button></div><input id="record-start" name="startedAt" type="datetime-local" step="60" required></div>
    <div class="field"><div class="now-control"><label for="record-end">结束浇筑时间</label><button type="button" class="text-button" data-now="endedAt" aria-label="结束时间填入现在">填入现在</button></div><input id="record-end" name="endedAt" type="datetime-local" step="60" required></div>
  </div>${latest ? `<p class="module-help">上一条结束：${timeText(latest.endedAt).slice(0,16)}</p>` : `<p class="module-help">初始混凝土面高：${fmt(slot.initialConcreteHeight ?? 0)} m · 自槽底，已初凝</p>`}</fieldset>
  <fieldset class="record-module" aria-label="混凝土面测量"><div class="module-header"><h3>混凝土面测量</h3><div><small>六个测点均需填写</small><button type="button" class="text-button" data-action="fill-measurement-average" title="仅为空白测点填入当前已填有效数据的平均值">快捷输入</button></div></div><div class="fields six">${Array.from({ length: 6 }, (_, i) => numericField(`point-${i}`, `测点 ${String.fromCharCode(65 + i)}`, { max: slot.depth })).join('')}</div><div class="mean-readout"><span>六点平均测深 · 距槽口</span><b id="mean-depth">— m</b></div></fieldset>
  <fieldset class="record-module" aria-label="浇筑管拔管"><div class="module-header"><h3>浇筑管拔管</h3><button type="button" class="text-button" data-zero="tremie">本次均未拔管 · 填 0</button></div><div class="fields three">${tremieDepths.map((d, i) => numericField(`tremie-${i}`, `浇筑管 ${i + 1} · 本次拔出`, { max: 1000000, help: `此前管底测深 ${fmt(d)} m` })).join('')}</div><p class="module-help">未拔管填 0；超拔后剩余管深取 0，原始拔出量保留。</p></fieldset>
  <fieldset class="record-module" aria-label="接头管拔管"><div class="module-header"><h3>接头管拔管</h3>${sidesFor(slot.jointLayout).length ? '<button type="button" class="text-button" data-zero="joint">本次均未拔管 · 填 0</button>' : ''}</div><div class="fields two">${sidesFor(slot.jointLayout).map(side => numericField(`joint-${side}`, `${side === 'left' ? '左' : '右'}接头管 · 本次拔出`, { min:-1000000,max: 1000000, help: `此前管底测深 ${fmt(jointDepths[side])} m` })).join('') || '<div class="no-pipes">未配置接头管</div>'}</div></fieldset>
  </div><section class="preview-panel"><div id="record-preview" class="record-summary">${pendingRecordPreview('填写后逐项预览可计算结果')}</div></section>
  <footer class="form-footer"><div class="reset-controls"><button type="button" class="secondary-button" data-reset-record><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg><span>${editing ? '恢复载入值' : '重置'}</span></button><div class="reset-confirmation" data-reset-confirmation role="group" aria-label="重置草稿确认" hidden><span>放弃未保存输入？</span><button type="button" class="secondary-button" data-reset-cancel>取消</button><button type="button" class="secondary-button" data-reset-confirm>确认重置</button></div></div><button type="submit" id="save-record" class="primary-button"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg><span>${editing ? '预览重算并保存修改' : '保存'}</span></button></footer></form>`;
}

const metric = (label, value, unit = '', digits = 2) => `<div><small>${label}</small><b>${fmt(value, digits)}${unit ? ' <em class="metric-unit">' + unit + '</em>' : ''}</b></div>`;

export function pendingRecordPreview(message) {
  return recordPreview({ actualDepth:null,theoreticalDepth:null,cumulativeVolume:null,currentRise:null,theoreticalSpeed:null,actualSpeed:null,notes:[] }, message);
}

const finiteValues = values => Array.isArray(values) ? values
  .filter(value => value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === ''))
  .map(Number).filter(Number.isFinite) : [];
const rangeMetric = values => {
  const valid = finiteValues(values);
  return valid.length === 6 ? Math.max(...valid) - Math.min(...valid) : null;
};
const minimumMetric = values => {
  const valid = finiteValues(values);
  return valid.length && valid.length === values.length ? Math.min(...valid) : null;
};

export function recordPreview(metrics, pending = '', measurementPoints = []) {
  return `<div class="module-header"><h3>事件指标预览</h3><span class="draft-badge">尚未保存</span></div><div class="detail-grid">
    ${metric('实测面深', metrics.actualDepth, 'm')}${metric('理论面深', metrics.theoreticalDepth, 'm')}${metric('累计方量', metrics.cumulativeVolume, 'm³')}
    ${metric('最近浇筑上升', metrics.currentRise, 'm')}${metric('实测累计上升', metrics.actualRiseFromInitial ?? metrics.actualHeight, 'm')}${metric('最近浇筑用时', metrics.durationHours, 'h')}
    ${metric('理论速度', metrics.theoreticalSpeed, 'm/h')}${metric('实测速度', metrics.actualSpeed, 'm/h')}${metric('充盈系数', metrics.fillCoefficient)}
    ${Object.prototype.hasOwnProperty.call(metrics.jointPressures||{},'left')?metric('左接头管拔管压力',metrics.jointPressures.left,'MPa'):''}${Object.prototype.hasOwnProperty.call(metrics.jointPressures||{},'right')?metric('右接头管拔管压力',metrics.jointPressures.right,'MPa'):''}
    ${metric('六点极差', Number.isFinite(metrics.actualDepth) ? rangeMetric(measurementPoints) : null, 'm')}${metric('浇筑管最小埋深', minimumMetric(metrics.tremieEmbedments), 'm')}
  </div>${pending ? `<p class="summary-hint">${esc(pending)}</p>` : metrics.actualSpeed === null ? '<p class="module-help">缺少有效的测量起点或时间间隔，实测速度暂不计算。</p>' : ''}${metrics.notes?.length ? `<ul class="notes-list">${metrics.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}
