import { Shape, Vector2, ExtrudeGeometry, Color, Float32BufferAttribute } from 'three';
import { terrainUVGenerator } from './terrain-uv.js';

export const CAVITY_TINT = '#607b8f';
                                                                          
                                                                          
export const TERRAIN_FRONT = 0;

                                                                                 
                                                                           
export function shadeTerrainCavity(geometry, spec) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const colour = new Color(CAVITY_TINT), colours = new Float32Array(positions.count * 3).fill(1);
  const half = spec.slot.thickness / 2 + .01, tolerance = 1e-5;
  for (let i=0; i<positions.count; i+=3) {
    const x=(positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3;
    const z=(positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3;
                                                                              
                                                                             
                                                                              
    const inside = normals.getZ(i) > .99 && Math.abs(z+half) <= tolerance
      && x >= -tolerance && x <= spec.slot.width+tolerance;
    if (inside) for (let j=i;j<i+3;j++) colour.toArray(colours,j*3);
  }
  geometry.setAttribute('color',new Float32BufferAttribute(colours,3));
  return geometry;
}

                                                                          
                                                                                    
export function terrainProfile(spec) {
  const {slot} = spec, clearance = .01;
  const half = slot.thickness / 2 + clearance;
  const back = -half - 3, front = TERRAIN_FRONT;
  const left = spec.soilLeft, right = left + spec.soilWidth;
  const points = [[left,front],[left,back],[right,back],[right,front]];
  const joint = side => spec.pipes.find(p=>p.kind==='joint' && p.side===side);
  const rightJoint = joint('right'), leftJoint = joint('left');
  if (rightJoint) {
    const r = rightJoint.diameter/2+clearance;
    points.push([slot.width+r,front]);
    for (let i=1;i<=48;i++) {
      const angle=-i*Math.PI/96;
      points.push([slot.width+r*Math.cos(angle),r*Math.sin(angle)]);
    }
    points.push([slot.width+clearance,-r]);
  } else points.push([slot.width+clearance,front]);
                                                                             
                                                                                 
  points.push([slot.width+clearance,-half],[-clearance,-half]);
  if (leftJoint) {
    const r = leftJoint.diameter/2+clearance;
    points.push([-clearance,-r],[0,-r]);
    for (let i=1;i<=48;i++) {
      const angle=-Math.PI/2+i*Math.PI/96;
      points.push([-r*Math.cos(angle),r*Math.sin(angle)]);
    }
  } else points.push([-clearance,front]);
  return points;
}

export function createTerrainGeometry(spec, height, layer = {}) {
  const profile=terrainProfile(spec);
  const shape = new Shape(profile.map(([x,z])=>new Vector2(x,z)));
  const geometry = new ExtrudeGeometry(shape, {depth:height,bevelEnabled:false,steps:1,UVGenerator:terrainUVGenerator(profile,layer.tileMeters||3,layer.offset||[0,0])});
  geometry.rotateX(Math.PI/2);
  return shadeTerrainCavity(geometry,spec);
}
