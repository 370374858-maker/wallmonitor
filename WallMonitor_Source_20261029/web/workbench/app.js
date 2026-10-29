import {tremieLabel} from '../../shared/pipe-labels.js';
import {jointDepthPending} from '../../shared/joint-depth-state.js';
import { calculateSlot, sidesFor } from '/workbench-domain.js';
import * as construction from '/workbench-domain.js';
import { createPreviewCalculators } from './progressive-preview.js';
import { api, esc, fmt, numericField } from './format.js';
import { renderModel } from './model.js';
import { recordPreview, emptyState } from './views.js';
import { reconcilePipes, submitRevision, showRevisionHistory } from './revision-ui.js';
import { minuteTime, recordTimeForSave } from './record-controls.js';
import { clearFieldError, showFieldErrors } from '../ui/form-feedback.js';
import { confirmDiscard } from '../ui/confirm-discard.js';
import { confirmPouringInsertion } from '../ui/confirm-pouring-insertion.js';
import { bindBlurPreview } from '../ui/blur-preview.js';
import { WORKSPACE_TABS, workspaceFor, WORKFLOW_TABS, isSlotTab, isRecordTab, nextWorkflowTab } from './workflow.js';
import { createNotificationController, bindValidationNotifications } from '../ui/notifications.js';
import { createEventWorkspace } from './event-ui.js';
import { createExternalSync } from './external-sync.js';
import { createSavedSync } from './saved-sync.js';
import { syncJointDiameterInput } from './joint-diameter.js';

import {confirmDeleteSlot} from './delete-slot-dialog.js';
import {renderSlotLedger} from './slot-ledger.js';
import {planMarkup} from '../monitor/geometry.js';
const $ = selector => document.querySelector(selector);
let workspaceGroup=new URLSearchParams(location.search).get('workspace')==='slot-info'?'slot-info':'record';
const lastWorkspaceTab={record:'record','slot-info':'slot'};
let slotLedgerPage=0;
function drawSlotLedger(){const count=state.slots.length;slotLedgerPage=Math.min(slotLedgerPage,Math.max(0,Math.ceil(count/10)-1));$('#slot-ledger-content').innerHTML=renderSlotLedger(state.slots,{page:slotLedgerPage,selectedId:state.slot?.id});}
function applyWorkspaceTabs(group){workspaceGroup=group;document.documentElement.dataset.workspace=group;const tabs=WORKSPACE_TABS[group];for(const b of document.querySelectorAll('[data-tab]'))b.hidden=!tabs.includes(b.dataset.tab);for(const [i,tab] of tabs.entries()){const b=$('#tab-'+tab);b.querySelector('span').textContent=String(i+1).padStart(2,'0');$('.tabs').append(b);}}
async function selectWorkspace(group){if(!WORKSPACE_TABS[group]||state.busy)return false;if(group===workspaceGroup)return true;try{await activateTab(lastWorkspaceTab[group]);return workspaceGroup===group;}catch(error){showError(error);return false;}}
const slotSaveIcon = $('#save-slot svg').outerHTML;
const notifications = createNotificationController($('#notice'));
bindValidationNotifications(document, notifications);
const { previewSlot } = createPreviewCalculators(construction);
const state = { slots: [], slot: null, latest: null, detail: null, draftSlot: null, draftMetrics: null,
  tab: 'slot', modelMode: 'section', history: null, slotDirty: false, recordDirty: false, busy: false,
  baseRevision: 0, nextTruckNo: 1, slotEdit: null, recordEdit: null, recordChoices: [] };
let slotRequest = crypto.randomUUID(), recordRequest = crypto.randomUUID(), selectionVersion = 0;
const initialCache = { tremie: {}, joint: {}, labels:{} };
const busyForms = new Map();
let eventBusy = false;
const eventWorkspace = createEventWorkspace({ api, confirmDiscard, confirmInsertion:confirmPouringInsertion,
  renderPreview: recordPreview,
  notify: (message,tone = 'success') => notice(message,tone === 'warning' ? 'info' : tone),
  onState: ({dirty,busy}) => {
    state.recordDirty = Boolean(dirty); eventBusy = Boolean(busy);
    state.busy = eventBusy || busyForms.size > 0;
    document.querySelectorAll('.toolbar button,.toolbar select').forEach(control => { control.disabled = state.busy; });
    notifyParent('state');
  },
  onPreview: snapshot => { state.eventPreview = snapshot; updateModel(); },
  onNavigate: tab => { switchTab(tab); notifyParent('state'); },
  onShowRevisions: () => state.slot ? showRevisionHistory(state.slot.id) : undefined,
  onChanged: createSavedSync({
    current:()=>({slotId:state.slot?.id,revision:state.baseRevision}),
    applyContext:context=>{
      state.slot=context.slot;state.latest=context.latest;state.baseRevision=context.baseRevision;
      state.nextTruckNo=context.nextTruckNo;state.eventPreview=null;
      state.slots=state.slots.map(slot=>slot.id===context.slot.id?{...slot,...context.slot,recordCount:context.events.filter(e=>e.status!=='void').length}:slot);
      renderPicker();updateModel();
    },
    notifySaved:details=>notifyParent('saved',details),
    fetchSlots:()=>api('/slots'),
    applySlots:slots=>{state.slots=slots;renderPicker();},
    onError:error=>notice(`已保存，槽段列表刷新失败：${error.message}`,'info')
  })
});
async function mountEvents(context = null) {
  return eventWorkspace.mount({ recordHost: $('#record-content'), historyHost: $('#history-content'),
    slot: state.slot, mode: state.tab, context });
}
const syncExternalRevision=createExternalSync({
  current:()=>({slotId:state.slot?.id,revision:state.baseRevision,busy:state.busy,
    editing:state.slotDirty||state.recordDirty||Boolean(state.slotEdit)||state.tab==='record-edit'}),
  fetchContext:id=>api(`/slots/${encodeURIComponent(id)}/event-state`,{activity:false}),
  notify:message=>notice(message,'info'),
  applyContext:async context=>{
    state.slot=context.slot;state.latest=context.latest;state.baseRevision=context.baseRevision;
    state.nextTruckNo=context.nextTruckNo;state.eventPreview=null;
    state.slots=state.slots.map(slot=>slot.id===context.slot.id?{...slot,...context.slot,recordCount:context.events.filter(e=>e.status!=='void').length}:slot);
    await mountEvents(context);renderPicker();updateModel();notifyParent('context');
  }
});
const storedSlot = () => { try { return localStorage.getItem('cw.selected-slot'); } catch { return null; } };
const rememberSlot = id => { try { localStorage.setItem('cw.selected-slot', id); } catch {                                                           } };
const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === 'monitor';
if (embedded) {
  document.documentElement.classList.add('monitor-embedded');
  state.modelMode = 'solid';
}
const embeddedStatus = () => ({ slotId: state.slot?.id || '', dirty: state.slotDirty || state.recordDirty, busy: state.busy });
const configuredSides = layout => layout ? sidesFor(layout) : [];
function notifyParent(type,details={}) {
  if (embedded) window.parent.postMessage({ type: 'cw:' + type, ...embeddedStatus(), ...details }, location.origin);
}

function notice(message, type = 'success') {
  notifications.show(message, { tone: type });
}

function showError(error) {
  const messages = error.issues ? [...new Set(Object.values(error.issues))] : [];
  notice(messages.length ? messages.join('\n') : error.message, 'error');
  showFieldErrors($(isSlotTab(state.tab) ? '#slot-form' : '#record-form'), error.issues, state.recordEdit?.record.id);
}

function numberFrom(form, name) {
  const value = form.elements.namedItem(name)?.value;
  return value === undefined || value.trim() === '' ? null : Number(value);
}

function slotInput() {
  const form = $('#slot-form'), count = Number($('#tremie-count').value), layout = $('#joint-layout').value;
  return { code: form.elements.code.value, width: numberFrom(form, 'width'), depth: numberFrom(form, 'depth'),
    thickness: numberFrom(form, 'thickness'), tremieCount: count, jointLayout: layout,
    initialConcreteHeight: numberFrom(form, 'initialConcreteHeight'),
    initialObservedAt: recordTimeForSave(form.elements.initialObservedAt.value, state.slotEdit?.slot.initialObservedAt) || null,
    jointDiameter: layout === 'none' ? null : numberFrom(form, 'jointDiameter'),
    tremieLabels:Array.from({length:count},(_,i)=>form.elements.namedItem(`label-tremie-${i}`)?.value??String(i+1)),
    tremieInitialDepths: Array.from({ length: count }, (_, i) => numberFrom(form, `initial-tremie-${i}`)),
    jointInitialDepths: Object.fromEntries(configuredSides(layout).map(side => [side, numberFrom(form, `initial-joint-${side}`)])) };
}

function rebuildInitialFields() {
  syncJointDiameterInput($('#slot-form'), $('#joint-diameter-hint'));
  const form = $('#slot-form');
  for (const element of form.querySelectorAll('[name^="initial-"]')) {
    const [, kind, id] = element.name.split('-');
    initialCache[kind][id] = element.value;
  }
  for(const element of form.querySelectorAll('[name^="label-tremie-"]'))initialCache.labels[element.name.split('-').at(-1)]=element.value;
  const depth = numberFrom(form, 'depth') || 10000;
  $('#tremie-initial-fields').innerHTML = Array.from({ length: Number($('#tremie-count').value) }, (_, i) =>
    `<div class="tremie-position-config"><label class="field">从左第 ${i+1} 根 · 自定义序号<input name="label-tremie-${i}" value="${esc(initialCache.labels[i]??String(i+1))}" inputmode="numeric" pattern="[0-9]+" maxlength="16" title="槽段内不重复的正整数" required></label>${numericField(`initial-tremie-${i}`, '初始管底测深', { value: initialCache.tremie[i] ?? '', min: .01, max: 1000000 })}</div>`).join('');
  $('#joint-initial-fields').innerHTML = configuredSides($('#joint-layout').value).map(side =>
    jointDepthPending(state.slotEdit?.slot,side)
      ? `<label class="field">${side==='left'?'左':'右'}接头管 · 初始管底测深<input type="hidden" name="initial-joint-${side}" value="${esc(initialCache.joint[side]??'')}"><input placeholder="等待设备深度" disabled aria-label="等待设备初始管底测深"></label>`
      : numericField(`initial-joint-${side}`, `${side === 'left' ? '左' : '右'}接头管 · 初始管底测深`, { value: initialCache.joint[side] ?? '', min: 0, max: 1000000, step:'any' })).join('') || '<div class="no-pipes">请选择接头管配置</div>';
}

function setSlotForm(context = null) {
  state.slotEdit = context; state.slotDirty = false; slotRequest = crypto.randomUUID();
  const form = $('#slot-form'); form.reset();
  initialCache.tremie = {}; initialCache.joint = {};initialCache.labels={};
  $('#tremie-initial-fields').innerHTML = ''; $('#joint-initial-fields').innerHTML = '';
  if (context) {
    for (const key of ['code','width','depth','thickness','tremieCount','jointLayout']) form.elements.namedItem(key).value = context.slot[key] ?? '';
    form.elements.initialConcreteHeight.value = context.slot.initialConcreteHeight ?? 0;
    form.elements.jointDiameter.value = context.slot.jointLayout === 'none' ? '' : context.slot.jointDiameter ?? construction.DEFAULT_JOINT_DIAMETER;
    form.elements.initialObservedAt.value = minuteTime(context.slot.initialObservedAt || '');
    initialCache.labels=Object.fromEntries(Array.from({length:context.slot.tremieCount},(_,i)=>[i,tremieLabel(context.slot,i)]));
    initialCache.tremie = { ...context.slot.tremieInitialDepths }; initialCache.joint = { ...context.slot.jointInitialDepths };
  }
  form.setAttribute('aria-label', context ? `修改槽段 · ${context.slot.code}` : '新建槽段');
  $('#save-slot').innerHTML = `${slotSaveIcon}<span>${context ? '预览重算并保存修改' : '保存'}</span>`;
  $('[data-reset-slot] span').textContent = context ? '恢复载入值' : '重置';
  form.querySelectorAll('[data-field-error]').forEach(clearFieldError);
  form.elements.initialConcreteHeight.max = form.elements.depth.value || 10000;
                                                                               
                                                                               
  form.elements.initialObservedAt.required = !context;
  rebuildInitialFields(); syncSlotCodeControl(); updateSlotPreview(); notifyParent('state');
}

function updateSlotPreview() {
  const result = previewSlot(slotInput());
  state.draftSlot = result.slot&&{...result.slot,...(state.slotEdit?.slot?.jointDepthInitialization?{jointDepthInitialization:state.slotEdit.slot.jointDepthInitialization}:{})};
  showFieldErrors($('#slot-form'),Object.fromEntries(Object.entries(result.issues).filter(([key])=>key.startsWith('tremieLabels'))),null,{focus:false});
  $('#slot-cross-section-view').innerHTML=result.slot?planMarkup(result.slot):'<p class="cross-section-empty">填写有效槽段尺寸后显示横截面</p>';
  const gross = result.areaStatus === 'gross-reference';
  $('#draft-area').previousElementSibling.textContent = gross ? '毛截面积（待接头配置）' : '有效截面积';
  $('#draft-capacity').previousElementSibling.textContent = gross ? '毛容积（待接头配置）' : '设计容积';
  $('#draft-area').innerHTML = `${fmt(gross ? result.grossArea : result.area)} <em>m²</em>`;
  $('#draft-capacity').innerHTML = `${fmt(gross ? result.grossCapacity : result.capacity)} <em>m³</em>`;
  $('#slot-draft-hint').textContent = result.ready.complete ? '参数完整 · 尚未保存' : result.slot
    ? '槽体已预览；管道随有效配置逐项显示' : '填写有效宽度、深度和厚度后显示槽体';
  updateModel();
}

function updateModel() {
  if(state.tab==='slot-ledger')return;
  let slot, metrics, label;
  if (isSlotTab(state.tab)) {
    slot = state.draftSlot; metrics = null; label = '未保存草稿';
  } else if (state.eventPreview && isRecordTab(state.tab)) {
    slot = state.slot; metrics = state.eventPreview.metrics;
    label = `分项预览 · ${state.eventPreview.occurredAt?.slice(0,16) || ''}`;
  } else if (state.tab === 'history' && state.detail) {
    slot = state.detail.slotSnapshot; metrics = state.detail.metrics; label = `第 ${state.detail.truckNo} 车快照`;
  } else {
    slot = state.slot;
    metrics = state.latest?.metrics;
    label = state.latest ? `已保存 · ${(state.latest.occurredAt || state.latest.endedAt || '').slice(0,16)}` : '初始管道布置';
  }
  $('#model-state').textContent = label;
  renderModel($('#model-view'), $('#model-values'), slot, metrics ?? null, state.modelMode);
}

function switchTab(tab, focus = false) {
  if (!WORKFLOW_TABS.includes(tab)) return;
  state.tab = tab;
  applyWorkspaceTabs(workspaceFor(tab));lastWorkspaceTab[workspaceGroup]=tab;
  if(tab==='slot-ledger')drawSlotLedger();
                                                                                  
  if (isSlotTab(tab)) $('#view-' + tab).append($('#slot-form'));
  if (isRecordTab(tab)) $('#view-' + tab).append($('#record-content'));
  document.documentElement.dataset.activeTab = tab;
  syncSlotCodeControl();
  for (const button of document.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (focus && selected) button.focus();
  }
  for (const pane of document.querySelectorAll('[role="tabpanel"]')) pane.hidden = pane.id !== 'view-' + tab;
  history.replaceState(null, '', '#' + tab);
  updateModel();
}

async function activateTab(tab, focus = false) {
  if (state.busy || !WORKFLOW_TABS.includes(tab)) return;
  if (workspaceFor(tab)!==workspaceGroup&&state.slotDirty){if(!await confirmDiscard('切换页面将放弃未保存的槽段资料，是否继续？'))return;setSlotForm();}
  if (tab !== state.tab && state.recordDirty && !await eventWorkspace.canLeave()) return;
  if (tab !== state.tab && state.recordDirty) { eventWorkspace.clear(); state.eventPreview = null; }
  if (tab === 'slot' && state.slotEdit) {
    if (state.slotDirty && !await confirmDiscard('进入新建槽段将放弃当前未保存的槽段修改。')) return;
    setSlotForm();
  }
  if (tab === 'slot-edit' && !state.slotEdit) {
    if (!state.slot) { notice('请先建立槽段档案，再进入槽段修改。', 'info'); return; }
    if (state.slotDirty && !await confirmDiscard('载入槽段修改将放弃当前未保存的新建草稿。')) return;
    const slotId = state.slot.id, form = $('#slot-form'); busyForm(form, true);
    try {
      const context = await api(`/slots/${slotId}/edit-context`);
      if (state.slot?.id !== slotId) return;
      setSlotForm(context);
    } finally { busyForm(form, false); }
  }
  switchTab(tab, focus); notifyParent('state');
  if (tab==='slot-ledger'){state.slots=await api('/slots');renderPicker();drawSlotLedger();}
  else if (!isSlotTab(tab)) await mountEvents();
}

function syncSlotCodeControl(){
  const editing=state.tab==='slot-edit',input=$('#slot-code'),picker=$('#slot-edit-picker');
  input.hidden=editing;input.required=!editing;input.readOnly=editing;picker.hidden=!editing;
  picker.innerHTML=state.slots.length?state.slots.map(s=>`<option value="${esc(s.id)}" ${s.id===state.slot?.id?'selected':''}>${esc(s.code)}</option>`).join(''):'<option value="">暂无槽段</option>';
}
function renderPicker() {
  drawSlotLedger();syncSlotCodeControl();
  $('#active-slot').innerHTML = state.slots.length ? state.slots.map(slot =>
    `<option value="${slot.id}" ${slot.id === state.slot?.id ? 'selected' : ''}>${esc(slot.code)} · ${slot.recordCount} 条记录</option>`).join('') : '<option value="">尚未建档</option>';
}

function renderRecord(fields = null) {
                                                                                   
  return;
}
function renderHistory() {
  updateModel();
}

async function selectSlot(id, preserve = false) {
  const form = $('#record-form') || $('#slot-form');
  busyForm(form, true);
  try {
  const version = ++selectionVersion;

  if (!id) { state.slot = state.latest = state.detail = state.history = state.eventPreview = null; state.baseRevision=0;state.nextTruckNo=1;state.recordDirty=false;state.recordEdit=null;eventWorkspace.clear();setSlotForm();rememberSlot('');renderPicker();await mountEvents();renderRecord();renderHistory();notifyParent('context');return; }
  const context = await api(`/slots/${id}/event-state`);
  if (version !== selectionVersion) return;
  state.slot = context.slot; state.latest = context.latest; state.nextTruckNo = context.nextTruckNo; state.history = null;
  state.baseRevision = context.baseRevision;
  state.detail = null; state.eventPreview = null;
  if (!preserve) { state.recordDirty = false; state.recordEdit = null; }
  recordRequest = crypto.randomUUID();
  rememberSlot(id);
  renderPicker(); renderRecord(); renderHistory();
  if (!preserve && isSlotTab(state.tab)) {
    setSlotForm(state.tab === 'slot-edit' ? await api(`/slots/${id}/edit-context`) : null);
  }
  if (!preserve) eventWorkspace.clear();
  await mountEvents(context);
  notifyParent('context');
  } finally { busyForm(form, false); }
}

async function reloadAll(preserve = true) {
  try {
    const [, slots] = await Promise.all([api('/health'), api('/slots')]);
    $('#db-status').className = 'connection';
    $('#db-status').innerHTML = '<i></i>MySQL 已连接';
    state.slots = slots;
    const wanted = state.slot?.id || new URLSearchParams(location.search).get('slot') || storedSlot();
    const id = state.slots.some(s => s.id === wanted) ? wanted : state.slots[0]?.id;
    await selectSlot(id, preserve && id === state.slot?.id);
    renderPicker();
  } catch (error) {
    $('#db-status').className = 'connection error';
    $('#db-status').innerHTML = '<i></i>数据读取失败';
    showError(error);
    if (!state.slot) { renderRecord(); renderHistory(); }
    throw error;
  }
}

function busyForm(form, busy) {
  const depth = (busyForms.get(form) || 0) + (busy ? 1 : -1);
  if (depth > 0) busyForms.set(form, depth); else busyForms.delete(form);
  const locked = depth > 0;
  state.busy = eventBusy || busyForms.size > 0;
  notifyParent('state');
  for (const control of form.querySelectorAll('input,select,button')) control.disabled = locked;
  form.setAttribute('aria-busy', String(locked));
  for (const button of form.querySelectorAll('[type=submit]')) {
    if (locked && !button.dataset.idleText) { button.dataset.idleText = button.innerHTML; button.dataset.working = 'true'; button.textContent = '处理中，请稍候'; }
    else if (!locked && button.dataset.idleText) { if (button.textContent === '处理中，请稍候') button.innerHTML = button.dataset.idleText; delete button.dataset.idleText; delete button.dataset.working; }
  }
  for (const control of document.querySelectorAll('.toolbar button,.toolbar select')) control.disabled = state.busy;
  if (!locked) syncJointDiameterInput($('#slot-form'), $('#joint-diameter-hint'));
}

async function saveSlot(event) {
  event.preventDefault();
  if (state.busy) return;
  if (state.recordDirty && !await confirmDiscard('保存槽段后将重新加载施工对象，未保存的施工记录草稿会清空。')) return;
  const form = event.target;
  let result;
  try {
    const raw = slotInput();
    calculateSlot(raw);
    busyForm(form, true);
    if (state.slotEdit) {
      const context = state.slotEdit;
      let recordPatches = [];
      if (context.records.length && (raw.tremieCount !== context.slot.tremieCount || raw.jointLayout !== context.slot.jointLayout)) {
        recordPatches = await reconcilePipes(raw, context.records);
        if (!recordPatches) return;
      }
      result = await submitRevision(context.slot.id, { kind: 'slot', values: raw, recordPatches, baseRevision: context.baseRevision });
      if (!result) return;
      state.slotDirty = false; state.recordDirty = false;
      notifyParent('saved');
      await reloadAll(false);
      setSlotForm(await api(`/slots/${context.slot.id}/edit-context`));
      notice(`槽段修改已保存，已重算 ${result.recalculated} 个事件时刻；旧槽段参数已留存修订日志。`);
      return;
    }
    result = await api('/slots', { method: 'POST', body: JSON.stringify({ ...raw, requestId: slotRequest }) });
    state.slotDirty = false; slotRequest = crypto.randomUUID();
    form.reset();
    initialCache.tremie = {}; initialCache.joint = {};initialCache.labels={};
                                                                                               
    $('#tremie-initial-fields').innerHTML = ''; $('#joint-initial-fields').innerHTML = '';
    rebuildInitialFields(); updateSlotPreview();
    state.slots = await api('/slots');
    await selectSlot(result.slot.id);
    notifyParent('saved');
    switchTab('slot-ledger');
    notice(`槽段 ${result.slot.code} 已保存，截面积 ${fmt(result.slot.area, 2)} m²。可前往“施工录入”添加事件。`);
    if (!embedded) $('.toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (result) notice('槽段已成功保存，但重新读取失败。请点击右上角刷新；不要重复创建。', 'info');
    else showError(error);
  } finally { busyForm(form, false); }
}

$('#slot-form').addEventListener('submit', saveSlot);
$('#model-view').addEventListener('modelmodechange', event => {
  if (!['section', 'solid'].includes(event.detail?.mode)) return;
  state.modelMode = event.detail.mode;
  updateModel();
});
$('#slot-form').addEventListener('input', event => {
  clearFieldError(event.target);
  state.slotDirty = true; slotRequest = crypto.randomUUID();
  if (['thickness','jointDiameter','jointLayout'].includes(event.target.name)) syncJointDiameterInput($('#slot-form'), $('#joint-diameter-hint'));
  if (event.target.name === 'depth') {
    $('#slot-initial-height').max = event.target.value || 10000;
    for (const input of $('#slot-form').querySelectorAll('[name^="initial-"]')) input.max = 1000000;
  }
});
for (const id of ['#tremie-count', '#joint-layout']) $(id).addEventListener('change', () => {
  rebuildInitialFields(); state.slotDirty = true; slotRequest = crypto.randomUUID(); updateSlotPreview();
});
bindBlurPreview($('#slot-form'),updateSlotPreview,()=>{}, { previewOnInput:true, delay:180 });

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || button.closest('.event-workspace,.event-history')) return;
  if (state.busy && !button.closest('.scene-viewport') && !button.hasAttribute('data-dismiss-notice')) return;
  if (button.hasAttribute('data-dismiss-notice')) notice('');
  try {
    if (button.hasAttribute('data-reset-slot')) {
      if (state.slotDirty && !await confirmDiscard(state.slotEdit ? '恢复载入值将放弃当前未保存的槽段修改。' : '重置将清空当前未保存的槽段参数。')) return;
      setSlotForm(state.slotEdit); notice('');
    }
    if (button.hasAttribute('data-revision-history') && state.slot) await showRevisionHistory(state.slot.id);
    if (button.dataset.tab) await activateTab(button.dataset.tab);
    if (button.hasAttribute('data-go-slot')) await activateTab('slot', true);
    if (button.hasAttribute('data-go-record') || button.hasAttribute('data-new-record')) await activateTab('record', true);
  } catch (error) { showError(error); }
  if (button.dataset.fillInitial) {
    const depth = numberFrom($('#slot-form'), 'depth');
    if (!depth || depth <= 0) { notice('请先填写有效的槽段深度。', 'info'); $('#slot-depth').focus(); return; }
    for (const input of $('#slot-form').querySelectorAll(`[name^="initial-${button.dataset.fillInitial}-"]`)) input.value = depth;
    state.slotDirty = true; slotRequest = crypto.randomUUID(); updateSlotPreview();
  }
});

$('.tabs').addEventListener('keydown', async event => {
  if (state.busy) return;
  const tab = nextWorkflowTab(state.tab, event.key);
  if (!tab) return;
  event.preventDefault();
  try { await activateTab(tab, true); } catch (error) { showError(error); }
});

async function changeActiveSlot(event) {
  const id = event.target.value;
  if (state.busy || (embedded && await window.parent.cwMonitor?.canChangeSlot(id) === false)) { renderPicker(); return; }
  if ((state.recordDirty || state.slotDirty) && !await confirmDiscard('切换槽段将清空当前未保存的草稿。')) { renderPicker(); return; }
  try { await selectSlot(id); if (!isSlotTab(state.tab)) setSlotForm(); notice(''); }
  catch (error) { renderPicker(); showError(error); }
}
$('#active-slot').addEventListener('change',changeActiveSlot);
$('#slot-edit-picker').addEventListener('input',event=>event.stopPropagation());
$('#slot-edit-picker').addEventListener('change',event=>{event.stopPropagation();changeActiveSlot(event);});
$('#reload').addEventListener('click', async () => {
  $('#reload').disabled = true;
  try {
    if(state.tab==='slot-ledger'){state.slots=await api('/slots');renderPicker();notice('槽段台账已刷新。','info');return;}
    if (!isSlotTab(state.tab)) {
      const context = await eventWorkspace.refresh();
      if (!context) return;
      state.slot = context.slot; state.latest = context.latest; state.baseRevision = context.baseRevision;
      updateModel(); notifyParent('context'); return;
    }
    if (state.slotEdit) {
      if ((state.recordDirty || state.slotDirty) && !await confirmDiscard('重新加载历史编辑会清除未提交修改。')) return;
      const form = $('#slot-form'), slotId = state.slot.id;
      busyForm(form, true);
      try {
                                                                         
        const context = await api(`/slots/${slotId}/edit-context`);
        state.slot = context.slot; state.latest = context.latest; state.nextTruckNo = context.nextTruckNo; state.baseRevision = context.baseRevision;
        state.history = null; state.detail = null;
        state.recordDirty = false; recordRequest = crypto.randomUUID();
        setSlotForm(context);
        renderRecord(); renderHistory(); renderPicker(); notifyParent('context');
      } finally { busyForm(form, false); }
    } else await reloadAll(true);
    notice(state.recordDirty ? '已读取最新管深。当前表单已保留，请核对后再保存。' : '已从数据库重新读取数据。', 'info');
  }
  catch (error) { showError(error); }
  finally { $('#reload').disabled = false; }
});
window.addEventListener('beforeunload', event => { if (state.slotDirty || state.recordDirty || state.busy) { event.preventDefault(); event.returnValue = ''; } });
                                                                                 
if (embedded) {
  window.cwEmbedded = {
    status: embeddedStatus,
    selectWorkspace,
    syncExternalRevision,
    setEffects(enabled) {
      document.documentElement.classList.toggle('effects-enabled', Boolean(enabled) && !matchMedia('(prefers-reduced-motion: reduce)').matches);
    },
    async selectSlot(id) {
      if (state.busy) return false;
      if (id === state.slot?.id) return true;
      if (await window.parent.cwMonitor?.canChangeSlot(id) === false) return false;
      if ((state.recordDirty || state.slotDirty) && !await confirmDiscard('切换槽段将清空未提交草稿。')) return false;
      const form = $('#record-form') || $('#slot-form');
      try { busyForm(form, true); await selectSlot(id); if (!isSlotTab(state.tab)) setSlotForm(); notice(''); return true; }
      catch (error) { showError(error); return false; }
      finally { busyForm(form, false); }
    }
  };
  document.addEventListener('input', () => notifyParent('state'));
  document.addEventListener('change', () => notifyParent('state'));
  document.addEventListener('click', () => queueMicrotask(() => notifyParent('state')));
}
applyWorkspaceTabs(workspaceGroup);
async function deleteSlotFromLedger(id) {
  if(state.busy)return;
  const form=$('#slot-form');let deleted=false;
  try {
    if(embedded&&await window.parent.cwMonitor?.canChangeSlot('')===false)return;
    if((state.recordDirty||state.slotDirty)&&!await confirmDiscard('删除后将重新载入槽段，未保存的草稿会清空。'))return;
    busyForm(form,true);
    const context=await api('/slots/'+encodeURIComponent(id)+'/event-state');
    if(!await confirmDeleteSlot(context.slot.code))return;
    await api('/slots/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({confirmation:'确认删除',baseRevision:context.baseRevision}),label:'正在删除槽段及全部关联记录'});
    deleted=true;
    if(embedded)window.parent.postMessage({type:'cw:deleted',deletedSlotId:id,...embeddedStatus()},location.origin);
    state.slots=state.slots.filter(s=>s.id!==id);eventWorkspace.clear();setSlotForm();
    await selectSlot(state.slot?.id===id?state.slots[0]?.id:state.slot?.id);
    state.slots=await api('/slots');renderPicker();
    notice('槽段及其全部关联记录已永久删除。');
  } catch(error) { if(deleted)notice('槽段已删除，但界面刷新未完成，请刷新页面。','info');else showError(error); }
  finally {busyForm(form,false);}
}
$('#slot-ledger-content').addEventListener('click',async event=>{const button=event.target.closest('button');if(!button||state.busy)return;if(button.dataset.slotHistory){try{await showRevisionHistory(button.dataset.slotHistory,{slotOnly:true});}catch(error){showError(error);}return;}if(button.dataset.slotDelete){await deleteSlotFromLedger(button.dataset.slotDelete);return;}if(button.dataset.slotPage){slotLedgerPage+=Number(button.dataset.slotPage);drawSlotLedger();}if(button.dataset.slotModify){try{if(embedded&&await window.parent.cwMonitor?.canChangeSlot(button.dataset.slotModify)===false)return;if(state.slotDirty&&!await confirmDiscard('载入槽段修改将放弃未保存的草稿。'))return;setSlotForm();await selectSlot(button.dataset.slotModify);await activateTab('slot-edit');}catch(error){showError(error);}}});
for(const button of document.querySelectorAll('[data-workspace]'))button.addEventListener('click',()=>selectWorkspace(button.dataset.workspace));
rebuildInitialFields(); updateSlotPreview(); renderRecord(); renderHistory();
try { await reloadAll(false); } catch {                                                            }
try { await activateTab(WORKSPACE_TABS[workspaceGroup].includes(location.hash.slice(1)) ? location.hash.slice(1) : WORKSPACE_TABS[workspaceGroup][0]); }
catch (error) { showError(error); switchTab('record'); }
notifyParent('ready');
                                                                                     
if(!embedded){
  const syncTimer=setInterval(()=>{if(!document.hidden)syncExternalRevision(state.slot?.id).catch(()=>{});},15000);
  window.addEventListener('pagehide',()=>clearInterval(syncTimer));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncExternalRevision(state.slot?.id).catch(()=>{});});
}
