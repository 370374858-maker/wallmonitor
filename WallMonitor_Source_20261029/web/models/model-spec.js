import { monitorLayout } from '../monitor/geometry.js';
import {jointDepthPending} from '../../shared/joint-depth-state.js';

export const MODEL_ASSETS = Object.freeze({
  joint: '/assets/models/codex-20260908/joint.glb',
  tremie: '/assets/models/codex-20260908/tremie.glb'
});
                                                                      
export {SOIL_LAYERS as TERRAIN_LAYERS} from './soil-config.js';
export const METER_ASSETS = Object.freeze({C01:'/assets/models/meter-20260908/C01.glb'});
export const PIPE_UNITS = Object.freeze({
  joint: { diameter: .93, length: 5.7, pitch: 5.7 },
  tremie: { diameter: .30, length: 1.5, pitch: 1.455 }
});
                                                                                   
                                                                                    
export const PIPE_PRESENTATION = Object.freeze({ jointSections: 2, tremieSections: 12, pixelsPerSection: 70 });
export const currentPipeDepth = (pipe, metrics, slot) => !metrics ? pipe.kind==='joint'&&jointDepthPending(slot,pipe.side)?null:pipe.initialDepth :
  pipe.kind === 'joint' ? metrics.jointDepths?.[pipe.side] : metrics.tremieDepths?.[Number(pipe.id.slice(1)) - 1];

export function sceneSpec(slot, metrics) {
  const layout = monitorLayout(slot), s = layout.horizontalScale, ratio = layout.verticalScale / s;
  return { slot, layout, ratio, height: slot.depth * ratio,
    soilWidth: layout.soilWidth / s, soilLeft: (layout.soilLeft - layout.offsetX) / s,
    viewWidth: 464 / s, viewHeight: 846 / s,
    centerX: (layout.soilLeft + layout.soilWidth / 2 - layout.offsetX) / s, centerY: (layout.top - 423) / s,
    pipes: layout.pipes.map(pipe => {
      const depth = currentPipeDepth(pipe, metrics, slot);
      const depthPending = pipe.kind === 'joint' && jointDepthPending(slot, pipe.side);
                                                                              
                                                                                 
      const length = depthPending ? slot.depth : Number.isFinite(depth) ? Math.min(slot.depth, Math.max(0, depth)) : 0;
      const unit = PIPE_UNITS[pipe.kind];
      const maxSections = pipe.kind === 'joint' ? PIPE_PRESENTATION.jointSections : PIPE_PRESENTATION.tremieSections;
                                                                            
                                                                                 
      const fullCount = Math.max(1, Math.min(maxSections,
        Math.ceil(slot.depth * layout.verticalScale / PIPE_PRESENTATION.pixelsPerSection)));
      const fullSpan = unit.length + (fullCount - 1) * unit.pitch;
      const axialScale = slot.depth * ratio / fullSpan;
      const instances = length > 0 ? Math.min(fullCount, Math.max(1,
        1 + Math.ceil((length * ratio / axialScale - unit.length) / unit.pitch))) : 0;
      return { ...pipe, depth, depthPending, length, yBottom: -length * ratio,
        unit, instances, axialScale: instances ? axialScale : 0,
        radialScale: pipe.diameter / unit.diameter, zCenter: pipe.z - slot.thickness / 2 };
    })
  };
}
