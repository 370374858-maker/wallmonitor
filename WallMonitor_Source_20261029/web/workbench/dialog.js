import { esc } from './format.js';
import { createNotificationController } from '../ui/notifications.js';

const notices = new WeakMap();
export function showDialogNotice(node, message, tone = 'error') {
  let controller = notices.get(node);
  if (!controller) {
    controller = createNotificationController(node.querySelector('[data-dialog-notice]'));
    notices.set(node, controller);
  }
  controller.show(message, { tone });
}

export function dialog(title, body, footer) {
  const node = document.createElement('dialog');
  node.className = 'revision-dialog';
  node.setAttribute('aria-label', title);
  node.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" data-close aria-label="关闭">×</button></header><div class="revision-body">${body}</div><div data-dialog-notice hidden></div><footer>${footer}</footer>`;
  document.body.append(node); node.showModal();
  return node;
}
