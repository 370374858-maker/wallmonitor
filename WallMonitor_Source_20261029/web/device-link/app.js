const labels={R30:'混凝土面高度',R32:'混凝土深度',R1:'1# 起拔压力',R2:'1# 起拔深度',R3:'1# 接头管深度',R4:'1# 接头管埋深',R16:'2# 起拔压力',R17:'2# 起拔深度',R18:'2# 接头管深度',R19:'2# 接头管埋深'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const number=value=>value==null?'缺值':String(value);
let busy=false;
async function refresh(){
 if(busy||document.hidden)return;busy=true;
 try{
  const response=await fetch('/api/v2/telemetry/status',{cache:'no-store'});
  if(!response.ok)throw Error(response.status===401?'请先登录平台':'暂时无法读取自动采集状态');
  const {data}=await response.json();const root=document.querySelector('#content'),fragment=document.createDocumentFragment();
  for(const binding of data.bindings){
   const box=el('section',undefined,'binding');box.append(el('h2',binding.slotCode+' · 自动采集联调'));
   const summary=el('div',undefined,'summary');
   const sync=binding.surfaceSync,enabled=sync?.enabled===true;
   summary.append(el('p',`项目 ${binding.project} / 机器 ${binding.machine}`),el('p',enabled?`混凝土深度变化已保存 ${sync.measurementCount.toLocaleString()} 条`:`已保存 ${binding.total.toLocaleString()} 条原始采样`),el('p',binding.mode==='paused'?'采集已暂停':enabled?'混凝土深度：每 2 秒读取，变化才保存':'模式：原始值联调'));
   box.append(summary,el('p',binding.note,'notice'));
   if(enabled){
    const saved=sync.lastSaved;
    box.append(el('p',saved?`最近保存：${saved.depth} m · ${new Date(saved.savedAt).toLocaleString('zh-CN')} · 单测点测量`:'尚无有效深度变化，等待设备数据','notice'));
   }
   const streams=el('div',undefined,'streams');
   for(const [stream,title]of [['DA1','混凝土面'],['DA2','接头管']]){
    const section=el('section',undefined,'stream'),s=binding.latest[stream];section.append(el('h2',title));
    if(!s){section.append(el('p','尚未收到此数据流','muted'));streams.append(section);continue;}
    const millis=s.sourceTimestamp==null?NaN:Number(s.sourceTimestamp)*1000,age=(Date.now()-millis)/1000;
    const state=!Number.isFinite(age)?'源时间缺失':age< -5?'源时间超前，需核对':age>10?'源数据已超过 10 秒未更新':'源接收时间近期有更新';
    section.append(el('p',state,age>=0&&age<=10?'ok':'stale'));
    const table=el('table'),head=el('tr');for(const t of ['字段','原始含义','原始值'])head.append(el('th',t));table.append(head);
    for(const [field,value]of Object.entries(s.values)){const tr=el('tr');tr.append(el('td',field),el('td',labels[field]||field),el('td',number(value)));table.append(tr);}
    section.append(table,el('p','来源表：'+s.sourceTable,'muted'),el('p','源行号：'+s.sourceId,'muted'));
    section.append(el('p','源时间：'+(s.sourceReceivedAt||'缺失')+(stream==='DA1'&&enabled?'（联调时间基准）':'（语义待确认）'),'muted'),el('p',(stream==='DA1'&&enabled?'本次读取：':'平台入库：')+s.platformReceivedAt,'muted'));
    const message=stream==='DA1'&&enabled?`${s.reason}；R32，单位 m，槽口向下测深`:'字段换算已确认；尚未接管正式模型';
    section.append(el('p',(stream==='DA1'&&enabled?message:s.converted.issues.join('；')||message),'notice'));
    streams.append(section);
   }
   box.append(streams);fragment.append(box);
  }
  if(!data.bindings.length)fragment.append(el('p','尚未配置采集绑定'));
  root.replaceChildren(fragment);document.querySelector('#connection').textContent='平台数据库已连接 · 每 3 秒刷新 · '+new Date().toLocaleTimeString('zh-CN');
 }catch(error){document.querySelector('#connection').textContent=error.message;}finally{busy=false;}
}
refresh();setInterval(refresh,3000);document.addEventListener('visibilitychange',refresh);
