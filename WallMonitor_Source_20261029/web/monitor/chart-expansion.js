                                                                       
export function bindChartExpansion(root, {onChange=()=>{}}={}) {
  const doc=root.ownerDocument, workspace=root.querySelector('.trends-workspace');
  const entries=[...workspace.querySelectorAll('.panel')].map(panel=>{
    const chart=panel.querySelector('.chart'),heading=panel.querySelector('.panel-heading');
    const name=heading.querySelector('h2').textContent;
    const button=doc.createElement('button');button.type='button';button.className='chart-expand-button';
    button.setAttribute('aria-controls',chart.id);heading.append(button);
    return {panel,button,name};
  });
  let active=null, scrollTop=0;
  function label(entry,expanded) {
    entry.button.textContent=expanded?'还原':'放大';
    entry.button.setAttribute('aria-label',`${expanded?'还原':'放大'}${entry.name}`);
    entry.button.setAttribute('aria-pressed',String(expanded));
    entry.button.title=expanded?'还原图表（Esc）':`放大${entry.name}`;
  }
  entries.forEach(entry=>label(entry,false));
  function reset({notify=true,focus=false}={}) {
    if(!active)return;
    const previous=active;active=null;
    root.classList.remove('chart-expanded');previous.panel.classList.remove('chart-expanded-panel');label(previous,false);
    workspace.scrollTop=scrollTop;
    if(focus)previous.button.focus();
    if(notify)onChange();
  }
  function click(event) {
    const entry=entries.find(item=>item.button===event.target.closest('.chart-expand-button'));
    if(!entry||entry.panel.hidden)return;
    if(active===entry){reset({focus:true});return;}
    reset({notify:false});scrollTop=workspace.scrollTop;active=entry;
    root.classList.add('chart-expanded');entry.panel.classList.add('chart-expanded-panel');label(entry,true);
    workspace.scrollTop=0;onChange();
  }
  function keydown(event) {
    if(event.key==='Escape'&&active&&!root.hidden){event.preventDefault();reset({focus:true});}
  }
  root.addEventListener('click',click);doc.addEventListener('keydown',keydown);
  return {reset,ensureVisible(){if(active?.panel.hidden){reset({notify:false});return true;}return false;},dispose(){
    reset({notify:false});root.removeEventListener('click',click);doc.removeEventListener('keydown',keydown);entries.forEach(({button})=>button.remove());
  }};
}
