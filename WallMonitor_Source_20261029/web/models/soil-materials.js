import {SOIL_STYLE} from './soil-config.js';
import {loadUnitySoilMaterials,cloneUnitySoilMaterials} from './unity-soil-materials.js';
import {loadClientSoilMaterials} from './client-soil-materials.js';

export async function loadSoilMaterials(style=SOIL_STYLE,options={}){
  if(style==='unity-original')return loadUnitySoilMaterials(options.load);
  if(style==='client-20261022')return loadClientSoilMaterials(options.load,options.extract);
  throw new RangeError('Unknown soil style: '+style);
}
export const cloneSoilMaterials=cloneUnitySoilMaterials;
