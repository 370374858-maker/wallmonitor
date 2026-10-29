import { beginActivity } from './activity.js';

export function requestLabel(path, method = 'GET') {
  if(method==='DELETE')return '正在删除槽段及关联记录';
  if (path.includes('/revisions/preview')) return '正在校验并预览整槽重算';
  if (method !== 'GET' && path.includes('/revisions')) return '正在备份、重算并保存修改';
  if (method !== 'GET') return path.includes('monitoring-policy') ? '正在保存评价规则' : '正在校验并保存数据';
  if (path.includes('/edit-context')) return '正在载入历史输入';
  if (path.includes('/revisions')) return '正在读取修改记录';
  if (path.includes('/records')) return '正在读取施工台账';
  return '正在读取槽段数据';
}

export async function requestJson(path, options = {}, { fetcher = globalThis.fetch, activity = beginActivity } = {}) {
  const { activity: feedback = true, label, timeoutMs, signal, ...init } = options;
  const method = (init.method || 'GET').toUpperCase();
  const preview = method === 'POST' && path.split('?')[0].endsWith('/revisions/preview');
  const write = !['GET','HEAD'].includes(method) && !preview;
  const finish = feedback ? activity(label || requestLabel(path, method), write) : () => {};
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) forwardAbort(); else signal?.addEventListener('abort', forwardAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs ?? (write || preview ? 60000 : 15000));
  try {
    const response = await fetcher('/api/v2' + path, { ...init, method, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init.headers }, cache: 'no-store' });
    let body;
    try { body = await response.json(); }
    catch (error) { if (controller.signal.aborted) throw error; throw Object.assign(new Error('服务响应无法识别，请刷新后核对数据。'), { responseError: true }); }
    if (response.status === 401 && body.login === '/login' && typeof window !== 'undefined') window.dispatchEvent(new Event('cw:auth-required'));
    if (!response.ok) throw Object.assign(new Error(body.error || '请求失败'), { status: response.status, issues: body.issues });
    return body.data ?? body;
  } catch (error) {
    if (signal?.aborted && !timedOut && !write) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    if (error.status) throw error;
    const message = method==='DELETE' ? '尚未收到删除结果，请先刷新槽段台账核对是否已删除。' : write
      ? '尚未收到保存结果，不能确认是否已入库。请先刷新台账核对；草稿已保留，请勿另建一条重复记录。'
      : timedOut ? '读取超时，请检查服务后重试；现有数据和草稿已保留。'
        : error.responseError ? error.message : '无法连接本地服务，请检查连接后重试；草稿已保留。';
    throw Object.assign(new Error(message), { status: 0, uncertain: write, cause: error });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', forwardAbort); finish(); }
}
