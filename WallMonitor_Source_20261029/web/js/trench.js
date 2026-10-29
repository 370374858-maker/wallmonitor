import { $, fixed } from './format.js';
import { pipeStatus } from './rules.js';

function clamp(value,min,max) {
  return Math.max(min,Math.min(max,value));
}

function heightToTop(value,total) {
  const ratio = Number(total) > 0 ? Number(value) / Number(total) : 0;
  return 100-clamp(ratio,0,1)*100;
}

function setSurface(id,labelId,value,total,label) {
  const element = $(id);
  element.style.top = heightToTop(value,total)+'%';
  $(labelId).textContent = label+' '+fixed(value)+' m';
}

function pipeEndPercent(pipe,data) {
  const total = data.profile.depth;
  if (pipe.kind === 'joint') {
    return clamp(heightToTop(data.progress.curing,total)+(Number(pipe.diff) || 0)/total*100,4,100);
  }
  return clamp(heightToTop(data.progress.actual,total)+(Number(pipe.diff) || 0)/total*100,4,100);
}

export function updateTrench(data) {
  const total = data.profile.depth;
  const actualTop = heightToTop(data.progress.actual,total);
  const concrete = $('#scene-concrete');
  concrete.style.top = actualTop+'%';
  concrete.style.height = (100-actualTop)+'%';

  setSurface('#scene-theory-line','#scene-theory-label',data.progress.theory,total,'理论');
  setSurface('#scene-actual-line','#scene-actual-label',data.progress.actual,total,'实测');
  setSurface('#scene-curing-line','#scene-curing-label',data.progress.curing,total,'初凝');

  data.pipes.forEach((pipe) => {
    const element = $('#scene-pipe-'+pipe.id);
    if (!element) return;
    const visible = Number.isFinite(Number(pipe.depth)) && Number(pipe.depth) > 0;
    element.style.opacity = visible ? '1' : '.18';
    element.style.height = visible ? pipeEndPercent(pipe,data)+'%' : '18%';
    element.classList.remove('status-ok','status-warn','status-danger','status-muted');
    const status = visible ? pipe.status || pipeStatus(pipe) : {key:'muted'};
    element.classList.add('status-'+status.key);
  });

  $('#visual-subtitle').textContent = '槽段 '+data.id+' · 真实地层剖面';
  $('#visual-theory').textContent = fixed(data.progress.theory)+' m';
  $('#visual-actual').textContent = fixed(data.progress.actual)+' m';
  $('#visual-curing').textContent = fixed(data.progress.curing)+' m';
  $('#visual-diff').textContent = fixed(data.progress.theory-data.progress.actual)+' m';
  $('#scene-thickness').textContent = fixed(data.profile.thickness,1)+' m';
  $('#scene-width').textContent = fixed(data.profile.width,1)+' m';

  $('#depth-scale').innerHTML = Array.from({length:6},(_,index) => {
    const value = total*index/5;
    const top = 100-index*20;
    return '<span style="top:'+top+'%">'+fixed(value,0)+'m</span>';
  }).join('');
}
