                                                                       
                                                                        
import { concreteTopDepth, displayedSetting } from './concrete-state.js';
import {initialJointDepth,jointDepthPending} from '../../shared/joint-depth-state.js';
export function sceneGeometryKey(slot, metrics) {
  const model=slot.model&&{...slot.model,pipes:slot.model.pipes.map(({label,...pipe})=>pipe)};
  return JSON.stringify([slot.width, slot.depth, slot.thickness, slot.geometryVersion,
    slot.initialConcreteHeight ?? 0, slot.tremieCount, slot.jointLayout, slot.jointDiameter, slot.tremieDiameter, model,
    metrics ? metrics.tremieDepths : slot.tremieInitialDepths,
    metrics ? metrics.jointDepths : Object.fromEntries(Object.keys(slot.jointInitialDepths??{}).map(side=>[side,initialJointDepth(slot,side)])),
    ['left','right'].map(side=>jointDepthPending(slot,side)), concreteTopDepth(slot, metrics)]);
}
export function sceneViewKey(slot, metrics, setting, mode) {
  const estimate=displayedSetting(metrics,setting);
  return JSON.stringify([sceneGeometryKey(slot, metrics), slot.code, slot.tremieLabels, metrics?.theoreticalDepth ?? null, estimate?.depth ?? null, estimate?.key ?? null, mode]);
}
