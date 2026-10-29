export function syncJointDiameterInput(form, hint) {
  const field = form.elements.namedItem('jointDiameter');
  const layout = form.elements.namedItem('jointLayout').value;
  const configured = ['left', 'right', 'both'].includes(layout);
  const thickness = Number(form.elements.namedItem('thickness').value);
  const hasThickness = Number.isFinite(thickness) && thickness > 0;
  field.disabled = !configured;
  field.required = configured;
  if (hasThickness) field.max = String(thickness); else field.removeAttribute('max');
  field.setCustomValidity(configured && hasThickness && Number(field.value) > thickness
    ? '接头管直径不得超过槽段厚度' : '');
  if (hint) hint.textContent = configured
    ? `须填写实际管径${hasThickness ? `，不超过槽厚 ${thickness} m` : '，不得超过槽段厚度'}；每侧扣减半圆面积`
    : layout === 'none' ? '无接头管，无需填写管径或扣减面积' : '选择接头管位置后填写实际管径';
}
