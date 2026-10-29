import {dialog} from '../workbench/dialog.js';
import {esc} from '../workbench/format.js';

let pending=false;
export function requestReason({title='修改原因',message='请输入原因，提交后将保留在修订记录中。',confirmLabel='确认修改',danger=false}={}){
  if(pending)return Promise.resolve(null);
  pending=true;
  return new Promise(resolve=>{
    const previous=document.activeElement;
    const node=dialog(title,`<p>${esc(message)}</p><label class="reason-label">原因（必填）<input data-reason maxlength="500" autocomplete="off" placeholder="请填写具体原因"></label>`,
      `<button type="button" class="secondary-button" data-cancel>取消</button><button type="button" class="${danger?'danger-button':'primary-button'}" data-accept disabled>${esc(confirmLabel)}</button>`);
    node.classList.add('confirmation-dialog');
    const input=node.querySelector('[data-reason]'),accept=node.querySelector('[data-accept]');
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;node.close();node.remove();pending=false;previous?.focus();resolve(value);};
    input.addEventListener('input',()=>{accept.disabled=!input.value.trim();});
    node.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    node.addEventListener('click',event=>{
      const b=event.target.closest('button');
      if(b?.hasAttribute('data-close')||b?.hasAttribute('data-cancel'))finish(null);
      else if(b?.hasAttribute('data-accept')&&input.value.trim())finish(input.value.trim());
    });
    input.focus();
  });
}
