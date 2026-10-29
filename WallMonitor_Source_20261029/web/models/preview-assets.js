import * as THREE from 'three';
import {PIPE_UNITS,TERRAIN_LAYERS} from './model-spec.js';

                                                                             
                                                                          
export function createPreviewAssets() {
  const owned=[],assets={};
  const own=v=>(owned.push(v),v);
  for(const kind of ['joint','tremie']) {
    const unit=PIPE_UNITS[kind];
    const geometry=own(new THREE.CylinderGeometry(unit.diameter/2,unit.diameter/2,unit.length,24,1,true));
    geometry.translate(0,-unit.length/2,0);
    assets[kind]=[{geometry,material:own(new THREE.MeshStandardMaterial({color:kind==='joint'?0x89949c:0x555e65,roughness:.5,metalness:.5}))}];
  }
  for(const [i,id] of [...TERRAIN_LAYERS.map(x=>x.id),'C01'].entries()) {
    const group=new THREE.Group();
    const colors=[0x687869,0xaaa08d,0x938471,0xa48d70,0xb29c7c,0xbdab8f,0x73797c];
    for(const face of ['top','side']){
      const material=own(new THREE.MeshStandardMaterial({color:colors[i],roughness:.9}));material.name=`preview_${face}_material`;
      group.add(new THREE.Mesh(own(new THREE.BufferGeometry()),material));
    }
    assets[id]=group;
  }
  return {assets,dispose:()=>owned.forEach(v=>v.dispose())};
}
