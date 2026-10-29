import { UI_FONT, FONT_SIZE, FONT_WEIGHT } from '../typography.js';
import { referenceColors } from '../reference-colors.js';
import { displayPixelRatio } from '../ui/display-density.js';
import {savedTimeWindow,timelineZoom} from './timeline-zoom.js';
import {fillSourceLabel,fillPointTooltip} from './fill-trend.js';
import {visibleTimelineYRange,bindTimelineYRange,deferTimelineUpdate} from './timeline-y-range.js';
import {applyVisibleLineSymbols} from './line-symbols.js';
import {heightVolumeRows,heightVolumeTooltip} from './height-volume.js';
import {bindTimelineDecoration,syncTimelineDecoration} from './timeline-decoration.js';
export { UI_FONT };
const token = (name, fallback) => typeof document === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const colors = [referenceColors().theory, referenceColors().actual, '#537da4', '#d1dce7'];
const valueColor = token('--value-color', '#edfaff');
const settingColor = token('--setting-color', '#ffbf60');
const states = { ok: token('--green', '#67baa8'), warn: token('--accent-warn', '#d9b978'), danger: token('--accent-danger', '#e58c95'), muted: token('--text-sub', '#92abc1') };
const text = token('--text-main', '#bad4ed'), sub = token('--text-sub', '#7d9fbe');
const rgba = (hex, opacity) => `rgba(${[1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${opacity})`;
export const chartGradient = (color, strong = .9, faint = .06) => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [{ offset: 0, color: rgba(color, strong) }, { offset: 1, color: rgba(color, faint) }] });
const charts = new Map();
const signatures = new Map();
const chartSizes = new Map();
const chartRatios = new Map();
let timelineContext='';
export function resetTimelineZoom(prefix=''){
  for(const [id,chart] of charts)if(id.startsWith(prefix)&&chart.getOption()?.dataZoom?.length){
    chart.dispatchAction({type:'dataZoom',start:0,end:100});signatures.delete(id);
  }
}
export function setTimelineContext(context){if(context!==timelineContext){resetTimelineZoom();timelineContext=context;}}
let motion = true, effectsActive = true, tour = null, focusIndex = 0;
const timeMs = v => Date.parse(v.replace(' ', 'T') + '+08:00');
export const numericAxisLabel = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';
const clockLabel = value => { const date = new Date(value + 8 * 3600000); return `${date.getUTCMonth() + 1}/${date.getUTCDate()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`; };
export function timelineSourceLabel(row, key) {
  if (!row) return '';
  if (key === 'actualSpeed') return row.actualSpeedAt ? `测量区间 ${row.actualSpeedStartedAt ? `${row.actualSpeedStartedAt} 至 ` : ''}${row.actualSpeedAt}` : '测量区间未知';
  if (key === 'theoreticalSpeed') return row.theoreticalSpeedStartedAt && row.theoreticalSpeedAt
    ? `最近浇筑区间 ${row.theoreticalSpeedStartedAt} 至 ${row.theoreticalSpeedAt}` : '最近浇筑区间未知';
  if (key === 'measurementVolume') return row.measurementVolumeAt ? `测深来源 ${row.measurementVolumeAt}` : '测深来源时间未知';
  if (key === 'fillCoefficient') return fillSourceLabel(row);
  if (key === 'actualDepth' || key === 'actualHeight') return row.measurementAt ? `实测来源 ${row.measurementAt}` : '实测来源时间未知';
  return '';
}
const axes = { axisLabel: { color: sub, fontSize: FONT_SIZE.meta }, axisLine: { lineStyle: { color: token('--chart-axis', '#3b648a') } }, axisTick: { show: false }, splitLine: { lineStyle: { color: token('--chart-grid', '#214266') } } };
const base = () => ({ animation: motion, animationDuration: 650, animationDurationUpdate: 450, animationEasing: 'cubicOut', color: colors, textStyle: { fontFamily: UI_FONT },
  grid: { left: 15, right: 20, top: 39, bottom: 10, containLabel: true },
  tooltip: { trigger: 'axis', renderMode: 'richText', backgroundColor: '#071c35', borderColor: '#28799d', textStyle: { color: text, fontSize: FONT_SIZE.meta } },
  legend: { top: 0, right: 2, itemWidth: 12, itemHeight: 7, textStyle: { color: sub, fontSize: FONT_SIZE.meta } } });
function set(id, option, sourceRevision = '') {
  const existing=charts.get(id);
  if(existing&&deferTimelineUpdate(existing,()=>set(id,option,sourceRevision)))return;
  const node = document.getElementById(id); if (!node || !node.getBoundingClientRect().width) return;
  if (!window.echarts) { node.textContent = '本地图表组件加载失败，请检查 /vendor 资源'; return; }
  if (!charts.has(id)) {
    const ratio = displayPixelRatio(node);
    charts.set(id, window.echarts.init(node, null, { renderer: 'canvas', devicePixelRatio: ratio }));
    chartRatios.set(id, ratio);
  }
  resizeChart(id, charts.get(id), node);
  const chart = charts.get(id);
  bindTimelineYRange(chart);bindTimelineDecoration(chart);
  const signature = JSON.stringify([sourceRevision, option], (_key, value) => typeof value === 'function' ? String(value) : value);
  if (signatures.get(id) === signature) return;
  signatures.set(id, signature);
  if(option.dataZoom?.length){
    const window=savedTimeWindow(chart.getOption());
    const slider=option.dataZoom[0];
    option.dataZoom=timelineZoom(option.xAxis.min,option.xAxis.max,window,option.dataZoom[0].labelFormatter || clockLabel);
    for(const key of ['height','bottom','left','right','moveHandleSize'])option.dataZoom[0][key]=slider[key];
    const range=visibleTimelineYRange(option);
    if(range)Object.assign(option.yAxis,range,{scale:true});
  }
  chart.setOption(applyVisibleLineSymbols(option), { notMerge: true });syncTimelineDecoration(chart);
}
export function emptyChart(id, text = '暂无已保存的完整记录') {
  set(id, { ...base(), legend: { show: false }, graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text, fill: '#86a8c2', fontFamily: UI_FONT, fontSize: FONT_SIZE.body, lineHeight: 24, textAlign: 'center' } }], series: [] });
}
export function timelineOption(rows, fields, { inverse = false, bounds = null, chartType = null, xKey = null, xInverse = false, xRange = null, xName = '', xUnit = '', compact = false } = {}) {
                                                                            
                                                                           
  if (xKey) rows = rows.filter(row => Number.isFinite(row[xKey]));
  if (!rows.length) return null;
  const option = base();
  const single = rows.length === 1;
  const numericLabel = value => `${Number(Number(value).toFixed(2))}${xUnit ? ` ${xUnit}` : ''}`;
  const xs = xKey ? rows.map(row => row[xKey]) : [];
  const fixedXRange=xKey&&Array.isArray(xRange)&&xRange.length===2&&xRange.every(Number.isFinite)&&xRange[1]>xRange[0]?xRange:null;
  option.xAxis = xKey ? { type: 'value', inverse:xInverse, ...axes, name: `${xName}${xUnit ? ` / ${xUnit}` : ''}`, nameLocation: 'middle', nameGap: 28, nameTextStyle: {color:sub,fontSize:FONT_SIZE.meta},
    min: fixedXRange?fixedXRange[0]:Math.min(...xs), max: fixedXRange?fixedXRange[1]:Math.max(...xs) === Math.min(...xs) ? Math.max(...xs) + Math.max(1,Math.abs(xs[0])*.05) : Math.max(...xs),
    splitNumber: 4, axisLabel: {...axes.axisLabel, formatter:numericAxisLabel, hideOverlap:true,...(fixedXRange?{showMinLabel:true,showMaxLabel:true}:{})}, splitLine:{show:false} }
    : single ? { type: 'category', data: [rows[0].endedAt.slice(5, 16)], ...axes, splitLine: { show: false } }
    : { type: 'time', min:timeMs(rows[0].endedAt),max:timeMs(rows.at(-1).endedAt), ...axes, splitNumber: 3, axisLabel: { ...axes.axisLabel, formatter: clockLabel, hideOverlap: true }, splitLine: { show: false } };
  option.yAxis = { type: 'value', inverse: single ? false : inverse, scale: inverse && !single, min: inverse && !single ? undefined : 0, ...axes, splitNumber: 4, minInterval: 1, axisLabel: {...axes.axisLabel, formatter: value => String(Math.round(value))} };
  if (xKey && rows.some(row => fields.some(([key]) => Number.isFinite(row[key]) && row[key] < 0))) delete option.yAxis.min;
  option.tooltip = { ...option.tooltip, formatter: params => {
    const items = Array.isArray(params) ? params : [params];
    const row = rows[items[0]?.dataIndex];
    const head = xKey ? `${xName}：${numericLabel(Array.isArray(items[0]?.value) ? items[0].value[0] : row?.[xKey] ?? 0)}` : row?.endedAt ? `事件时刻 ${row.endedAt}` : '';
    return [head, ...items.map(p => {
      const value = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
      const key = fields[p.seriesIndex]?.[0];
      const pointRow = xKey ? rows[p.dataIndex] : row;
      const source = timelineSourceLabel(pointRow, key);
      return `${p.seriesName || ''}：${value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'}${xKey && pointRow?.endedAt ? `\n事件时刻 ${pointRow.endedAt}` : ''}${source ? `（${source}）` : ''}`;
    })].filter(Boolean).join('\n');
  }};
  option.legend.data = fields.map(f => f[1]); option.legend.show = fields.length > 1;
  option.series = fields.map(([key, label], i) => ({ name: label, type: chartType || (single ? 'bar' : rows.length < 8 ? 'scatter' : 'line'),
    data: rows.map(r => xKey ? [r[xKey], Number.isFinite(r[key]) ? r[key] : null] : single ? r[key] : [timeMs(r.endedAt), r[key]]),
    smooth: false, connectNulls: false, step: false,
    showSymbol:true, showAllSymbol:true, symbol: i ? 'diamond' : 'circle', symbolSize: 6, barMaxWidth: 44, barGap: '60%',
    itemStyle: { color: single && chartType !== 'line' ? chartGradient(colors[i]) : colors[i], borderRadius: [5, 5, 0, 0] }, lineStyle: { color: colors[i], width: 2, type: key.startsWith('theor') ? 'dashed' : 'solid' },
    areaStyle: !single && (chartType === 'line' || rows.length >= 8) ? { origin:inverse?'end':'start',color: chartGradient(colors[i], .18, .015) } : undefined,
    label: { show: single, position: 'top', color: colors[i], fontSize: FONT_SIZE.body, formatter: p => { const value=Array.isArray(p.value)?p.value[1]:p.value; return value == null ? '—' : Number(value).toFixed(2); } }
  }));
  if (bounds) option.series[0].markLine = { silent: true, symbol: 'none', label: { formatter: p => String(p.value), position: 'insideEndTop', color: '#99a7b8', fontSize: FONT_SIZE.caption }, lineStyle: { color: '#899aa7', type: 'dashed' }, data: bounds.map(yAxis => ({ yAxis })) };
  if (fields.length===1 && fields[0][0]==='fillCoefficient') {
    option.tooltip={...option.tooltip,trigger:'item',formatter:p=>fillPointTooltip(rows[(Array.isArray(p)?p[0]:p)?.dataIndex])};
    option.series[0].showSymbol=true;option.series[0].symbolSize=5;
    option.yAxis.minInterval=0;option.yAxis.axisLabel.formatter=numericAxisLabel;
    if(option.series[0].markLine){
      option.grid.right=52;
      Object.assign(option.series[0].markLine.label,{position:xInverse?'start':'end',distance:7,align:'left',verticalAlign:'middle',
        formatter:p=>Number.isInteger(Number(p.value))?Number(p.value).toFixed(1):String(p.value)});
    }
  }
  if (xKey) option.grid.bottom=38;
  if (!single){
    option.grid.bottom=xKey ? 80 : 58;
    option.dataZoom=timelineZoom(option.xAxis.min,option.xAxis.max,null,xKey ? numericLabel : clockLabel);
  }
  if(compact){
    option.grid.top=10;option.grid.bottom=54;
    option.graphic=[{id:'timeline-axis-label',type:'text',left:48,bottom:25,silent:true,style:{text:option.xAxis.name,fill:sub,fontFamily:UI_FONT,fontSize:12}}];
    option.xAxis.name='';
    if(option.dataZoom)Object.assign(option.dataZoom[0],{height:12,bottom:2,moveHandleSize:3});
  }
  return applyVisibleLineSymbols(option);
}
export function timeline(id, rows, fields, options = {}) {
  const option = timelineOption(rows, fields, options);
  if (!option) return emptyChart(id);
                                                                              
                                                                               
  set(id, option, rows);
}
                                                                               
export function heightVolumeOption(slot, rows, {measurementRows=rows,compact=false}={}) {
  const points=heightVolumeRows(slot,rows,measurementRows);
  const option=timelineOption([...points.theory,...points.measured],[['theoreticalHeight','理论高度'],['actualHeight','实测高度']],
  {chartType:'line',xKey:'cumulativeVolume',xName:'已浇筑方量',xUnit:'m³'});
  if(!option)return null;
  option.series[0].data=points.theory.map(p=>[p.cumulativeVolume,p.theoreticalHeight]);
  option.series[1].data=points.measured.map(p=>[p.cumulativeVolume,p.actualHeight]);
  applyVisibleLineSymbols(option);
  option.tooltip.formatter=params=>{
    const seen=new Set();
    return (Array.isArray(params)?params:[params]).filter(p=>{
      if(seen.has(p.seriesIndex))return false;seen.add(p.seriesIndex);return true;
    }).map(p=>heightVolumeTooltip((p.seriesIndex===1?points.measured:points.theory)[p.dataIndex])).filter(Boolean).join('\n\n');
  };
  if(compact){
    option.grid.top=10;option.grid.bottom=54;
                                                                   
    option.graphic=[{id:'timeline-axis-label',type:'text',left:48,bottom:25,silent:true,style:{text:option.xAxis.name,fill:sub,fontFamily:UI_FONT,fontSize:12}}];
    option.xAxis.name='';
    option.legend={...option.legend,top:null,bottom:20,right:20,textStyle:{color:sub,fontSize:12}};
    if(option.dataZoom)Object.assign(option.dataZoom[0],{height:12,bottom:2,moveHandleSize:3});
  }
  return option;
}
export function heightVolume(id,slot,rows,options={}) {
  const option=heightVolumeOption(slot,rows,options);
  if(!option)return emptyChart(id);
  set(id,option,[rows,options.measurementRows]);
}
export function speedGaugeOption(speed, policy) {
  if (!speed) return null;
  const items = [[speed.actual, '实测 · 相邻记录'], [speed.theory, '理论 · 本车时段']];
  const upper=Number.isFinite(policy.speedWatchMax)?policy.speedWatchMax:policy.speedWatchBelow;
  const max = Math.max(10,Math.ceil(upper/5)*5);
  const stop=value=>Math.max(0,Math.min(1,value/max));
  const zones=Number.isFinite(policy.speedNormalMax)&&Number.isFinite(policy.speedWatchMax)
    ?[[stop(policy.speedDangerBelow),states.danger],[stop(policy.speedWatchBelow),states.warn],[stop(policy.speedNormalMax),states.ok],[stop(policy.speedWatchMax),states.warn],[1,states.danger]]
    :[[stop(policy.speedDangerBelow),states.danger],[stop(policy.speedWatchBelow),states.warn],[1,states.ok]];
  return { ...base(), tooltip: { show: false }, legend: { show: false }, series: items.map(([v, title], i) => ({
    type: 'gauge', center: [i ? '76%' : '24%', '50%'], radius: '83%', min: 0, max,
    startAngle: 220, endAngle: -40, splitNumber: 5,
    axisLine: { lineStyle: { width: 5, color: zones } },
    axisTick: { show: false }, splitLine: { length: 4, distance: 2, lineStyle: { color: '#7594ae', width: 1 } },
    axisLabel: { distance: 8, color: '#819eb7', fontSize: 10, formatter: x => x.toFixed(0) },
    pointer: { show: Number.isFinite(v.value) && v.value >= 0, width: 3, length: '59%', itemStyle: { color: colors[0] } },
    anchor: { show: Number.isFinite(v.value), size: 5, itemStyle: { color: colors[0] } },
    detail: { offsetCenter: [0, '95%'], color: valueColor, fontSize: FONT_SIZE.page, fontWeight: FONT_WEIGHT.strong, fontFamily: UI_FONT, formatter: () => v.value == null ? '—' : v.value.toFixed(2) },
    title: { show: false }, data: [{ value: Number.isFinite(v.value)?Math.max(0,Math.min(max,v.value)):null, name: title }]
  })) };
}
export function gauges(id,speed,policy){
 const option=speedGaugeOption(speed,policy);
 if(!option)return emptyChart(id,'等待完整施工记录\n首车实测速度待下一次测量');
 set(id,option);
}
export function pressureGaugeOption(pressure,policy){
 const items=['left','right'].map(side=>({side,item:pressure?.[side]??{value:null},watch:policy[side+'PressureWatchAbove'],danger:policy[side+'PressureDangerAbove']}));
                                                                             
                                                                             
 const limit=Math.max(policy.leftPressureDangerAbove||0,policy.rightPressureDangerAbove||0);
 const max=Math.max(30,Math.ceil(limit/10)*10);
 return {...base(),tooltip:{show:false},legend:{show:false},series:items.map(({side,item,watch,danger},i)=>({
  type:'gauge',center:[i?'76%':'24%','50%'],radius:'83%',min:0,max,startAngle:220,endAngle:-40,splitNumber:5,
  axisLine:{lineStyle:{width:5,color:watch>0&&danger>watch?[[Math.min(1,watch/max),states.ok],[Math.min(1,danger/max),states.warn],[1,states.danger]]:watch===0&&danger>0?[[Math.min(1,danger/max),states.ok],[1,states.danger]]:[[1,states.muted]]}},
  axisTick:{show:false},splitLine:{length:4,distance:2,lineStyle:{color:'#7594ae',width:1}},axisLabel:{distance:8,color:sub,fontSize:10,formatter:x=>String(Number(x.toFixed(1)))},
  pointer:{show:Number.isFinite(item.value),width:3,length:'59%',itemStyle:{color:colors[0]}},anchor:{show:Number.isFinite(item.value),size:5,itemStyle:{color:colors[0]}},
  detail:{offsetCenter:[0,'95%'],color:valueColor,fontSize:FONT_SIZE.page,fontWeight:FONT_WEIGHT.strong,fontFamily:UI_FONT,formatter:()=>Number.isFinite(item.value)?item.value.toFixed(2):'—'},
  title:{show:false},data:[{value:Number.isFinite(item.value)?Math.max(0,Math.min(max,item.value)):null,name:side==='left'?'左接头管拔管压力':'右接头管拔管压力'}]
 }))};
}
export function pressureGauges(id,pressure,policy){set(id,pressureGaugeOption(pressure,policy));}
                                                                            
                                                                                
export function truckTickIndices(length) {
  const count = Math.min(length, 10);
  if (count < 2) return length ? [0] : [];
  return Array.from({length:count}, (_, i) => Math.round(i * (length - 1) / (count - 1)));
}
export function truckLineOption(rows, fields, { unit = '', inverse = false, bounds = null, transform = (_key, value) => value } = {}) {
  const option=base();
  const ticks=new Set(truckTickIndices(rows.length));
  option.grid={left:12,right:22,top:32,bottom:6,containLabel:true};
  option.xAxis={type:'category',data:rows.map(row=>String(row.truckNo)),boundaryGap:rows.length===1,...axes,splitLine:{show:false},
    axisLabel:{...axes.axisLabel,interval:index=>ticks.has(index),hideOverlap:true,showMinLabel:true,showMaxLabel:true},
    axisPointer:{label:{formatter:p=>`车号 ${p.value}`}}};
  option.tooltip={...option.tooltip,formatter:params=>{
    const row=rows[params[0]?.dataIndex];
    if(!row) return '';
    return [`车号 ${row.truckNo}`,row.endedAt||'',...params.map(p=>`${p.seriesName}：${Number.isFinite(p.value)?p.value.toFixed(2)+(unit?' '+unit:''):'—'}`)].filter(Boolean).join('\n');
  }};
  option.yAxis={type:'value',...axes,min:0,splitNumber:3,inverse};
  if (inverse) { delete option.yAxis.min; option.yAxis.scale=true; }
  option.legend.data=fields.map(field=>field[1]); option.legend.show=fields.length>1;
  option.series=fields.map(([key,name],i)=>({
    name,type:'line',data:rows.map(row=>Number.isFinite(row[key])?transform(key,row[key]):null),
    smooth:false,connectNulls:false,showSymbol:true,showAllSymbol:true,symbol:i?'diamond':'circle',symbolSize:7,
    itemStyle:{color:colors[i]},lineStyle:{color:colors[i],width:2,type:key.startsWith('theor')?'dashed':'solid'},
    areaStyle:{origin:inverse?'end':'start',color:chartGradient(colors[i],.18,.015)},
    label:{show:rows.length===1,position:i?'top':'bottom',color:colors[i],fontSize:FONT_SIZE.meta,formatter:p=>Number.isFinite(p.value)?p.value.toFixed(2):'—'}
  }));
                                                                              
  if(option.series.some(series=>series.data.some(value=>value!==null&&value<0))) delete option.yAxis.min;
  if (bounds?.length && option.series[0]) option.series[0].markLine={silent:true,symbol:'none',label:{show:false},lineStyle:{color:states.warn,type:'dashed'},data:bounds.map(yAxis=>({yAxis}))};
  return applyVisibleLineSymbols(option);
}
export function truckProgressOption(slot, rows) {
  return truckLineOption(rows,[['theoreticalDepth','理论高度'],['actualDepth','实测高度']],{unit:'m',transform:(_key,value)=>slot.depth-value});
}
export function truckLine(id, rows, fields, options = {}) {
  if (!rows.length) return emptyChart(id, '暂无已保存的完整车次');
  set(id,truckLineOption(rows,fields,options),rows.map(row=>`${row.id}:${row.endedAt}`).join('|'));
}
export function truckProgress(id,slot,rows) {
  if(!rows.length) return emptyChart(id,'暂无已保存的完整车次');
  set(id,truckProgressOption(slot,rows),rows.map(row=>`${row.id}:${row.endedAt}`).join('|'));
}
export function pointDepths(id, row) {
  if (!row?.measurementPoints?.length) return emptyChart(id, '等待独立测量记录');
  const b = base();
  set(id, { ...b, tooltip: { ...b.tooltip, formatter: params => {
      const p = Array.isArray(params) ? params[0] : params;
      return p && Number.isFinite(Number(p.value)) ? `测深：${Number(p.value).toFixed(2)}` : '测深：—';
    } }, legend: { show: false }, grid: { ...b.grid, top: 15 },
    xAxis: { type: 'category', data: row.measurementPoints.map((_,i) => row.measurementPoints.length === 6 ? String.fromCharCode(65+i) : String(i+1)), ...axes, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, ...axes, splitNumber: 4 },
    series: [{ type: 'bar', name: '测深', barMaxWidth: 24, data: row.measurementPoints, itemStyle: { color: chartGradient(colors[0]), borderRadius: [5, 5, 0, 0] }, emphasis: { itemStyle: { color: '#8eebff' } },
      label: { show: true, position: 'top', color: text, fontSize: FONT_SIZE.caption, formatter: p => p.value.toFixed(2) },
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: colors[1], type: 'dashed' }, data: [{ yAxis: row.metrics.actualDepth }] } }] });
}
export function assessmentOption(counts) {
  const keys = ['ok', 'warn', 'danger', 'muted'], labels = ['正常', '预报', '预警', '待判'];
  const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  return { ...base(), tooltip: { trigger: 'item', renderMode: 'richText', formatter: '{b}：{c} 项' }, legend: { show: false },
    graphic: [{ type: 'text', left: 'center', top: '35%', style: { text: String(total), fill: '#dce7ed', fontFamily: UI_FONT, fontSize: FONT_SIZE.display, textAlign: 'center' } },
      { type: 'text', left: 'center', top: '64%', style: { text: '评价项', fill: '#91a5b1', fontFamily: UI_FONT, fontSize: FONT_SIZE.caption, textAlign: 'center' } }],
    series: [{ type: 'pie', radius: ['76%', '91%'], center: ['50%', '50%'], label: { show: false }, labelLine: { show: false },
      emphasis: { scale: false }, itemStyle: { borderColor: token('--bg-panel', '#10294e'), borderWidth: 2 },
      data: keys.map((key, i) => ({ name: labels[i], value: counts[key] || 0, itemStyle: { color: states[key] } })) }] };
}
export function assessment(id, counts) { set(id, assessmentOption(counts)); }
export function progressOption(slot, metrics, setting) {
  const percent = depth => Number.isFinite(depth) && slot.depth > 0 ? (slot.depth-depth)/slot.depth*100 : null;
  const values = [percent(metrics.theoreticalDepth), metrics.progressPercent, percent(setting?.depth)];
  const ringColors = [colors[0], colors[1], settingColor];
  return {...base(), tooltip:{show:false}, legend:{show:false}, series:values.map((value,i)=>({
    type:'gauge', center:['50%','50%'], radius:['90%','76%','62%'][i], min:0, max:100, startAngle:90, endAngle:-270,
    progress:{show:true,roundCap:true,width:5,itemStyle:{color:ringColors[i]}},
    axisLine:{lineStyle:{width:5,color:[[1,'#244666']]}}, axisLabel:{show:false}, axisTick:{show:false}, splitLine:{show:false}, pointer:{show:false},
    title:{show:i===1,offsetCenter:[0,'30%'],fontSize: FONT_SIZE.meta,color:sub},
    detail:{show:i===1,offsetCenter:[0,'-5%'],fontFamily:UI_FONT,fontSize:20,fontWeight: FONT_WEIGHT.strong,color:valueColor,formatter:()=>Number.isFinite(value)?value.toFixed(2)+'%':'—'},
    data:[{value:Number.isFinite(value)?Math.min(100,Math.max(0,value)):null,name:['理论进度','实测进度','初凝估计进度'][i]}]
  }))};
}
export function progress(id, slot, metrics, setting) {
  if (!metrics) return emptyChart(id, '暂无施工记录');
  set(id, progressOption(slot,metrics,setting));
}
export function setMotion(enabled) {
  motion = enabled; signatures.clear();
  for (const chart of charts.values()) chart.setOption({ animation: enabled });
  setEffectsActive(effectsActive);
}
export function setEffectsActive(enabled) {
  effectsActive = enabled;
  if (tour) clearInterval(tour); tour = null;
  for (const chart of charts.values()) chart.dispatchAction({ type: 'downplay' });
  if (!motion || !enabled) return;
  tour = setInterval(() => {
    const chart = charts.get('points-chart');
    if (!chart || document.hidden || !chart.getDom().getBoundingClientRect().width) return;
    const count = chart.getOption().series?.[0]?.data?.length || 0;
    if (!count) return;
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: focusIndex++ % count });
  }, 3200);
}
function resizeChart(id, chart, node) {
  if(deferTimelineUpdate(chart,()=>resizeChart(id,charts.get(id),node),'resize'))return;
  if (!node) return;
  const { clientWidth: width, clientHeight: height } = node;
  if (typeof width !== 'number' || typeof height !== 'number') { chart.resize(); return; }
  if (!width || !height) return;                                         
  const ratio = displayPixelRatio(node);
  if (Math.abs((chartRatios.get(id) || 1) - ratio) > .01) {
                                                                                 
    const option = chart.getOption();
    chart.dispose();
    chart = window.echarts.init(node, null, { renderer: 'canvas', devicePixelRatio: ratio });
    bindTimelineYRange(chart);bindTimelineDecoration(chart);
    chart.setOption(option);
    charts.set(id, chart); chartRatios.set(id, ratio); chartSizes.delete(id);
  }
  const size = `${width}:${height}`;
  if (chartSizes.get(id) === size) return;
  chartSizes.set(id, size); chart.resize();syncTimelineDecoration(chart);
}
export function resizeCharts() { for (const [id, chart] of charts) resizeChart(id, chart, document.getElementById(id)); }
export function disposeCharts() { if (tour) clearInterval(tour); tour = null; for (const chart of charts.values()) chart.dispose(); charts.clear(); signatures.clear(); chartSizes.clear(); chartRatios.clear(); }
