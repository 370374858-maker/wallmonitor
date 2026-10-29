                                                                       
export const SOURCE_FIELDS = Object.freeze({
  DA1: ['R30','R32'],
  DA2: ['R1','R2','R3','R4','R16','R17','R18','R19']
});
export const SOURCE_LABELS = Object.freeze({R30:'混凝土面高度',R32:'混凝土深度',R1:'1# 起拔压力',R2:'1# 起拔深度',R3:'1# 接头管深度',R4:'1# 接头管埋深',R16:'2# 起拔压力',R17:'2# 起拔深度',R18:'2# 接头管深度',R19:'2# 接头管埋深'});
export const issue = (status,message) => Object.assign(new Error(message),{status});
export function sourceId(value) {
  if(typeof value!=='string'||!/^\d{1,20}$/.test(value)||BigInt(value)>18446744073709551615n)throw issue(422,'源 Id 必须是未丢失精度的十进制字符串');
  return BigInt(value).toString();
}
export function sourceTable(value,project,machine) {
  if(typeof value!=='string')throw issue(422,'来源表无效');
  const m=/^(DA[12])_(\d{1,10})_(\d{1,10})_(\d{8})$/.exec(value);
  if(!m||m[2]!==String(project)||m[3]!==String(machine))throw issue(422,'来源表与项目或机器绑定不一致');
  const date=m[4],iso=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const ms=Date.parse(iso+'T00:00:00Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==iso)throw issue(422,'来源表日期无效');
  return {stream:m[1],date:iso};
}
export function sourceTimestamp(value) {
  if(value===null)return {raw:null,receivedAt:null};
  if(typeof value!=='string'||!/^\d{1,11}$/.test(value))throw issue(422,'源时间戳须为 Unix 秒字符串或 null');
  const seconds=Number(value);
  if(seconds<946684800||seconds>4133980800)throw issue(422,'源时间戳年份超出 2000-2100');
  return {raw:value,receivedAt:new Date(seconds*1000+8*3600000).toISOString().slice(0,19).replace('T',' ')};
}
export function normalizeSourceRow(row,stream) {
  const id=sourceId(row?.id),timestamp=sourceTimestamp(row?.timestamp);
  const fields=SOURCE_FIELDS[stream];
  if(!fields||!row.values||Object.keys(row.values).sort().join(',')!==[...fields].sort().join(','))throw issue(422,'源字段不完整或包含未经允许的字段');
  const values=Object.fromEntries(fields.map(field=>{
    const value=row.values[field];
    if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw issue(422,'原始值只能为有限数字或 null，不能补零');
    return [field,value];
  }));
  return {id,timestamp:timestamp.raw,sourceReceivedAt:timestamp.receivedAt,values};
}
                                                                                              
export function convertSourceValues(row,stream,slot,config={}) {
  const values=row.values,ready=config.timeConfirmed===true;
  const out={concreteDepth:null,joints:{},issues:[],usable:false};
  if(!ready)out.issues.push('源时间是接收时间还是采样时间尚未确认');
  if(stream==='DA1'){
    const m=config.surface;
    if(!m?.confirmed){out.issues.push('混凝土面单位和基准尚未确认');return out;}
    if(!['depthFromTop','heightFromBottom','elevation'].includes(m.kind)||!Number.isFinite(m.scale)||m.scale<=0)throw issue(422,'混凝土面映射无效');
    const raw=values[m.field];
    if(typeof raw!=='number'){out.issues.push('混凝土面缺值');return out;}
    let d=raw*m.scale;
    if(m.kind==='heightFromBottom')d=slot.depth-d;
    if(m.kind==='elevation'){
      if(!Number.isFinite(m.slotTopElevation))throw issue(422,'工程高程缺少槽口高程');
      d=m.slotTopElevation-d;
    }
    if(d<0||d>slot.depth){out.issues.push('混凝土面超出槽段范围');return out;}
    out.concreteDepth=d;
  }else{
    for(const number of [1,2]){
      const m=config.joints?.[number];
      if(!m?.confirmed){out.issues.push(`${number}# 管位、单位和长度含义尚未确认`);continue;}
      if(!['left','right'].includes(m.side)||!['absoluteDepth','cumulativePull'].includes(m.kind))throw issue(422,'接头管映射无效');
      if(out.joints[m.side])throw issue(422,'两路接头管不能映射到同一侧');
      if(!Number.isFinite(m.lengthScale)||m.lengthScale<=0||!Number.isFinite(m.pressureScale)||m.pressureScale<=0)throw issue(422,'接头管换算倍率无效');
      const rawLength=values[m.lengthField],rawPressure=values[m.pressureField];
      if(typeof rawLength!=='number'||typeof rawPressure!=='number'){out.issues.push(`${number}# 接头管缺值`);continue;}
      let depth=rawLength*m.lengthScale,pull=null;
      if(m.kind==='cumulativePull'){
        if(!Number.isFinite(m.baselineCounter)||!Number.isFinite(m.baselineDepth))throw issue(422,'累计起拔量缺少计数与管底基准');
        pull=depth-m.baselineCounter;
        if(pull<0){out.issues.push(`${number}# 累计计数归零，须重新核对基准`);continue;}
        depth=m.baselineDepth-pull;
      }
      const pressure=rawPressure*m.pressureScale;
      if(depth<0||depth>slot.depth||pressure<0){out.issues.push(`${number}# 接头管值超出范围`);continue;}
      out.joints[m.side]={depth,pressure,cumulativePull:pull};
    }
  }
  out.usable=ready&&out.issues.length===0;
  return out;
}
