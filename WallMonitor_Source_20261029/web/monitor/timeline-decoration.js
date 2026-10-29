import {visibleTimelineYRange,deferTimelineUpdate} from './timeline-y-range.js';
const first=value=>Array.isArray(value)?value[0]:value;
const bound=new WeakSet(),signatures=new WeakMap();
                                                                            
                                                                               
export function numericShadowSegments(data,{min,max,yMin,yMax,width,height,inverseX=false,inverseY=false}){
 const segments=[];let points=[];
 const flush=()=>{if(points.length)segments.push(points);points=[];};
 const clamp=n=>Math.max(0,Math.min(1,n));
 for(const item of data??[]){
  const value=Array.isArray(item)?item:item?.value;
  if(!Array.isArray(value)||!Number.isFinite(value[0])||!Number.isFinite(value[1])){flush();continue;}
  const x=clamp((value[0]-min)/(max-min)),y=clamp((value[1]-yMin)/(yMax-yMin));
  points.push([(inverseX?1-x:x)*width,1+(inverseY?y:1-y)*Math.max(0,height-2)]);
 }
 flush();return segments;
}
export function syncTimelineDecoration(chart){
 if(!chart?.getModel||!chart.getOption||!chart.getWidth||chart.isDisposed?.())return;
 if(deferTimelineUpdate(chart,()=>syncTimelineDecoration(chart),'timeline-decoration'))return;
 const option=chart.getOption();if(!option)return;
 const slider=option.dataZoom?.find(z=>z.id==='timeline-slider'),axis=first(option.xAxis);
 if(!slider||!axis)return;
 const rect=chart.getModel().getComponent('grid')?.coordinateSystem?.getRect();
 const min=Number(axis.min),max=Number(axis.max),width=rect?.width,height=Number(slider.height);
 if(!rect||!Number.isFinite(width)||width<=0||!Number.isFinite(min)||!Number.isFinite(max)||max<=min||!(height>0))return;
 const full={...option,dataZoom:option.dataZoom.map(z=>({...z,start:0,end:100,startValue:undefined,endValue:undefined}))};
 const range=visibleTimelineYRange(full);if(!range)return;
 const selected=first(option.legend)?.selected??{},children=[];
 for(const [i,series] of (option.series??[]).entries()){
  if(series.type!=='line'||selected[series.name]===false)continue;
  const color=typeof series.lineStyle?.color==='string'?series.lineStyle.color:option.color?.[i]??'#4ecbff';
  const segments=numericShadowSegments(series.data,{min,max,yMin:range.min,yMax:range.max,width,height,inverseX:axis.inverse,inverseY:first(option.yAxis)?.inverse});
  for(const [j,points] of segments.entries())children.push(points.length===1?
   {id:`shadow-${i}-${j}`,type:'circle',silent:true,z:4,z2:2,shape:{cx:points[0][0],cy:points[0][1],r:.7},style:{fill:color,opacity:.8}}:
   {id:`shadow-${i}-${j}`,type:'polyline',silent:true,z:4,z2:2,shape:{points},style:{stroke:color,lineWidth:1,fill:null,opacity:.8}});
 }
 const left=rect.x,right=Math.max(0,chart.getWidth()-rect.x-width);
 const graphic=[{id:'timeline-numeric-shadow',type:'group',$action:'replace',silent:true,x:left,y:chart.getHeight()-Number(slider.bottom)-height,children}];
 if(option.graphic?.some(g=>(g.elements??[g]).some(e=>e.id==='timeline-axis-label')))graphic.push({id:'timeline-axis-label',left});
 const hasShadow=option.graphic?.some(g=>(g.elements??[g]).some(e=>e.id==='timeline-numeric-shadow'));
 const signature=JSON.stringify([left,right,graphic]);if(signatures.get(chart)===signature&&hasShadow)return;
 signatures.set(chart,signature);
 chart.setOption({dataZoom:[{id:'timeline-slider',left,right,showDataShadow:false}],graphic},{silent:true});
 return {left,right,width};
}
export function bindTimelineDecoration(chart){
 if(bound.has(chart)||!chart?.on)return;bound.add(chart);
 chart.on('finished',()=>syncTimelineDecoration(chart));
}
