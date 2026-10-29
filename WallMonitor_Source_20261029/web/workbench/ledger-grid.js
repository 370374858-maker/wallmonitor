import { esc, fmt, timeText } from './format.js';

const header = (label, unit = '', description = '') => {
  const title = description ? ` title="${esc(description)}"` : '';
  return `<span${title}>${esc(label)}</span>${unit ? `<small>${esc(unit)}</small>` : ''}`;
};
const cell = (value, digits = 2) => `<td>${fmt(value, digits)}</td>`;
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${({previous:'<path d="m14 6-6 6 6 6"/>',next:'<path d="m10 6 6 6-6 6"/>',add:'<path d="M12 5v14M5 12h14"/>',history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',edit:'<path d="m15 5 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15z"/>'})[name]}</svg>`;

function truckText(value) {
  const truckNo = Number(value);
  return Number.isInteger(truckNo) ? String(truckNo) : '—';
}

function configuredJointSides(slot) {
  if (slot?.jointLayout === 'both') return ['left', 'right'];
  if (slot?.jointLayout === 'left' || slot?.jointLayout === 'right') return [slot.jointLayout];
  return [];
}

function pipeColumns(slot) {
  const tremieCount = Number.isInteger(Number(slot?.tremieCount)) && Number(slot.tremieCount) > 0
    ? Number(slot.tremieCount) : 0;
  return { tremies: Array.from({ length: tremieCount }, (_, index) => index), joints: configuredJointSides(slot) };
}

const groupHeader = (label, count, className = '', rowspan = 1) =>
  `<th class="${className}" colspan="${count}"${rowspan > 1 ? ` rowspan="${rowspan}"` : ''} scope="colgroup">${esc(label)}</th>`;
const pipeHeader = label => `<th class="ledger-pipe-heading" colspan="4" scope="colgroup">${esc(label)}</th>`;
const subHeader = (label, unit = '', description = '') => `<th scope="col">${header(label, unit, description)}</th>`;

function compactTime(value) {
  const text = timeText(value);
  if (text === '—') return '<td class="ledger-time">—</td>';
  const [date, clock = ''] = text.split(' ');
  return `<td class="ledger-time"><span class="ledger-clock">${esc(clock.slice(0, 5))}</span><small class="ledger-date">${esc(date)}</small></td>`;
}

const pipeSubHeaders = () => `${subHeader('本车拔出', 'm')}${subHeader('管底位置', 'm', '自槽口向下')}${subHeader('实际埋深', 'm')}${subHeader('理论埋深', 'm')}`;

                                                                            
export function createHistoryTable({ pipeEmbedment }) {
return function historyTable(slot, history, selectedId) {
  const rows = Array.isArray(history?.rows) ? history.rows : [];
  const total = Number.isFinite(Number(history?.total)) ? Number(history.total) : rows.length;
  const limit = Number.isFinite(Number(history?.limit)) && Number(history.limit) > 0 ? Number(history.limit) : Math.max(rows.length, 1);
  const offset = Number.isFinite(Number(history?.offset)) && Number(history.offset) >= 0 ? Number(history.offset) : 0;
  const { tremies, joints } = pipeColumns(slot);

  const table = rows.length ? `<div class="ledger-table-scroll" role="region" aria-label="${esc(slot?.code)}施工数据台账" tabindex="0">
    <table class="ledger-table"><thead>
    <tr>
      <th class="ledger-key" rowspan="3" scope="col">${header('车号')}</th>
      ${groupHeader('浇筑数据', 6, 'ledger-group-pouring', 2)}
      ${groupHeader('测量数据', 2, 'ledger-group-measurement', 2)}
      ${tremies.length ? groupHeader('浇筑管数据', tremies.length * 4, 'ledger-group-tremie') : ''}
      ${joints.length ? groupHeader('接头管数据', joints.length * 4, 'ledger-group-joint') : ''}
      <th class="ledger-actions-heading" rowspan="3" scope="col">操作</th>
    </tr>
    <tr>
      ${tremies.map(index => pipeHeader(`浇筑管 ${index + 1}`)).join('')}
      ${joints.map(side => pipeHeader(`${side === 'left' ? '左' : '右'}接头管`)).join('')}
    </tr>
    <tr>
      ${subHeader('本车方量', 'm³')}${subHeader('累计方量', 'm³')}${subHeader('浇筑开始时间')}${subHeader('浇筑结束时间')}${subHeader('理论上升高度', 'm')}${subHeader('理论浇筑速度', 'm/h')}
      ${subHeader('实际测量高度', 'm', '自槽底向上')}${subHeader('实际上升速度', 'm/h')}
      ${tremies.map(pipeSubHeaders).join('')}${joints.map(pipeSubHeaders).join('')}
    </tr></thead><tbody>${rows.map(row => {
      const metrics = row?.metrics || {};
      const pulls = Array.isArray(row?.tremiePulls) ? row.tremiePulls : [];
      const depths = Array.isArray(metrics?.tremieDepths) ? metrics.tremieDepths : [];
      const jointPulls = row?.jointPulls || {};
      const jointDepths = metrics?.jointDepths || {};
      const id = esc(row?.id);
      const truckNo = truckText(row?.truckNo);
      return `<tr${row?.id === selectedId ? ' class="selected"' : ''}>
        <th class="ledger-key" scope="row">${truckNo}</th>
        ${cell(row?.volume)}${cell(metrics?.cumulativeVolume)}${compactTime(row?.startedAt)}${compactTime(row?.endedAt)}${cell(metrics?.currentRise)}${cell(metrics?.theoreticalSpeed)}
        ${cell(metrics?.actualHeight)}${cell(metrics?.actualSpeed)}
        ${tremies.map(index => `${cell(pulls[index])}${cell(depths[index])}${cell(pipeEmbedment(depths[index], metrics?.actualDepth))}${cell(pipeEmbedment(depths[index], metrics?.theoreticalDepth))}`).join('')}
        ${joints.map(side => `${cell(jointPulls[side])}${cell(jointDepths[side])}${cell(pipeEmbedment(jointDepths[side], metrics?.actualDepth))}${cell(pipeEmbedment(jointDepths[side], metrics?.theoreticalDepth))}`).join('')}
        <td class="ledger-actions"><button class="record-edit-link" data-edit-record="${id}" aria-label="修改第 ${truckNo} 车">${icon('edit')}编辑</button></td>
      </tr>`;
    }).join('')}</tbody></table>
  </div>` : '<div class="empty-card ledger-empty"><h3>还没有施工记录</h3><p>录入首车数据后查看记录。</p><button class="primary-button" data-new-record>开始记录第一车 →</button></div>';

  const pagination = rows.length ? `<div class="ledger-page-controls"><button class="secondary-button" data-page="${Math.max(0, offset - limit)}" ${offset === 0 ? 'disabled' : ''}>${icon('previous')}上一页</button><span>${offset + 1}—${offset + rows.length} / ${total}</span><button class="secondary-button" data-page="${offset + limit}" ${offset + rows.length >= total ? 'disabled' : ''}>下一页${icon('next')}</button></div>` : '<div class="ledger-page-controls"><span>暂无记录</span></div>';
  const actions = `<div class="ledger-footer-actions"><button class="secondary-button" data-revision-history>${icon('history')}修订日志</button><button class="secondary-button" data-new-record>${icon('add')}新建</button></div>`;
  return `<section class="history-list-card ledger-shell">${table}<footer class="pagination ledger-pagination ledger-footer">${actions}${pagination}</footer></section>`;
};
}
