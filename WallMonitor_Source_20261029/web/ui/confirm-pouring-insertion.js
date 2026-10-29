import {dialog} from '../workbench/dialog.js';
import {esc} from '../workbench/format.js';
export function confirmPouringInsertion(info){
  return new Promise(resolve=>{
    const previous=document.activeElement;
    const node=dialog('插入历史浇筑数据？',`<p>本次开始时间早于已有浇筑的最新结束时间，是否按历史插入处理？</p><p>确认后将检查所有浇筑时段。不重叠时按时间顺序安排为第 ${esc(info.position)} 车，并重排后续车号、重算指标及图表。重叠则不会保存。</p>`,
      '<button type="button" class="secondary-button" data-cancel>继续编辑</button><button type="button" class="primary-button" data-confirm>确认插入</button>');
    node.classList.add('confirmation-dialog');let done=false;
    const finish=value=>{if(done)return;done=true;node.close();node.remove();previous?.focus();resolve(value);};
    node.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
    node.addEventListener('click',e=>{const button=e.target.closest('button');if(button?.hasAttribute('data-confirm'))finish(true);else if(button?.hasAttribute('data-cancel')||button?.hasAttribute('data-close'))finish(false);});
    node.querySelector('[data-cancel]').focus();
  });
}
