import {createMaterialViewer} from './renderer.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const MAP_NAMES={albedo:'颜色',normal:'法线',ao:'遮蔽',roughness:'粗糙度',metallic:'金属度',height:'高度'};
const STORAGE='geotech-material-shortlist-v1';
let catalogue,active,pack='all',query='',onlySelected=false,shape='trench',mode='platform',compare=false,viewer;
let selected=[],toastTimer,updateTimer;
try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(saved))selected=saved;}catch{}
const controls={repeat:1,roughness:.92,normal:.32};
const materialById=id=>catalogue.materials.find(item=>item.id===id);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function saveSelection(){try{localStorage.setItem(STORAGE,JSON.stringify(selected));}catch{toast('浏览器存储不可用，请及时导出选择清单。');}}
function setPressed(selector,key,value){document.querySelectorAll(selector).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[key]===value)));}

function renderPacks(){
  $('packs').innerHTML=[{id:'all',label:'全部资源',name:'ALL COLLECTIONS',count:catalogue.materials.length},...catalogue.packs].map(item=>`<button class="pack" data-pack="${item.id}" aria-pressed="${pack===item.id}"><span class="pack-icon" aria-hidden="true">${item.id==='all'?'▦':'▱'}</span><span>${esc(item.label)}<small>${esc(item.name)}</small></span><b>${item.count}</b></button>`).join('');
}
function renderList(){
  const items=catalogue.materials.filter(item=>(pack==='all'||item.pack===pack)&&(!query||item.search.includes(query))&&(!onlySelected||selected.includes(item.id)));
  $('visible-count').textContent=`${items.length} / ${catalogue.materials.length} 项`;
  $('material-list').innerHTML=items.length?items.map(item=>`<button class="material-card" data-material="${item.id}" aria-pressed="${active?.id===item.id}" title="${esc(item.name)}"><img loading="lazy" src="${item.thumbnail}" alt="${esc(item.title)}颜色贴图">${selected.includes(item.id)?'<span class="chosen" aria-label="已加入选择">✓</span>':''}<strong>${esc(item.title)}</strong><small>${esc(item.packLabel)}</small></button>`).join(''):'<p class="empty">没有匹配的资源。<br>试试其他名称或筛选条件。</p>';
}
function renderShortlist(){
  $('selected-count').textContent=selected.length;$('shortlist-count').textContent=selected.length;
  $('export').disabled=!selected.length;
  $('compare').querySelector('span').textContent=`${Math.min(selected.length,4)}/4`;
  $('shortlist').innerHTML=selected.length?selected.map(id=>{const item=materialById(id);return `<div class="shortlist-item"><button data-shortlist="${id}" title="预览 ${esc(item.title)}"><img src="${item.thumbnail}" alt="${esc(item.title)}"></button><span>${esc(item.title)}</span><button data-remove="${id}" aria-label="移除 ${esc(item.title)}">✕</button></div>`;}).join(''):'<p>点击「加入选择」，保留中意的材质。</p>';
  syncSelectButton();
}
function syncSelectButton(){
  if(!active)return;
  const chosen=selected.includes(active.id);
  $('select-material').textContent=chosen?'✓ 已加入选择 · 点击移除':'＋ 加入选择';
  $('select-material').setAttribute('aria-pressed',String(chosen));$('select-material').disabled=false;
}
function renderDetail(){
  if(!active)return;
  $('detail-title').textContent=active.title;$('detail-name').textContent=active.name;
  $('detail-pack').textContent=active.packLabel;
  $('detail-number').textContent=String(catalogue.materials.indexOf(active)+1).padStart(2,'0')+' / '+catalogue.materials.length;
  $('resolution').textContent=active.maps.albedo.originalSize.join(' × ');
  $('source-path').textContent=active.sourceMaterial;
  const roles=Object.keys(active.maps);
  $('map-count').textContent=roles.length+' 个通道';
  $('maps').innerHTML=roles.map(role=>`<button class="map-button" data-map="${role}" title="查看${MAP_NAMES[role]}贴图"><img src="${active.maps[role].url}" alt="${MAP_NAMES[role]}贴图" loading="lazy">${MAP_NAMES[role]}</button>`).join('');
  syncSelectButton();
}
function syncControls(){
  for(const key of Object.keys(controls)){
    $(key).value=controls[key];
    $(key+'-value').textContent=key==='repeat'?controls[key].toFixed(1)+' ×':controls[key].toFixed(2);
  }
  setPressed('[data-mode]','mode',mode);
  $('mode-note').textContent=mode==='platform'?'统一使用当前平台的土体表面参数。':'保留源材质颜色与纹理，近似还原标准 PBR 表面。';
}
function resetMaterial(){
  controls.repeat=1;
  controls.roughness=mode==='platform'?.92:active.maps.roughness?1:active.sourceSettings.roughness;
  controls.normal=mode==='platform'?.32:Math.min(1.5,active.sourceSettings.normalScale);
  syncControls();
}
function setActive(id){
  const item=materialById(id);if(!item)return;
  active=item;location.hash=id;
  resetMaterial();renderList();renderDetail();refreshPreview();
}
function refreshPreview(){
  if(!viewer||!active)return;
  clearTimeout(updateTimer);
  const items=compare?selected.slice(0,4).map(materialById):[active];
  $('stage-error').hidden=true;
  void viewer.update(items,{shape,mode,...controls});
}
function setCompare(value){
  if(value&&selected.length<2){toast('先加入至少两项材质，即可并排比较。');return;}
  compare=value;$('compare').setAttribute('aria-pressed',String(value));
  if(value&&selected.length>4)toast('对比展示选择清单中的前 4 项，可移除后切换。');
  refreshPreview();
}
function toggleSelected(id){
  if(selected.includes(id))selected=selected.filter(value=>value!==id);else selected.push(id);
  saveSelection();renderList();renderShortlist();
  if(compare){if(selected.length<2)setCompare(false);else refreshPreview();}
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function copyPath(){
  try{await navigator.clipboard.writeText(active.sourceMaterial);toast('已复制原始材质路径。');}
  catch{const text=document.createElement('textarea');text.value=active.sourceMaterial;document.body.append(text);text.select();const ok=document.execCommand('copy');text.remove();toast(ok?'已复制原始材质路径。':'请从资源信息中选择路径并复制。');}
}
function showError(error){
  $('loading').hidden=true;$('render-state').textContent='加载失败';$('stage').dataset.status='error';
  $('stage-error').hidden=false;$('stage-error').querySelector('p').textContent=error.message||'三维预览暂时不可用，请检查浏览器 WebGL 支持。';
}

async function init(){
  const response=await fetch('./catalogue.json');if(!response.ok)throw new Error('资源目录读取失败（'+response.status+'）');
  catalogue=await response.json();
  selected=[...new Set(selected.filter(id=>typeof id==='string'&&materialById(id)))];
  $('total-count').textContent=catalogue.materials.length+' 项资源';
  renderPacks();renderShortlist();
  $('packs').addEventListener('click',event=>{const button=event.target.closest('[data-pack]');if(!button)return;pack=button.dataset.pack;renderPacks();renderList();$('material-list').scrollTop=0;});
  $('material-list').addEventListener('click',event=>{const button=event.target.closest('[data-material]');if(button)setActive(button.dataset.material);});
  $('search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();renderList();});
  $('only-selected').addEventListener('change',event=>{onlySelected=event.target.checked;renderList();});
  $('select-material').addEventListener('click',()=>toggleSelected(active.id));
  $('shortlist').addEventListener('click',event=>{const remove=event.target.closest('[data-remove]'),preview=event.target.closest('[data-shortlist]');if(remove)toggleSelected(remove.dataset.remove);else if(preview)setActive(preview.dataset.shortlist);});
  $('compare').addEventListener('click',()=>setCompare(!compare));
  document.querySelectorAll('[data-shape]').forEach(button=>button.addEventListener('click',()=>{shape=button.dataset.shape;setPressed('[data-shape]','shape',shape);refreshPreview();}));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;resetMaterial();refreshPreview();}));
  for(const key of Object.keys(controls))$(key).addEventListener('input',()=>{controls[key]=Number($(key).value);syncControls();clearTimeout(updateTimer);updateTimer=setTimeout(refreshPreview,100);});
  $('reset-material').addEventListener('click',()=>{resetMaterial();refreshPreview();});
  $('autorotate').addEventListener('change',event=>viewer?.setAutorotate(event.target.checked));
  $('copy-path').addEventListener('click',copyPath);
  $('maps').addEventListener('click',event=>{const button=event.target.closest('[data-map]');if(!button)return;const role=button.dataset.map,texture=active.maps[role];$('map-dialog-title').textContent=active.title+' · '+MAP_NAMES[role];$('map-dialog-image').src=texture.url;$('map-dialog-image').alt=active.title+MAP_NAMES[role]+'贴图';$('map-dialog-path').textContent=texture.source;$('map-dialog').showModal();});
  $('close-dialog').addEventListener('click',()=>$('map-dialog').close());
  $('map-dialog').addEventListener('click',event=>{if(event.target===$('map-dialog')){const rect=$('map-dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('map-dialog').close();}});
  $('export').addEventListener('click',()=>{
    const data={format:'geotech-material-selection-v1',createdAt:new Date().toISOString(),renderPreset:catalogue.renderPreset,preview:{shape,mode,...controls},materials:selected.map(id=>materialById(id))};
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),'材质选择清单.json');toast('已导出材质名称、源路径、贴图通道与当前预览参数。');
  });
  $('snapshot').addEventListener('click',async()=>{
    if(!viewer||$('stage').dataset.status!=='ready')return;
    try{
      const blob=await viewer.snapshot();if(!blob)throw new Error('预览图生成失败');
                                                                        
      const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height+54;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#0c192a';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);image.close();
      ctx.fillStyle='#c2d9ed';ctx.font='14px Microsoft YaHei, sans-serif';
      const names=(compare?selected.slice(0,4).map(id=>materialById(id).title):[active.title]).join(' / ');
      ctx.fillText(names+' · '+(mode==='platform'?'平台土体':'材质本色'),20,canvas.height-28,canvas.width-40);
      ctx.fillStyle='#7d9ab6';ctx.font='10px sans-serif';ctx.fillText(`ACES Filmic · Exposure 0.85 · repeat ${controls.repeat.toFixed(1)} · roughness ${controls.roughness.toFixed(2)} · normal ${controls.normal.toFixed(2)}`,20,canvas.height-10,canvas.width-40);
      const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!output)throw new Error('预览图生成失败');download(output,'材质预览-'+(compare?'对比':active.id)+'.png');
    }catch(error){toast(error.message);}
  });
  function startViewer(){
    try{
      viewer?.dispose();viewer=createMaterialViewer($('stage'),$('reset-camera'),{
        loading(value){$('loading').hidden=!value;$('render-state').textContent=value?'读取贴图…':'已就绪';$('snapshot').disabled=value;},
        ready(items){$('stage-labels').className='stage-labels'+(items.length>1?' compare':'')+(items.length>2?' many':'');$('stage-labels').innerHTML=items.map((item,index)=>`<div class="stage-label"><span>${items.length>1?'<b>'+String.fromCharCode(65+index)+'</b>':''}${esc(item.title)}</span></div>`).join('');},
        error:showError
      });
      viewer.setAutorotate($('autorotate').checked);refreshPreview();
    }catch(error){showError(error);}
  }
  $('retry').addEventListener('click',startViewer);
  const initial=materialById(decodeURIComponent(location.hash.slice(1)))||catalogue.materials.find(item=>item.name==='ClumpMud')||catalogue.materials[0];
  setActive(initial.id);startViewer();
  window.addEventListener('hashchange',()=>{const id=decodeURIComponent(location.hash.slice(1));if(id!==active.id&&materialById(id))setActive(id);});
}

init().catch(error=>{showError(error);$('material-list').innerHTML='<p class="empty">资源目录未能读取，请刷新页面重试。</p>';});
