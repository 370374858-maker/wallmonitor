export function browserSafety(request, response, next) {
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('X-Frame-Options', 'SAMEORIGIN');
  response.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET','HEAD','OPTIONS'].includes(request.method) && request.path.startsWith('/api')) {
    const origin = request.get('origin');
    const expected = `${request.protocol}://${request.get('host')}`;
    if (request.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) {
      return response.status(403).json({ error:'不允许其他网站提交施工数据，请从本平台页面操作。' });
    }
  }
  next();
}

export function apiNotFound(_request, response) {
  response.status(404).json({ error:'接口不存在，请刷新页面或检查请求地址。' });
}

export function pageNotFound(_request, response) {
  response.status(404).type('text/plain').send('页面或文件不存在。请从数据大屏进入：/dashboard');
}
