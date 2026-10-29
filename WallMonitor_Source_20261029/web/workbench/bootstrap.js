                                                                                       
import('./app.js').catch(error => {
  console.error('施工工作台初始化失败', error);
  const message = '施工页面加载失败，请点击重新加载；若仍失败，请更新 Edge 后重试。';
  if (window.parent !== window) window.parent.postMessage({type:'cw:load-error', message}, location.origin);
  else {
    const notice = document.createElement('p'); notice.setAttribute('role','alert');
    notice.textContent = message; document.body.prepend(notice);
  }
});
