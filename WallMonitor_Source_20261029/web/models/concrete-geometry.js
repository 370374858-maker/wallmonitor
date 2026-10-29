                                                                             
                                                                              
export function concreteCutawayProfile(slot) {
  const front=slot.thickness/2, source=slot.model.profile, result=[];
  for(let i=0;i<source.length;i++) {
    const a=source[(i+source.length-1)%source.length],b=source[i];
    const aInside=a[1]<=front,bInside=b[1]<=front;
    if(aInside!==bInside) {
      const fraction=(front-a[1])/(b[1]-a[1]);
      result.push([a[0]+(b[0]-a[0])*fraction,0]);
    }
    if(bInside)result.push([b[0],b[1]-front]);
  }
                                                                                
  return result.filter((point,i)=>{
    const previous=result[(i+result.length-1)%result.length];
    return Math.hypot(point[0]-previous[0],point[1]-previous[1])>1e-9;
  });
}
