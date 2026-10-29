import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {modelFailureMessage} from '../web/models/model-errors.js';
const css=readFileSync(new URL('../web/ui/activity.css',import.meta.url),'utf8');

test('仅首次加载显示居中旋转圈，后台更新不覆盖已有画面',()=>{
  assert.doesNotMatch(css,/content:'模型更新中'/);
  assert.match(css,/not\(\[data-status=error\]\):not\(\[data-status=ready\]\)::before\{[^}]*left:50%;top:50%[^}]*border:0[^}]*background:#0b294180[^}]*pointer-events:none/);
  assert.doesNotMatch(css,/scene-viewport[^{}]*data-updating[^{}]*::(?:before|after)/);
  assert.match(css,/::after\{[^}]*left:50%;top:50%[^}]*border-radius:50%[^}]*animation:activity-spin \.85s linear infinite/);
  assert.match(css,/not\(\[data-status=ready\]\):not\(\[data-status=error\]\)>\.scene-message\{background:transparent;font-size:0/);
});

test('初次加载保持画布隐藏，完整资源就绪后才创建渲染器',()=>{
  const renderer=readFileSync(new URL('../web/models/scene-renderer.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/createPreviewAssets|detailsStarted|first-stage/);
  assert.ok(renderer.indexOf('const assets=await loadAssets()')<renderer.indexOf('new THREE.WebGLRenderer'));
  assert.match(css,/not\(\[data-status=ready\]\)>canvas[^}]*visibility:hidden/);
});

test('资源、脚本、WebGL 和其他初始化错误给出不同提示，不能把资源失败误判为显卡问题',()=>{
  const asset=modelFailureMessage({code:'MODEL_ASSET',asset:'S13'},'initialization');
  assert.match(asset,/资源加载失败（S13）/);assert.doesNotMatch(asset,/WebGL|显卡/);
  assert.match(modelFailureMessage({code:'MODEL_WEBGL'},'initialization'),/图形加速/);
  assert.match(modelFailureMessage(new Error('Failed to fetch'),'script'),/脚本加载失败/);
  assert.match(modelFailureMessage(new Error('unknown'),'initialization'),/初始化失败/);
});
test('减少动态效果时暂停转圈，错误提示不被加载态样式覆盖',()=>{
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.scene-viewport::after\{animation:none!important/);
  const scene=readFileSync(new URL('../web/models/model-scene.js',import.meta.url),'utf8');
  assert.match(scene,/dataset.status = 'error'/);
  assert.match(scene,/scene-message'\).textContent = modelFailureMessage/);
});
