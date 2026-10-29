import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MeshStandardMaterial, BoxGeometry } from 'three';
import { calculateSlot, calculateRecord } from '../shared/construction.js';
import { buildMonitor, timeMs } from '../shared/monitoring.js';
import { renderOverview, renderAlerts, renderPolicy, statusText, pipeSafetyTable } from '../web/monitor/views.js';
import { sceneSpec, PIPE_PRESENTATION, METER_ASSETS } from '../web/models/model-spec.js';
import { tuneSoilMaterial, applyConcreteUV } from '../web/models/model-appearance.js';

const html = readFileSync(new URL('../web/monitor/index.html', import.meta.url), 'utf8');
const slot = calculateSlot({ code:'UI-QA', width:6, depth:200, thickness:1.8, tremieCount:3,
  tremieInitialDepths:[200,200,200], jointLayout:'both', jointInitialDepths:{left:200,right:200} });

test('批注布局：控件归位，无旧工具区、模型侧轨或警灯图', () => {
  assert.doesNotMatch(html, /class="toolbar"|geometry-rail|geometry-plan|surface-readings/);
  assert.match(html.match(/<header class="masthead">[\s\S]*?<\/header>/)[0], /id="fullscreen"/);
  assert.match(html.match(/<article class="panel slot-panel">[\s\S]*?<\/article>/)[0], /id="slot"/);
  const settings = html.slice(html.indexOf('<section id="view-policy"'));
  for (const id of ['refresh','pause','motion']) assert.match(settings, new RegExp(`id="${id}"`));
  assert.match(html, /<b>预警值设置<\/b>/);
  assert.doesNotMatch(html,/screen-footer|source-time|plan-note|宽厚与管径同比例/);
  const css = readFileSync(new URL('../web/monitor/control-room.css', import.meta.url),'utf8');
  assert.match(css, /\.geometry-panel\s*\{[^}]*order:0/);
  assert.match(css, /\.tremie-panel\s*\{\s*min-height:0/);
  for (const [key,label] of [['ok','正常'],['warn','预报'],['danger','预警'],['muted','待判']]) {
    assert.match(statusText({key,label}), new RegExp(label));
    assert.doesNotMatch(statusText({key,label}), /<img|lamp/);
  }
  const app = readFileSync(new URL('../web/monitor/app.js', import.meta.url),'utf8');
  for (const [,id] of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(html.includes(`id="${id}"`), `Missing DOM id: ${id}`);
});

test('管体表六列，接头管分别按实测及理论混凝土面埋深判定', () => {
  const data=buildMonitor(slot,[],timeMs('2026-09-08 11:00'));
  const before=JSON.stringify(data.evaluation),markup=pipeSafetyTable(data.evaluation);
  assert.equal((markup.match(/scope="col"/g)||[]).length,6);
  assert.match(markup,/实测状态/);assert.match(markup,/理论状态/);
  assert.equal((markup.match(/pipe-marker tremie/g)||[]).length,3);
  assert.equal((markup.match(/pipe-marker joint/g)||[]).length,2);
  assert.match(markup,/管底测深减实测混凝土面测深/);assert.match(markup,/管底测深减理论混凝土面测深/);
  assert.doesNotMatch(markup,/初凝|龄期/);
  assert.doesNotMatch(markup,/<td colspan="2" class="pipe-status"><small>初凝<\/small>/);
  const legacy=buildMonitor({...slot,monitoringPolicy:{jointMin:0,jointMax:.5}},[],timeMs('2026-09-08 11:00'));
  assert.equal(legacy.evaluation.policy.jointReference,'actual');
  assert.equal(legacy.evaluation.policy.jointMax,48);
  assert.doesNotMatch(pipeSafetyTable(legacy.evaluation),/<td colspan="2" class="pipe-status"><small>初凝<\/small>/);
  assert.doesNotMatch(markup,/<img|lamp/);
  assert.equal(JSON.stringify(data.evaluation),before);
});

test('完整、空槽及历史数据均可渲染；四统计与文字分级不改业务数据', () => {
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{innerHTML:'',textContent:''}]));
  const previous = globalThis.document;
  globalThis.document = { getElementById(id) { assert.ok(nodes[id], `Missing element: ${id}`); return nodes[id]; } };
  try {
    const result = calculateRecord(slot,{truckNo:1,volume:20,startedAt:'2026-09-07 10:00',endedAt:'2026-09-07 11:00',measurementPoints:Array(6).fill(195),tremiePulls:[2,2,3],jointPulls:{left:2,right:5}});
    const record = {id:'qa',...result.raw,metrics:result.metrics};
    for (const records of [[],[record]]) {
      const data=buildMonitor(slot,records,timeMs('2026-09-08 11:00'));
      const before=JSON.stringify(data);
      renderOverview(data); renderAlerts(data); renderPolicy(data.evaluation.policy);
      assert.equal((nodes.headline.innerHTML.match(/class="headline-card"/g)||[]).length,4);
      assert.match(nodes.headline.innerHTML,/累计浇筑车数/);
      assert.doesNotMatch(nodes.headline.innerHTML,/<p>/, '首页统计卡只保留名称、数字和角标状态');
      assert.match(nodes.headline.innerHTML,/<span class="metric-status"><span class="status-label/);
      assert.ok(!nodes['pipe-rule'], '管体面板不再显示说明性页脚');
      assert.match(nodes['slot-plan'].innerHTML,/data-plan-profile/);
      assert.doesNotMatch(nodes['progress-readings'].innerHTML,/理论面深|实测面深|初凝估计面深/);
      assert.match(nodes['progress-readings'].innerHTML,/理论高度/);
      assert.match(nodes['progress-readings'].innerHTML,/实测高度/);
      assert.doesNotMatch(nodes['pipe-safety'].innerHTML+nodes['action-list'].innerHTML,/<img|lamp-/);
      assert.doesNotMatch(nodes.headline.innerHTML,/<b class="(?:ok|warn|danger)"/);
      assert.equal(JSON.stringify(data),before);
      assert.ok(!nodes['data-status'], '档案不再占用一行显示时效/规则提醒');
      assert.doesNotMatch(nodes['quality-list'].innerHTML, /施工测量已超过|当前为旧版规则试运行/);
      assert.match(nodes['alert-version'].textContent, /默认规则/);
      if(records.length) assert.equal(data.freshness.stale, undefined, '不再包含失效判断');
    }
  } finally { if(previous===undefined) delete globalThis.document; else globalThis.document=previous; }
});

test('12 米土层与双倍示意管节只改展示，不改真实管长或截面积', () => {
  const before=JSON.stringify(slot), spec=sceneSpec(slot);
  assert.ok(Math.abs(spec.soilWidth-12)<1e-8);
  assert.equal(PIPE_PRESENTATION.tremieSections,12);
  assert.ok(spec.pipes.filter(p=>p.kind==='tremie').every(p=>p.instances===12));
  assert.ok(spec.pipes.filter(p=>p.kind==='joint').every(p=>p.instances===2));
  assert.equal(JSON.stringify(slot),before);
});

test('保留旧版七个 GLB 原资源，当前仅加载 C01，旧材质函数不修改原件', () => {
  const root=new URL('../web/assets/models/meter-20260908/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.assets.length,7); assert.deepEqual(Object.keys(METER_ASSETS),['C01']);
  for (const asset of manifest.assets) {
    const b=readFileSync(new URL(asset.file,root));
    assert.equal(createHash('sha256').update(b).digest('hex'),asset.sha256);
    const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
    assert.ok(j.images.every(i=>i.bufferView!==undefined&&!i.uri));
  }
  const source=new MeshStandardMaterial(), clone=source.clone();
  tuneSoilMaterial(clone,'S13'); assert.deepEqual(clone.color.toArray(),[.64,.69,.65]);
  assert.equal(source.color.r,1);
  const g=new BoxGeometry(6,5,1.8); applyConcreteUV(g);
  assert.ok([...g.getAttribute('uv').array].every(Number.isFinite));
  source.dispose(); clone.dispose(); g.dispose();
});
