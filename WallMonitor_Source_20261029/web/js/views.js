import { api } from './api.js';
import { config, saveConfig } from './config.js';
import { $, $$, escapeHtml, fixed, levelLabel, timeText } from './format.js';
import { lampMarkup } from './lamps.js';
import { pipeStatus } from './rules.js';

let context;

export function initViews(options) {
  context = options;
}

export async function activateView(view) {
  const dashboard = $('#view-dashboard');
  const workspace = $('#view-workspace');
  if (view === 'dashboard') {
    dashboard.hidden = false;
    dashboard.classList.add('active');
    dashboard.setAttribute('aria-hidden','false');
    workspace.hidden = true;
    workspace.classList.remove('active');
    workspace.setAttribute('aria-hidden','true');
    requestAnimationFrame(() => window.dispatchEvent(new Event('dashboard-visible')));
    return;
  }
  dashboard.hidden = true;
  dashboard.classList.remove('active');
  dashboard.setAttribute('aria-hidden','true');
  workspace.hidden = false;
  workspace.classList.add('active');
  workspace.setAttribute('aria-hidden','false');
  $('#workspace-slot').textContent = context.getSlotId() || '—';
  if (view === 'data') renderDataView();
  if (view === 'slot') renderSlotView();
  if (view === 'settings') renderSettingsView();
  if (view === 'warnings') await renderWarningView();
}

function setTitle(title,subtitle) {
  $('#workspace-title').textContent = title;
  $('#workspace-subtitle').textContent = subtitle;
}

function renderDataView() {
  setTitle('施工数据','CONSTRUCTION DATA');
  $('#workspace-body').innerHTML =
    '<div class="workspace-toolbar">'+
      '<div class="workspace-tabs">'+
        '<button class="workspace-tab active" data-table="pouring">浇筑记录</button>'+
        '<button class="workspace-tab" data-table="measurement">测量记录</button>'+
        '<button class="workspace-tab" data-table="pipe">管体记录</button>'+
      '</div>'+
      '<div><button class="quiet-button" id="new-record-button">新增记录</button></div>'+
    '</div>'+
    '<div id="record-form-host"></div>'+
    '<div id="data-table-host"></div>';
  renderDataTable('pouring');
  $$('.workspace-tab').forEach((button) => {
    button.addEventListener('click',() => {
      $$('.workspace-tab').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderDataTable(button.dataset.table);
    });
  });
  $('#new-record-button').addEventListener('click',renderRecordForm);
}

function renderDataTable(type) {
  const data = context.getData();
  const host = $('#data-table-host');
  if (type === 'pouring') {
    const rows = data.history?.pouring || [];
    host.innerHTML =
      '<table class="data-table"><thead><tr><th>槽号</th><th>车号</th><th>本车方量 / m³</th><th>速度 / m·h⁻¹</th><th>理论高度 / m</th><th>浇筑结束</th><th>累计方量 / m³</th></tr></thead><tbody>'+
      rows.map((row) => '<tr><td>'+escapeHtml(data.id)+'</td><td class="num">'+escapeHtml(row.truckNo)+'</td><td class="num">'+fixed(row.concreteVolume,1)+'</td><td class="num">'+fixed(row.speed)+'</td><td class="num">'+fixed(row.theoreticalHeight)+'</td><td>'+escapeHtml(timeText(row.endedAt))+'</td><td class="num">'+fixed(row.cumulativeVolume,1)+'</td></tr>').join('')+
      '</tbody></table>';
    return;
  }
  if (type === 'measurement') {
    const rows = data.history?.measurement || [];
    host.innerHTML =
      '<table class="data-table"><thead><tr><th>槽号</th><th>序号</th><th>测点1</th><th>测点2</th><th>测点3</th><th>测点4</th><th>测点5</th><th>测点6</th><th>实际高度 / m</th><th>测量时间</th><th>速度</th></tr></thead><tbody>'+
      rows.map((row) => '<tr><td>'+escapeHtml(data.id)+'</td><td class="num">'+escapeHtml(row.sequenceNo)+'</td><td class="num">'+fixed(row.point1)+'</td><td class="num">'+fixed(row.point2)+'</td><td class="num">'+fixed(row.point3)+'</td><td class="num">'+fixed(row.point4)+'</td><td class="num">'+fixed(row.point5)+'</td><td class="num">'+fixed(row.point6)+'</td><td class="num">'+fixed(row.actualHeight)+'</td><td>'+escapeHtml(timeText(row.measuredAt))+'</td><td class="num">'+fixed(row.speed)+'</td></tr>').join('')+
      '</tbody></table>';
    return;
  }
  host.innerHTML =
    '<table class="data-table"><thead><tr><th>槽号</th><th>管体</th><th>类别</th><th>当前深度 / m</th><th>关键差值 / m</th><th>规则判定</th><th>最近更新</th></tr></thead><tbody>'+
    data.pipes.map((pipe) => {
      const status = pipe.status || pipeStatus(pipe);
      return '<tr><td>'+escapeHtml(data.id)+'</td><td>'+escapeHtml(pipe.name)+'</td><td>'+(pipe.kind === 'joint' ? '接头管' : '浇筑管')+'</td><td class="num">'+fixed(pipe.depth)+'</td><td class="num">'+fixed(pipe.diff)+'</td><td>'+lampMarkup(status.key,status.label,'compact')+'</td><td>'+escapeHtml(data.pressure.time)+'</td></tr>';
    }).join('')+
    '</tbody></table>';
}

const recordSchemas = {
  pouring:{
    label:'浇筑记录',
    fields:[
      ['truckNo','车号','number'],['concreteVolume','本车方量 / m³','number'],
      ['currentHeight','本次高度 / m','number'],['theoreticalHeight','理论高度 / m','number'],
      ['speed','理论速度 / m·h⁻¹','number'],['startedAt','开始时间','datetime-local'],
      ['endedAt','结束时间','datetime-local'],['cumulativeVolume','实际累计方量 / m³','number']
    ]
  },
  measurement:{
    label:'测量记录',
    fields:[
      ['sequenceNo','序号','number'],['point1','测点1 / m','number'],['point2','测点2 / m','number'],
      ['point3','测点3 / m','number'],['point4','测点4 / m','number'],['point5','测点5 / m','number'],
      ['point6','测点6 / m','number'],['actualHeight','实际高度 / m','number'],
      ['measuredAt','测量时间','datetime-local'],['speed','实际速度 / m·h⁻¹','number'],
      ['theoreticalCumulativeVolume','理论累计方量 / m³','number']
    ]
  },
  tremie:{
    label:'浇筑管记录',
    fields:[['sequenceNo','序号','number'],['pipe1','管1深度 / m','number'],['pipe2','管2深度 / m','number'],['pipe3','管3深度 / m','number'],['pulledAt','拔管时间','datetime-local']]
  },
  joint:{
    label:'接头管记录',
    fields:[['sequenceNo','序号','number'],['pipe1','管1深度 / m','number'],['pipe2','管2深度 / m','number'],['pulledAt','拔管时间','datetime-local']]
  },
  pressure:{
    label:'泵压记录',
    fields:[['value','压力 / MPa','number'],['measuredAt','测量时间','datetime-local']]
  }
};

function renderRecordForm() {
  const host = $('#record-form-host');
  host.innerHTML =
    '<form id="record-form" class="form-grid" style="margin-bottom:22px">'+
      '<div class="form-section">新增施工记录 · '+escapeHtml(context.getSlotId())+'</div>'+
      '<div class="form-field"><label>记录类型</label><select id="record-type">'+
        Object.entries(recordSchemas).map(([key,schema]) => '<option value="'+key+'">'+schema.label+'</option>').join('')+
      '</select></div>'+
      '<div id="record-fields" style="grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:18px"></div>'+
      '<div class="form-actions"><button type="button" class="quiet-button" id="record-cancel">取消</button><button class="primary-button" type="submit">保存记录</button></div>'+
    '</form>';
  const drawFields = () => {
    const schema = recordSchemas[$('#record-type').value];
    $('#record-fields').innerHTML = schema.fields.map(([name,label,type]) =>
      '<div class="form-field"><label>'+label+'</label><input name="'+name+'" type="'+type+'" '+(type === 'number' ? 'step="0.01"' : '')+' required></div>'
    ).join('');
  };
  $('#record-type').addEventListener('change',drawFields);
  drawFields();
  $('#record-cancel').addEventListener('click',() => { host.innerHTML = ''; });
  $('#record-form').addEventListener('submit',async (event) => {
    event.preventDefault();
    const type = $('#record-type').value;
    const schema = recordSchemas[type];
    const form = new FormData(event.currentTarget);
    const values = {};
    schema.fields.forEach(([name,,fieldType]) => {
      const value = form.get(name);
      values[name] = fieldType === 'number' ? Number(value) : String(value).replace('T',' ');
    });
    try {
      await api.addRecord(context.getSlotId(),type,values);
      context.showToast('记录已写入数据库');
      host.innerHTML = '';
      await context.refresh();
      renderDataView();
    } catch (error) {
      context.showToast(error.message);
    }
  });
}

async function renderWarningView(filter = 'all') {
  setTitle('预警中心','WARNING CENTER');
  $('#workspace-body').innerHTML = '<div class="error-card"><div><b>正在加载</b><span>读取全部槽段事件</span></div></div>';
  try {
    const alerts = await api.alerts();
    const visibleAlerts = alerts.filter((alert) => filter === 'all' || (filter === 'open' ? alert.status === 'open' : alert.status !== 'open'));
    const counts = alerts.reduce((result,alert) => {
      const key = alert.level === 'danger' ? 'danger' : alert.level === 'warn' ? 'warn' : alert.level === 'ok' ? 'ok' : 'muted';
      result[key] += 1;
      return result;
    },{danger:0,warn:0,ok:0,muted:0});
    $('#workspace-body').innerHTML =
      '<div class="workspace-toolbar"><div class="workspace-tabs"><button class="workspace-tab '+(filter === 'all' ? 'active' : '')+'" data-warning-filter="all">全部事件</button><button class="workspace-tab '+(filter === 'open' ? 'active' : '')+'" data-warning-filter="open">未闭环</button><button class="workspace-tab '+(filter === 'closed' ? 'active' : '')+'" data-warning-filter="closed">已处置</button></div><div class="warning-summary">'+lampMarkup('danger','告警 '+counts.danger,'mini')+lampMarkup('warn','关注 '+counts.warn,'mini')+lampMarkup('ok','正常 '+counts.ok,'mini')+lampMarkup('muted','记录 '+counts.muted,'mini')+'<span class="status-chip '+(api.mode === 'api' ? 'ok' : 'warn')+'">'+(api.mode === 'api' ? '数据库实时数据' : '演示数据')+'</span></div></div>'+
      '<table class="data-table"><thead><tr><th>级别</th><th>槽号</th><th>时间</th><th>事件描述</th><th>测值</th><th>状态 / 操作</th></tr></thead><tbody>'+
      visibleAlerts.map((alert) => {
        const level = alert.level || alert.severity;
        const description = alert.desc || alert.description || alert.message;
        const date = alert.time || alert.occurredAt;
        const value = alert.value === null || alert.value === undefined ? '—' : alert.value+(alert.unit ? ' '+alert.unit : '');
        const isOpen = alert.status === 'open';
        return '<tr><td>'+lampMarkup(level,levelLabel(level),'compact')+'</td><td>'+escapeHtml(alert.slotId || context.getSlotId())+'</td><td>'+escapeHtml(timeText(date))+'</td><td>'+escapeHtml(description)+'</td><td class="num">'+escapeHtml(value)+'</td><td>'+(isOpen ? '<button class="quiet-button acknowledge-button" data-alert-id="'+alert.id+'">确认</button>' : '<span class="status-chip ok">已处置</span>')+'</td></tr>';
      }).join('')+
      '</tbody></table>';
    $$('[data-warning-filter]').forEach((button) => {
      button.addEventListener('click',() => renderWarningView(button.dataset.warningFilter));
    });
    $$('.acknowledge-button').forEach((button) => {
      button.addEventListener('click',async () => {
        await api.acknowledgeAlert(button.dataset.alertId);
        context.showToast('预警已确认');
        await renderWarningView(filter);
      });
    });
  } catch (error) {
    $('#workspace-body').innerHTML = '<div class="error-card"><div><b>预警读取失败</b><span>'+escapeHtml(error.message)+'</span></div></div>';
  }
}

function renderSlotView() {
  const data = context.getData();
  const profile = data.profile;
  setTitle('槽段参数','SLOT PARAMETER SETTING');
  $('#workspace-body').innerHTML =
    '<form id="slot-form" class="form-grid">'+
      '<div class="form-section">基础参数 · '+escapeHtml(data.id)+'</div>'+
      '<div class="form-field"><label>槽号</label><input value="'+escapeHtml(data.id)+'" disabled></div>'+
      '<div class="form-field"><label>施工类型</label><select name="type"><option>三管法</option><option>双管法</option><option>单管法</option></select></div>'+
      '<div class="form-field"><label>设计深度 / m</label><input name="depth" type="number" step=".1" value="'+profile.depth+'"></div>'+
      '<div class="form-field"><label>槽段宽度 / m</label><input name="width" type="number" step=".1" value="'+profile.width+'"></div>'+
      '<div class="form-field"><label>墙体厚度 / m</label><input name="thickness" type="number" step=".1" value="'+profile.thickness+'"></div>'+
      '<div class="form-field"><label>槽段类别</label><input name="category" value="'+escapeHtml(profile.category || '标准槽段')+'"></div>'+
      '<div class="form-field"><label>浇筑管数量</label><input name="tremieCount" type="number" min="1" max="3" value="'+profile.tremieCount+'"></div>'+
      '<div class="form-field"><label>接头管数量</label><input name="jointCount" type="number" min="0" max="2" value="'+profile.jointCount+'"></div>'+
      '<div class="form-field"><label>施工状态</label><select name="status"><option>待施工</option><option>浇筑中</option><option>重点关注</option><option>已完成</option><option>已停工</option></select></div>'+
      '<div class="form-actions"><button type="button" id="slot-reset" class="quiet-button">恢复原值</button><button class="primary-button" type="submit">保存参数</button></div>'+
    '</form>';
  $('[name="type"]').value = profile.type;
  $('[name="status"]').value = data.status;
  $('#slot-reset').addEventListener('click',renderSlotView);
  $('#slot-form').addEventListener('submit',async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      type:form.get('type'),
      category:form.get('category'),
      depth:Number(form.get('depth')),
      width:Number(form.get('width')),
      thickness:Number(form.get('thickness')),
      tremieCount:Number(form.get('tremieCount')),
      jointCount:Number(form.get('jointCount')),
      status:form.get('status')
    };
    try {
      await api.updateSlot(data.id,values);
      context.showToast(api.mode === 'api' ? '槽段参数已写入数据库' : '演示参数已更新');
      await context.refresh();
      renderSlotView();
    } catch (error) {
      context.showToast(error.message);
    }
  });
}

function renderSettingsView() {
  setTitle('系统设置','SYSTEM SETTINGS');
  $('#workspace-body').innerHTML =
    '<div class="settings-card"><h3>数据接口</h3><p>页面优先访问同源 REST API；接口不可用时可切换到内置演示数据。</p>'+
      '<div class="form-grid"><div class="form-field"><label>API 基地址</label><input id="setting-api" value="'+escapeHtml(config.apiBase)+'"></div><div class="form-field"><label>自动刷新间隔 / 秒</label><input id="setting-refresh" type="number" min="5" value="'+config.refreshMs/1000+'"></div><div class="form-field"><label>API 断开时</label><select id="setting-fallback"><option value="true">显示演示数据</option><option value="false">显示连接错误</option></select></div></div></div>'+
    '<div class="settings-card"><h3>数据库安全边界</h3><div class="api-notice">网页只访问 REST API。MySQL 地址、账号、密码和 SQL 均保留在 server 层，并通过 .env 注入，避免在浏览器中泄露数据库凭据。</div></div>'+
    '<div class="settings-card"><h3>当前运行状态</h3><p>数据模式：<span class="status-chip '+(api.mode === 'api' ? 'ok' : 'warn')+'">'+(api.mode === 'api' ? 'MySQL / REST API' : 'Mock 演示数据')+'</span></p></div>'+
    '<div class="form-actions"><button id="save-settings" class="primary-button">应用设置</button></div>';
  $('#setting-fallback').value = String(config.fallbackToMock);
  $('#save-settings').addEventListener('click',async () => {
    saveConfig({
      apiBase:$('#setting-api').value.trim() || '/api',
      refreshMs:Math.max(5000,Number($('#setting-refresh').value)*1000),
      fallbackToMock:$('#setting-fallback').value === 'true'
    });
    context.showToast('设置已保存');
    await context.refresh();
    renderSettingsView();
  });
}
