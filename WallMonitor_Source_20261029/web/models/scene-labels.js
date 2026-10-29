import {externalSoilLabels,soilLabelWidth} from './soil-surface-labels.js';
import {tremieLabel} from '../../shared/pipe-labels.js';
import { FONT_SIZE } from '../typography.js';
import { esc, fmt } from '../workbench/format.js';

export const LABEL_GAP = 12;
export function projectedBounds(points) {
  if (!points.length) return null;
  return points.reduce((box, [x, y]) => ({
    left: Math.min(box.left, x), right: Math.max(box.right, x),
    top: Math.min(box.top, y), bottom: Math.max(box.bottom, y)
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
}

                                                                                
                                                                               
export function annotationFitScale(bounds, width, height, depth, soilLabels = false) {
  if (!bounds) return 1;
  const precision = depth < 10 ? 1 : 0;
  const depthWidth = fmt(depth, precision).length * FONT_SIZE.meta * .65;
  const side = depthWidth + LABEL_GAP + 8;
  const right = soilLabels ? soilLabelWidth()+LABEL_GAP+8 : side;
  const top = soilLabels ? 52 : FONT_SIZE.meta + LABEL_GAP + 8;
  const bottom = FONT_SIZE.meta / 2 + 8;
  return Math.max(1,
    (width / 2 - bounds.left) / Math.max(1, width / 2 - side),
    (bounds.right - width / 2) / Math.max(1, width / 2 - right),
    (height / 2 - bounds.top) / Math.max(1, height / 2 - top),
    (bounds.bottom - height / 2) / Math.max(1, height / 2 - bottom));
}

export function externalLabels(spec, project, bounds, viewport) {
  if (!bounds) return '';
  const slot = spec.slot;
  const text = (x, y, value, anchor, baseline = 'auto') => `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="#fff" stroke="none" font-size="${FONT_SIZE.meta}">${esc(value)}</text>`;
  let markup = '<g class="scene-depth-labels">';
                                                                              
  const [,zeroY]=project(spec.soilLeft,0,-slot.thickness/2);
  const labelWidth=fmt(slot.depth,slot.depth<10?1:0).length*FONT_SIZE.meta*.65;
  markup += `<g class="scene-depth-unit">${text(bounds.left-LABEL_GAP-labelWidth,Math.min(zeroY,bounds.top)-LABEL_GAP,'测深 / m','start')}</g>`;
  for (let i = 0; i <= 5; i++) {
    const depth = slot.depth * i / 5;
    const [, y] = project(spec.soilLeft, -depth * spec.ratio, -slot.thickness / 2);
    markup += `<g data-depth-label="${depth}"><path d="M${bounds.left - 8} ${y}h5" stroke="#fff" stroke-opacity=".5"/>${text(bounds.left - LABEL_GAP, y, fmt(depth, slot.depth < 10 ? 1 : 0), 'end', 'middle')}</g>`;
  }
  markup += '</g><g class="scene-pipe-labels">';
  for (const p of spec.pipes) {
    const [x] = project(p.x, 0, p.zCenter);
    const label = p.kind === 'joint' ? p.side === 'left' ? '左' : '右' : tremieLabel(slot,Number(p.id.slice(1))-1);
    markup += `<g data-pipe="${esc(p.id)}" data-diameter="${p.diameter}" data-x="${p.x}" data-depth="${Number.isFinite(p.depth) ? p.depth : ''}" data-visual-sections="${p.instances}"><title>${esc(p.label)} · 管径 ${fmt(p.diameter)} m · 管底测深 ${fmt(p.depth)} m · 管节仅作示意</title>${text(x, bounds.top - LABEL_GAP, label, 'middle')}</g>`;
  }
  return markup + '</g>' + (viewport ? externalSoilLabels(spec,project,bounds,viewport) : '');
}
