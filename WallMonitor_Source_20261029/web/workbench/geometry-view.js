import {pipeLabel} from '../../shared/pipe-labels.js';
                                                                                            
export const ISO_COS = Math.sqrt(3) / 2;
export const isoPoint = ([x, z]) => [ISO_COS * (x - z), (x + z) / 2];
export const isLegacyGeometry = slot => slot.geometryVersion === 'semicircle-joints-v1';
export function pipeDiameter(slot, pipe) {
  return pipe.diameter ?? (pipe.kind === 'tremie' ? slot.tremieDiameter ?? .3 : slot.jointDiameter ?? slot.thickness);
}

export function geometryLayout(slot, mode = 'section') {
  const pipes = slot.model.pipes.map(pipe => ({ ...pipe, label:pipeLabel(slot,pipe.id), diameter: pipeDiameter(slot, pipe) }));
  const all = [...slot.model.profile];
  for (const pipe of pipes) for (let i = 0; i < 64; i++) {
    const a = i * Math.PI / 32;
    all.push([pipe.x + pipe.diameter / 2 * Math.cos(a), pipe.z + pipe.diameter / 2 * Math.sin(a)]);
  }
  const projected = all.map(isoPoint);
  const minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]));
  const isoMinX = Math.min(...projected.map(p => p[0])), isoMaxX = Math.max(...projected.map(p => p[0]));
  const isoMinY = Math.min(...projected.map(p => p[1])), isoMaxY = Math.max(...projected.map(p => p[1]));
                                                                                           
  const horizontalScale = Math.min(246 / (maxX - minX), 82 / slot.thickness, 246 / (isoMaxX - isoMinX));
  const maxHeight = mode === 'solid' ? 395 - (isoMaxY - isoMinY) * horizontalScale : 385;
  const verticalScale = Math.min(horizontalScale, maxHeight / slot.depth);
  const offsetX = 190 - (minX + maxX) / 2 * horizontalScale;
  const isoOffsetX = 190 - (isoMinX + isoMaxX) / 2 * horizontalScale;
  const isoOffsetY = 60 - isoMinY * horizontalScale;
  return { pipes, horizontalScale, verticalScale, compression: horizontalScale / verticalScale,
    height: slot.depth * verticalScale, offsetX, minX, maxX,
    project: (point, depth = 0) => {
      const [x, y] = isoPoint(point);
      return [isoOffsetX + x * horizontalScale, isoOffsetY + y * horizontalScale + depth * verticalScale];
    } };
}
