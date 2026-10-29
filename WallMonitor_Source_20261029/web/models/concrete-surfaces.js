import { Shape, Path, Vector2, ExtrudeGeometry, MeshBasicMaterial, Mesh, Group } from 'three';
import { terrainProfile } from './terrain-geometry.js';
import { referenceColors } from '../reference-colors.js';
                                                                                
                                                                                
export const REFERENCE_DISPLAY_OFFSET=.05;
export const REFERENCE_SURFACE_MARGIN=.45;
export const REFERENCE_PIPE_CLEARANCE=.15;

export function referenceRimShapes(profile,dashed=false) {
  const [[left,front],[,back],[right]]=profile,inset=.045;
  const rect=(x1,z1,x2,z2)=>new Shape([[x1,z1],[x1,z2],[x2,z2],[x2,z1]].map(([x,z])=>new Vector2(x,z)));
  if(!dashed){
    const shape=rect(left,front,right,back);
    shape.holes.push(new Path([[left+inset,front-inset],[right-inset,front-inset],[right-inset,back+inset],[left+inset,back+inset]].map(([x,z])=>new Vector2(x,z))));
    return [shape];
  }
  const shapes=[];
  for(let x=left;x<right;x+=.45){
    const end=Math.min(x+.28,right);
    shapes.push(rect(x,front,end,front-inset),rect(x,back+inset,end,back));
  }
  for(let z=back;z<front;z+=.45){
    const end=Math.min(z+.28,front);
    shapes.push(rect(left,end,left+inset,z),rect(right-inset,end,right,z));
  }
  return shapes;
}

export function referenceSurfaceProfile(spec) {
                                                                            
                                                                                
  const terrain=terrainProfile(spec),xs=terrain.map(([x])=>x),zs=terrain.map(([,z])=>z);
  const left=Math.min(...xs)-REFERENCE_SURFACE_MARGIN,right=Math.max(...xs)+REFERENCE_SURFACE_MARGIN;
  const back=Math.min(...zs)-REFERENCE_SURFACE_MARGIN;
                                                                                
  const jointFront=spec.pipes.filter(p=>p.kind==='joint').map(p=>p.zCenter+p.diameter/2+REFERENCE_PIPE_CLEARANCE);
  const front=Math.max(Math.max(...zs)+REFERENCE_SURFACE_MARGIN,...jointFront);
  return [[left,front],[left,back],[right,back],[right,front]];
}

export function createReferenceSurface(spec, kind, own = value => value) {
  const shape = new Shape(referenceSurfaceProfile(spec).map(([x,z]) => new Vector2(x,z)));
                                                                            
                                                                           
  const geometry = own(new ExtrudeGeometry(shape, {depth:.025,bevelEnabled:false,steps:1}));
  geometry.rotateX(Math.PI/2);
  const group = new Group();
  const actual=kind==='actual';
  const color=referenceColors()[kind],profile=referenceSurfaceProfile(spec);
                                                                               
                                                                                 
  const sheet = new Mesh(geometry, own(new MeshBasicMaterial({color,transparent:true,opacity:actual?.24:.28,depthWrite:false,depthTest:true,toneMapped:false})));
                                                                               
  const rim=own(new ExtrudeGeometry(referenceRimShapes(profile,!actual),{depth:.035,bevelEnabled:false,steps:1}));rim.rotateX(Math.PI/2);
  const border = new Mesh(rim,own(new MeshBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false,depthTest:true,toneMapped:false})));
  sheet.renderOrder=actual?5:3;border.renderOrder=actual?6:4;group.add(sheet,border);
  group.visible=false;
  return group;
}

export function updateReferenceSurface(surface, slot, depth, ratio) {
  surface.visible=Number.isFinite(depth);
  if(surface.visible) surface.position.y=-Math.min(slot.depth,Math.max(0,depth))*ratio+REFERENCE_DISPLAY_OFFSET;
}
