import { esc, fmt } from './format.js';
import { geometryLayout, isLegacyGeometry } from './geometry-view.js';
import { FONT_SIZE } from '../typography.js';

import { showScene, clearScene } from '../models/model-scene.js';

function plan(slot, layout) {
  const s = layout.horizontalScale, x = layout.offsetX, y = 547 + (82 - slot.thickness * s) / 2;
  const points = slot.model.profile.map(p => `${x + p[0] * s},${y + p[1] * s}`).join(' ');
  const circle = p => `<circle data-plan-pipe="${p.id}" data-kind="${p.kind}" data-diameter="${p.diameter}" cx="${x + p.x * s}" cy="${y + p.z * s}" r="${p.diameter / 2 * s}" fill="${p.kind === 'joint' ? '#9b9a8e' : '#c1cece'}" stroke="#c7d6d7" stroke-width=".6"><title>${esc(p.label)} · Ø ${fmt(p.diameter)} m</title></circle>`;
  return `<g data-view="plan"><text x="26" y="512" font-size="${FONT_SIZE.meta}" fill="#9db8c8">截面俯视 · 宽 / 厚 / 管径同比例</text>
    ${layout.pipes.filter(p => p.kind === 'joint').map(circle).join('')}<polygon data-plan-profile="true" points="${points}" fill="#416873" stroke="#85aab4"/>${layout.pipes.filter(p => p.kind === 'tremie').map(circle).join('')}
    <path d="M${x} 642H${x + slot.width * s}m0 -4v8M${x} 638v8" stroke="#7294a5"/><text x="190" y="659" text-anchor="middle" fill="#abc0cb" font-size="${FONT_SIZE.meta}">宽 ${fmt(slot.width)} m　×　厚 ${fmt(slot.thickness)} m</text>
    <text x="190" y="678" text-anchor="middle" fill="#abc0cb" font-size="${FONT_SIZE.meta}">浇筑管 Ø 0.30 m${layout.pipes.some(p => p.kind === 'joint') ? `　/　接头管 Ø ${fmt(layout.pipes.find(p => p.kind === 'joint').diameter)} m` : '　/　无接头管'}</text></g>`;
}

export function renderModel(container, values, slot, metrics = null, mode = 'section') {
  if (!slot) {
    clearScene(container.querySelector?.('.workbench-scene'));
    container.innerHTML = '<div class="model-empty"><div class="ghost" aria-hidden="true"></div><p>填写宽度、深度和厚度即可生成槽体<br>管道随有效配置逐项显示</p></div>';
    values.innerHTML = ''; return;
  }
  const layout = geometryLayout(slot, mode);
  const legacy = isLegacyGeometry(slot) ? '<div class="geometry-legacy-note">旧几何快照：接头管按当时槽厚绘制，面积未重算。新建槽段可设置管径，默认 0.93 m。</div>' : '';
  const diagram = `<svg viewBox="0 496 380 196" role="img" aria-label="横截面俯视，宽厚管径同比例">${plan(slot, layout)}</svg>`;
  if (!container.querySelector?.('.workbench-scene')) {
    container.innerHTML = `${legacy}<div class="workbench-scene" data-model-source="codex-20260908"></div><div class="workbench-plan">${diagram}</div><p class="geometry-asset-note">土层与管节为示意</p>`;
  } else container.querySelector('.workbench-plan').innerHTML = diagram;
  showScene(container.querySelector?.('.workbench-scene'), slot, metrics, null, mode);
  const hasInitial = !metrics && Number.isFinite(slot.initialConcreteHeight) && slot.initialConcreteHeight > 0;
  values.innerHTML = `<div><small>槽段深度</small><b>${fmt(slot.depth)}<em>m</em></b></div><div><small>有效截面积</small><b>${fmt(slot.area)}<em>m²</em></b></div><div><small>${metrics ? '实测上升高度' : hasInitial ? '初始混凝土高度' : '设计容积'}</small><b>${fmt(metrics ? metrics.actualHeight : hasInitial ? slot.initialConcreteHeight : slot.capacity)}<em>${metrics || hasInitial ? 'm' : 'm³'}</em></b></div>`;
}
