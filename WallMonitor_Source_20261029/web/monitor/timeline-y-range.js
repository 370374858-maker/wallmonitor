import {savedTimeWindow} from './timeline-zoom.js';
import {visibleLineSymbols} from './line-symbols.js';
const first=value=>Array.isArray(value)?value[0]:value;

                                                                            
                                                                          
export function visibleTimelineYRange(option){
  if(!option?.dataZoom?.some(z=>z.id==='timeline-slider'))return null;
  const axis=first(option.xAxis);
  const [start,end]=savedTimeWindow(option)??[Number(axis?.min),Number(axis?.max)];
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  const selected=first(option.legend)?.selected??{};
  let min=Infinity,max=-Infinity;
  const add=value=>{min=Math.min(min,value);max=Math.max(max,value);};
  for(const series of option.series??[]){
    if(selected[series.name]===false)continue;
    let previous=null;
    for(const item of series.data??[]){
      const point=Array.isArray(item)?item:item?.value;
      if(!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1])){previous=null;continue;}
      const [x,y]=point;
      if(x>=start&&x<=end)add(y);
      if(series.type==='line'&&previous&&x!==previous[0]){
        for(const edge of [start,end])if(Math.min(previous[0],x)<edge&&edge<Math.max(previous[0],x))
          add(previous[1]+(y-previous[1])*(edge-previous[0])/(x-previous[0]));
      }
      previous=point;
    }
  }
                                                             
  if(min===Infinity)return {min:0,max:1};
  const pad=max>min?Math.max((max-min)*.08,.025):Math.max(Math.abs(min)*.02,.05);
                                                                          
  return {min:Math.floor(min>=0?Math.max(0,min-pad):min-pad),max:Math.ceil(max+pad)};
}

const bound=new WeakMap();
                                                                             
                                                                                
export function deferTimelineUpdate(chart,update,key='data'){
  const state=bound.get(chart);
  if(!state?.pointerDown)return false;
  state.pending.set(key,update);
  return true;
}
export function bindTimelineYRange(chart){
  if(bound.has(chart)||!chart.on)return;
  const state={pointerDown:false,pending:new Map()};
  bound.set(chart,state);
  const release=()=>{
    state.pointerDown=false;
    const pending=[...state.pending.values()];state.pending.clear();
    for(const update of pending){if(chart.isDisposed?.())break;update();}
  };
  const zr=chart.getZr?.();
  zr?.on('mousedown',()=>{state.pointerDown=true;});
  zr?.on('mouseup',release);
  zr?.on('globalout',release);
  const fit=()=>{
    if(deferTimelineUpdate(chart,fit,'axis'))return;
    const option=chart.getOption(),range=visibleTimelineYRange(option);
    if(!range)return;
    const axis=first(option.yAxis);
    const axisChanged=axis?.min!==range.min||axis?.max!==range.max;
    const symbols=visibleLineSymbols(option);
    const symbolsChanged=symbols.some(({index,showSymbol})=>option.series[index].showSymbol!==showSymbol);
    if(!axisChanged&&!symbolsChanged)return;
    const patch={};
    if(axisChanged)patch.yAxis=[{...range,scale:true}];
    if(symbolsChanged){
      patch.series=option.series.map(()=>({}));
      for(const {index,showSymbol} of symbols)patch.series[index]={showSymbol,showAllSymbol:true};
      if(option.series.length===1&&['充盈系数','扩孔系数'].includes(option.series[0].name))patch.tooltip={trigger:symbols[0].showSymbol?'item':'axis'};
    }
    chart.setOption(patch,{silent:true});
  };
  chart.on('datazoom',fit);
  chart.on('legendselectchanged',fit);
}
