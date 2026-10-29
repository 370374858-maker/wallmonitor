const enterPath = 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5';
const exitPath = 'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5';

                                                                           
export function bindFullscreen(button, doc, { onChange = () => {}, onError = () => {} } = {}) {
  let pending = false;
  function sync() {
    const active = Boolean(doc.fullscreenElement);
    const label = active ? '退出全屏' : '进入全屏';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? '退出全屏（Esc）' : label;
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${active ? exitPath : enterPath}"/></svg>`;
    onChange(active);
  }
  async function toggle() {
    if (pending) return;
    pending = true; button.disabled = true;
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else await doc.documentElement.requestFullscreen();
    } catch (error) { onError(error); }
    finally { pending = false; button.disabled = false; sync(); }
  }
  button.addEventListener('click', toggle);
  doc.addEventListener('fullscreenchange', sync);
  sync();
  return () => { button.removeEventListener('click', toggle); doc.removeEventListener('fullscreenchange', sync); };
}
