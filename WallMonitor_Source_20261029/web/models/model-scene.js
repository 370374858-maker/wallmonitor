                                                                                   
import {modelFailureMessage} from './model-errors.js';
const mounted = new WeakMap();
let engine;
function reportFailure(state, error) {
  if (state.cancelled) return;
  state.renderer?.dispose(); state.renderer = null;
  state.viewport.dataset.status = 'error';
  state.viewport.querySelector('.scene-message').textContent = modelFailureMessage(error, state.stage);
  console.warn('GLB scene unavailable:', error);
}
export function clearScene(host) {
  const state = mounted.get(host);
  if (state) { state.cancelled = true; state.renderer?.dispose(); mounted.delete(host); }
}
export function showScene(host, slot, metrics = null, setting = null, mode = 'section') {
  if (typeof window === 'undefined' || !host?.querySelector) return;
  let state = mounted.get(host);
  if (!state || !host.querySelector('.scene-viewport')) {
    clearScene(host);
    host.innerHTML = '<div class="scene-viewport" role="img" aria-label="正在加载新三维模型"><div class="scene-message" role="status">正在加载新三维模型…</div></div>';
    state = { host, viewport: host.firstElementChild, args: null, renderer: null, cancelled: false, stage:'script' };
    state.viewport.dataset.loadStarted=String(performance.now());
    mounted.set(host, state);
    engine ||= import('./scene-renderer.js').catch(error => { engine = null; throw error; });
    const current = state;
    engine.then(async module => {
      if (current.cancelled) return;
      current.stage='initialization';
      current.renderer = await module.createScene(current.viewport, () => current.cancelled);
      if (current.cancelled) { current.renderer?.dispose(); return; }
      current.renderer.update(...current.args);
    }).catch(error => reportFailure(current, error));
  }
  state.args = [slot, metrics, setting, mode];
  try { state.renderer?.update(...state.args); } catch (error) { reportFailure(state, error); }
}
