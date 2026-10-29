import {TextureLoader,RepeatWrapping,SRGBColorSpace,NoColorSpace,MeshStandardMaterial,Vector2,Color} from 'three';
import {UNITY_SOIL_LAYERS} from './unity-soil-spec.js';

                                                                               
                                                                               
                                                                                            
                                                                              
                                                                               
export async function loadUnitySoilMaterials(load=url=>new TextureLoader().loadAsync(url)) {
  const textures=new Map();
  const texture=(url,color)=>{
    if(!textures.has(url))textures.set(url,Promise.resolve(load(url)).then(map=>{
      map.wrapS=map.wrapT=RepeatWrapping;map.colorSpace=color?SRGBColorSpace:NoColorSpace;
      map.anisotropy=4;map.needsUpdate=true;return map;
    }).catch(cause=>{throw Object.assign(new Error('Unity soil texture failed',{cause}),{code:'MODEL_ASSET',asset:url.split('/').pop()});}));
    return textures.get(url);
  };
  return Object.fromEntries(await Promise.all(UNITY_SOIL_LAYERS.map(async layer=>{
    const [map,normalMap,aoMap]=await Promise.all([texture(layer.maps.albedo,true),texture(layer.maps.normal,false),layer.maps.ao?texture(layer.maps.ao,false):null]);
    return [layer.id,new MeshStandardMaterial({name:layer.id+' Unity opaque soil',map,normalMap,aoMap,
      color:new Color().setRGB(...layer.color,SRGBColorSpace),metalness:0,roughness:.92,normalScale:new Vector2(.32,.32),aoMapIntensity:.45,
      transparent:false,opacity:1,alphaTest:0,depthWrite:true,vertexColors:true})];
  })));
}
export function cloneUnitySoilMaterials(source,own=value=>value){
  return ['top','side'].map(face=>{const material=own(source.clone());material.name=source.name+' '+face;return material;});
}
