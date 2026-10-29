import {tremieLabel} from '../../shared/pipe-labels.js';
import { esc, fmt } from '../workbench/format.js';
import { showScene } from '../models/model-scene.js';
import { visibleMonitorIssues, policyLabel, progressSetting, displayEvaluation, metricTimeText } from './presentation.js';
import { planMarkup } from './geometry.js';
import { fillSourceLabel } from './fill-trend.js';
import { pageItems, ALERT_PAGE_SIZE } from './record-selection.js';
const $ = id => document.getElementById(id);
export function boundaryValue(item, p, digits = 2) {
  if (!Number.isFinite(item.value)) return '—';
  const limits = item.kind === 'fill' ? [p.fillMin, p.fillMax] : item.kind === 'tremie'
    ? [p.tremieWatchMin, p.tremieNormalMin, p.tremieNormalMax, p.tremieWatchMax] : item.kind === 'joint' ? [p.jointMin, p.jointMax]
    :item.kind==='speed'?[p.speedDangerBelow,p.speedWatchBelow,p.speedNormalMax,p.speedWatchMax]
    :item.kind?.startsWith('pressure-')?[p[item.kind.slice(9)+'PressureWatchAbove'],p[item.kind.slice(9)+'PressureDangerAbove']]:[];
  const displayed = Number(item.value.toFixed(digits));
  return (item.value !== displayed && limits.includes(displayed) ? item.value < displayed ? '&lt;' : '&gt;' : '') + fmt(item.value, digits);
}
export const statusText = item => `<span class="status-label ${esc(item.key)}">${esc(item.label)}</span>`;
                                                                              
                                                                               
const card = (label, value, source = '', cls = '', unit = '', status = '', title = '') => `<div class="headline-card"${title || source ? ` title="${esc(title || source)}"` : ''}><small>${esc(label)}</small>${status ? `<span class="metric-status">${status}</span>` : ''}<div class="metric-value"><b class="${cls}">${value}</b>${unit ? `<em>${unit}</em>` : ''}</div></div>`;
const cellValue = item => `<td class="data-value">${fmt(item)}</td>`;
const boundaryCell = (item, p) => `<td class="data-value" title="原始值 ${fmt(item.value, 8)} m">${boundaryValue(item, p)}</td>`;
export function pipeSafetyTable(e) {
  const row=(name,kind,cells,statuses)=>`<tr><th scope="row"><span class="pipe-name"><i class="pipe-marker ${kind}" aria-hidden="true"></i>${name}</span></th>${cells}${statuses}</tr>`;
  const statusCell=item=>`<td class="pipe-status">${statusText(item)}</td>`;
  const unused=(name,kind)=>row(name,kind,'<td class="unconfigured">—</td>'.repeat(3),'<td colspan="2" class="pipe-status"><span class="status-label muted">未配置</span></td>');
  const tremies=Array.from({length:3},(_,i)=>{
    const t=e.tremies[i];return t?row(`浇筑管 ${esc(t.label??i+1)}`,'tremie',cellValue(t.depth)+boundaryCell(t.actual,e.policy)+boundaryCell(t.theory,e.policy),statusCell(t.actual)+statusCell(t.theory)):unused(`浇筑管 ${i+1}`,'tremie');
  });
  const joints=['left','right'].map(side=>{
    const j=e.joints.find(j=>j.side===side),label=side==='left'?'左接头管':'右接头管';
    return j?row(label,'joint',cellValue(j.depth)+boundaryCell(j.actualStatus,e.policy)+boundaryCell(j.theoryStatus,e.policy),statusCell(j.actualStatus)+statusCell(j.theoryStatus)):unused(label,'joint');
  });
  const headers=[['管体',''],['管底测深',''],['实测埋深','管底测深减实测混凝土面测深'],['理论埋深','管底测深减理论混凝土面测深'],['实测状态',''],['理论状态','']];
  return `<div class="pipe-scroll" role="region" aria-label="管体安全指标" tabindex="0"><table><colgroup><col class="pipe-name-column">${'<col class="pipe-value-column">'.repeat(3)}${'<col class="pipe-status-column">'.repeat(2)}</colgroup><thead><tr>${headers.map(([label,title])=>`<th scope="col"${title?` title="${title}"`:''}>${label}</th>`).join('')}</tr></thead><tbody>${[...tremies,...joints].join('')}</tbody></table></div>`;
}

export function renderOverview(data, mode = 'solid') {
  const { slot: s, latest: row } = data, e = displayEvaluation(data), m = row?.metrics;
  const setting = progressSetting(data);
  const displayedCount = data.displayedCount ?? data.eligibleCount;
  $('slot-profile').innerHTML = [['槽段深度', s.depth, 'm'], ['槽段宽度', s.width, 'm'], ['墙体厚度', s.thickness, 'm'],
    ['有效截面积', s.area, 'm²'], ['浇筑管', s.tremieCount, '根'], ['接头管', e.joints.length, '根']].map(([label, value, unit]) => `<div><small>${label}</small><b>${fmt(value, unit === '根' ? 0 : 2)}</b><em>${unit}</em></div>`).join('');
  showScene($('geometry'), s, m, data.modelSetting ?? e.setting, mode);
  $('slot-plan').innerHTML = planMarkup(s);
  $('headline').innerHTML = card('累计浇筑车数', fmt(data.pouringCount ?? displayedCount, 0), '', '', '车')
    + card('累计浇筑方量', fmt(m?.cumulativeVolume), metricTimeText(m, 'cumulativeVolumeAt', ''), '', 'm³')
    + card('测深理论方量', fmt(m?.measurementVolume), metricTimeText(m, 'measurementVolumeAt'), '', 'm³', '', m?.measurementVolumeAt || '')
    + card('扩孔系数', boundaryValue(e.fill, e.policy, 2), '', '', '', `${statusText(e.fill)}${m?.fillCoefficientTimeGapExceeded ? '<small class="metric-history warn">时间差 &gt;1h</small>' : ''}`, fillSourceLabel(m || {}));
  $('progress-readings').innerHTML = [['理论高度',Number.isFinite(m?.theoreticalDepth) ? s.depth-m.theoreticalDepth:null,0],['实测高度',m?.actualHeight,1],['初凝估计高度',Number.isFinite(setting?.depth)?s.depth-setting.depth:null,2]]
    .map(([name,value,key])=>`<div><small class="progress-key key-${key}">${name}</small><b>${fmt(value)} <em>m</em></b></div>`).join('');
  $('progress-readings').title = `${setting?.reason || ''} 初凝显示为龄期估计，不能替代现场试验。`;
  $('pipe-safety').innerHTML = pipeSafetyTable(e);
  $('pipe-safety').title = `实测混凝土面来源 ${m?.measurementAt || '尚无'}；理论混凝土面按累计浇筑方量计算`;
  const actualPeriod = m?.actualSpeedAt ? `测量区间：${m.actualSpeedStartedAt || '未知'} 至 ${m.actualSpeedAt}` : '测量区间未知';
  const theoryPeriod = m?.theoreticalSpeedStartedAt && m?.theoreticalSpeedAt ? `最近浇筑区间：${m.theoreticalSpeedStartedAt} 至 ${m.theoreticalSpeedAt}` : '最近浇筑区间未知';
  $('speed-status').innerHTML = `<span title="${esc(actualPeriod)}"><small>测量区间</small> 实测 ${statusText(e.speed.actual)}</span><span title="${esc(theoryPeriod)}"><small>浇筑区间</small> 理论 ${statusText(e.speed.theory)}</span>`;
}

const sourceSmall = (value, source) => Number.isFinite(value) && source
  ? `<small class="metric-source" title="${esc(source)}">来源 ${esc(source.replace(/\d{4}-(\d{2}-\d{2} \d{2}:\d{2}):\d{2}/g, '$1'))}</small>` : '';

export function renderAlerts(data, { page = 0, filter = 'all' } = {}) {
  const e = data.evaluation;
  $('alert-version').textContent = `规则 v${e.policy.revision} · ${policyLabel(e.policy)} · ${e.policy.confirmed ? '已核定' : '未核定'}`;
  $('alert-summary').innerHTML = card('预警', e.counts.danger, '', '', '项', statusText({key:'danger',label:'优先复核'})) + card('预报', e.counts.warn, '', '', '项', statusText({key:'warn',label:'关注变化'}))
    + card('正常', e.counts.ok, '', '', '项') + card('待判', e.counts.muted, '', '', '项');
  const actions = [...data.actions].filter(a => filter === 'all' || a.key === filter).sort((a, b) => (a.key === 'danger' ? 0 : 1) - (b.key === 'danger' ? 0 : 1));
  const pagination = pageItems(actions, page, ALERT_PAGE_SIZE);
  $('action-list').innerHTML = pagination.items.map(a => `<section class="action-item ${esc(a.key)}"><header><h3>${esc(a.name)}</h3>${statusText(a)}</header><div class="action-value">${boundaryValue(a, e.policy, a.kind === 'fill' ? 3 : 2)} <em>${esc(a.unit)}</em></div><p>${esc(a.action)}</p></section>`).join('') || '<div class="empty">当前筛选无异常项</div>';
  $('alert-page').textContent = `${pagination.total} 项 · ${pagination.page+1} / ${pagination.pages} 页`;
  $('alert-prev').disabled = pagination.page === 0;
  $('alert-next').disabled = pagination.page + 1 >= pagination.pages;
  $('quality-list').innerHTML = [...visibleMonitorIssues(data.issues), ...e.indicators.filter(v => v.key === 'muted').map(v => `${v.name}：待判定。${v.kind === 'joint' ? v.id.endsWith('-theory')?'缺少有效管底位置或完整的理论混凝土面数据。':'缺少有效管底位置或实测混凝土面数据。' : '缺少相邻完整记录或有效计算分母。'}`),
    `初凝估计依据：${e.setting.reason}。`, '初凝时长须按入槽后龄期校准，不能替代现场凝结试验。',
    '测深按本次上报的有效测点均值计算；测点数与来源可在台账核对，单管局部埋深需复测。',
    '处置建议需人工确认，不自动控制设备。'].map(t => `<p>${esc(t)}</p>`).join('');
  return pagination.page;
}

export function recordsTable(rows, total, page = 0, selectedId = '') {
  const pagination = pageItems([...rows].reverse(), page);
  $('trend-count').textContent = `${rows.length} / ${total} 条`;
  $('record-table').innerHTML = rows.length ? `<table><thead><tr><th>事件</th><th>发生 / 测量时间</th><th>方量 m³</th><th>最近实测面深 m</th><th>理论面深 m</th><th>实测 m/h</th><th>理论 m/h</th><th>同期扩孔系数</th></tr></thead><tbody>${pagination.items.map(r => `<tr aria-selected="${r.id === selectedId}"><td><button data-trend-record="${esc(r.id)}" aria-label="查看 ${esc(r.endedAt)} 时刻模型">${esc(r.label || '事件')}${r.truckNo ? ` · ${r.truckNo} 车` : ''}</button></td><td>${esc(r.endedAt.slice(5,16))}<small style="display:block">测量 ${esc(r.measurementAt?.slice(5,16) || '未知')}</small></td><td>${fmt(r.volume)}</td><td>${fmt(r.actualDepth)}</td><td>${fmt(r.theoreticalDepth)}</td><td title="${esc(r.actualSpeedAt || '测量区间未知')}">${fmt(r.actualSpeed)}${sourceSmall(r.actualSpeed, r.actualSpeedAt)}</td><td title="${esc(r.theoreticalSpeedStartedAt && r.theoreticalSpeedAt ? `${r.theoreticalSpeedStartedAt} 至 ${r.theoreticalSpeedAt}` : '最近浇筑区间未知')}">${fmt(r.theoreticalSpeed)}${sourceSmall(r.theoreticalSpeed, r.theoreticalSpeedStartedAt && r.theoreticalSpeedAt ? `${r.theoreticalSpeedStartedAt} 至 ${r.theoreticalSpeedAt}` : '')}</td><td title="${esc(r.fillCoefficientAt || r.fillCoefficientReason || '来源时间未知')}">${fmt(r.fillCoefficient, 2)}${sourceSmall(r.fillCoefficient, r.fillCoefficientAt)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">当前时间范围没有事件</div>';
  $('trend-page').textContent = `${pagination.page+1} / ${pagination.pages} 页`;
  $('trend-prev').disabled = pagination.page === 0;
  $('trend-next').disabled = pagination.page + 1 >= pagination.pages;
  return pagination.page;
}

export function renderPolicy(p) {
  const input = (key, title, unit, min = 0, max = 1000) => `<label>${title} / ${unit}<input type="number" name="${key}" value="${p[key]??''}" min="${min}" max="${max}" step="0.01" required></label>`;
  $('policy-version').textContent = `当前规则 v${p.revision} · ${p.changedAt || '系统默认'}`;
  $('policy-fields').innerHTML = `<div class="policy-grid">
    <fieldset><legend>初凝参数</legend><div class="rule-fields single-field">${input('settingHours', '入槽后初凝时长', 'h', .01, 168)}</div></fieldset>
    <fieldset><legend>浇筑导管埋深</legend><div class="rule-fields">${input('tremieNormalMin', '正常区间下限', 'm', 0, 100)}${input('tremieNormalMax', '正常区间上限', 'm', 0, 100)}${input('tremieWatchMin', '预警区间下限', 'm', 0, 100)}${input('tremieWatchMax', '预警区间上限', 'm', 0, 100)}</div></fieldset>
    <fieldset><legend>接头管埋深（混凝土面）与扩孔系数</legend><div class="rule-fields">${input('jointMin','埋深下限（含）','m',-100,100)}${input('jointMax','最大允许埋深（含）','m',-100,100)}${input('fillMin','扩孔系数下限（含）','无量纲',.01,10)}${input('fillMax','扩孔系数上限（含）','无量纲',.01,10)}</div></fieldset>
    <fieldset><legend>浇筑上升速度</legend><div class="rule-fields">${input('speedWatchBelow','正常区间下限','m/h')}${input('speedNormalMax','正常区间上限','m/h')}${input('speedDangerBelow','预警区间下限','m/h')}${input('speedWatchMax','预警区间上限','m/h')}</div></fieldset>
    <fieldset><legend>左接头管拔管压力</legend><div class="rule-fields">${input('leftPressureWatchAbove','预报值','MPa',0,1000000)}${input('leftPressureDangerAbove','预警值','MPa',0,1000000)}</div></fieldset>
    <fieldset><legend>右接头管拔管压力</legend><div class="rule-fields">${input('rightPressureWatchAbove','预报值','MPa',0,1000000)}${input('rightPressureDangerAbove','预警值','MPa',0,1000000)}</div></fieldset>
    </div>`;
  $('policy-message').textContent = '';
}
