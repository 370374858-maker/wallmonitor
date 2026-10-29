export function referenceColors() {
  const css=typeof document==='undefined'?null:getComputedStyle(document.documentElement);
  return {
    theory:css?.getPropertyValue('--data-color').trim()||'#40adff',
    actual:css?.getPropertyValue('--series-secondary').trim()||'#2ce6a0'
  };
}
