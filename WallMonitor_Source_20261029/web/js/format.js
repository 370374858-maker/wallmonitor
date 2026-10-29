export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function fixed(value, digits = 2) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—';
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[character]);
}

export function timeText(value) {
  if (!value) return '—';
  const match = String(value).match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : String(value);
}

export function levelLabel(level) {
  return ({ danger:'告警', warn:'关注', ok:'正常', info:'记录' })[level] || '记录';
}

export function animateNumber(element, target, digits = 1) {
  const numeric = Number(target);
  if (!Number.isFinite(numeric)) {
    element.textContent = '—';
    return;
  }
  const start = Number(element.dataset.value || 0);
  const begin = performance.now();
  const duration = 650;
  const tick = (now) => {
    const progress = Math.min(1, (now - begin) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = (start + (numeric - start) * eased).toFixed(digits);
    if (progress < 1) requestAnimationFrame(tick);
    else element.dataset.value = String(numeric);
  };
  requestAnimationFrame(tick);
}
