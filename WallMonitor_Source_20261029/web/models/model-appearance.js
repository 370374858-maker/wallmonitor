                                                                            
                                                                        
export const SOIL_APPEARANCE = Object.freeze({
  layerId: 'S06', sourceId: 'S04',
  side: '/assets/models/appearance-20260908/fine-sand-side.jpg',
  top: '/assets/models/appearance-20260908/fine-sand-top.jpg',
  roughness: '/assets/models/appearance-20260908/fine-sand-roughness.png'
});

export function tunePipeMaterial(material, kind) {
  if (kind !== 'tremie' && kind !== 'joint') return material;
  const inner = material.name.includes('内壁');
  material.color.setRGB(...(kind==='joint'?(inner?[.15,.17,.19]:[.33,.36,.39]):(inner?[.10,.075,.068]:[.28,.17,.135])));
  material.metalness = kind==='joint'?.72:.35;
  material.roughness = inner ? .48 : kind==='joint'?.38:.62;
  material.envMapIntensity = .85;
  return material;
}

export function tuneSoilMaterial(material, layerId) {
  if (layerId === 'S13') material.color.setRGB(.64, .69, .65);
  if (layerId === 'S12') material.color.setRGB(.72, .68, .62);
  return material;
}

                                                                           
                                                                             
                                                                      
export function applyConcreteUV(geometry, tileMeters = 2) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const top = ay >= ax && ay >= az;
    const u = top || az >= ax ? p.getX(i) : -p.getZ(i);
    const v = top ? -p.getZ(i) : p.getY(i);
    uv.setXY(i, u / tileMeters, 1 - v / tileMeters);
  }
  uv.needsUpdate = true;
  return geometry;
}
