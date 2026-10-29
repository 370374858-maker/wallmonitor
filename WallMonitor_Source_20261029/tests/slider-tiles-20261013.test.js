import test from 'node:test';
import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import {numericShadowSegments,syncTimelineDecoration} from '../web/monitor/timeline-decoration.js';
import {timelineOption,heightVolumeOption} from '../web/monitor/charts.js';
import {visibleTimelineYRange,bindTimelineYRange} from '../web/monitor/timeline-y-range.js';
import {pipeSafetyTable} from '../web/monitor/views.js';
import {readFileSync} from 'node:fs';

test('numeric preview follows real depth spacing and direction, preserves gaps, and uses plot scale',()=>{
 const data=[[200,.6],[195,1],[120,1.05],[110,null],[100,1.02]],before=JSON.stringify(data);
 const lines=numericShadowSegments(data,{min:100,max:200,yMin:0,yMax:2,width:100,height:12});
 assert.deepEqual(lines[0].map(p=>p[0]),[100,95,20]);assert.equal(lines[0][0][1],8);assert.equal(lines[1][0][0],0);assert.equal(lines.length,2);assert.equal(JSON.stringify(data),before);
});
test('decreasing-depth segments crossing a zoom window still determine the correct y range',()=>{
 const option={xAxis:{min:0,max:100},dataZoom:[{id:'timeline-slider',start:40,end:60}],series:[{type:'line',data:[[100,0],[0,100]]}]};
 assert.deepEqual(visibleTimelineYRange(option),{min:38,max:62});
});
const measurements=[{endedAt:'2026-10-10 10:00:00',measurementAt:'2026-10-10 10:00:00',actualDepth:200,fillCoefficient:.6},{endedAt:'2026-10-10 10:05:00',measurementAt:'2026-10-10 10:05:00',actualDepth:195,fillCoefficient:1},{endedAt:'2026-10-10 10:10:00',measurementAt:'2026-10-10 10:10:00',actualDepth:100,fillCoefficient:1.02}];
function option(){return timelineOption(measurements,[['fillCoefficient','充盈系数']],{chartType:'line',xKey:'actualDepth',xName:'实测深度',xUnit:'m',compact:true,bounds:[1,1.2]});}
function elements(chart){return chart.getOption().graphic.flatMap(g=>g.elements??[g]);}
test('real ECharts slider and preview align to actual contained-label grid through zoom and resize',()=>{
 const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:760,height:210});
 try{
  assert.doesNotThrow(()=>syncTimelineDecoration(chart));
  const o=option(),original=JSON.stringify(o.series[0].data);chart.setOption(o);bindTimelineYRange(chart);syncTimelineDecoration(chart);
  const verify=()=>{const rect=chart.getModel().getComponent('grid').coordinateSystem.getRect(),current=chart.getOption(),slider=current.dataZoom.find(z=>z.id==='timeline-slider');
   assert.ok(Math.abs(slider.left-rect.x)<1e-6);assert.ok(Math.abs(chart.getWidth()-slider.right-rect.x-rect.width)<1e-6);assert.equal(slider.showDataShadow,false);
   const shadow=elements(chart).find(g=>g.id==='timeline-numeric-shadow');assert.ok(shadow);assert.ok(Math.abs(shadow.x-rect.x)<1e-6);assert.equal(JSON.stringify(current.series[0].data),original);
   const points=elements(chart).find(g=>g.id==='shadow-0-0').shape.points;assert.ok(Math.abs(points[0][0]-rect.width)<1e-6);assert.ok(Math.abs(points.at(-1)[0])<1e-6);assert.ok(points[1][0]>rect.width*.9,'195 m is near 200 m, not centered by record index');
   assert.ok(Math.abs(elements(chart).find(g=>g.id==='timeline-axis-label').left-rect.x)<1e-6);
  };
  verify();chart.setOption(o,{notMerge:true});syncTimelineDecoration(chart);verify();
  chart.dispatchAction({type:'dataZoom',dataZoomId:'timeline-slider',start:20,end:80});syncTimelineDecoration(chart);verify();
  chart.resize({width:960,height:230});syncTimelineDecoration(chart);verify();assert.match(chart.renderToSVGString(),/<svg/);
 }finally{chart.dispose();}
});
test('safety table restores numeric columns before statuses without a slider',()=>{
 const item={key:'ok',label:'正常',value:3,kind:'tremie'},e={policy:{},tremies:[{label:'3',depth:104,actual:item,theory:item}],joints:[],setting:{}};
 const html=pipeSafetyTable(e),headers=[...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(m=>m[1]);
 assert.deepEqual(headers,['管体','管底测深','实测埋深','理论埋深','实测状态','理论状态']);assert.doesNotMatch(html,/初凝|type="range"|pipe-scroll-range/);assert.match(html,/浇筑管 3/);
 const doc=readFileSync(new URL('../web/monitor/index.html',import.meta.url),'utf8');assert.doesNotMatch(doc,/class="panel key-data-panel"/);assert.equal((doc.match(/id="headline"/g)||[]).length,1);
});
