import test from 'node:test';
import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import {timeline,timelineOption,disposeCharts,setTimelineContext,resetTimelineZoom} from '../web/monitor/charts.js';
import {savedTimeWindow,timelineZoom} from '../web/monitor/timeline-zoom.js';

test('physical depth axis is exactly slot depth to zero even with one measurement or a missing coefficient',()=>{
 const fields=[['fillCoefficient','扩孔系数']],options={chartType:'line',xKey:'actualDepth',xInverse:true,xRange:[0,12.0887]};
 for(const coefficient of [null,1.02]){
  const rows=[{actualDepth:12.0887,fillCoefficient:coefficient}],option=timelineOption(rows,fields,options);
  assert.equal(option.xAxis.max,12.0887);assert.equal(option.xAxis.min,0);assert.equal(option.xAxis.axisLabel.formatter(option.xAxis.max),'12.09');
  assert.equal(option.xAxis.axisLabel.showMaxLabel,true);assert.deepEqual(option.series[0].data,[[12.0887,coefficient]]);
 }
 const multiple=timelineOption([{actualDepth:10,fillCoefficient:1.01},{actualDepth:2,fillCoefficient:1.02}],fields,options);
 assert.equal(multiple.xAxis.max,12.0887);assert.equal(multiple.xAxis.min,0);
 const revised=timelineOption([{actualDepth:10,fillCoefficient:1.01}],fields,{...options,xRange:[0,14.2]});assert.equal(revised.xAxis.max,14.2);
});

test('overview depth axis runs deepest to shallowest while preserving measurement order and zoom on refresh',()=>{
 const oldDoc=globalThis.document,oldWin=globalThis.window;
 const node={clientWidth:640,clientHeight:240,ownerDocument:{defaultView:null},getBoundingClientRect:()=>({width:640,height:240})};let chart;
 globalThis.document={getElementById:()=>node,createElement:()=>({getContext:()=>null})};
 globalThis.window={echarts:{init:()=>{chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:640,height:240});const resize=chart.resize.bind(chart);chart.resize=options=>resize({...options,width:640,height:240});return chart;}}};
 try{
  const rows=[200,150,150,100].map((actualDepth,i)=>({endedAt:`2026-10-27 10:0${i}:00`,measurementAt:`2026-10-27 10:0${i}:00`,actualDepth,actualHeight:200-actualDepth,cumulativeVolume:i*10,fillCoefficient:1+i*.01}));
  const original=structuredClone(rows),fields=[['fillCoefficient','扩孔系数']],options={chartType:'line',xKey:'actualDepth',xInverse:true,xName:'实测深度（槽口向下）',xUnit:'m',compact:true,bounds:[.98,1.1]};
  const draw=data=>timeline('depth-fill-chart',data,fields,options);draw(rows);
  assert(chart.convertToPixel({xAxisIndex:0},200)<chart.convertToPixel({xAxisIndex:0},100),JSON.stringify({axis:chart.getOption().xAxis,deep:chart.convertToPixel({xAxisIndex:0},200),shallow:chart.convertToPixel({xAxisIndex:0},100)}));
  assert.deepEqual(chart.getOption().series[0].data,rows.map(r=>[r.actualDepth,r.fillCoefficient]));
  assert.deepEqual(rows,original);
  assert.equal(chart.getOption().series[0].markLine.label.position,'start');
  chart.dispatchAction({type:'dataZoom',start:20,end:60});const selected=savedTimeWindow(chart.getOption());
  draw([...rows,{...rows[3],endedAt:'2026-10-27 10:04:00',measurementAt:'2026-10-27 10:04:00',actualDepth:50,fillCoefficient:1.02}]);
  assert.deepEqual(savedTimeWindow(chart.getOption()),selected);assert.equal(chart.getOption().xAxis[0].inverse,true);
  assert(chart.convertToPixel({xAxisIndex:0},selected[1])<chart.convertToPixel({xAxisIndex:0},selected[0]));
  resetTimelineZoom();draw(rows.slice(0,1));assert.equal(chart.getOption().xAxis[0].inverse,true);
  const height=timelineOption(rows,fields,{chartType:'line',xKey:'actualHeight'}),volume=timelineOption(rows,[['actualHeight','实测高度']],{chartType:'line',xKey:'cumulativeVolume'});
  assert.equal(height.xAxis.inverse,false);assert.equal(volume.xAxis.inverse,false);
 }finally{disposeCharts();globalThis.document=oldDoc;globalThis.window=oldWin;}
});

test('time window clamps to surviving data, resets disjoint windows, and keeps full-range live',()=>{
 assert.equal(savedTimeWindow({dataZoom:[{id:'timeline-slider',start:0,end:100}]}),null);
 assert.deepEqual(savedTimeWindow({xAxis:[{min:100,max:200}],dataZoom:[{id:'timeline-slider',start:20,end:60}]}),[120,160]);
 const options=timelineZoom(130,300,[120,160]);assert.equal(options[0].startValue,130);assert.equal(options[0].endValue,160);
 assert.equal(timelineZoom(300,400,[120,160])[0].end,100);
 assert.deepEqual(options.map(z=>z.type),['slider','inside']);assert.ok(options.every(z=>z.filterMode==='none'&&z.xAxisIndex===0));
});

for(const chartId of ['overview-trend','trend-depth'])test(`${chartId}: real ECharts dragging survives refresh and preserves tooltip provenance`,()=>{
 const oldDoc=globalThis.document,oldWin=globalThis.window;
 const node={clientWidth:640,clientHeight:240,ownerDocument:{defaultView:null},getBoundingClientRect:()=>({width:640,height:240})};
 let chart;
 globalThis.document={getElementById:()=>node,createElement:()=>({getContext:()=>null})};
 globalThis.window={echarts:{init:()=>{chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:640,height:240});return chart;}}};
 try{
  const base=Date.parse('2026-09-13T00:00:00Z');
  const rows=Array.from({length:101},(_,i)=>({endedAt:new Date(base+i*60000).toISOString().slice(0,19).replace('T',' '),height:i}));
  const draw=r=>timeline(chartId,r,[['height','高度']],{chartType:'line',inverse:chartId==='trend-depth'});
  setTimelineContext('slot-A');draw(rows);
  assert.equal(chart.getOption().dataZoom.length,2);assert.equal(chart.getOption().grid[0].bottom,58);
  assert.equal(chart.getOption().series[0].showSymbol,false);
  chart.dispatchAction({type:'dataZoom',start:20,end:40});
  assert.equal(chart.getOption().yAxis[0].min,18);
  assert.equal(chart.getOption().yAxis[0].max,42);
  const slider=chart.getViewOfComponentModel(chart.getModel().getComponent('dataZoom',0));
  const handle=slider._displayables.handles[0];
  chart.getZr().trigger('mousedown',{target:handle,event:{zrX:0,zrY:0}});
  chart.dispatchAction({type:'dataZoom',from:slider.uid,dataZoomId:'timeline-slider',start:25,end:45});
  assert.ok(slider._displayables.handles[0]===handle,'auto-fit must not replace the handle during a drag');
  chart.getZr().trigger('mouseup',{event:{zrX:0,zrY:0}});
  assert.equal(chart.getOption().yAxis[0].min,23,'fit applies when the pointer is released');
  chart.dispatchAction({type:'dataZoom',start:20,end:40});
  assert.equal(chart.getOption().yAxis[0].minInterval,1);
  assert.equal(chart.getOption().yAxis[0].axisLabel.formatter(152.42010709),'152');
  const selected=savedTimeWindow(chart.getOption());assert.ok(selected);
  const expanded=[...rows,{endedAt:'2026-09-13 03:00:00',height:180}];draw(expanded);
  assert.deepEqual(savedTimeWindow(chart.getOption()),selected,'refresh keeps absolute timestamps rather than relative percentages');
  assert.equal(chart.getOption().yAxis[0].min,18,'refresh also preserves fitted y bounds');
  assert.equal(chart.getOption().yAxis[0].max,42);
  const refreshedSlider=chart.getViewOfComponentModel(chart.getModel().getComponent('dataZoom',0));
  const refreshedHandle=refreshedSlider._displayables.handles[0];
  chart.getZr().trigger('mousedown',{target:refreshedHandle,event:{zrX:0,zrY:0}});
  chart.dispatchAction({type:'dataZoom',from:refreshedSlider.uid,dataZoomId:'timeline-slider',start:30,end:50});
  const draggedWindow=savedTimeWindow(chart.getOption());
  const newer=[...expanded,{endedAt:'2026-09-13 04:00:00',height:240}];
  draw(newer);
  const newest=[...newer,{endedAt:'2026-09-13 05:00:00',height:300}];draw(newest);
  assert.ok(refreshedSlider._displayables.handles[0]===refreshedHandle,'incoming records do not interrupt the active handle');
  assert.equal(chart.getOption().series[0].data.length,expanded.length,'refresh waits until pointer release');
  chart.getZr().trigger('mouseup',{event:{zrX:0,zrY:0}});
  assert.equal(chart.getOption().series[0].data.length,newest.length,'latest queued refresh is applied on release');
  assert.deepEqual(savedTimeWindow(chart.getOption()),draggedWindow,'refresh retains the window selected during dragging');
  draw(expanded);
  chart.dispatchAction({type:'dataZoom',start:50,end:70});
  assert.ok(Math.abs(chart.getOption().dataZoom[0].start-50)<.001,'drag mode remains responsive after a saved time window was restored');
  assert.ok(Math.abs(chart.getOption().dataZoom[0].end-70)<.001);
  assert.notDeepEqual(savedTimeWindow(chart.getOption()),selected,'selected window can pan');
  assert.ok(chart.getOption().yAxis[0].min>80,'panning recomputes y bounds');
  const tooltip=chart.getOption().tooltip[0].formatter([{dataIndex:60,seriesIndex:0,seriesName:'高度',value:[base,60]}]);
  assert.ok(tooltip.includes(rows[60].endedAt));
  assert.ok(chart.renderToSVGString().includes('<svg'),'slider and lines render with installed ECharts');
  resetTimelineZoom();draw(expanded);assert.equal(savedTimeWindow(chart.getOption()),null);
  assert.equal(chart.getOption().yAxis[0].min,0);assert.ok(chart.getOption().yAxis[0].max>180);
  chart.dispatchAction({type:'dataZoom',start:10,end:30});setTimelineContext('slot-B');draw(rows);assert.equal(savedTimeWindow(chart.getOption()),null);
  draw(rows.slice(0,1));assert.equal(chart.getOption().dataZoom.length,0,'single observation has no useless slider');
  draw(rows.slice(0,2).map((r,i)=>({...r,height:1.01+i*.01})));
  const ticks=chart.getModel().getComponent('yAxis').axis.scale.getTicks();
  assert.ok(ticks.every(t=>Number.isInteger(t.value)),'narrow ranges do not create duplicate rounded decimal ticks');
  assert.ok(chart.getOption().tooltip[0].formatter([{dataIndex:0,seriesIndex:0,seriesName:'高度',value:[base,1.01]}]).includes('1.01'),'tooltip keeps the measured precision');
 }finally{try{disposeCharts();}finally{globalThis.document=oldDoc;globalThis.window=oldWin;}}
});
