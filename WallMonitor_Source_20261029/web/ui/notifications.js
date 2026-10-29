const TONES = new Set(['success', 'info', 'warning', 'error']);
const controllers = new WeakMap();

export function normalizeNotificationTone(value = 'info') {
  const tone = String(value || 'info').toLowerCase();
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'danger') return 'error';
  return TONES.has(tone) ? tone : 'info';
}

export function notificationDuration(tone, duration) {
  if (Number.isFinite(duration)) return Math.max(0, duration);
  return normalizeNotificationTone(tone) === 'error' ? 8000 :
    normalizeNotificationTone(tone) === 'success' ? 4500 : 7000;
}

                                                                             
                                                                                 
export function bindValidationNotifications(root, controller) {
  let pending = [], scheduled = false;
  root.addEventListener('invalid', event => {
    event.preventDefault();
    const input = event.target;
    input.setAttribute('aria-invalid', 'true');
    input.dataset.noticeInvalid = 'true';
    const label = input.labels?.[0]?.textContent?.trim() || input.name || '输入内容';
    pending.push({input,message:`${label}：${input.validationMessage || '请检查输入值'}`});
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      const errors = pending; pending = []; scheduled = false;
      const modalTarget = errors[0]?.input.closest?.('dialog')?.querySelector('[data-dialog-notice]');
      const surface = modalTarget ? createNotificationController(modalTarget) : controller;
      surface.show([...new Set(errors.map(error => error.message))].join('\n'), {tone:'error'});
      errors[0]?.input.focus();
    });
  }, true);
  root.addEventListener('input', event => {
    if (!event.target.dataset?.noticeInvalid) return;
    event.target.removeAttribute('aria-invalid');
    delete event.target.dataset.noticeInvalid;
  });
}

                                                                                  
export function createNotificationController(target, options = {}) {
  if (!target) throw new TypeError('Notification target is required');
  if (controllers.has(target)) return controllers.get(target);
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  let timer = null;
  let activeTone = '';

  function dismiss() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    activeTone = '';
    target.hidden = true;
    target.replaceChildren();
  }

  function show(message, { tone = 'info', duration, dismissible = true } = {}) {
    const text = String(message || '').trim();
    if (!text) { dismiss(); return; }
    if (timer !== null) clearTimer(timer);
    timer = null;
    activeTone = normalizeNotificationTone(tone);

    const document = target.ownerDocument;
    const copy = document.createElement('span');
    copy.className = 'app-notice__message';
    copy.textContent = text;
    target.replaceChildren(copy);
    if (dismissible) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'app-notice__close';
      close.setAttribute('aria-label', '关闭提示');
      close.textContent = '×';
      target.append(close);
    }
    target.className = `notice app-notice app-notice--${activeTone} ${activeTone}`;
    target.setAttribute('role', activeTone === 'error' ? 'alert' : 'status');
    target.setAttribute('aria-live', activeTone === 'error' ? 'assertive' : 'polite');
    target.setAttribute('aria-atomic', 'true');
    target.hidden = false;

    const lifetime = notificationDuration(activeTone, duration);
    if (lifetime > 0) timer = setTimer(dismiss, lifetime);
  }

  target.addEventListener('click', event => {
    if (event.target.closest('.app-notice__close,[data-dismiss-notice]')) dismiss();
  });
  const controller = { show, dismiss, get tone() { return activeTone; } };
  controllers.set(target, controller);
  return controller;
}
