import {Vector2} from 'three';
                                                                             
                                                                            
                                                                              
export function terrainUVGenerator(profile,tileMeters=3,offset=[0,0]){
  if(!Number.isFinite(tileMeters)||tileMeters<=0)throw new RangeError('Invalid terrain texture scale');
  const lengths=[0];for(let i=1;i<profile.length;i++)lengths.push(lengths[i-1]+Math.hypot(profile[i][0]-profile[i-1][0],profile[i][1]-profile[i-1][1]));
  const perimeter=lengths[lengths.length-1]+Math.hypot(profile[0][0]-profile.at(-1)[0],profile[0][1]-profile.at(-1)[1]);
  const nearest=(x,y)=>{let best=Infinity,index=0;profile.forEach((p,i)=>{const d=(p[0]-x)**2+(p[1]-y)**2;if(d<best){best=d;index=i;}});return index;};
  return {
    generateTopUV(_g,v,a,b,c){return [a,b,c].map(i=>new Vector2(v[i*3]/tileMeters+offset[0],-v[i*3+1]/tileMeters+offset[1]));},
    generateSideWallUV(_g,v,a,b,c,d){
      const ia=nearest(v[a*3],v[a*3+1]),ib=nearest(v[b*3],v[b*3+1]);
      let ua=lengths[ia],ub=lengths[ib];
                                                                                  
      if(Math.abs(ua-ub)>perimeter/2){if(ua<ub)ua+=perimeter;else ub+=perimeter;}
      return [a,b,c,d].map((i,n)=>new Vector2((n===0||n===3?ua:ub)/tileMeters+offset[0],1-v[i*3+2]/tileMeters+offset[1]));
    }
  };
}
