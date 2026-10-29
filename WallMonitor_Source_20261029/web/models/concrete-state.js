                                                                             
                                                                                  
export const displayedSetting = (metrics, setting) => setting ?? metrics?.monitoring?.setting ?? null;

export function validInitialConcreteHeight(slot) {
  const value = slot?.initialConcreteHeight ?? 0;
  return Number.isFinite(value) && Number.isFinite(slot?.depth) && value >= 0 && value <= slot.depth ? value : null;
}

                                                                           
                                                                                
                                         
export function concreteTopDepth(slot, metrics) {
  const actual = metrics?.actualDepth;
  if (Number.isFinite(actual)) return Math.min(slot.depth, Math.max(0, actual));
  if (actual !== undefined && actual !== null) return null;
  const initial = validInitialConcreteHeight(slot);
  return initial > 0 ? slot.depth - initial : null;
}

export function concreteState(slot, metrics, setting) {
  const top = concreteTopDepth(slot, metrics), initial = validInitialConcreteHeight(slot);
  if (!Number.isFinite(top) || top >= slot.depth) return { phase:'empty', boundary:null };
  if (initial === null) return { phase:'unknown', boundary:null };
  const measuredHeight = slot.depth - top;
  if (Number.isFinite(metrics?.actualDepth) && measuredHeight < initial - 1e-7) return { phase:'unknown', boundary:null };
  const baselineDepth = slot.depth - initial, estimate = displayedSetting(metrics, setting);
  if (Number.isFinite(estimate?.depth)) {
                                                                           
                                                                        
    const boundary = Math.min(slot.depth, Math.max(top, Math.min(estimate.depth, baselineDepth)));
    return { phase:boundary <= top ? 'set' : boundary >= slot.depth ? 'fresh' : 'mixed', boundary };
  }
  if (initial > 0) {
    const boundary = Math.max(top, baselineDepth);
    return { phase:boundary <= top ? 'set' : 'mixed', boundary };
  }
  if (estimate?.key === 'pending') return { phase:'fresh', boundary:slot.depth };
  return { phase:'unknown', boundary:null };
}

export function tuneConcreteMaterial(material, wet = false) {
  if (wet) {
                                                                             
    material.color.multiplyScalar(.19);
    material.roughness = Math.min(material.roughness, .36);
    material.metalness = 0;
  }
  return material;
}

export function updateConcreteRegions(regions, spec, metrics, setting) {
  const state = concreteState(spec.slot, metrics, setting);
  if (regions) {
    regions.wet.visible = state.phase === 'fresh' || state.phase === 'mixed';
    regions.dry.visible = state.phase === 'set' || state.phase === 'mixed' || state.phase === 'unknown';
    regions.wetPlane.constant = (state.boundary ?? spec.slot.depth) * spec.ratio;
                                                                               
    regions.dryPlane.constant = -(state.boundary ?? concreteTopDepth(spec.slot, metrics) ?? spec.slot.depth) * spec.ratio;
  }
  return state;
}
