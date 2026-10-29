import {pipeLabel} from '../../shared/pipe-labels.js';
import { esc, fmt, timeText } from './format.js';
import { renderTimeline, eventSourceLabel, sourceLabel } from './event-ledger.js';
import { inspectPouringInsertion, pouringConflictMessage } from '../../shared/pouring-order.js';
import { requestReason } from '../ui/request-reason.js';
import { confirmDiscard as defaultConfirmDiscard } from '../ui/confirm-discard.js';
import { confirmPouringInsertion } from '../ui/confirm-pouring-insertion.js';

export const EVENT_LABELS = Object.freeze({ pouring:'浇筑方量', measurement:'混凝土面', tremie:'浇筑管', joint:'接头管' });
const TYPES = Object.keys(EVENT_LABELS);
const blank = value => value == null || String(value).trim() === '';
const number = value => blank(value) ? null : Number(value);
export const minuteTime = value => String(value || '').replace(' ', 'T').slice(0,16);
export const beijingTime = value => String(value || '').replace('T',' ').slice(0,16) + ':00';
export const timeForSave = (value, original) => original && minuteTime(original) === value ? String(original).replace('T',' ') : beijingTime(value);
const nowMinute = () => { const now = new Date(Date.now() + 8 * 3600000); return now.toISOString().slice(0,16); };
export function latestEventTime(events, type, fallback = nowMinute()) {
  return (events || []).filter(event => event.type === type && event.status !== 'void' && event.occurredAt)
    .map(event => minuteTime(event.occurredAt)).sort().at(-1) || fallback;
}
const uuid = () => globalThis.crypto?.randomUUID?.() || `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const issueText = error => error?.issues ? (Array.isArray(error.issues) ? error.issues : Object.values(error.issues)).join('；') : error?.message || '操作失败，请稍后重试。';

export function pipeIds(slot, type) {
  if (type === 'tremie') return Array.from({ length:Number(slot?.tremieCount || 0) }, (_,i) => `t${i+1}`);
  const layout = String(slot?.jointLayout || '').toLowerCase();
  if (layout === 'both' || layout.includes('双') || layout.includes('两')) return ['left','right'];
  if (layout === 'left' || layout.includes('左')) return ['left'];
  if (layout === 'right' || layout.includes('右')) return ['right'];
  return [];
}

                                                                             
                                                                                 
export function manualPullDraft(event, slot, events = []) {
  const depths = Object.fromEntries([
    ...(slot.tremieInitialDepths || []).map((depth, i) => [`t${i + 1}`, depth]),
    ...Object.entries(slot.jointInitialDepths || {})
  ]);
  const prior = events.filter(e => e.status !== 'void' && e.occurredAt < event.occurredAt &&
    (e.type === 'tremie' || e.type === 'joint')).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const e of prior) for (const p of e.payload.pulls || []) {
    depths[p.pipeId] = p.mode === 'absolute' ? p.value : Math.max(0, depths[p.pipeId] - p.value);
  }
  const pulls = {}, modes = {};
  for (const p of event.payload.pulls || []) {
    const value = p.mode === 'absolute' ? depths[p.pipeId] - p.value : p.value;
    if (!Number.isFinite(value) || (event.type!=='joint'&&value<0)) throw new Error('该历史管底记录无法换算为有效的本次位移，请先核对管底位置记录。');
    pulls[p.pipeId] = p.mode === 'absolute' ? Number(value.toFixed(8)) : value;
    modes[p.pipeId] = 'delta';
  }
  return { pulls, modes };
}

export function validateDraft(type, draft, slot, { expectedPoints=6 }={}) {
  const errors = {};
  const nonnegative = value => !blank(value) && Number.isFinite(number(value)) && number(value) >= 0;
  if (blank(draft.occurredAt)) errors.occurredAt = '请选择事件时间';
  if (type === 'pouring') {
    if (!Number.isInteger(number(draft.truckNo)) || number(draft.truckNo) < 1) errors.truckNo = '车号无效';
    if (!nonnegative(draft.volume) || number(draft.volume) <= 0) errors.volume = '请输入大于 0 的方量';
    if (blank(draft.startedAt)) errors.startedAt = '请选择开始时间';
    if (!blank(draft.startedAt) && !blank(draft.occurredAt) && draft.startedAt >= draft.occurredAt) errors.startedAt = '开始时间必须早于结束时间';
  }
  if (type === 'measurement') {
    const points = draft.measurementPoints || [];
    if (points.length !== expectedPoints || points.some(v => !nonnegative(v))) errors.measurementPoints = `${expectedPoints} 个测点必须全部填写非负数值`;
  }
  if (type === 'tremie' || type === 'joint') {
    const pulls = pipeIds(slot,type).filter(id => !blank(draft.pulls?.[id]));
    if (!pulls.length) errors.pulls = '至少填写一根管的数值';
    if (pulls.some(id => type==='joint'?!Number.isFinite(number(draft.pulls[id])):!nonnegative(draft.pulls[id]))) errors.pulls = type==='joint'?'拔管数值须为有效数字；正数上拔、负数回落':'拔管数值须为非负数';
    if(type==='joint'&&pulls.some(id=>!nonnegative(draft.pressures?.[id])))errors.pressures='填写拔出量的接头管必须同时填写非负液压压力（MPa）';
  }
  return errors;
}

export function eventFromDraft(type, draft, slot, { truckNo, original }={}) {
  const occurredAt = timeForSave(draft.occurredAt,original?.occurredAt);
  const base = { type, occurredAt, source:'manual', payload:{} };
  if (type === 'pouring') base.payload = { truckNo:Number(truckNo ?? draft.truckNo), volume:number(draft.volume), startedAt:timeForSave(draft.startedAt,original?.payload?.startedAt), endedAt:occurredAt };
  if (type === 'measurement') base.payload = { measurementPoints:draft.measurementPoints.map(Number) };
  if (type === 'tremie' || type === 'joint') base.payload = { pulls:pipeIds(slot,type).filter(id => !blank(draft.pulls?.[id])).map(id => ({ pipeId:id, mode:draft.modes?.[id] || 'delta', value:number(draft.pulls[id]),...(type==='joint'?{pressure:number(draft.pressures?.[id]),...(original?.payload?.pulls?.find(p=>p.pipeId===id)?.pressureBackfilled&&number(draft.pressures?.[id])===(original.payload.pulls.find(p=>p.pipeId===id).pressure??1)?{pressureBackfilled:true}:{})}:{}) })) };
  return base;
}

export function attachSnapshots(events=[],snapshots=[]) { const byId=new Map(); for(const snapshot of snapshots)for(const id of snapshot.eventIds||[])byId.set(id,snapshot); return events.map(event=>({...event,snapshot:byId.get(event.id)||event.snapshot||null})); }

const input = (name,label,value='',extra='') => `<label class="field event-field"><span>${esc(label)}</span><input name="${esc(name)}" value="${esc(value)}" ${extra}></label>`;
const numeric = (name,label,value='',unit='m',min=0,step='0.01') => `<label class="field event-field"><span>${esc(label)}</span><div class="unit-input"><input name="${esc(name)}" value="${esc(value)}" type="number" min="${min}" max="1000000" step="${step}" inputmode="decimal"><span>${esc(unit)}</span></div></label>`;
const icon = path => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
const defaultPreview=(snapshot,message='')=>{const m=snapshot?.metrics||snapshot||{};return `<div class="module-header"><h3>事件指标预览</h3><span class="draft-badge">尚未保存</span></div><div class="detail-grid">${[['实测面深',m.actualDepth,'m'],['理论面深',m.theoreticalDepth,'m'],['累计方量',m.cumulativeVolume,'m³'],['理论速度',m.theoreticalSpeed,'m/h'],['实测速度',m.actualSpeed,'m/h'],['测量时间',m.measurementAt,'']].map(([l,v,u])=>`<div><small>${l}</small><b>${typeof v==='string'?esc(timeText(v)):fmt(v)}${u?` <em>${u}</em>`:''}</b></div>`).join('')}</div>${message?`<p class="summary-hint">${esc(message)}</p>`:''}`;};

const sourceTime = value => timeText(value);
const shortSourceTime = value => sourceTime(value).replace(/^\d{4}-/, '').slice(0, 11);
const metricSource = (label, at) => at
  ? `<small class="metric-source" title="${esc(`${label}来源 ${sourceTime(at)}`)}">来源 ${esc(shortSourceTime(at))}</small>`
  : '';

export const previewSourceHint = metrics => {
  const m = metrics || {};
  const evaluatedAt = m.evaluatedAt;
  const items = [
    ['实测速度', m.actualSpeed, m.actualSpeedAt],
    ['理论速度', m.theoreticalSpeed, m.theoreticalSpeedAt],
    ['测量方量', m.measurementVolume, m.measurementVolumeAt],
    ['充盈系数', m.fillCoefficient, m.fillCoefficientAt]
  ].filter(([, value, at]) => value != null && at);
  if (!items.length) return '';
  const groups = new Map();
  for (const [label, , at] of items) {
    const key = sourceTime(at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(label);
  }
  const text = [...groups].map(([at, labels]) => `${labels.join('、')}来源 ${shortSourceTime(at)}${evaluatedAt && at !== evaluatedAt ? '（沿用历史）' : ''}`).join('；');
  const reason = m.fillCoefficientReason ? `；${m.fillCoefficientReason}` : '';
  const title = items.map(([label, , at]) => `${label}来源 ${sourceTime(at)}`).join('；') + reason;
  return `<p class="summary-hint event-source-hint" title="${esc(title)}">${esc(text + reason)}</p>`;
};

const previewMarkup = (renderPreview, snapshot, message = '', points = []) => {
  const metrics = snapshot?.metrics || snapshot || {};
  return `${renderPreview(metrics, message, points)}${previewSourceHint(metrics)}`;
};

export function createEventWorkspace({ api, onChanged=()=>{}, onPreview=()=>{}, onState=()=>{}, onNavigate=()=>{}, onShowRevisions=()=>{}, notify=()=>{}, confirmInsertion=confirmPouringInsertion, confirmDiscard=defaultConfirmDiscard, askReason=requestReason, renderPreview=defaultPreview, pendingPreview=message=>defaultPreview(null,message) }={}) {
  if (typeof api !== 'function') throw new TypeError('createEventWorkspace 需要 api(path, options)');
  const state={ slot:null, data:null, mode:'record', activeType:'pouring', dirty:false, dirtyModules:new Set(), busy:false, hosts:new Set(), previewSeq:0, loadSeq:0, previewTimer:0, historyType:'all', page:0, pageSize:10, edit:null, request:null, preview:null, lastError:'', lastErrorAt:0 };
  let drafts={}, mutationBusy=false;
  const freshDraft=type=>{const time=latestEventTime(state.data?.events,type);return { occurredAt:time, startedAt:time, truckNo:'', volume:'', measurementPoints:Array(6).fill(''), pulls:{}, modes:{}, pressures:{} };};
  const resetDrafts=()=>{drafts=Object.fromEntries(TYPES.map(type=>[type,freshDraft(type)]));state.request=null;state.preview=null;}; resetDrafts();
  const seedDraftTimes=()=>{
    if(state.edit)return;
    for(const type of TYPES){
      if(state.dirtyModules.has(type)||state.dirtyModules.has('all'))continue;
      const time=latestEventTime(state.data?.events,type);
      drafts[type].occurredAt=time;
      if(type==='pouring')drafts[type].startedAt=time;
    }
  };
  const request=(path,options={})=>api(path,{ activity:false,...options });
  const endpoint=suffix=>`/slots/${encodeURIComponent(state.slot.id)}/${suffix}`;
  const setError=(target,message='')=>{if(!message)return;const now=Date.now();if(state.lastError===message&&now-state.lastErrorAt<1500)return;state.lastError=message;state.lastErrorAt=now;notify(message,'error');};
  const leave=async()=>!state.dirty || await confirmDiscard();
  const setDirty=(value,type='all')=>{if(value)state.dirtyModules.add(type);else if(type==='all')state.dirtyModules.clear();else state.dirtyModules.delete(type);state.dirty=state.dirtyModules.size>0;onState({dirty:state.dirty,busy:state.busy});};
                                                                                
  const setBusy=value=>{state.busy=Boolean(value||mutationBusy);onState({dirty:state.dirty,busy:state.busy});};

  function syncDraft(section,type) {
    const d=drafts[type], get=name=>section.querySelector(`[name="${name}"]`)?.value ?? '';
    const time=get('occurredAt'); if(time)d.occurredAt=time;
    if(type==='pouring'){d.truckNo=get('truckNo');d.volume=get('volume');d.startedAt=get('startedAt');}
    if(type==='measurement') d.measurementPoints=Array.from(section.querySelectorAll('[data-measurement-point]'),node=>node.value);
    if(type==='tremie'||type==='joint') for(const id of pipeIds(state.slot,type)){d.pulls[id]=get(`pull-${id}`);d.modes[id]='delta';if(type==='joint')d.pressures[id]=get(`pressure-${id}`);}
  }
  const formFor = type => {
    const d=drafts[type], common=input('occurredAt','事件时间',d.occurredAt,'type="datetime-local" step="60" required');
    if(type==='pouring') return `<div class="event-input-grid">${input('truckNo',state.edit?'车号 · 原记录':'车号 · 自动编号',state.edit?d.truckNo:(state.data?.nextTruckNo||d.truckNo),'type="number" min="1" step="1" readonly aria-readonly="true"')}${numeric('volume','本车方量',d.volume,'m³')}${input('startedAt','开始时间',d.startedAt,'type="datetime-local" step="60" required')}${input('occurredAt','结束时间',d.occurredAt,'type="datetime-local" step="60" required')}</div>`;
    if(type==='measurement') return `${common}<fieldset class="event-points" aria-label="测点测深 · 距槽口">${d.measurementPoints.map((v,i)=>numeric(`point${i}`,`测点 ${String.fromCharCode(65+i)}`,v).replace('type="number"','data-measurement-point type="number"')).join('')}</fieldset>`;
    const ids=pipeIds(state.slot,type); return `${common}<fieldset class="event-pipes" aria-label="本次拔出量，可只填一根">${ids.length?ids.map(id=>`<div class="event-pipe-row">${numeric(`pull-${id}`,pipeLabel(state.slot,id)+' · 本次拔出',d.pulls[id]??'','m',type==='joint'?-1000000:0,type==='joint'?'any':'0.01')}${type==='joint'?numeric(`pressure-${id}`,`${id==='left'?'左':'右'}接头管 · 拔管压力`,d.pressures[id]??'','MPa',0,'any'):''}</div>`).join(''):'<p class="event-empty">当前槽段未配置此类管道。</p>'}</fieldset>`;
  };

  function recordMarkup(){
    const module=t=>{const inactive=state.mode==='record-edit'&&(!state.edit||t!==state.activeType),unconfigured=(t==='tremie'||t==='joint')&&!pipeIds(state.slot,t).length;return `<form class="event-form" data-event-form data-type="${t}"><section class="event-module record-module" data-module="${t}"><div class="module-header"><h3>${EVENT_LABELS[t]}</h3></div><fieldset class="event-module-fields" ${inactive?'disabled':''}>${formFor(t)}</fieldset><footer><button type="button" class="secondary-button" data-reset="${t}" ${inactive?'disabled':''}>${icon('M3 12a9 9 0 1 0 3-6.7M3 4v6h6')}重置</button>${t==='measurement'&&drafts[t].measurementPoints.length===6?`<button type="button" class="secondary-button" data-average ${inactive?'disabled':''} title="仅为空白测点填入已填写测点的平均值">${icon('M5 5h14M7 10h10M9 15h6M11 20h2')}均值填入</button>`:''}<button type="submit" class="primary-button" ${inactive||unconfigured?'disabled':''}>${icon('M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7')}${state.mode==='record-edit'?'保存修订':'保存'}</button></footer></section></form>`;};
    const editPicker=state.mode==='record-edit'?`<div class="event-edit-picker"><label>事件类型<select data-edit-type>${TYPES.map(t=>`<option value="${t}" ${state.activeType===t?'selected':''}>${EVENT_LABELS[t]}</option>`).join('')}</select></label><label>${state.activeType==='pouring'?'选择车号 / 浇筑事件':'选择事件'}<select data-edit-choice><option value="">请选择</option>${(state.data?.events||[]).filter(e=>e.type===state.activeType&&e.status!=='void').map(e=>`<option value="${esc(e.id)}" ${state.edit?.ids?.includes(e.id)?'selected':''}>${esc(timeText(e.occurredAt))} · ${esc(eventDetail(e))}</option>`).join('')}</select></label></div>`:'';
    return `<section class="event-workspace" data-event-record>${editPicker}<div class="event-peer-grid">${TYPES.map(module).join('')}</div></section>`;
  }

  function eventDetail(e){ if(e.type==='pouring')return `车号 ${e.payload?.truckNo??'—'} · ${fmt(e.payload?.volume)} m³`; if(e.type==='measurement')return `${e.payload?.measurementPoints?.length||0} 点 · ${e.payload?.measurementPoints?.map(v=>fmt(v)).join(' / ')}`; return (e.payload?.pulls||[]).map(p=>`${pipeLabel(state.slot,p.pipeId)} ${p.mode==='absolute'?'管底':'拔出'} ${fmt(p.value)} m${e.type==='joint'?` · 压力 ${fmt(p.pressure??1)} MPa${p.pressureBackfilled?'（历史补值）':''}`:''}`).join('；')||'无管道操作'; }
  function historyMarkup(){
    const events=(state.data?.events||[]).filter(e=>e.status!=='void'&&(state.historyType==='all'||e.type===state.historyType)), total=events.length;
    state.page=Math.min(state.page,Math.max(0,Math.ceil(total/state.pageSize)-1));
    const rows=events.slice(state.page*state.pageSize,(state.page+1)*state.pageSize);
    const timeline=renderTimeline(rows,state.data?.events||[],state.slot,{type:state.historyType});
    return `<section class="event-history"><header class="event-toolbar event-ledger-toolbar"><nav class="event-history-filters" aria-label="事件分类"><button data-filter="all" class="${state.historyType==='all'?'active':''}">时间线</button>${TYPES.map(t=>`<button data-filter="${t}" class="${state.historyType===t?'active':''}">${EVENT_LABELS[t]}</button>`).join('')}</nav><div class="event-toolbar-tools"><div class="event-pagination"><button data-page="-1" ${state.page?'':'disabled'}>${icon('m14 6-6 6 6 6')}上一页</button><span>${total?state.page*state.pageSize+1:0}—${Math.min(total,(state.page+1)*state.pageSize)} / ${total}</span><button data-page="1" ${(state.page+1)*state.pageSize<total?'':'disabled'}>下一页${icon('m10 6 6 6-6 6')}</button></div></div></header>${timeline}<p class="event-error" data-event-error role="alert" hidden></p></section>`;
  }

  function bind(host,kind){
    host.onclick=async ev=>{const b=ev.target.closest('button');if(!b)return;
      if(state.busy)return;
      if(b.dataset.closeAudit!==undefined){b.closest('.event-audit')?.remove();return;}
      if(b.dataset.type){if(!await leave())return;state.activeType=b.dataset.type;setDirty(false);renderHosts();return;}
      if(b.dataset.refresh!==undefined){await refresh();return;}
      if(b.dataset.filter){state.historyType=b.dataset.filter;state.page=0;renderHosts();return;}
      if(b.dataset.page){state.page+=Number(b.dataset.page);renderHosts();return;}
      if(b.dataset.edit){await startEdit([b.dataset.edit]);return;}
      if(b.dataset.audit){await showAudit(host,b.dataset.audit);return;}
      if(b.dataset.void){await voidEvent(host,b.dataset.void);return;}
      if(b.dataset.revisions!==undefined){onShowRevisions(state.slot.id);return;}
      if(b.dataset.reset){if(!await leave())return;if(b.dataset.reset==='all'){resetDrafts();setDirty(false);}else{drafts[b.dataset.reset]=freshDraft(b.dataset.reset);setDirty(false,b.dataset.reset);}state.preview=null;onPreview(null);renderHosts();return;}
      if(b.dataset.average!==undefined){const section=b.closest('[data-module="measurement"]'),values=[...section.querySelectorAll('[data-measurement-point]')],valid=values.map(x=>number(x.value)).filter(Number.isFinite);if(valid.length){const mean=(valid.reduce((a,c)=>a+c,0)/valid.length).toFixed(2);for(const node of values)if(blank(node.value))node.value=mean;syncDraft(section,'measurement');setDirty(true,'measurement');renderHosts();const form=host.querySelector('[data-module="measurement"]')?.closest('[data-event-form]');if(form)await preview(host,true,form);}return;}
    };
    host.onchange=async ev=>{if(state.busy)return;if(ev.target.matches('[data-edit-type]')){if(!await leave()){ev.target.value=state.activeType;return;}state.activeType=ev.target.value;state.edit=null;resetDrafts();setDirty(false);onPreview(null);renderHosts();return;}if(ev.target.matches('[data-edit-choice]')){if(ev.target.value)await startEdit([ev.target.value]);else if(await leave()){state.edit=null;resetDrafts();setDirty(false);onPreview(null);renderHosts();}}};
    host.oninput=ev=>{if(state.busy)return;const form=ev.target.closest('[data-event-form]');if(!form)return;++state.previewSeq;const section=ev.target.closest('[data-module]'),type=section?.dataset.module;if(section)syncDraft(section,section.dataset.module);state.request=null;setDirty(true,type);clearTimeout(state.previewTimer);state.previewTimer=setTimeout(()=>preview(host,true,form),350);};
    host.onsubmit=async ev=>{if(!ev.target.matches('[data-event-form]'))return;ev.preventDefault();if(state.busy)return;if(state.data?.readOnly){setError(ev.target,'当前为只读模式，事件表初始化后才能保存。');return;}if(state.mode==='record-edit'&&!state.edit){setError(ev.target,'请先选择需要修改的事件。');return;}await save(host,ev.target);};
  }
  function renderHosts(){clearTimeout(state.previewTimer);++state.previewSeq;for(const item of state.hosts){item.host.innerHTML=item.kind==='history'?historyMarkup():recordMarkup();if(item.kind==='record'&&state.data?.readOnly){item.host.querySelector('[data-event-record]')?.insertAdjacentHTML('afterbegin',`<div class="event-readonly" role="status">${state.data?.migrationRequired?'事件表尚未初始化，当前为历史数据只读模式。':'当前槽段为只读模式。'} 可以预览，但不能保存或修订。</div>`);for(const button of item.host.querySelectorAll('[data-event-form] button[type="submit"]'))button.disabled=true;}bind(item.host,item.kind);}}
  function collect(form){
    const type=form.dataset.type,section=form.querySelector(`[data-module="${type}"]`);
    if(!TYPES.includes(type)||!section)return {errors:{type:'请选择有效事件类型'},events:[]};
    const original=state.edit?.ids?.length===1?state.data.events.find(e=>e.id===state.edit.ids[0]):null;
    if(state.mode==='record-edit'&&(!original||original.type!==type))return {errors:{type:'请先选择该类型的事件再修改'},events:[]};
    syncDraft(section,type);
    const expectedPoints=original?.type==='measurement'?original.payload.measurementPoints.length:6;
    if(type==='pouring')drafts[type].truckNo=original?.payload?.truckNo??state.data?.nextTruckNo;
    const errors=validateDraft(type,drafts[type],state.slot,{expectedPoints});
    return {errors,events:Object.keys(errors).length?[]:[eventFromDraft(type,drafts[type],state.slot,{truckNo:original?.payload?.truckNo??state.data?.nextTruckNo,original})]};
  }
  async function preview(host,silent=false,activeForm=null) {
    if(state.busy)return;
    const form=activeForm||host.querySelector('[data-event-form]:focus-within')||host.querySelector('[data-event-form]');
    if(!form||form.isConnected===false)return;
    const seq=++state.previewSeq,slotId=state.slot.id;
    try {
      const payload=collect(form);
      if(Object.keys(payload.errors).length){if(!silent)setError(form,Object.values(payload.errors).join('；'));return;}
      const result=await request(endpoint('events/preview'),{method:'POST',body:JSON.stringify({events:payload.events,replaceIds:state.edit?.ids})});
      if(state.busy||seq!==state.previewSeq||slotId!==state.slot?.id||form.isConnected===false)return;
      state.preview=result.previewSnapshot||result.snapshots?.at(-1)||result.latest||result;
      const node=host.querySelector('[data-event-preview]');
       if(node)node.innerHTML=previewMarkup(renderPreview,state.preview,'',state.preview.measurementPoints);
      setError(form);onPreview(state.preview);
      if(!silent&&result.issues?.length)notify(result.issues.join('；'),'warning');
    } catch(error){if(!silent&&seq===state.previewSeq&&slotId===state.slot?.id&&form.isConnected!==false)setError(form,issueText(error));}
  }
  async function save(host,form) {
    const payload=collect(form);
    if(Object.keys(payload.errors).length){setError(form,Object.values(payload.errors).join('；'));return;}
    let allowInsertion=false;
    if(payload.events[0]?.type==='pouring'){
      const original=state.edit?.ids?.length?state.data.events.find(e=>e.id===state.edit.ids[0]):null;
      const candidate={...payload.events[0],id:original?.id};
      try{
        const info=inspectPouringInsertion(state.data.events,candidate);
        const timeChanged=!original||original.payload.startedAt!==candidate.payload.startedAt||original.occurredAt!==candidate.occurredAt;
        if(info.insertion&&timeChanged){
          clearTimeout(state.previewTimer);++state.previewSeq;setBusy(true);
          try{allowInsertion=await confirmInsertion(info);}finally{setBusy(false);}
          if(!allowInsertion)return;
        }
        if(info.conflicts.length){setError(form,pouringConflictMessage(info.conflicts));return;}
      }catch(error){setError(form,issueText(error));return;}
    }
    if(!state.request)state.request={requestId:uuid()};
    clearTimeout(state.previewTimer);++state.previewSeq;mutationBusy=true;
    setError(form); form.setAttribute('aria-busy','true'); setBusy(true);
    for(const control of form.querySelectorAll('button,input,select,textarea'))control.disabled=true;
    try {
      let result;
      if(state.edit){
        const reason=await askReason({title:'确认修改施工记录',message:'请填写修改原因。保存后将重新计算受影响的指标，原始版本保留供审计。'});
        if(!reason)return;
        const changes=state.edit.ids.map(id=>{const old=state.data.events.find(e=>e.id===id),replacement=payload.events.find(e=>e.type===old.type);if(!replacement)throw new Error(`缺少${EVENT_LABELS[old.type]}修订内容`);return {id,version:old.version,event:{...old,occurredAt:replacement.occurredAt,payload:replacement.payload}};});
        result=await request(endpoint('events/revise'),{method:'POST',body:JSON.stringify({requestId:state.request.requestId,baseRevision:state.data.baseRevision,reason,changes,allowInsertion})});
      } else {
        result=await request(endpoint('events'),{method:'POST',body:JSON.stringify({requestId:state.request.requestId,baseRevision:state.data.baseRevision,events:payload.events,allowInsertion})});
      }
      const dirtyKey=form.dataset.type;
      drafts[dirtyKey]=freshDraft(dirtyKey); state.preview=null;
      setDirty(false,dirtyKey); state.request=null; state.edit=null; notify(result.insertion||result.renumbered?.length?'已保存，车号与后续指标已按时间重算':'事件已保存');
      await publishSaved(result);
    } catch(error){setError(form,issueText(error));}
    finally {form.removeAttribute('aria-busy');for(const control of form.querySelectorAll('button,input,select,textarea'))control.disabled=false;mutationBusy=false;setBusy(false);}
  }
  async function publishSaved(result){
    let context=null,refreshError=null;
    try{
      context=await refresh();
    }catch(error){
                                                                                
                                                                            
      refreshError=error;
    }
    await onChanged(result,context);
    if(refreshError)notify(`数据已保存，最新状态暂未读取成功，请刷新重试：${refreshError.message}`,'warning');
    onPreview(null);
  }
  async function startEdit(ids){
    if(state.dirty&&!await leave())return;
    const selected=ids.map(id=>state.data.events.find(e=>e.id===id)).filter(Boolean);
    if(!selected.length)return;
    if(selected.length!==1){notify('每次只允许修改一条独立事件','warning');return;}
    const pipeDrafts=new Map();
    try { for(const e of selected)if(e.type==='tremie'||e.type==='joint')pipeDrafts.set(e.id,manualPullDraft(e,state.slot,state.data.events)); }
    catch(error){notify(error.message,'warning');return;}
    resetDrafts();state.edit={ids:selected.map(e=>e.id)};state.mode='record-edit';state.activeType=selected[0].type;
    for(const e of selected){
      const d=drafts[e.type];d.occurredAt=minuteTime(e.occurredAt);
      if(e.type==='pouring'){d.truckNo=e.payload.truckNo;d.volume=e.payload.volume;d.startedAt=minuteTime(e.payload.startedAt);}
      if(e.type==='measurement')d.measurementPoints=[...e.payload.measurementPoints];
      if(pipeDrafts.has(e.id))Object.assign(d,pipeDrafts.get(e.id));
    if(e.type==='joint')d.pressures=Object.fromEntries(e.payload.pulls.map(p=>[p.pipeId,p.pressure??1]));
    }
    setDirty(false);onNavigate('record-edit');renderHosts();
  }
  async function refresh(){if(!state.slot?.id){state.data=null;for(const h of state.hosts)h.host.innerHTML='<div class="event-empty">请先选择槽段。</div>';return null;}const seq=++state.loadSeq,slotId=state.slot.id;for(const h of state.hosts)h.host.setAttribute('aria-busy','true');setBusy(true);try{const data=await request(endpoint('event-state'));if(seq!==state.loadSeq||slotId!==state.slot?.id)return null;state.slot=data.slot||state.slot;state.data={...data,events:attachSnapshots(data.events,data.snapshots)};seedDraftTimes();renderHosts();return state.data;}catch(error){if(seq===state.loadSeq&&slotId===state.slot?.id)for(const h of state.hosts)setError(h.host,issueText(error));throw error;}finally{if(seq===state.loadSeq){for(const h of state.hosts)h.host.removeAttribute('aria-busy');setBusy(false);}}}
  async function mount({recordHost,historyHost,host,slot,mode='record',tab,context=null}={}) {
    if(state.busy)return false;
    const nextMode=mode==='record-edit'?'record-edit':mode==='history'?'history':'record';
    if((state.slot?.id!==slot?.id||state.mode!==nextMode)&&!await leave())return false;
    if(state.slot?.id!==slot?.id||state.mode==='record-edit'&&nextMode!=='record-edit'){++state.previewSeq;++state.loadSeq;resetDrafts();setDirty(false);}
    if(nextMode!=='record-edit')state.edit=null;
    state.slot=slot; state.mode=nextMode; state.hosts.clear();
    if(recordHost)state.hosts.add({host:recordHost,kind:'record'});
    if(historyHost)state.hosts.add({host:historyHost,kind:'history'});
    if(host)state.hosts.add({host,kind:nextMode==='history'||tab==='history'?'history':'record'});
    for(const h of state.hosts)h.host.innerHTML=slot?.id?'<div class="event-loading" role="status">正在读取事件账本…</div>':'<div class="event-empty">请先选择槽段。</div>';
    const reusable=context?.slot?.id===slot?.id?context:state.data?.slot?.id===slot?.id&&state.data.baseRevision===(slot?.dataRevision??state.data.baseRevision)?state.data:null;
    if(reusable){state.data=reusable===state.data?reusable:{...reusable,events:attachSnapshots(reusable.events,reusable.snapshots)};seedDraftTimes();renderHosts();}
    else await refresh(); return true;
  }
  async function render(options){return mount(options);}
  function clear(){clearTimeout(state.previewTimer);++state.previewSeq;++state.loadSeq;for(const h of state.hosts){h.host.innerHTML='';h.host.onclick=h.host.oninput=h.host.onchange=h.host.onsubmit=null;}state.hosts.clear();state.data=null;state.edit=null;resetDrafts();setDirty(false);setBusy(false);}
  async function showAudit(host,id){
    try{
      const detail=await request(endpoint(`events/${encodeURIComponent(id)}`));
      const reasons=new Map((detail.audit||[]).map(row=>[Number(row.afterVersion),row.reason]));
      const versions=detail.versions||[detail.event].filter(Boolean);
      host.insertAdjacentHTML('afterbegin',`<section class="event-audit" role="dialog"><button type="button" data-close-audit>关闭</button><h3>事件版本与审计</h3>${versions.map(v=>`<article><b>v${esc(v.version||1)} · ${esc(v.status||'active')} · ${esc(eventSourceLabel(v))}</b><time>${esc(timeText(v.receivedAt||v.createdAt))}</time><p><strong>原因：</strong>${esc(reasons.get(Number(v.version))||v.reason||(Number(v.version)>1?'历史审计未提供':'原始录入'))}</p><pre>${esc(JSON.stringify(v.payload||{},null,2))}</pre></article>`).join('')||'<p>暂无审计版本。</p>'}</section>`);
    }catch(error){notify(issueText(error),'warning');}
  }
  async function voidEvent(host,id){
    if(state.busy)return;
    const event=state.data.events.find(e=>e.id===id);
    if(!event||state.data?.readOnly)return;
    clearTimeout(state.previewTimer);++state.previewSeq;mutationBusy=true;setBusy(true);
    try{
      const reason=await askReason({title:'确认作废施工记录',message:`将作废并删除 ${EVENT_LABELS[event.type]} v${event.version}。该记录将从台账移除，不再参与计算。请填写作废原因。`,confirmLabel:'作废并删除',danger:true});
      if(!reason)return;
      const result=await request(endpoint('events/revise'),{method:'POST',body:JSON.stringify({requestId:uuid(),baseRevision:state.data.baseRevision,reason,changes:[{id,version:event.version,void:true}]})});
      state.preview=null;await publishSaved(result);
    }catch(error){notify(issueText(error),'warning');}
    finally{mutationBusy=false;setBusy(false);}
  }
  return { mount,render,refresh,isDirty:()=>state.dirty,canLeave:leave,clear };
}
