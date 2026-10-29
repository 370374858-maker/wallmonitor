import { escapeHtml } from './format.js';

const assets = {
  ok:'./assets/legacy/lamp-green.png',
  warn:'./assets/legacy/lamp-amber.png',
  danger:'./assets/legacy/lamp-red.png',
  muted:'./assets/legacy/lamp-muted.png'
};

export function lampKey(key) {
  return key === 'danger' ? 'danger' : key === 'warn' ? 'warn' : key === 'ok' ? 'ok' : 'muted';
}

export function lampMarkup(key,label,size = '') {
  const normalized = lampKey(key);
  return '<span class="lamp-state '+normalized+(size ? ' '+size : '')+'">'+
    '<img src="'+assets[normalized]+'" alt="" aria-hidden="true">'+
    '<span>'+escapeHtml(label)+'</span>'+
  '</span>';
}
