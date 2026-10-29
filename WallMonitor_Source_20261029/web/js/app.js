import { api } from './api.js';
import { config } from './config.js';
import { initCharts, updateCharts } from './charts.js';
import { activateView, initViews } from './views.js';
import { $, $$, animateNumber, escapeHtml, fixed, levelLabel } from './format.js';
import { lampMarkup } from './lamps.js';
import { fillStatus, healthFrom, pipeStatus, speedStatus } from './rules.js';
import { updateTrench } from './trench.js';

const state = {
  slotId:null,
  data:null,
  paused:false,
  refreshing:false,
  lastUpdated:0,
  speedMode:'both',
  alarmOffset:0,
  activeView:'dashboard',
  toastTimer:null
};

function fitScreen() {
  const scale = Math.min(innerWidth/1920,innerHeight/1080);
  $('#screen').style.transform = 'scale('+scale+') translate(-50%, -50%)';
}

function updateClock() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2,'0');
  $('#clock').innerHTML =
    pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds())+
    '<small>'+now.getFullYear()+'年'+pad(now.getMonth()+1)+'月'+pad(now.getDate())+'日 · 星期'+'日一二三四五六'[now.getDay()]+'</small>';
}

function updateFreshness() {
  if (state.paused) {
    $('#freshness').textContent = '自动刷新已暂停';
    return;
  }
  if (!state.lastUpdated) {
    $('#freshness').textContent = '正在读取数据';
    return;
  }
  const seconds = Math.floor((Date.now()-state.lastUpdated)/1000);
  $('#freshness').textContent = '数据于 '+seconds+' 秒前更新';
}

function setConnectionState(ok,message,mode) {
  const element = $('#system-state');
  element.className = 'system-state'+(ok ? mode === 'mock' ? ' mock' : '' : ' error');
  $('b',element).textContent = message;
}

function renderProfile(data) {
  $('#profile-type').textContent = data.profile.type;
  $('#profile-depth').textContent = fixed(data.profile.depth,1);
  $('#profile-width').textContent = fixed(data.profile.width,1);
  $('#profile-thickness').textContent = fixed(data.profile.thickness,1);
  $('#profile-tremie').textContent = data.profile.tremieCount+' 根';
  $('#profile-joint').textContent = data.profile.jointCount+' 根';
  $('#profile-start').textContent = '开浇 '+String(data.profile.start || '—').slice(5,16);
  $('#profile-duration').textContent = data.profile.duration === '实时统计' ? '实时统计' : '持续 '+data.profile.duration;
  $('#slot-state').textContent = data.status;
  const health = healthFrom(data);
  const color = health.state === 'danger' ? '#ff5f5f' : health.state === 'warn' ? '#ffb84d' : '#00f2a9';
  $('#slot-state').style.color = color;
  $('#slot-state').style.background = health.state === 'danger' ? 'rgba(255,95,95,.1)' : health.state === 'warn' ? 'rgba(255,184,77,.1)' : 'rgba(0,242,169,.1)';
}

function renderKpis(data) {
  const theoryPercent = data.progress.theory/data.profile.depth*100;
  const actualPercent = data.progress.actual/data.profile.depth*100;
  const fill = data.concrete.fillCoefficient ?? (data.concrete.theory ? data.concrete.actual/data.concrete.theory : 0);
  const fillState = data.concrete.status || fillStatus(fill);
  animateNumber($('#kpi-theory'),theoryPercent,1);
  animateNumber($('#kpi-actual'),actualPercent,1);
  animateNumber($('#kpi-volume'),data.concrete.actual,1);
  animateNumber($('#kpi-fill'),fill,2);
  animateNumber($('#kpi-pressure'),data.pressure.value,2);
  $('#kpi-theory-sub').textContent = fixed(data.progress.theory)+' / '+fixed(data.profile.depth)+' m';
  $('#kpi-actual-sub').textContent = fixed(data.progress.actual)+' / '+fixed(data.profile.depth)+' m';
  $('#kpi-volume-sub').textContent = '理论 '+fixed(data.concrete.theory,1)+' m³';
  $('#kpi-fill-sub').textContent = fillState.label+' · 正常 1.00–1.20';
  $('#kpi-fill-sub').className = fillState.key;
  $('#kpi-pressure-sub').textContent = '采集时间 '+data.pressure.time;
}

function renderProgress(data) {
  $('#progress-theory').textContent = fixed(data.progress.theory)+' m';
  $('#progress-actual').textContent = fixed(data.progress.actual)+' m';
  $('#progress-curing').textContent = fixed(data.progress.curing)+' m';
  const status = data.speed.status || speedStatus(data.speed.actual);
  $('#progress-note').textContent = '实测速度 '+fixed(data.speed.actual)+' m/h · '+status.label;
}

function renderPipeTable(data) {
  $('#pipe-table-body').innerHTML = data.pipes.map((pipe) => {
    const status = pipe.status || pipeStatus(pipe);
    return '<tr>'+
      '<td><span class="pipe-name"><i class="pipe-symbol '+(pipe.kind === 'joint' ? 'joint' : '')+'"></i>'+escapeHtml(pipe.name)+'</span></td>'+
      '<td>'+fixed(pipe.depth)+' m</td>'+
      '<td>'+fixed(pipe.diff)+' m</td>'+
      '<td>'+lampMarkup(status.key,status.label,'compact')+'</td>'+
    '</tr>';
  }).join('');
}

function renderHealth(data) {
  const health = healthFrom(data);
  const color = health.state === 'danger' ? '#ff5f5f' : health.state === 'warn' ? '#ffb84d' : '#00f2a9';
  const ring = $('#health-score');
  $('b',ring).innerHTML = health.score+'<small>分</small>';
  $('b',ring).style.color = color;
  ring.style.background = 'radial-gradient(circle,#0b234d 52%,transparent 53%),conic-gradient('+color+' 0 '+health.score+'%,rgba(107,147,184,.15) '+health.score+'% 100%)';
  $('#health-state').textContent = health.label;
  $('#health-state').className = health.state;
  $('#health-alarm').textContent = (health.danger+health.warn)+' 项';
  $('#health-alarm').className = health.state;
  $('#health-data').textContent = fixed(data.quality.dataIntegrity,1)+'%';
  $('#health-data').className = data.quality.dataIntegrity >= 99 ? 'ok' : data.quality.dataIntegrity >= 95 ? 'warn' : 'danger';
}

function renderEvents(data) {
  const openCount = data.alarms.filter((alarm) => alarm.status === 'open').length;
  $('#alarm-count').textContent = openCount+' 条未闭环';
  const rows = data.alarms.map((alarm) =>
    '<li>'+
      '<span>'+lampMarkup(alarm.level,levelLabel(alarm.level),'mini')+'</span>'+
      '<time>'+escapeHtml(alarm.time)+'</time>'+
      '<span class="event-description" title="'+escapeHtml(alarm.desc)+'">'+escapeHtml(alarm.desc)+'</span>'+
      '<span class="event-value">'+escapeHtml(alarm.value)+'</span>'+
    '</li>'
  ).join('');
  $('#alarm-list').innerHTML = rows+rows;
  state.alarmOffset = 0;
  $('#alarm-list').style.transform = 'translateY(0)';
}

function render(data) {
  state.data = data;
  renderProfile(data);
  renderKpis(data);
  renderProgress(data);
  renderPipeTable(data);
  renderHealth(data);
  renderEvents(data);
  updateTrench(data);
  updateCharts(data,state.speedMode);
}

async function refresh(manual = false) {
  if (!state.slotId || state.refreshing) return;
  state.refreshing = true;
  if (manual) $('#refresh-button').classList.add('spin');
  try {
    const data = await api.snapshot(state.slotId);
    render(data);
    state.lastUpdated = Date.now();
    setConnectionState(true,api.mode === 'api' ? 'MySQL 实时在线' : '演示数据在线',api.mode);
    if (manual) showToast('槽段 '+state.slotId+' 数据已刷新');
  } catch (error) {
    setConnectionState(false,'数据接口异常','error');
    showToast(error.message);
  } finally {
    state.refreshing = false;
    updateFreshness();
    setTimeout(() => $('#refresh-button').classList.remove('spin'),350);
  }
}

async function initSlots() {
  const slots = await api.listSlots();
  if (!slots.length) throw new Error('数据库中没有槽段数据');
  $('#slot-select').innerHTML = slots.map((slot) => '<option value="'+escapeHtml(slot.id)+'">'+escapeHtml(slot.id)+' 槽段</option>').join('');
  state.slotId = slots[0].id;
  $('#slot-select').value = state.slotId;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'),2200);
}

function bindEvents() {
  window.addEventListener('resize',fitScreen);
  $('#slot-select').addEventListener('change',async (event) => {
    state.slotId = event.target.value;
    await refresh();
    if (state.activeView !== 'dashboard') await activateView(state.activeView);
  });
  $('#refresh-button').addEventListener('click',async () => {
    await refresh(true);
    if (state.activeView !== 'dashboard') await activateView(state.activeView);
  });
  $('#pause-button').addEventListener('click',() => {
    state.paused = !state.paused;
    $('#pause-button').textContent = state.paused ? '恢复刷新' : '暂停刷新';
    updateFreshness();
    showToast(state.paused ? '自动刷新已暂停' : '自动刷新已恢复');
  });
  $('#fullscreen-button').addEventListener('click',async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      showToast('浏览器未允许全屏');
    }
  });
  $$('.nav-button').forEach((button) => {
    button.addEventListener('click',async () => {
      $$('.nav-button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.activeView = button.dataset.view;
      await activateView(state.activeView);
    });
  });
  $$('[data-speed]').forEach((button) => {
    button.addEventListener('click',() => {
      $$('[data-speed]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.speedMode = button.dataset.speed;
      if (state.data) updateCharts(state.data,state.speedMode);
    });
  });
}

function runTimers() {
  setInterval(updateClock,1000);
  setInterval(updateFreshness,1000);
  setInterval(() => {
    if (!state.paused && state.lastUpdated && Date.now()-state.lastUpdated >= config.refreshMs) refresh();
  },1000);
  setInterval(() => {
    const list = $('#alarm-list');
    if (document.hidden || !list || !list.scrollHeight) return;
    const half = list.scrollHeight/2;
    if (!half) return;
    state.alarmOffset = (state.alarmOffset+.55)%half;
    list.style.transform = 'translateY(-'+state.alarmOffset+'px)';
  },40);
}

async function boot() {
  fitScreen();
  updateClock();
  initCharts();
  initViews({
    getData:() => state.data,
    getSlotId:() => state.slotId,
    refresh:() => refresh(),
    showToast
  });
  bindEvents();
  runTimers();
  try {
    await initSlots();
    await refresh();
  } catch (error) {
    setConnectionState(false,'启动失败','error');
    showToast(error.message);
  }
}

boot();
