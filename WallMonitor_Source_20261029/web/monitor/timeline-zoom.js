const first=value=>Array.isArray(value)?value[0]:value;
                                                                              
                                                                  
export function savedTimeWindow(option){
  const zoom=option?.dataZoom?.find(z=>z.id==='timeline-slider');
  if(!zoom)return null;
  const percentSpecified=zoom.start!=null&&zoom.end!=null;
  if(percentSpecified&&zoom.start<=.00001&&zoom.end>=99.99999)return null;
  if(!percentSpecified&&zoom.startValue==null&&zoom.endValue==null)return null;
  const axis=first(option.xAxis),min=Number(axis?.min),max=Number(axis?.max);
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return null;
  const value=(v,p)=>v!=null&&Number.isFinite(Number(v))?Number(v):min+(max-min)*p/100;
  return [value(zoom.startValue,zoom.start??0),value(zoom.endValue,zoom.end??100)];
}
export function timelineZoom(min,max,window=null,labelFormatter){
                                                                           
                                                                              
                                                   
  let range={start:0,end:100};
  if(window&&window[1]>min&&window[0]<max){
    const startValue=Math.max(min,window[0]),endValue=Math.min(max,window[1]);
    if(endValue>startValue)range={startValue,endValue};
  }
  const common={xAxisIndex:0,filterMode:'none',throttle:60,...range};
  return [{...common,id:'timeline-slider',type:'slider',bottom:7,left:48,right:22,height:20,
    brushSelect:false,zoomLock:false,showDetail:true,showDataShadow:false,labelFormatter,
    backgroundColor:'#0b2542',borderColor:'#37668a',fillerColor:'rgba(48,181,232,.22)',
    dataBackground:{lineStyle:{color:'#507d9d',opacity:.7},areaStyle:{color:'#214866',opacity:.5}},
    selectedDataBackground:{lineStyle:{color:'#4ecbff'},areaStyle:{color:'#26749b'}},
    handleSize:'115%',handleStyle:{color:'#45c1ee',borderColor:'#9de8ff'},
    moveHandleSize:5,moveHandleStyle:{color:'#428fb5'},textStyle:{color:'#b8ddf1',fontSize:11}},
    {...common,id:'timeline-inside',type:'inside',zoomOnMouseWheel:true,moveOnMouseMove:true,moveOnMouseWheel:false,preventDefaultMouseMove:true}];
}
