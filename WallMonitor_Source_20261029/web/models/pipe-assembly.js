import { Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

                                                                             
                                                                             
                                                                             
                                                                              
export function repairBarrelNormals(source, radius = .15) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const p=geometry.getAttribute('position'), n=geometry.getAttribute('normal');
  for(let i=0;i<p.count;i+=3) {
    const onBarrel=[i,i+1,i+2].every(j=>Math.abs(Math.hypot(p.getX(j),p.getZ(j))-radius)<1e-5);
    const height=Math.max(p.getY(i),p.getY(i+1),p.getY(i+2))-Math.min(p.getY(i),p.getY(i+1),p.getY(i+2));
    if(!onBarrel || height<1e-4) continue;
    for(let j=i;j<i+3;j++) n.setXYZ(j,p.getX(j)/radius,0,p.getZ(j)/radius);
  }
  n.needsUpdate=true;
  return geometry;
}

export function assembleTremieGeometry(source, pipe) {
  if(!pipe.instances) return null;
  const barrel=repairBarrelNormals(source), pieces=[];
  const matrix=new Matrix4(), rotation=new Quaternion(), scale=new Vector3(pipe.radialScale,pipe.axialScale,pipe.radialScale);
  for(let i=0;i<pipe.instances;i++) {
    const position=new Vector3(pipe.x,-i*pipe.unit.pitch*pipe.axialScale,pipe.zCenter);
    pieces.push(barrel.clone().applyMatrix4(matrix.compose(position,rotation,scale)));
  }
  const assembled=mergeGeometries(pieces,false);
  barrel.dispose(); pieces.forEach(piece=>piece.dispose());
  if(!assembled) throw new Error('浇筑管组装失败');
  assembled.computeBoundingBox(); assembled.computeBoundingSphere();
  assembled.userData={assembledSections:pipe.instances,shading:'continuous-radial-barrel'};
  return assembled;
}
