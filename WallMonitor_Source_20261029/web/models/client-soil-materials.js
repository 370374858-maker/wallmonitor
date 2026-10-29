import {ImageLoader,CanvasTexture,RepeatWrapping,MirroredRepeatWrapping,SRGBColorSpace,MeshStandardMaterial,Vector2} from 'three';
import {CLIENT_SOIL_ATLAS,CLIENT_SOIL_LAYERS,atlasBandRect} from './client-soil-spec.js';

                                                                        
export const CLIENT_SOIL_TINT=0xb8b8b8;
export const CLIENT_SOIL_BRIGHTNESS=Object.freeze({soil3:1.7});

function atlasTexture(image,rect){
                                                                             
                                                        
  const canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Cannot prepare client soil texture');
  context.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  return new CanvasTexture(canvas);
}

export async function loadClientSoilMaterials(load=url=>new ImageLoader().loadAsync(url),extract=atlasTexture){
  let image;
  try{image=await load(CLIENT_SOIL_ATLAS);}
  catch(cause){throw Object.assign(new Error('Client soil atlas failed',{cause}),{code:'MODEL_ASSET',asset:'soil-atlas.png'});}
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  const owned=[];
  try{
    return Object.fromEntries(CLIENT_SOIL_LAYERS.map(layer=>{
      const rect=atlasBandRect(width,height,layer.atlasRow),map=extract(image,rect);owned.push(map);
      map.name=layer.id+' client photo';map.colorSpace=SRGBColorSpace;
      map.wrapS=RepeatWrapping;map.wrapT=MirroredRepeatWrapping;
                                                                             
                                                                            
      map.repeat.set(1,rect.width/rect.height);map.anisotropy=4;map.needsUpdate=true;
      const material=new MeshStandardMaterial({name:layer.id+' client opaque soil',map,color:CLIENT_SOIL_TINT,
        metalness:0,roughness:.98,normalMap:null,aoMap:null,normalScale:new Vector2(0,0),
        transparent:false,opacity:1,alphaTest:0,depthWrite:true,vertexColors:true});
      material.color.multiplyScalar(CLIENT_SOIL_BRIGHTNESS[layer.id]??1);
      owned.push(material);return [layer.id,material];
    }));
  }catch(cause){owned.forEach(item=>item.dispose());throw Object.assign(new Error('Client soil texture preparation failed',{cause}),{code:'MODEL_ASSET',asset:'soil-atlas.png'});}
}
