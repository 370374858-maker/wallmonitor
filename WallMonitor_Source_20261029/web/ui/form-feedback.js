                                                                              
                                                                                   
export function inputNameForIssue(key, recordId = null) {
  if (key.startsWith('records.')) {
    const [, id, ...parts] = key.split('.');
    if (id !== recordId) return null;
    key = parts.join('.');
  }
  for (const [prefix, field] of Object.entries({
    measurementPoints: 'point', tremiePulls: 'tremie', jointPulls: 'joint',
    tremieLabels:'label-tremie', tremieInitialDepths: 'initial-tremie', jointInitialDepths: 'initial-joint'
  })) {
    if (key.startsWith(prefix + '.')) return field + '-' + key.slice(prefix.length + 1);
  }
  return key==='tremieLabels'?'label-tremie-0':key;
}

export function clearFieldError(input) {
  if (!input?.dataset?.fieldError) return;
  input.ownerDocument.getElementById(input.dataset.fieldError)?.remove();
  const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== input.dataset.fieldError);
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' ')); else input.removeAttribute('aria-describedby');
  input.removeAttribute('aria-invalid');
  delete input.dataset.fieldError;
}

export function showFieldErrors(form, issues = {}, recordId = null, {focus=true}={}) {
  if (!form) return;
  form.querySelectorAll('[data-field-error]').forEach(clearFieldError);
  let first = null;const marked=new Set();
  for (const [key, message] of Object.entries(issues)) {
    const name = inputNameForIssue(key, recordId), input = name && form.elements.namedItem(name);
    if (!input?.setAttribute||marked.has(name)) continue;
    marked.add(name);
    const id = `field-error-${form.id}-${name}`;
    const description = form.ownerDocument.createElement('span');
    description.id = id; description.className = 'field-error-description'; description.textContent = message;
                                                                              
                                                                            
    form.append(description);
    input.dataset.fieldError = id;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
    first ||= input;
  }
                                                                        
  if(focus)queueMicrotask(() => first?.isConnected && first.focus());
}

export function lockFormControls(form) {
  const controls = [...form.querySelectorAll('input,select,textarea,button')].map(input => [input, input.disabled]);
  controls.forEach(([input]) => { input.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  return () => {
    controls.forEach(([input, disabled]) => { input.disabled = disabled; });
    form.setAttribute('aria-busy', 'false');
  };
}
