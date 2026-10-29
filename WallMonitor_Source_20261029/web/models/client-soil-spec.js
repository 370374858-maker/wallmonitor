import {UNITY_SOIL_LAYERS} from './unity-soil-spec.js';

                                                                          
                                                                           
export const CLIENT_SOIL_ATLAS='/assets/models/client-soil-20261022/soil-atlas.png';
export const CLIENT_SOIL_ROWS=Object.freeze([
  Object.freeze({id:'soil1',name:'砂卵砾石',label:'4 砂卵砾石',tileMeters:5.2}),
  Object.freeze({id:'soil2',name:'含砾粗中砂',label:'3-3 含砾粗中砂',tileMeters:5}),
  Object.freeze({id:'soil3',name:'黏质粉土',label:'3-2-2 黏质粉土',tileMeters:4.4}),
  Object.freeze({id:'soil4',name:'粉质黏土',label:'3-2-1 粉质黏土',tileMeters:4.8}),
  Object.freeze({id:'soil5',name:'含砾中粗砂',label:'3-1 含砾中粗砂',tileMeters:5})
]);
export const CLIENT_SOIL_LAYERS=Object.freeze(UNITY_SOIL_LAYERS.map(original=>{
  const atlasRow=CLIENT_SOIL_ROWS.findIndex(row=>row.id===original.id),row=CLIENT_SOIL_ROWS[atlasRow];
  return Object.freeze({...original,label:row.label,tileMeters:row.tileMeters,offset:Object.freeze([0,0]),
    color:Object.freeze([1,1,1]),atlasRow,maps:Object.freeze({albedo:CLIENT_SOIL_ATLAS})});
}));

                                                                             
                                                          
export function atlasBandRect(width,height,row,gutter=3){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<40||!Number.isInteger(row)||row<0||row>=CLIENT_SOIL_ROWS.length||!Number.isInteger(gutter)||gutter<0)throw new RangeError('Invalid client soil atlas band');
  const y=Math.ceil(height*row/CLIENT_SOIL_ROWS.length)+gutter;
  const end=Math.floor(height*(row+1)/CLIENT_SOIL_ROWS.length)-gutter;
  if(end<=y)throw new RangeError('Client soil atlas band is empty');
  return {x:0,y,width,height:end-y};
}
