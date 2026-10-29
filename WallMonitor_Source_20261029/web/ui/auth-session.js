                                                                                    
function showLoginNotice(){
  if(window.parent!==window){window.parent.dispatchEvent(new Event('cw:auth-required'));return;}
  if(document.querySelector('.auth-session-notice'))return;
  const notice=document.createElement('aside');notice.className='auth-session-notice';notice.setAttribute('role','alert');
  notice.innerHTML='<span>登录已失效，当前填写内容仍保留。</span><a href="/login" target="_blank" rel="noopener">重新登录</a><button type="button" aria-label="关闭登录提示">×</button>';
  notice.querySelector('button').onclick=()=>notice.remove();document.body.append(notice);
}
window.addEventListener('cw:auth-required',showLoginNotice);
async function update(){
  try{
    const response=await fetch('/auth/status',{cache:'no-store'});if(!response.ok)return;
    const state=await response.json();if(!state.enabled)return;
    if(state.authenticated)document.querySelector('.auth-session-notice')?.remove();
    else showLoginNotice();
    const header=document.querySelector('.header-right');
    if(header&&!header.querySelector('.auth-account')){
      const link=document.createElement('a');link.className='auth-account';link.href='/login';link.target='_blank';link.rel='noopener';link.title='登录管理 / 退出登录';link.setAttribute('aria-label','登录管理');
      link.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
      header.append(link);
    }
  }catch{                                                             }
}
window.addEventListener('focus',update);update();
