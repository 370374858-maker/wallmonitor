import {UNITY_SOIL_LAYERS} from './unity-soil-spec.js';
import {CLIENT_SOIL_LAYERS} from './client-soil-spec.js';

                          
                                   
                                                  
export const SOIL_STYLE='client-20261022';

export function soilPreset(style=SOIL_STYLE){
  if(style==='client-20261022')return {id:style,name:'甲方五层土体',layers:CLIENT_SOIL_LAYERS};
  if(style==='unity-original')return {id:style,name:'原有 Unity 五层土体',layers:UNITY_SOIL_LAYERS};
  throw new RangeError('Unknown soil style: '+style);
}
export const SOIL_PRESET=Object.freeze(soilPreset());
export const SOIL_LAYERS=SOIL_PRESET.layers;
