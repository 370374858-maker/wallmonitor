import {createHash} from 'node:crypto';

function requiredText(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) throw new Error(`${name} 缺失、过长或含首尾空格`);
  return value;
}
function number(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} 必须是有效的非负数，不能用空值或字符串代替`);
  return value;
}
export function toDeviceEvent(row, config) {
  if (config?.confirmed !== true) throw new Error('尚未确认字段、单位、时间基准、槽段和管号映射');
  if (config.contractVersion !== 1) throw new Error('不支持的标准化数据协议版本');
  const deviceId = requiredText(row.deviceId, 'deviceId');
  const sourceId = requiredText(row.sourceId, 'sourceId');
  const slotCode = requiredText(row.slotCode, 'slotCode');
  const binding = config.bindings?.find(item => item.deviceId === deviceId && item.slotCode === slotCode);
  if (!binding || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(binding.slotId ?? '')) throw new Error('设备和槽段没有唯一有效的绑定');
  if (config.bindings.filter(item => item.deviceId === deviceId && item.slotCode === slotCode).length !== 1) throw new Error('设备与槽段绑定重复');
  const occurredAt = requiredText(row.observedAt, 'observedAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt))) throw new Error('观测时间必须精确到秒并带时区，不可使用采集程序当前时间');
                                                                                       
  const [year, month, day, hour, minute, second] = occurredAt.slice(0, 19).split(/[-T:]/).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (year < 2000 || year > 2100 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error('观测日期不存在或超出平台支持年份');
  let payload;
  if (row.kind === 'measurement') {
    if (row.depthDatum !== 'slot-top-down' || row.lengthUnit !== 'm') throw new Error('混凝土面必须转换为从槽口向下的测深，单位 m');
    if (!Array.isArray(row.depths) || row.depths.length < 1 || row.depths.length > 64) throw new Error('一次测量必须包含 1 至 64 个同批有效测点');
    payload = {measurementPoints: row.depths.map(value => number(value, 'depths'))};
  } else if (row.kind === 'joint') {
    if (row.lengthUnit !== 'm' || row.pressureUnit !== 'MPa') throw new Error('拔管长度须为 m，压力须为 MPa，现场确认后在源适配层换算');
    if (!['delta', 'absolute'].includes(row.mode)) throw new Error('拔管仅支持本次长度 delta 或当前管底测深 absolute，累计拔出量不能直接上传');
    if (row.mode === 'absolute' && row.depthDatum !== 'slot-top-down') throw new Error('absolute 必须是当前管底距槽口的测深');
    const side = binding.pipeMap?.[String(row.pipeNo)];
    if (!['left', 'right'].includes(side)) throw new Error('设备管号尚未映射到左右接头管');
    payload = {pulls: [{pipeId: side, mode: row.mode, value: number(row.value, 'value'), pressure: number(row.pressure, 'pressure')}]};
  } else throw new Error('仅接收 measurement 或 joint 数据');
  return {slotId: binding.slotId, deviceId, externalId: sourceId, event: {type: row.kind, occurredAt, payload}};
}
export const fingerprint = body => createHash('sha256').update(JSON.stringify(body)).digest('hex');
