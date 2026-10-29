                                                                      
                                                                                
export function bindBlurPreview(container, preview, invalidate = () => {}, {schedule=setTimeout,cancel=clearTimeout,delay=120,previewOnInput=false} = {}) {
  const changed = new WeakSet(); let timer;
  const input = event => {
    changed.add(event.target);cancel(timer);invalidate();
    if (previewOnInput) timer=schedule(preview,delay);
  };
  const focusout = event => {
    if(!changed.has(event.target)) return;
    changed.delete(event.target);cancel(timer);
    timer=schedule(preview,delay);
  };
  container.addEventListener('input',input);
  container.addEventListener('focusout',focusout);
  return () => {cancel(timer);container.removeEventListener('input',input);container.removeEventListener('focusout',focusout);invalidate();};
}
