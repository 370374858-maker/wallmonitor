const form=document.querySelector('form'),fieldset=document.querySelector('fieldset'),message=document.querySelector('#message');
const password=document.querySelector('#password'),show=document.querySelector('#show-password'),logout=document.querySelector('#logout');
const submit=document.querySelector('#submit'),title=document.querySelector('#login-title');
const failureMessage='密码错误或系统正在维护中';
let mode='loading';
show.addEventListener('click',()=>{
  const visible=password.type==='password';password.type=visible?'text':'password';show.textContent=visible?'隐藏':'显示';
  show.setAttribute('aria-pressed',String(visible));show.setAttribute('aria-label',visible?'隐藏密码':'显示密码');
});
async function status(){
  mode='loading';fieldset.disabled=true;submit.disabled=true;logout.hidden=true;
  try{
    const r=await fetch('/auth/status',{cache:'no-store'});if(!r.ok)throw Error('登录服务暂不可用，请刷新重试');
    const s=await r.json();
    if(typeof s.enabled!=='boolean'||typeof s.authenticated!=='boolean')throw Error('登录状态无法识别，请刷新重试');
    mode=s.maintenance?'maintenance':!s.enabled?'preview':s.authenticated?'authenticated':'login';
    fieldset.disabled=mode!=='login';fieldset.hidden=mode==='authenticated';
    submit.disabled=mode==='maintenance';submit.textContent=mode==='maintenance'?'系统维护中':mode==='preview'?'预览平台':mode==='authenticated'?'进入平台':'登录';
    title.textContent=mode==='authenticated'?'已登录':'账号登录';logout.hidden=mode!=='authenticated';
    message.className='';message.textContent=mode==='maintenance'?failureMessage:mode==='preview'?'本地预览 · 未启用登录验证':'';
  }catch(e){message.textContent=failureMessage;message.className='error';}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(mode==='preview'||mode==='authenticated'){location.assign('/dashboard');return;}
  if(mode!=='login'||submit.disabled||!form.reportValidity())return;
  fieldset.disabled=true;submit.disabled=true;message.className='';message.textContent='正在登录…';
  try{
    const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('#username').value,password:password.value,next:new URLSearchParams(location.search).get('next')})});
    const data=await r.json();if(!r.ok)throw Error(failureMessage);
    password.value='';location.replace(data.next||'/dashboard');
  }catch(e){password.value='';message.textContent=failureMessage;message.className='error';fieldset.disabled=false;submit.disabled=false;password.focus();}
});
logout.addEventListener('click',async()=>{
  logout.disabled=true;
  try{const r=await fetch('/auth/logout',{method:'POST'});if(!r.ok)throw Error('退出失败，请重试');password.value='';await status();}
  catch(e){message.textContent=e.message;message.className='error';}
  finally{logout.disabled=false;}
});
status();
