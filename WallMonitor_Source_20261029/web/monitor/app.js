import {createEntryLoading} from './entry-loading.js';
import {pipeLabel} from '../../shared/pipe-labels.js';
import { esc } from '../workbench/format.js';
import { fillTrendRows } from './fill-trend.js';
import { renderOverview, renderAlerts, renderPolicy } from './views.js';
import { timeline, heightVolume, truckLine, truckProgress, gauges, pressureGauges, pointDepths, progress, emptyChart, resizeCharts, disposeCharts, setMotion, setEffectsActive, setTimelineContext, resetTimelineZoom } from './charts.js?v=20260919-axes';
import {bindChartExpansion} from './chart-expansion.js';

import { clearScene } from '../models/model-scene.js';
import { bindFullscreen } from './fullscreen.js';
import { visibleMonitorIssues, progressSetting, displayEvaluation } from './presentation.js';
import { requestJson } from '../ui/request.js';
import { beginActivity } from '../ui/activity.js';
import { dataStatus,latestDataTime } from './data-status.js';
import { confirmDiscard } from '../ui/confirm-discard.js';
import { clearFieldError, showFieldErrors, lockFormControls } from '../ui/form-feedback.js';
import { watchDisplayDensity } from '../ui/display-density.js';
import { createNotificationController, normalizeNotificationTone, bindValidationNotifications } from '../ui/notifications.js';
import { TREND_PIPES, configuredTrendPipeIds, pipeTrendRows, pipeCsvColumns } from './trend-pipes.js';
import { syncPolicyEditor } from './policy-sync.js';
import { syncPolicyIntervalInputs } from './policy-validation.js';
import { policyInput } from './policy-form.js';
import {createLivePressureController,livePressureStatusHtml} from './live-pressure.js';
import {isDemoSlot,dataModeText} from './demo-label.js';
const $ = id => document.getElementById(id);
let policyMetadata;
function renderPolicyEditor(policy) {
  $('policy-form').querySelectorAll('[data-field-error]').forEach(clearFieldError);
  policyMetadata={basis:policy.basis,confirmed:policy.confirmed,emptyAtStart:policy.emptyAtStart};
  renderPolicy(policy);syncPolicyIntervalInputs($('policy-form'));
}
const state = { slots: [], slotId: '', data: null, tab: 'overview', modelMode: 'solid', alertPage: 0, paused: false, busy: false, generation: 0, dirty: false, policyRevision: null, saving: false, entryReady: false, entryBusy: false, entryDirty: false, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches };
const pressureController=createLivePressureController({
  getContext:()=>({slotId:state.slotId,active:!document.hidden&&!!state.data,paused:state.paused,
    jointLayout:state.data?.slot?.jointLayout??'none',policyRevision:state.data?.evaluation?.policy?.revision}),
  fetchSnapshot:(id,signal)=>request(`/slots/${encodeURIComponent(id)}/live-pressure`,{signal,activity:false,timeoutMs:5000}),
  onChange:()=>{renderRealtimePressure();renderLatestDataTime();}
});
function renderLatestDataTime(){
  const stamp=latestDataTime(state.data,pressureController.view());
  $('sidebar-time').textContent=stamp?.slice(5)||'暂无数据';
  $('sidebar-time').title=stamp?`${stamp} · 北京时间 UTC+8`:'';
}
function renderRealtimePressure(){
  if(!state.data||state.tab!=='overview')return;
  const display=pressureController.view();
  pressureGauges('pressure-chart',display,displayEvaluation(state.data).policy);
  $('pressure-chart').setAttribute('role','img');
  $('pressure-chart').setAttribute('aria-label',['left','right'].map(side=>`${side==='left'?'左':'右'}接头管实时压力 ${Number.isFinite(display[side].value)?display[side].value.toFixed(2)+' MPa':'无实时值'}，${display[side].label}`).join('；'));
  $('pressure-status').innerHTML=livePressureStatusHtml(display);
}
let controller = null, refreshTimer = null, clockTimer = null;
let navigatingWorkspace=false;
let trendExpansion;
const isWorkbenchView=view=>view==='record'||view==='slot-info';
const entryLoading=createEntryLoading({render:({visible,retry,message})=>{
  $('entry-feedback').hidden=!visible; $('entry-retry').hidden=!retry; $('entry-status').textContent=message;
}});
window.addEventListener('pagehide',()=>entryLoading.dispose(),{once:true});
$('entry-retry').addEventListener('click',async()=>{
  if(state.entryReady)return;
  if(state.entryDirty&&!await confirmDiscard('重新加载施工页面将清空尚未保存的草稿，是否继续？'))return;
  state.entryBusy=false;state.entryDirty=false;$('record-frame').removeAttribute('src');ensureEntry();
});

const notifications = createNotificationController($('notice'));
bindValidationNotifications(document, notifications);
const readStoredSlot = () => { try { return localStorage.getItem('monitor-slot') || localStorage.getItem('cw.selected-slot') || ''; } catch { return ''; } };
const storeSlot = value => { try { localStorage.setItem('monitor-slot', value); } catch {                            } };
function fit() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
                                                            
  $('screen').style.setProperty('transform', `scale(${scale}) translate(-50%, -50%)`, 'important');
  requestAnimationFrame(() => {
    resizeCharts();
    window.dispatchEvent(new Event('cw:display-resize'));
    const child = $('record-frame').contentWindow;
    if (state.entryReady && child) child.dispatchEvent(new child.Event('cw:display-resize'));
  });
}
const slotPickers = () => document.querySelectorAll('#slot,[data-slot-picker]');
function lockSlotPickers(disabled) { slotPickers().forEach(picker => { picker.disabled = disabled; }); }
function syncSlotPickers() {
  const options = state.slots.length ? state.slots.map(s => `<option value="${esc(s.id)}" ${s.id === state.slotId ? 'selected' : ''}>${esc(s.code)}</option>`).join('') : '<option value="">暂无槽段</option>';
  slotPickers().forEach(picker => { if (picker.innerHTML !== options) picker.innerHTML = options; picker.value = state.slotId; });
}
function clock() {
  const date = new Date();
  $('clock').textContent = date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  $('date').textContent = date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
}
async function request(url, options = {}) {
  return requestJson(url, options);
}
function showMessage(text, type = '', notify = false) {
  $('message').textContent = text;
  const tone = normalizeNotificationTone(type || 'info');
                                                                                
                                                                                 
  if (notify) notifications.show(text, { tone });
}
function offline(message) {
  $('sidebar-connection').textContent = '连接中断'; $('sidebar-connection').className = 'danger';
  $('screen').classList.add('offline'); showMessage(message + '。已停止宣称实时状态；保留画面仅供历史参考。', 'error', true);
  updateEffects();
}
function updateEffects() {
  pressureController.tick();
  $('sidebar-slot').textContent = state.data ? state.data.slot.code : '—';
  $('sidebar-records').textContent = state.data ? `${state.data.total} 条` : '—';
  renderLatestDataTime();
  const freshness = dataStatus(state.data, { paused: state.paused, offline: $('screen').classList.contains('offline') });
  $('data-time-mode').hidden = false;
  $('data-time-mode').textContent = dataModeText(state.data?.slot,freshness.text);
  $('data-time-mode').className = 'time-mode ' + freshness.tone;
  $('data-time-mode').title = state.data ? `${isDemoSlot(state.data.slot)?'模拟数据，仅用于接口联调展示。':''}评价时刻 ${state.data.evaluation.evaluatedAt}；服务器时刻 ${state.data.asOf}` : '';
  const warnings = state.data?.evaluation.counts.danger || 0;
  $('nav-alert-count').hidden = !warnings;
  $('nav-alert-count').textContent = String(warnings);
  $('nav-alert-count').setAttribute('aria-label', `${warnings} 项预警`);
  $('settings-slot').textContent = state.data ? `当前槽段：${state.data.slot.code}` : '尚未选择槽段';
  const active = state.motion && !state.paused && !document.hidden && !$('screen').classList.contains('offline');
  $('screen').classList.toggle('motion-enabled', active);
  $('screen').classList.toggle('motion-disabled', !active);
  setEffectsActive(active && state.tab === 'overview');
  if (state.entryReady) $('record-frame').contentWindow.cwEmbedded?.setEffects(active && isWorkbenchView(state.tab));
}
function ensureEntry() {
  const frame = $('record-frame');
  if (frame.hasAttribute('src')) return;
  entryLoading.start();
  lockSlotPickers(true);
  const group=state.tab==='slot-info'?'slot-info':'record';
  frame.src = `/embedded/workbench?embedded=monitor&workspace=${group}&slot=${encodeURIComponent(state.slotId)}#${group==='slot-info'?'slot':'record'}`;
}
function syncEntryRevision(data = state.data) {
  if (!state.entryReady || !data?.slot?.id) return;
  const revision = data.baseRevision ?? data.slot.dataRevision;
  if (!Number.isSafeInteger(revision)) return;
  try {
    Promise.resolve($('record-frame').contentWindow.cwEmbedded?.syncExternalRevision?.(data.slot.id, revision))
      .catch(error => console.warn('施工录入外部修订同步失败', error));
  } catch (error) { console.warn('施工录入外部修订同步失败', error); }
}
function adoptSlot(id) {
  if (id === state.slotId) { slotPickers().forEach(picker => { picker.value = id; }); return; }
  state.slotId = id; state.dirty = false; state.policyRevision = null; clearView();
  showMessage('正在加载新槽段，旧槽段数值已清空。'); load({ force: true, resetPolicy: true });
}
async function canChangeSlot(id) {
  return !state.saving && !state.reloadingPolicy && (id === state.slotId || !state.dirty || await confirmDiscard('规则修改尚未保存，切换槽段将丢弃修改。'));
}
                                                                              
                                                                         
window.cwMonitor = { canChangeSlot };
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== $('record-frame').contentWindow || !event.data?.type?.startsWith('cw:')) return;
  const msg = event.data;
  if(msg.type==='cw:load-error'){state.entryReady=false;state.entryBusy=false;entryLoading.failed(msg.message);lockSlotPickers(state.saving);return;}
  state.entryBusy = Boolean(msg.busy); state.entryDirty = Boolean(msg.dirty);
  if (msg.type === 'cw:ready') { state.entryReady = true; entryLoading.ready(); updateEffects(); if(isWorkbenchView(state.tab))selectView(state.tab).catch(error=>entryLoading.failed(error.message)); }
  lockSlotPickers(state.saving || state.entryBusy || !state.entryReady);
  if(state.entryReady)$('entry-status').textContent = state.entryBusy ? '正在处理，请稍候' : state.entryDirty ? '草稿未保存' : '独立事件录入';
  if (state.entryReady && (msg.type === 'cw:context' || msg.type === 'cw:ready') && msg.slotId) adoptSlot(msg.slotId);
  if(msg.type==='cw:deleted'){if(state.slotId===msg.deletedSlotId){state.slotId='';state.dirty=false;clearView();}load({force:true,resetPolicy:true});}
  if (msg.type === 'cw:saved') { showMessage('施工数据已保存，正在读取最新指标。'); load({ force: true }); }
});
function rangeRows() {
  const rows = state.data?.trend || [], hours = $('range').value;
  if (hours === 'all') return rows;
  const cutoff = Date.parse(state.data.evaluation.evaluatedAt.replace(' ', 'T') + '+08:00') - Number(hours) * 3600000;
  return rows.filter(r => Date.parse(r.endedAt.replace(' ', 'T') + '+08:00') >= cutoff);
}
function drawPipeTrends(rows, slot) {
  const configured = new Set(configuredTrendPipeIds(slot));
  for (const { id } of TREND_PIPES) {
    const panel = $(`trend-${id}-panel`), chartId = `trend-${id}`;
    panel.hidden = !configured.has(id);
    if (panel.hidden) continue;
    panel.querySelector('h2').textContent=pipeLabel(slot,id)+' 埋深';
    timeline(chartId, pipeTrendRows(rows, id), [['theoreticalEmbedment', '理论埋深'], ['actualEmbedment', '实测埋深']], { chartType: 'line' });
  }
}
function draw() {
  const data = state.data;
  if (!data) { if (isWorkbenchView(state.tab) && !state.busy) ensureEntry(); return; }
  setTimelineContext(data.slot.id);
  if (state.tab === 'overview') {
    renderOverview(data, state.modelMode);
    progress('progress-chart', data.slot, data.latest?.metrics, progressSetting(data));
    heightVolume('overview-trend',data.slot,data.trend,{compact:true});
    gauges('speed-chart', data.latest ? displayEvaluation(data).speed : null, displayEvaluation(data).policy);
    $('speed-chart').title = data.latest?.metrics?.actualSpeedAt || data.latest?.metrics?.theoreticalSpeedAt
      ? `实测区间：${data.latest.metrics.actualSpeedStartedAt || '未知'} 至 ${data.latest.metrics.actualSpeedAt || '未知'}；最近浇筑区间：${data.latest.metrics.theoreticalSpeedStartedAt && data.latest.metrics.theoreticalSpeedAt ? `${data.latest.metrics.theoreticalSpeedStartedAt} 至 ${data.latest.metrics.theoreticalSpeedAt}` : '未知'}`
      : '速度为区间平均值，来源时段未知';
    renderRealtimePressure();
    timeline('depth-fill-chart',fillTrendRows(data.slot,data.trend),[['fillCoefficient','扩孔系数']],{compact:true,chartType:'line',xKey:'actualDepth',xInverse:true,xRange:[0,data.slot.depth],xName:'实测深度（槽口向下）',xUnit:'m',bounds:[data.evaluation.policy.fillMin,data.evaluation.policy.fillMax]});
  } else if (state.tab === 'trends') {
    const rows = rangeRows();
    heightVolume('trend-depth',data.slot,rows,{measurementRows:data.trend});
    timeline('trend-volume', rows, [['cumulativeVolume', '已完浇筑累计'], ['measurementVolume', '同期测深折算']], { chartType: 'line' });
    timeline('trend-speed', rows, [['theoreticalSpeed', '理论 · 最近浇筑区间'], ['actualSpeed', '实测 · 测量间隔']], { chartType: 'line' });
    timeline('trend-fill', fillTrendRows(data.slot,rows,data.trend), [['fillCoefficient', '扩孔系数']], { chartType: 'line', xKey:'actualHeight', xName:'实际浇筑高度', xUnit:'m', bounds: [data.evaluation.policy.fillMin, data.evaluation.policy.fillMax] });
    drawPipeTrends(rows, data.slot);
    if(trendExpansion?.ensureVisible()){draw();return;}
  } else if (state.tab === 'alerts') state.alertPage = renderAlerts(data, { page: state.alertPage, filter: $('alert-filter').value });
  else if (isWorkbenchView(state.tab)) ensureEntry();
                                                                            
  requestAnimationFrame(resizeCharts);
  updateEffects();
}
function clearView() {
  pressureController.reset();
  trendExpansion?.reset({notify:false});
  state.data = null;
  state.alertPage = 0;
  for (const id of ['slot-profile', 'slot-plan', 'headline', 'pipe-safety', 'progress-readings', 'speed-status', 'pressure-status', 'action-list', 'quality-list', 'alert-summary']) $(id).innerHTML = '';
  $('pressure-status').textContent = '';
  $('pressure-chart').setAttribute('aria-label','等待读取所选槽段实时压力');
  clearScene($('geometry'));
  $('geometry').innerHTML = '<div class="empty">正在读取所选槽段</div>';
  for (const id of ['progress-chart', 'overview-trend', 'speed-chart', 'pressure-chart', 'depth-fill-chart', 'trend-depth', 'trend-volume', 'trend-speed', 'trend-fill', ...TREND_PIPES.map(pipe => `trend-${pipe.id}`)]) emptyChart(id, '等待所选槽段数据');
  $('policy-fields').innerHTML = ''; $('save-policy').disabled = true; $('reload-policy').disabled = true;
}
async function load({ force = false, resetPolicy = false } = {}) {
  if ((state.busy && !force) || state.saving) return;
  if (controller) controller.abort();
  controller = new AbortController();
  const generation = ++state.generation, currentController = controller;
  const timeout = setTimeout(() => currentController.abort(), 12000);
  state.busy = true; $('refresh').disabled = true;
  const finish = force || !state.data ? beginActivity('正在读取并更新槽段数据') : () => {};
  $('refresh').dataset.working = 'true';
  try {
    const slots = await request('/slots', { signal: currentController.signal, activity: false });
    if (generation !== state.generation) return;
    state.slots = slots;
    const stillExists = slots.some(s => s.id === state.slotId);
    if (!stillExists) {
      const requested = new URLSearchParams(location.search).get('slot') || readStoredSlot();
      state.slotId = slots.find(s => s.id === requested)?.id || slots[0]?.id || '';
      state.dirty = false; clearView(); resetPolicy = true;
    }
    syncSlotPickers();
    if (!state.slotId) {
      $('sidebar-connection').textContent = '数据库在线'; $('sidebar-connection').className = 'ok'; $('screen').classList.remove('offline');
      showMessage('尚未建立槽段。请通过“槽段信息”建立档案，再到“施工录入”提交独立事件。');
      if (isWorkbenchView(state.tab)) ensureEntry();
      updateEffects(); return;
    }
    const data = await request(`/slots/${encodeURIComponent(state.slotId)}/monitor`, { signal: currentController.signal, activity: false });
    if (generation !== state.generation || data.slot.id !== state.slotId) return;
    state.data = data; storeSlot(state.slotId); syncEntryRevision(data);
    $('sidebar-connection').textContent = state.paused ? '刷新已暂停' : '数据库在线'; $('sidebar-connection').className = state.paused ? 'warn' : 'ok';
    $('screen').classList.remove('offline'); $('record-counter').textContent = `${data.displayedCount ?? data.eligibleCount} 条展示 / ${data.total} 条已存${data.freshness.futureCount ? ` · 含 ${data.freshness.futureCount} 条未来记录` : ''}`;
    const warnings = visibleMonitorIssues(data.issues);
    if (data.evaluation.counts.danger) warnings.unshift(`当前 ${data.evaluation.counts.danger} 项预警：${data.actions.filter(a => a.key === 'danger').map(a => a.name).slice(0, 3).join('、')}，请核对施工记录`);
    showMessage((state.paused ? '自动刷新已暂停；画面停留在上次评价。 ' : '') + (warnings.join(' ') || '已读取所选槽段记录。'), data.evaluation.counts.danger ? 'error' : warnings.length ? '' : 'ok');
    syncPolicyEditor(state, data.evaluation.policy, { reset: resetPolicy, render: renderPolicyEditor,
      conflict: ({editingRevision,serverRevision}) => {
        $('policy-version').textContent = `正在编辑 v${editingRevision} · 当前生效 v${serverRevision}`;
        $('policy-message').textContent = '其他页面已更新本槽段规则；当前预警按最新规则显示，未保存草稿已保留。请重新载入已保存规则后核对修改。';
      } });
    $('save-policy').disabled = false;
    $('reload-policy').disabled = false;
    draw();
    return data;
  } catch (error) { if (generation === state.generation) offline(error.name === 'AbortError' ? '读取超过 12 秒未完成' : error.message); }
  finally { clearTimeout(timeout); finish(); if (generation === state.generation) { state.busy = false; $('refresh').disabled = false; delete $('refresh').dataset.working; } }
}
async function selectView(view, focus = false) {
  if (!['overview', 'record', 'trends', 'alerts', 'slot-info', 'policy'].includes(view)) view = 'overview';
  if ($('tab-' + view)?.hidden) view = 'overview';
  if(navigatingWorkspace)return;
  if(isWorkbenchView(view)&&state.entryReady){navigatingWorkspace=true;try{if(!await $('record-frame').contentWindow.cwEmbedded?.selectWorkspace(view))return;}finally{navigatingWorkspace=false;}}
                                                                                    
  state.tab = view;
  if(view!=='trends')trendExpansion?.reset({notify:false});
  for (const button of document.querySelectorAll('[data-view]')) {
    const active = button.dataset.view === view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    if(button.dataset.view!=='slot-info'){$('view-' + button.dataset.view).hidden = !active;$('view-' + button.dataset.view).classList.toggle('view-enter', active);}
    if (focus && active) button.focus();
  }
  $('view-record').hidden=!isWorkbenchView(view);
  $('view-record').classList.toggle('view-enter',isWorkbenchView(view));
  $('view-record').setAttribute('aria-labelledby',view==='slot-info'?'tab-slot-info':'tab-record');
  $('record-frame').title=view==='slot-info'?'槽段信息':'独立施工事件录入';
  history.replaceState(null, '', location.pathname + location.search + '#' + view);
  if (view === 'policy' && state.data && !state.dirty) { renderPolicyEditor(state.data.evaluation.policy); state.policyRevision = state.data.evaluation.policy.revision; }
  if (isWorkbenchView(view)) { ensureEntry(); syncEntryRevision(state.data); }
  updateEffects();
  requestAnimationFrame(draw);
}
document.querySelector('nav[role=tablist]').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) selectView(button.dataset.view); });
document.querySelector('nav[role=tablist]').addEventListener('keydown', event => {
  const tabs = [...document.querySelectorAll('[data-view]:not([hidden])')], index = tabs.findIndex(b => b.dataset.view === state.tab);
  let next = null;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  if (next !== null) { event.preventDefault(); selectView(tabs[next].dataset.view, true); }
});
slotPickers().forEach(picker => picker.addEventListener('change', async () => {
  if (state.saving) { syncSlotPickers(); return; }
  const id = picker.value;
  if ($('record-frame').hasAttribute('src')) {
    const bridge = $('record-frame').contentWindow.cwEmbedded;
    if (!state.entryReady || !bridge || !(await bridge.selectSlot(id))) { syncSlotPickers(); return; }
  } else if (!await canChangeSlot(id)) { syncSlotPickers(); return; }
  adoptSlot(id);
}));
$('geometry').addEventListener('modelmodechange', event => {
  state.modelMode = event.detail.mode;
  draw();
});
$('refresh').addEventListener('click', () => load({ force: true }));
$('pause').addEventListener('click', () => {
  state.paused = !state.paused; $('pause').textContent = state.paused ? '继续刷新' : '暂停刷新'; $('pause').setAttribute('aria-pressed', String(state.paused));
  if (!state.paused) load({ force: true });
  else {
    controller?.abort(); ++state.generation; state.busy = false; $('refresh').disabled = false; delete $('refresh').dataset.working;
    $('sidebar-connection').textContent = '刷新已暂停'; $('sidebar-connection').className = 'warn'; showMessage('自动刷新已暂停。画面停留在上次评价时刻，初凝估计及预警不再随时间更新。');
  }
  updateEffects();
});
$('motion').addEventListener('click', () => {
  state.motion = !state.motion;
  $('motion').textContent = state.motion ? '动效开' : '动效关'; $('motion').setAttribute('aria-pressed', String(state.motion));
  setMotion(state.motion); updateEffects(); draw();
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
  if (event.matches) { state.motion = false; $('motion').textContent = '动效关'; $('motion').setAttribute('aria-pressed', 'false'); setMotion(false); updateEffects(); }
});
bindFullscreen($('fullscreen'), document, {
  onChange: fit,
  onError: () => showMessage('当前浏览器不允许切换全屏，请使用浏览器全屏功能；退出可按 Esc。', '', true),
});
$('range').addEventListener('change',()=>{resetTimelineZoom('trend-');draw();});
trendExpansion=bindChartExpansion($('view-trends'),{onChange:()=>{draw();requestAnimationFrame(resizeCharts);}});
for (const [id,field,step] of [['alert-prev','alertPage',-1],['alert-next','alertPage',1]]) $(id).addEventListener('click',()=>{state[field]+=step;draw();});
$('alert-filter').addEventListener('change',()=>{state.alertPage=0;draw();});
$('export').addEventListener('click', () => {
  const rows = rangeRows(); if (!rows.length) { showMessage('当前范围没有可导出的记录。', '', true); return; }
  const pipeColumns = pipeCsvColumns(state.data.slot);
  const fields = ['endedAt', 'label', 'volume', 'actualDepth', 'theoreticalDepth', 'actualSpeed', 'theoreticalSpeed', 'cumulativeVolume', 'measurementVolume', 'fillCoefficient', 'leftPressure','rightPressure', ...pipeColumns.map(column => column.key)];
  const headers = ['事件时刻(UTC+8)', '事件类型', '浇筑方量(m3)', '实测面深(m)', '理论面深(m)', '实测速度(m/h)', '理论速度(m/h)', '累计入槽(m3)', '测深折算(m3)', '扩孔系数','左接头管拔管压力(MPa)','右接头管拔管压力(MPa)', ...pipeColumns.map(column => column.label)];
  const csv = [headers.join(','), ...rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${state.data.slot.code}-事件趋势.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage(`已导出 ${rows.length} 条事件趋势。`, 'success', true);
});
$('policy-form').addEventListener('input', event => {
  clearFieldError(event.target); state.dirty = true;
  const issues=syncPolicyIntervalInputs(event.currentTarget,{showErrors:true});
  $('policy-message').textContent = Object.values(issues)[0] || '修改尚未保存。';
});
$('reload-policy').addEventListener('click', async () => {
  if (!state.data || state.saving || state.reloadingPolicy) return;
  if (state.dirty && !await confirmDiscard('重新载入将放弃未保存的规则草稿，读取当前已生效规则，是否继续？')) return;
  state.reloadingPolicy = true;
  const unlock = lockFormControls($('policy-form'));
  lockSlotPickers(true);
  try {
    const refreshed = await load({ force: true, resetPolicy: true });
    if (refreshed) $('policy-message').textContent = '已重新载入当前生效规则，可以继续修改。';
  } finally {
    unlock(); state.reloadingPolicy = false;
    lockSlotPickers(state.entryBusy || ($('record-frame').hasAttribute('src') && !state.entryReady));
  }
});
$('policy-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!state.data || state.saving) return;
  if(Object.keys(syncPolicyIntervalInputs(event.currentTarget,{showErrors:true})).length){event.currentTarget.reportValidity();return;}
  const policy = policyInput(new FormData(event.currentTarget),policyMetadata);
  const unlock = lockFormControls(event.currentTarget);
  state.saving = true; lockSlotPickers(true);
  $('save-policy').dataset.working = 'true';
  try {
    const saved = await request(`/slots/${encodeURIComponent(state.slotId)}/monitoring-policy`, { method: 'PUT', body: JSON.stringify({ baseRevision: state.policyRevision, policy }) });
    state.dirty = false; state.saving = false; const refreshed = await load({ force: true, resetPolicy: true });
    $('policy-message').textContent = refreshed?.evaluation.policy.revision === saved.revision
      ? '规则已保存并保留上一版本；当前评价已刷新，历史记录未被重写。'
      : '规则已保存，但当前评价刷新失败，请恢复连接后再刷新核对；不要重复提交。';
    showMessage($('policy-message').textContent, refreshed?.evaluation.policy.revision === saved.revision ? 'success' : 'warning', true);
  } catch (error) {
    $('policy-message').textContent = (error.issues ? [...new Set(Object.values(error.issues))].join('；') : error.message) + '；表单已保留。';
    showFieldErrors($('policy-form'), error.issues);
    showMessage($('policy-message').textContent, 'error', true);
  }
  finally { unlock(); state.saving = false; $('save-policy').disabled = false; delete $('save-policy').dataset.working; lockSlotPickers(state.entryBusy || ($('record-frame').hasAttribute('src') && !state.entryReady)); }
});
window.addEventListener('resize', fit);
                                                                           
watchDisplayDensity(() => requestAnimationFrame(resizeCharts));
window.addEventListener('hashchange', () => selectView(location.hash.slice(1)));
window.addEventListener('beforeunload', event => { if (state.saving || state.dirty || state.entryDirty || state.entryBusy) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { updateEffects(); if (!document.hidden && !state.paused) load({ force: true }); });
window.addEventListener('pagehide', () => { clearInterval(refreshTimer); clearInterval(clockTimer); pressureController.dispose(); controller?.abort(); trendExpansion?.dispose(); disposeCharts(); });
setMotion(state.motion); $('motion').textContent = state.motion ? '动效开' : '动效关'; $('motion').setAttribute('aria-pressed', String(state.motion));
fit(); clock(); selectView(location.hash.slice(1)); load({ resetPolicy: true });
refreshTimer = setInterval(() => { if (!document.hidden && !state.paused && !state.saving) load(); }, 15000);
clockTimer = setInterval(() => { if (!document.hidden) {clock();pressureController.tick();} }, 1000);
