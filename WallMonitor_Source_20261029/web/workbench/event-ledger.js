import {pipeLabel} from '../../shared/pipe-labels.js';
import { esc, fmt, timeText } from './format.js';

export const sourceLabel = source => ({
  manual: '人工录入',
  legacy: '人工录入',
  device: '设备采集'
}[source] || '未知来源');

export const eventSourceLabel = event => sourceLabel(event?.source);

const LABELS = Object.freeze({ pouring:'浇筑', measurement:'测量', tremie:'浇筑管', joint:'接头管' });
const TYPES = new Set(Object.keys(LABELS));
const td = (value, className = '') => `<td${className ? ` class="${className}"` : ''}${value == null || value === '' ? ' aria-label="无数据"></td>' : `>${fmt(value, 2)}</td>`}`;
const integerTd = value => value !== null && value !== '' && Number.isInteger(Number(value)) ? `<td class="event-raw-value">${esc(Number(value))}</td>` : '<td aria-label="无数据"></td>';
const blankCells = count => Array.from({ length:count }, () => '<td aria-label="无数据"></td>').join('');
const th = (text, attrs = '') => {
  const match = String(text).match(/^(.*) (MPa|m³|m\/h|m)$/);
  return `<th ${attrs}>${match ? `${esc(match[1])}<small>${esc(match[2])}</small>` : esc(text)}</th>`;
};

function eventTime(value) {
  const text = timeText(value);
  if (text === '—') return '<span aria-label="无数据"></span>';
  const [date, clock = ''] = text.split(' ');
  return `<time><b>${esc(clock.slice(0, 5))}</b><small>${esc(date)}</small></time>`;
}

const pipeDepth = (event, kind, id) => kind === 'tremie'
  ? event?.snapshot?.metrics?.tremieDepths?.[Number(String(id).replace(/^t/, '')) - 1]
  : event?.snapshot?.metrics?.jointDepths?.[id];

function initialPipeDepth(slot, kind, id) {
  return kind === 'tremie'
    ? slot?.tremieInitialDepths?.[Number(String(id).replace(/^t/, '')) - 1]
    : slot?.jointInitialDepths?.[id];
}

                                                                                 
                                                                                
const depthIndexes=new WeakMap();
export function pipeDepthIndex(allEvents,slot) {
  const cached=depthIndexes.get(allEvents);
  if(cached?.slot===slot)return cached.index;
  const depth=Object.fromEntries([...(slot.tremieInitialDepths||[]).map((v,i)=>[`t${i+1}`,Number(v)]),...Object.entries(slot.jointInitialDepths||{})]);
  const index=new Map(), sorted=allEvents.filter(e=>e.status!=='void'&&(e.type==='tremie'||e.type==='joint'))
    .slice().sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt))||String(a.id).localeCompare(String(b.id)));
  for(let i=0;i<sorted.length;){
    let end=i+1;while(end<sorted.length&&sorted[end].occurredAt===sorted[i].occurredAt)end++;
    for(let j=i;j<end;j++)index.set(sorted[j].id,{...depth});
    for(let j=i;j<end;j++)for(const p of sorted[j].payload?.pulls||[]){const v=Number(p.value);if(Number.isFinite(v))depth[p.pipeId]=p.mode==='absolute'?v:Math.max(0,depth[p.pipeId]-v);}
    i=end;
  }
  depthIndexes.set(allEvents,{slot,index});return index;
}
function pullValue(event, kind, id, allEvents, slot) {
  const pull = event?.payload?.pulls?.find(item => item?.pipeId === id);
  if (!pull) return null;
  if (pull.mode !== 'absolute') return Number.isFinite(Number(pull.value)) ? Number(pull.value) : null;
  const initial = initialPipeDepth(slot, kind, id);
  if (initial == null || initial === '') return null;
  let depth = Number(initial);
  if (!Number.isFinite(depth)) return null;
  depth = pipeDepthIndex(allEvents,slot).get(event.id)?.[id] ?? depth;
  const absolute = Number(pull.value), result = depth - absolute;
  return Number.isFinite(result) && (kind==='joint'||result>=0) ? result : null;
}

function embeddings(event, kind, id) {
  const metrics = event?.snapshot?.metrics || {};
  const depth = pipeDepth(event, kind, id);
  const embedding = surface => depth != null && depth !== '' && surface != null && surface !== '' && Number.isFinite(Number(depth)) && Number.isFinite(Number(surface))
    ? Math.max(0, Number(depth) - Number(surface)) : null;
  return [embedding(metrics.theoreticalDepth), embedding(metrics.actualDepth)];
}

function pipeCells(event, kind, id, allEvents, slot) {
  if (event?.type !== kind) return blankCells(kind==='joint'?4:3);
  const operation = event?.payload?.pulls?.find(item => item?.pipeId === id);
  if (!operation) return blankCells(kind==='joint'?4:3);
  const [theory, actual] = embeddings(event, kind, id);
  const calculated = event?.status === 'void' ? null : pullValue(event, kind, id, allEvents, slot);
  const pullClass = operation.mode === 'absolute' ? 'event-calculated-value' : 'event-raw-value';
  const pressureTitle=operation.pressureBackfilled||operation.pressure==null?'历史缺失压力补为 1 MPa':event.payload?.operation?'本次起拔过程最大压力；'+event.payload.operation.startedAt+' 至 '+event.payload.operation.endedAt:'本次记录的拔管压力';
  return `${td(operation.mode === 'absolute' ? calculated : operation.value,pullClass)}${td(event?.status === 'void' ? null : theory,'event-calculated-value')}${td(event?.status === 'void' ? null : actual,'event-calculated-value')}${kind==='joint'?`<td class="event-raw-value" title="${esc(pressureTitle)}">${fmt(operation.pressure??1)}</td>`:''}`;
}

function pouringCells(event, slot) {
  if (event?.type !== 'pouring') return blankCells(6);
  const metrics = event?.snapshot?.metrics || {}, payload = event.payload || {};
  const theoreticalHeight = metrics.theoreticalHeight ?? (
    slot?.depth != null && slot.depth !== '' && metrics.theoreticalDepth != null && metrics.theoreticalDepth !== ''
      ? Number(slot.depth) - Number(metrics.theoreticalDepth) : null);
  return `${integerTd(payload.truckNo)}${td(payload.volume,'event-raw-value')}<td class="event-raw-value">${eventTime(payload.startedAt)}</td><td class="event-raw-value">${eventTime(payload.endedAt || event.occurredAt)}</td>${td(event?.status === 'void' ? null : theoreticalHeight,'event-calculated-value')}${td(event?.status === 'void' ? null : metrics.theoreticalSpeed,'event-calculated-value')}`;
}

function measurementCells(event) {
  if (event?.type !== 'measurement') return blankCells(8);
  const points = Array.isArray(event?.payload?.measurementPoints) ? event.payload.measurementPoints : [];
  const valid = points.slice(0, 6).filter(value => value != null && value !== '').map(Number).filter(Number.isFinite);
  const average = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  return `${td(event?.status === 'void' ? null : average,'event-calculated-value')}${td(event?.status === 'void' ? null : event?.snapshot?.metrics?.actualSpeed,'event-calculated-value')}${Array.from({ length:6 }, (_, i) => td(points[i],'event-raw-value')).join('')}`;
}

function actions(event) {
  const id = esc(event?.id);
  return `<td class="event-ledger-actions"><button data-edit="${id}">修改</button><button data-audit="${id}">审计</button>${event?.status === 'void' ? '' : `<button data-void="${id}">作废</button>`}</td>`;
}

const group = (label, count, className) => th(label, `colspan="${count}" scope="colgroup" class="${className}"`);
const pipeSub = (pressure=false) => `${th('本次拔出 m','scope="col" class="event-raw-value" title="原始录入数据；absolute 设备值换算后为计算值"')}${th('理论埋深 m','scope="col" class="event-calculated-value" title="计算值"')}${th('实际埋深 m','scope="col" class="event-calculated-value" title="计算值"')}${pressure?th('拔管压力 MPa','scope="col" class="event-raw-value"'):''}`;

function configuredPipes(slot) {
  const count = Math.max(0, Math.min(3, Number.isInteger(Number(slot?.tremieCount)) ? Number(slot.tremieCount) : 0));
  const tremies = Array.from({ length:count }, (_, index) => `t${index + 1}`);
  const layout = String(slot?.jointLayout || '').toLowerCase();
  const joints = layout === 'both' || layout.includes('双') || layout.includes('两') ? ['left','right']
    : layout === 'left' || layout.includes('左') ? ['left'] : layout === 'right' || layout.includes('右') ? ['right'] : [];
  return { tremies, joints };
}

   
                                                                               
                                                                          
   
export function renderTimeline(rows = [], allEvents = [], slot = {}, options = {}) {
  const requestedType = options?.type;
  const selectedType = requestedType === 'all' || TYPES.has(requestedType) ? requestedType : 'all';
  const suppliedEvents = Array.isArray(rows) ? rows.filter(event=>event?.status!=='void') : [];
  const events = selectedType === 'all' ? suppliedEvents : suppliedEvents.filter(event => event?.type === selectedType);
  const history = Array.isArray(allEvents) ? allEvents : events;
  const { tremies, joints } = configuredPipes(slot);
  const showPouring = selectedType === 'all' || selectedType === 'pouring';
  const showMeasurement = selectedType === 'all' || selectedType === 'measurement';
  const showTremies = selectedType === 'all' || selectedType === 'tremie';
  const showJoints = selectedType === 'all' || selectedType === 'joint';
  const body = events.map(event => {
    const known = TYPES.has(event?.type), type = known ? event.type : 'unknown';
    const status = event?.status === 'void' ? '已作废' : `v${esc(event?.version || 1)}`;
    return `<tr class="event-row event-row-${type}"><td class="event-col-time event-raw-value">${eventTime(event?.occurredAt)}</td><td class="event-col-type"><span class="event-type-block event-type-${type}" aria-hidden="true"></span><b>${esc(LABELS[event?.type] || '未知事件')}</b></td>${showPouring ? pouringCells(event,slot) : ''}${showJoints ? joints.map(id=>pipeCells(event,'joint',id,history,slot)).join('') : ''}${showTremies ? tremies.map(id=>pipeCells(event,'tremie',id,history,slot)).join('') : ''}${showMeasurement ? measurementCells(event) : ''}<td><span class="event-status ${event?.status === 'void' ? 'void' : ''}">${status}</span></td><td class="event-col-received">${eventTime(event?.receivedAt)}</td><td class="event-col-source">${esc(sourceLabel(event?.source))}</td>${actions(event)}</tr>`;
  }).join('');
  const jointGroup = showJoints && joints.length ? group('接头管数据',joints.length*4,'event-group-joint') : '';
  const tremieGroup = showTremies && tremies.length ? group('浇筑管数据',tremies.length*3,'event-group-tremie') : '';
  const pipeHeadings = `${showJoints ? joints.map(id=>th(`${id==='left'?'左':'右'}接头管`,'colspan="4" scope="colgroup"')).join('') : ''}${showTremies ? tremies.map(id=>th(pipeLabel(slot,id),'colspan="3" scope="colgroup"')).join('') : ''}`;
  const groupedPipes = selectedType === 'all' && !!pipeHeadings;
  const headerRows = groupedPipes ? 3 : ((selectedType === 'joint' || selectedType === 'tremie') && !pipeHeadings ? 1 : 2);
  const groupSpan = groupedPipes ? ' rowspan="2"' : '';
  const pouringHead = showPouring ? th('浇筑数据',`colspan="6"${groupSpan} scope="colgroup" class="event-group-pouring"`) : '';
  const measurementHead = showMeasurement ? th('测量数据',`colspan="8"${groupSpan} scope="colgroup" class="event-group-measurement"`) : '';
  const pouringSub = showPouring ? `${th('车号','scope="col" class="event-raw-value" title="原始录入数据"')}${th('浇筑方量 m³','scope="col" class="event-raw-value" title="原始录入数据"')}${th('开始时间','scope="col" class="event-raw-value" title="原始录入数据"')}${th('结束时间','scope="col" class="event-raw-value" title="原始录入数据"')}${th('理论高度 m','scope="col" class="event-calculated-value" title="计算值"')}${th('理论速度 m/h','scope="col" class="event-calculated-value" title="计算值"')}` : '';
  const jointSub = showJoints ? joints.map(()=>pipeSub(true)).join('') : '';
  const tremieSub = showTremies ? tremies.map(()=>pipeSub(false)).join('') : '';
  const measurementSub = showMeasurement ? `${th('平均值 m','scope="col" class="event-calculated-value" title="计算值"')}${th('实际速度 m/h','scope="col" class="event-calculated-value" title="计算值"')}${Array.from({length:6},(_,i)=>th(`测量点 ${i+1} m`,'scope="col" class="event-raw-value" title="原始录入数据"')).join('')}` : '';
                                                                           
                                                                           
  const common = headerRows > 1 ? `rowspan="${headerRows}" scope="col"` : 'scope="col"';
  const businessHead = `${pouringHead}${groupedPipes ? jointGroup+tremieGroup : pipeHeadings}${measurementHead}`;
  const subHead = pouringSub+jointSub+tremieSub+measurementSub;
  const header = `<tr>${th('事件时间',`${common} class="event-col-time event-raw-value" title="原始录入数据"`)}${th('事件类型',`${common} class="event-col-type"`)}${businessHead}${th('状态',common)}${th('接收时间',common)}${th('数据来源',`${common} class="event-col-source"`)}${th('操作',common)}</tr>${groupedPipes ? `<tr>${pipeHeadings}</tr>` : ''}${subHead ? `<tr>${subHead}</tr>` : ''}`;
  return `<div class="event-ledger event-ledger-wide event-ledger-${selectedType}" data-event-type="${selectedType}" data-header-rows="${headerRows}" role="region" aria-label="事件时间线数据台账" tabindex="0"><table aria-label="${selectedType === 'all' ? '全部事件' : LABELS[selectedType]}数据"><thead>${header}</thead><tbody>${body}</tbody></table>${events.length ? '' : '<p class="event-empty">暂无事件。</p>'}</div>`;
}
