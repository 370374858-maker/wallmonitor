                                                                                    
export function displayScale(node) {
  let scale = node.clientWidth ? node.getBoundingClientRect().width / node.clientWidth : 1;
  let win = node.ownerDocument?.defaultView;
  try {
    while (win?.frameElement) {
      const frame = win.frameElement;
      scale *= frame.clientWidth ? frame.getBoundingClientRect().width / frame.clientWidth : 1;
      win = frame.ownerDocument.defaultView;
    }
  } catch {                                                               }
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function boundedPixelRatio(width, height, scale = 1, dpr = 1, maxPixels = 6_000_000) {
  const desired = Math.max(1, (Number.isFinite(scale) ? scale : 1) * (Number.isFinite(dpr) ? dpr : 1));
  const area = Math.max(1, width * height), edge = Math.max(1, width, height);
  return Math.min(desired, 3, Math.sqrt(maxPixels / area), 4096 / edge);
}

export function displayPixelRatio(node, maxPixels) {
  return boundedPixelRatio(node.clientWidth, node.clientHeight, displayScale(node), globalThis.devicePixelRatio || 1, maxPixels);
}

export function watchDisplayDensity(changed, win = window) {
  let query;
  const resolutionChanged = () => { bind(); changed(); };
  function bind() {
    query?.removeEventListener('change', resolutionChanged);
    query = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', resolutionChanged);
  }
  bind();
  win.addEventListener('resize', changed);
  win.addEventListener('cw:display-resize', changed);
  return () => {
    query?.removeEventListener('change', resolutionChanged);
    win.removeEventListener('resize', changed);
    win.removeEventListener('cw:display-resize', changed);
  };
}
