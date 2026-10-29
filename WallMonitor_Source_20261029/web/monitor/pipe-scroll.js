const bindings=new WeakMap();
export function bindPipeScroll(host){
 if(!host?.querySelector)return;
 bindings.get(host)?.();const scroller=host.querySelector('.pipe-scroll'),range=host.querySelector('.pipe-scroll-range');if(!scroller||!range)return;
 const update=()=>{const width=host.clientWidth;if(width)host.style.setProperty('--summary-width',`${Math.max(300,width-440)}px`);range.max=String(Math.max(0,scroller.scrollWidth-scroller.clientWidth));range.value=String(scroller.scrollLeft);};
 range.oninput=()=>{scroller.scrollLeft=Number(range.value);};scroller.onscroll=()=>{range.value=String(scroller.scrollLeft);};
 const observer=new ResizeObserver(update);observer.observe(host);update();requestAnimationFrame(update);bindings.set(host,()=>observer.disconnect());
}
