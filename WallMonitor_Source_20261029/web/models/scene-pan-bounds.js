export const MIN_VISIBLE_FRACTION=.45;
export const DEFAULT_PAN_BOUNDS=Object.freeze({x:[-.35,.35],y:[-.35,.35]});

                                                                            
                                                                             
                                                                               
export function scenePanBounds(bounds,width,height) {
  if(!bounds || ![width,height,bounds.left,bounds.right,bounds.top,bounds.bottom].every(Number.isFinite)
    || width<=0 || height<=0 || bounds.right<=bounds.left || bounds.bottom<=bounds.top) return DEFAULT_PAN_BOUNDS;
  const axis=(min,max,size)=>{
    const visible=Math.min(max-min,size)*MIN_VISIBLE_FRACTION;
    return [(visible-max)/size,(size-visible-min)/size];
  };
  return {x:axis(bounds.left,bounds.right,width),y:axis(bounds.top,bounds.bottom,height)};
}

export function constrainPan(view,bounds) {
  view.panX=Math.min(bounds.x[1],Math.max(bounds.x[0],Number.isFinite(view.panX)?view.panX:0));
  view.panY=Math.min(bounds.y[1],Math.max(bounds.y[0],Number.isFinite(view.panY)?view.panY:0));
}
