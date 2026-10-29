import {scenePanBounds,constrainPan,DEFAULT_PAN_BOUNDS} from './scene-pan-bounds.js';

export const DEFAULT_ORBIT=Object.freeze({yaw:Math.atan2(14,36),pitch:Math.atan2(7,Math.hypot(14,36)),zoom:1,panX:0,panY:0});
export const ORBIT_PITCH_LIMITS=Object.freeze({min:.025,max:1.2});
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

                                                                                     
export function createSceneInteraction(canvas, resetButton, changed) {
  const view={...DEFAULT_ORBIT};let enabled=false,drag=null,panBounds=DEFAULT_PAN_BOUNDS;
  const reset=()=>{Object.assign(view,DEFAULT_ORBIT);changed();};
  const down=e=>{
    if(!enabled || drag || ![0,1].includes(e.button)) return;
    e.preventDefault?.();
    canvas.dataset.focusOrigin='pointer';
    canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.button===1};canvas.dataset.dragging='true';
  };
  const move=e=>{
    if(!enabled || drag?.id!==e.pointerId) return;
    const rect=canvas.getBoundingClientRect();
    const dx=(e.clientX-drag.x)/Math.max(1,rect.width),dy=(e.clientY-drag.y)/Math.max(1,rect.height);
    if(drag.pan){view.panX+=dx;view.panY+=dy;constrainPan(view,panBounds);}
    else {
      view.yaw-=dx*Math.PI;
      view.pitch=clamp(view.pitch+dy*Math.PI,ORBIT_PITCH_LIMITS.min,ORBIT_PITCH_LIMITS.max);
    }
    drag.x=e.clientX;drag.y=e.clientY;changed();
  };
  const up=()=>{if(drag && canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null;canvas.dataset.dragging='false';};
  const zoom=factor=>{view.zoom=clamp(view.zoom*factor,.65,2.5);changed();};
  const wheel=e=>{if(!enabled)return;e.preventDefault();zoom(Math.exp(-clamp(e.deltaY,-200,200)*.002));};
  const dblclick=()=>{if(enabled)reset();};
  const key=e=>{
    if(!enabled)return;
    canvas.dataset.focusOrigin='keyboard';
    if(e.key==='ArrowLeft')view.yaw-=.1;
    else if(e.key==='ArrowRight')view.yaw+=.1;
    else if(e.key==='ArrowUp')view.pitch=clamp(view.pitch+.08,ORBIT_PITCH_LIMITS.min,ORBIT_PITCH_LIMITS.max);
    else if(e.key==='ArrowDown')view.pitch=clamp(view.pitch-.08,ORBIT_PITCH_LIMITS.min,ORBIT_PITCH_LIMITS.max);
    else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1/1.1:1.1);return;}
    else if(e.key==='0'||e.key==='Home'){e.preventDefault();reset();return;}
    else return;
    e.preventDefault();changed();
  };
  const auxclick=e=>{if(enabled && e.button===1)e.preventDefault();};
  const blur=()=>{delete canvas.dataset.focusOrigin;up();};
  const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,lostpointercapture:up,wheel,dblclick,keydown:key,auxclick,blur};
  for(const [name,fn]of Object.entries(events))canvas.addEventListener(name,fn,name==='wheel'?{passive:false}:undefined);
  resetButton.addEventListener('click',reset);
  return {view,reset,setPanBounds(bounds,width,height){panBounds=scenePanBounds(bounds,width,height);constrainPan(view,panBounds);return panBounds;},
    setEnabled(value){enabled=value;canvas.tabIndex=value?0:-1;canvas.style.touchAction=value?'none':'pan-y';resetButton.hidden=!value;if(!value)up();},
    dispose(){up();for(const [name,fn]of Object.entries(events))canvas.removeEventListener(name,fn);resetButton.removeEventListener('click',reset);}};
}
