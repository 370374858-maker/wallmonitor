import { config } from './config.js';
import { allMockAlerts, getMockSnapshot, listMockSlots, updateMockSlot } from './mock-data.js';

let usingFallback = false;

async function request(path, options = {}) {
  const response = await fetch(config.apiBase + path, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'HTTP ' + response.status);
  }
  return response.json();
}

async function withFallback(apiWork, mockWork) {
  try {
    const result = await apiWork();
    usingFallback = false;
    return result;
  } catch (error) {
    if (!config.fallbackToMock) throw error;
    usingFallback = true;
    return mockWork();
  }
}

export const api = {
  async health() {
    return request('/health');
  },
  async listSlots() {
    return withFallback(
      async () => (await request('/slots')).data,
      () => listMockSlots()
    );
  },
  async snapshot(slotId) {
    return withFallback(
      async () => (await request('/slots/' + encodeURIComponent(slotId) + '/snapshot')).data,
      () => getMockSnapshot(slotId)
    );
  },
  async alerts() {
    return withFallback(
      async () => (await request('/alerts?limit=100')).data,
      () => allMockAlerts()
    );
  },
  async updateSlot(slotId, values) {
    if (usingFallback) return updateMockSlot(slotId, values);
    return (await request('/slots/' + encodeURIComponent(slotId), {
      method: 'PUT',
      body: JSON.stringify(values)
    })).data;
  },
  async addRecord(slotId, type, values) {
    if (usingFallback) throw new Error('演示数据模式不写入记录');
    return (await request('/slots/' + encodeURIComponent(slotId) + '/records/' + encodeURIComponent(type), {
      method: 'POST',
      body: JSON.stringify(values)
    })).data;
  },
  async acknowledgeAlert(id) {
    if (usingFallback) return { acknowledged:true };
    return (await request('/alerts/' + id + '/acknowledge', { method:'PATCH', body:'{}' })).data;
  },
  get mode() {
    return usingFallback ? 'mock' : 'api';
  }
};
