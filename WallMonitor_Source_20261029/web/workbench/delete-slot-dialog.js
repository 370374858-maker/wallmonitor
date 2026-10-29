import {dialog} from './dialog.js';
import {esc} from './format.js';
export function confirmDeleteSlot(code){
  const previous=document.activeElement;
  const node=dialog('永久删除槽段',`<p>将永久删除槽段 <strong>${esc(code)}</strong>，以及该槽段全部浇筑、测量、拔管记录、历史版本、修订日志和设备接收记录。</p><p>删除后不可恢复。请输入 <strong>确认删除</strong>：</p><label class="field">删除确认<input data-delete-phrase autocomplete="off" placeholder="确认删除" aria-label="输入确认删除"></label>`, '<button type="button" class="secondary-button" data-cancel>取消</button><button type="button" class="danger-button" data-delete-confirm disabled>永久删除</button>');
  const input=node.querySelector('[data-delete-phrase]'),button=node.querySelector('[data-delete-confirm]');
  return new Promise(resolve=>{
    let done=false;
    const finish=value=>{if(done)return;done=true;node.close();node.remove();previous?.focus();resolve(value);};
    input.addEventListener('input',()=>{button.disabled=input.value!=='确认删除';});
    button.addEventListener('click',()=>{if(input.value==='确认删除')finish(true);});
    node.querySelector('[data-cancel]').addEventListener('click',()=>finish(false));
    node.querySelector('[data-close]').addEventListener('click',()=>finish(false));
    node.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    node.addEventListener('close',()=>finish(false));
    input.focus();
  });
}
