export function modelFailureMessage(error, stage) {
  const suffix='右侧真实数据不受影响。';
  if(error?.code==='MODEL_ASSET')return `三维模型资源加载失败（${error.asset || '模型文件'}）。请刷新重试；若持续失败，请检查服务器资源或网络连接。${suffix}`;
  if(error?.code==='MODEL_WEBGL')return `浏览器无法初始化三维渲染。请检查浏览器图形加速是否开启，或更新浏览器及显卡驱动后重试。${suffix}`;
  if(stage==='script')return `三维模型脚本加载失败。请刷新页面重新获取最新资源；若持续失败，请检查网络连接或重新登录。${suffix}`;
  return `三维模型初始化失败。请刷新重试；若持续失败，请提供浏览器控制台中的错误信息。${suffix}`;
}
