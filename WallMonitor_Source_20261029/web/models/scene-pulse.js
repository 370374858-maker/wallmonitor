                                                                             
                                                                               
export function createScenePulse(host,{enabled,draw,clear},env=globalThis) {
  const doc=host.ownerDocument,root=doc.getElementById('screen')||doc.documentElement;
  const media=env.matchMedia('(prefers-reduced-motion: reduce)');
  let intersecting=false,timer=null,disposed=false;
  const allowed=()=>!disposed&&intersecting&&!doc.hidden&&!media.matches&&enabled()
    &&(root.id==='screen'?root.classList.contains('motion-enabled'):
      !doc.documentElement.classList.contains('monitor-embedded')||root.classList.contains('effects-enabled'));
  function refresh(){
    if(allowed()) {
      if(timer===null)timer=env.setInterval(()=>{if(allowed())draw(env.performance.now()/1000);else refresh();},50);
    } else if(timer!==null){env.clearInterval(timer);timer=null;clear();}
  }
  const visibility=new env.IntersectionObserver(entries=>{intersecting=entries.some(e=>e.isIntersecting);refresh();});visibility.observe(host);
  const settings=new env.MutationObserver(refresh);settings.observe(root,{attributes:true,attributeFilter:['class']});
  doc.addEventListener('visibilitychange',refresh);media.addEventListener('change',refresh);
  return {refresh,dispose(){disposed=true;refresh();visibility.disconnect();settings.disconnect();doc.removeEventListener('visibilitychange',refresh);media.removeEventListener('change',refresh);}};
}
