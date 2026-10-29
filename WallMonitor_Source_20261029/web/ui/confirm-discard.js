import { dialog } from '../workbench/dialog.js';
import { esc } from '../workbench/format.js';

let pending = false;
                                                                              
                                                                            
export function confirmDiscard(message) {
  if (pending) return Promise.resolve(false);
  pending = true;
  return new Promise(resolve => {
    const previous = document.activeElement;
    const description = String(message ?? '').trim() || '当前修改尚未保存，放弃后将丢失。是否放弃修改？';
    const node = dialog('放弃未保存的修改？', `<p>${esc(description)}</p>`,
      '<button type="button" class="primary-button" data-keep>继续编辑</button><button type="button" class="secondary-button" data-discard>放弃修改</button>');
    node.classList.add('confirmation-dialog');
    const finish = accepted => { node.close(); node.remove(); pending = false; previous?.focus(); resolve(accepted); };
    node.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    node.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-discard')) finish(true);
      else if (button?.hasAttribute('data-keep') || button?.hasAttribute('data-close')) finish(false);
    });
    node.querySelector('[data-keep]').focus();
  });
}
