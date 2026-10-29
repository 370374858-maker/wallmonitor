                                                            
export function surfaceDecision(row,slotDepth,previous=null,now=Date.now()) {
  const raw=row.values.R32;
  if(typeof raw!=='number'||!Number.isFinite(raw))return {status:'invalid',reason:'混凝土深度缺值'};
  if(raw<0||raw>slotDepth)return {status:'invalid',reason:'混凝土深度超出槽段范围'};
  const time=row.timestamp==null?NaN:Number(row.timestamp)*1000;
  if(!Number.isFinite(time))return {status:'invalid',reason:'源时间缺失'};
  if(time>now+5000)return {status:'invalid',reason:'源时间超前'};
  if(time<now-300000)return {status:'invalid',reason:'源数据超过 5 分钟未更新'};
  if(previous&&time<Number(previous.timestamp)*1000)return {status:'outOfOrder',reason:'旧时间数据，不覆盖新测量'};
  if(previous&&raw===previous.depth)return {status:'unchanged',depth:raw,reason:'深度未变化，不新增记录'};
  if(previous&&time===Number(previous.timestamp)*1000)return {status:'invalid',reason:'同一秒出现不同深度，需核对源数据'};
  if(!previous&&raw===0)return {status:'waiting',reason:'初始零值待核验，尚未生成有效测量'};
  return {status:'changed',depth:raw,reason:'深度变化，保存测量'};
}
