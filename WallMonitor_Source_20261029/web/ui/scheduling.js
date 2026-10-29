                                                                                  
export const yieldToBrowser = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

                                                                             
export function createRequestGate() {
  let version = 0;
  return { begin() { const ticket = ++version; return () => ticket === version; }, invalidate() { ++version; } };
}

                                                                            
export function createLatestQueue(run, { delay = 80, onError = () => {}, onBusy = () => {},
  schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null, pending = null, running = false, disposed = false, version = 0;
  const arm = () => {
    if (running || disposed || !pending) return;
    cancel(timer);
    timer = schedule(drain, delay);
  };
  async function drain() {
    timer = null;
    if (running || disposed || !pending) return;
    const job = pending; pending = null; running = true;
    const current = () => !disposed && job.version === version;
    try { await run(job.value, current); }
    catch (error) { if (current()) onError(error); }
    finally { running = false; if (!disposed) { if (pending) arm(); else onBusy(false); } }
  }
  return {
    enqueue(value) { if (disposed) return; pending = { value, version: ++version }; onBusy(true); arm(); },
    dispose() { disposed = true; ++version; pending = null; cancel(timer); onBusy(false); }
  };
}
