const saved = JSON.parse(localStorage.getItem('wall-monitor-config') || '{}');

export const config = {
  apiBase: saved.apiBase || '/api',
  refreshMs: Number(saved.refreshMs) || 15000,
  fallbackToMock: saved.fallbackToMock !== false
};

export function saveConfig(next) {
  Object.assign(config, next);
  localStorage.setItem('wall-monitor-config', JSON.stringify(config));
}
