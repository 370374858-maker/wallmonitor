import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {openSync, closeSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {toDeviceEvent, fingerprint} from './contract.mjs';

const [configFile, inputFile, ...flags] = process.argv.slice(2);
if (!configFile || !inputFile || flags.some(x => x !== '--apply')) throw new Error('用法: node forward-jsonl.mjs config.json records.jsonl [--apply]；默认仅预览');
const config = JSON.parse((await readFile(configFile, 'utf8')).replace(/^\uFEFF/, ''));
const directory = path.dirname(path.resolve(configFile));
const text = await readFile(inputFile, 'utf8');
if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new Error('单批最多 32 MiB，请分批处理');
const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
if (!rows.length || rows.length > 10000) throw new Error('单批须为 1 至 10000 条');
const events = rows.map(row => toDeviceEvent(row, config));
                                                                                       
const seen = new Map();
for (const event of events) {
  const key = JSON.stringify([event.deviceId, event.externalId]);
  if (seen.has(key) && seen.get(key) !== fingerprint(event)) throw new Error('同一来源编号对应不同内容，请人工核对');
  seen.set(key, fingerprint(event));
}
if (!flags.includes('--apply')) {
  console.log(JSON.stringify({previewOnly: true, sent: 0, validated: events.length, events}, null, 2));
} else {
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/api/v2/device-events' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('必须使用正式 HTTPS 设备接收地址');
  const receiverFile = path.resolve(directory, config.receiverFile || '../config/device-receiver.json');
  const receiver = JSON.parse((await readFile(receiverFile, 'utf8')).replace(/^\uFEFF/, ''));
  if (typeof receiver.token !== 'string' || receiver.token.length < 32) throw new Error('设备专用令牌无效');
  const ca = config.caFile ? await readFile(path.resolve(directory, config.caFile)) : undefined;
  const stateDirectory = path.resolve(directory, config.stateDirectory || 'bridge-state');
  await mkdir(stateDirectory, {recursive: true});
  const lockFile = path.join(stateDirectory, 'sending.lock');
  const lock = openSync(lockFile, 'wx');                                                         
  const stateFile = path.join(stateDirectory, 'acknowledged.json');
  try {
    let state;
    try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; state = {format: 1, acknowledged: {}}; }
    if (state.format !== 1 || !state.acknowledged) throw new Error('发送状态损坏，停止以供核对');
    for (const event of events) {
      const key = JSON.stringify([event.deviceId, event.externalId]), digest = fingerprint(event);
      if (Object.hasOwn(state.acknowledged, key) && state.acknowledged[key] !== digest) throw new Error('已发送来源编号的内容发生变化，必须走人工修订流程');
    }
    let sent = 0, skipped = 0;
    for (const event of events) {
      const key = JSON.stringify([event.deviceId, event.externalId]), digest = fingerprint(event);
      if (Object.hasOwn(state.acknowledged, key)) { skipped++; continue; }
      const result = await new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(event));
        const req = https.request(endpoint, {method: 'POST', ca, timeout: 10000, headers: {'Content-Type': 'application/json', 'Content-Length': data.length, Authorization: 'Bearer ' + receiver.token}}, response => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', part => { body += part; if (body.length > 1024 * 1024) response.destroy(new Error('Response too large')); });
          response.on('error', reject);
          response.on('end', () => resolve({status: response.statusCode, body}));
        });
        req.on('error', reject);req.on('timeout', () => req.destroy(new Error('接收超时，可用相同编号安全重试')));req.end(data);
      });
      if (![200, 201].includes(result.status)) throw new Error(`接收失败 HTTP ${result.status}；本条及后续未确认，停止发送。核对失败条目 ${event.externalId} 后重试。`);
      const response = JSON.parse(result.body);
      if (!Array.isArray(response.data?.events) || response.data.events.length !== 1 || response.data.events[0].deviceId !== event.deviceId || response.data.events[0].externalId !== event.externalId) throw new Error('接收结果未确认对应事件成功，停止发送');
      state.acknowledged[key] = digest;
      await writeFile(stateFile + '.tmp', JSON.stringify(state));await rename(stateFile + '.tmp', stateFile);
      sent++;
    }
    console.log(JSON.stringify({sent, skipped, complete: true}));
  } finally { closeSync(lock);unlinkSync(lockFile); }
}
