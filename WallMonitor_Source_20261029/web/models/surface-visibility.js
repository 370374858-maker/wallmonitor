export function bindSurfaceVisibility(button,changed) {
  let visible=true;
  const sync=()=>{
    button.setAttribute('aria-label','显示参考面');
    button.setAttribute('aria-pressed',String(visible));
    button.title=visible?'隐藏理论面和实测面':'显示理论面和实测面';
    button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible?'':'<path d="m3 3 18 18"/>'}</svg>`;
  };
  const click=()=>{visible=!visible;sync();changed();};
  sync();button.addEventListener('click',click);
  return {get visible(){return visible;},dispose(){button.removeEventListener('click',click);}};
}
