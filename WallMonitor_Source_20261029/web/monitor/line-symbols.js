import {savedTimeWindow} from './timeline-zoom.js';
export const LINE_SYMBOL_LIMIT=30;
export function visibleLineSymbols(option){
  const window=savedTimeWindow(option),legend=Array.isArray(option.legend)?option.legend[0]:option.legend;
  const active=(option.series||[]).filter(s=>s.type==='line'&&legend?.selected?.[s.name]!==false);
  const limit=LINE_SYMBOL_LIMIT*active.length;
  let count=0;
  for(const series of active)for(const [i,item] of (series.data||[]).entries()){
    const value=item&&typeof item==='object'&&!Array.isArray(item)?item.value:item;
    const [x,y]=Array.isArray(value)?value:[i,value];
    if(Number.isFinite(x)&&Number.isFinite(y)&&(!window||(x>=window[0]&&x<=window[1])))count++;
  }
  return (option.series||[]).flatMap((s,index)=>s.type==='line'?[{index,showSymbol:count<=limit}]:[]);
}
export function applyVisibleLineSymbols(option){
  for(const {index,showSymbol} of visibleLineSymbols(option))Object.assign(option.series[index],{showSymbol,showAllSymbol:true});
                                                                                 
  if(option.series?.length===1&&['充盈系数','扩孔系数'].includes(option.series[0].name)&&option.tooltip)
    option.tooltip.trigger=option.series[0].showSymbol?'item':'axis';
  return option;
}
