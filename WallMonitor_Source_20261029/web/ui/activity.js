                                                                    
export function createActivityTracker(emit, { now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  delay = 160, minimum = 360 } = {}) {
  const tasks = new Map(); let timer = null, shownAt = null;
  function draw() {
    cancel(timer); timer = null;
    if (!tasks.size) {
      const remaining = shownAt === null ? 0 : minimum - (now() - shownAt);
      if (remaining > 0) { emit({ visible: true, label: '请求已结束', elapsed: 0, slow: false, done: true }); timer = schedule(draw, remaining); }
      else { shownAt = null; emit({ visible: false }); }
      return;
    }
    const first = [...tasks.values()][0], latest = [...tasks.values()].at(-1);
    if (shownAt === null && now() - first.started < delay) { timer = schedule(draw, delay - (now() - first.started)); return; }
    shownAt ??= now();
    emit({ visible: true, label: latest.label, elapsed: Math.floor((now() - first.started) / 1000),
      slow: now() - first.started >= 5000, write: [...tasks.values()].some(t => t.write), done: false });
    timer = schedule(draw, 1000);
  }
  return {
    begin(label, write = false) {
      const id = Symbol(); tasks.set(id, { label, write, started: now() }); draw();
      let ended = false;
      return () => { if (!ended) { ended = true; tasks.delete(id); draw(); } };
    },
    dispose() { cancel(timer); tasks.clear(); shownAt = null; emit({ visible: false }); }
  };
}

let tracker;
export function beginActivity(label, write = false) {
  if (typeof document === 'undefined') return () => {};
  if (!tracker) {
    const node = document.createElement('div'); node.className = 'operation-status'; node.hidden = true;
    node.innerHTML = '<i class="activity-spinner" aria-hidden="true"></i><div><strong role="status" aria-live="polite"></strong><small></small></div><span class="activity-time" aria-hidden="true"></span>';
    (document.getElementById('screen') || document.body).append(node);
    tracker = createActivityTracker(state => {
                                                                              
                                                                  
      const parent = document.querySelector('dialog[open]') || document.getElementById('screen') || document.body;
      if (node.parentElement !== parent) parent.append(node);
      node.hidden = !state.visible;
      if (!state.visible) return;
      node.classList.toggle('activity-done', Boolean(state.done));
      node.querySelector('strong').textContent = state.label;
      node.querySelector('small').textContent = state.slow ? state.write ? '仍在处理，请勿重复提交；完成后自动更新' : '耗时较长，正在等待服务响应' : '';
      node.querySelector('.activity-time').textContent = state.elapsed ? `${state.elapsed} 秒` : '';
    });
    window.addEventListener('pagehide', () => tracker.dispose(), { once: true });
  }
  return tracker.begin(label, write);
}
