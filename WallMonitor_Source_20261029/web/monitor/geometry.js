import { geometryLayout } from '../workbench/geometry-view.js';
import { esc, fmt } from '../workbench/format.js';
import { FONT_SIZE } from '../typography.js';


                                                                                     
export function monitorLayout(slot) {
  const layout = geometryLayout(slot);
                                                                           
                                                                               
  const soilSpan = Math.max(12, layout.maxX - layout.minX + 2 * Math.max(slot.width * .20, .8));
  const soilMargin = (soilSpan - (layout.maxX - layout.minX)) / 2;
  const s = 396 / (layout.maxX - layout.minX + 2 * soilMargin);
  const x = 54 + (soilMargin - layout.minX) * s;
  const sy = 804 / slot.depth;
  return { ...layout, horizontalScale: s, verticalScale: sy, offsetX: x, soilMargin,
    top: 26, bottom: 830, soilLeft: 54, soilWidth: 396 };
}

                                                                                        
export function geometryMarkup(slot) {
  if (!slot) return '<div class="empty">等待槽段档案</div>';
  const l = monitorLayout(slot);
  return `<div class="model-glb-shell" data-model-source="codex-20260908" data-horizontal-scale="${l.horizontalScale}" data-vertical-scale="${l.verticalScale}" data-soil-margin="${l.soilMargin}" aria-label="${esc(slot.code)} 槽段 GLB 模型"></div>`;
}

export function planMarkup(slot) {
  if (!slot) return '';
                                                                               
                                                                                 
  const l = geometryLayout(slot), s = Math.min(27.4, 300 / (l.maxX - l.minX), 92 / slot.thickness);
                                                                                
                                                                             
  const frameThickness = Math.max(2, slot.thickness), frameHeight = frameThickness * s + 52;
  const x = 151 - (l.minX + l.maxX) / 2 * s, y = 14 + (frameThickness - slot.thickness) * s / 2;
  const right = x + slot.width*s, bottom = y + slot.thickness*s;
  const dimY = bottom+17, dimX = x+l.maxX*s+13;
  const profile = slot.model.profile.map(p => `${x + p[0] * s},${y + p[1] * s}`).join(' ');
  const circle = p => `<circle data-plan-pipe="${p.id}" cx="${x + p.x * s}" cy="${y + p.z * s}" r="${p.diameter * s / 2}" fill="${p.kind === 'joint' ? '#aaa799' : '#d2d9d9'}" stroke="#d0d9d9" stroke-width=".5"/>`;
  return `<svg viewBox="0 0 332 ${frameHeight}" role="img" aria-label="横截面，宽 ${fmt(slot.width)} 米，厚 ${fmt(slot.thickness)} 米" data-plan-scale="${s}" data-plan-reference-width="10">
    ${l.pipes.filter(p => p.kind === 'joint').map(circle).join('')}<polygon data-plan-profile="true" points="${profile}" fill="#405d65" stroke="#8dabae" stroke-width=".7"/>${l.pipes.filter(p => p.kind === 'tremie').map(circle).join('')}
    <g stroke="#78a8c5" stroke-width="1" fill="none"><path d="M${x} ${bottom+6}V${dimY+4}M${right} ${bottom+6}V${dimY+4}M${x} ${dimY}H${right}"/><path d="M${dimX-4} ${y}H${dimX+4}M${dimX-4} ${bottom}H${dimX+4}M${dimX} ${y}V${bottom}"/></g>
    <g fill="#c0d8f0" font-size="${FONT_SIZE.meta}" text-anchor="middle"><text x="${(x+right)/2}" y="${dimY+16}">宽 ${fmt(slot.width)} m</text><text transform="translate(${dimX+17} ${(y+bottom)/2}) rotate(-90)">厚 ${fmt(slot.thickness)} m</text></g>
  </svg>`;
}
