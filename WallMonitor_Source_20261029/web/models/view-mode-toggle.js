export const MODEL_VIEW_MODES = Object.freeze({ section: 'section', solid: 'solid' });

const ICONS = Object.freeze({
  section: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M8 5v14M4 9h4"/></svg>',
  solid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>'
});

export function nextModelViewMode(mode) {
  return mode === MODEL_VIEW_MODES.solid ? MODEL_VIEW_MODES.section : MODEL_VIEW_MODES.solid;
}

export function bindViewModeToggle(button, changed, initialMode = MODEL_VIEW_MODES.section) {
  let mode = initialMode === MODEL_VIEW_MODES.solid ? MODEL_VIEW_MODES.solid : MODEL_VIEW_MODES.section;
  const sync = () => {
    const next = nextModelViewMode(mode);
    button.dataset.mode = mode;
    button.setAttribute('aria-pressed', String(mode === MODEL_VIEW_MODES.solid));
    button.setAttribute('aria-label', next === MODEL_VIEW_MODES.solid ? '切换为立体视角' : '切换为正视剖面');
    button.title = next === MODEL_VIEW_MODES.solid ? '切换为立体视角' : '切换为正视剖面';
    button.innerHTML = ICONS[mode];
  };
  const click = () => { mode = nextModelViewMode(mode); sync(); changed(mode); };
  sync();
  button.addEventListener('click', click);
  return {
    get mode() { return mode; },
    set(next) {
      const normalized = next === MODEL_VIEW_MODES.solid ? MODEL_VIEW_MODES.solid : MODEL_VIEW_MODES.section;
      if (mode !== normalized) { mode = normalized; sync(); }
    },
    dispose() { button.removeEventListener('click', click); }
  };
}
