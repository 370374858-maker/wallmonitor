import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import mysql from 'mysql2/promise';
import {sourceTable} from '../shared/telemetry.js';
import {CHANGE_FIELDS} from '../shared/change-sync.js';

export class AtomicStateStore{
  constructor(file){this.file=file;}
  async load(){try{return JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async save(value){
    const folder=path.dirname(this.file);await fs.mkdir(folder,{recursive:true,mode:0o700});
    const temporary=this.file+'.tmp-'+randomUUID();let handle;
    try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=null;await fs.rename(temporary,this.file);
      if(process.platform!=='win32'){const directory=await fs.open(folder,'r');try{await directory.sync();}finally{await directory.close();}}}
    finally{await handle?.close();await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async lock(){
    await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const file=this.file+'.lock';
    const token=randomUUID();
    for(let attempt=0;attempt<2;attempt++){
      try{const handle=await fs.open(file,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,token}));await handle.close();
        return async()=>{const current=JSON.parse(await fs.readFile(file,'utf8'));if(current.token===token)await fs.unlink(file);};
      }catch(error){if(error.code!=='EEXIST')throw error;
        const old=JSON.parse(await fs.readFile(file,'utf8'));try{process.kill(old.pid,0);throw Error('已有同步程序正在使用同一进度文件');}catch(check){if(check.code!=='ESRCH')throw check;await fs.unlink(file);}}
    }
    throw Error('无法取得同步进度锁');
  }
}
export function platformApi(config){
  const base=new URL(config.baseUrl),ca=readFileSync(config.caFile);
  const request=(route,body)=>new Promise((resolve,reject)=>{
    const data=body===undefined?null:Buffer.from(JSON.stringify(body));
    const req=httpsRequest(new URL(route,base),{method:data?'POST':'GET',ca,headers:{Authorization:'Bearer '+config.token,...(data?{'Content-Type':'application/json','Content-Length':data.length}:{})},timeout:12000},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(text.length>16000000)req.destroy(Error('API response limit'));});
      res.on('end',()=>{let value;try{value=JSON.parse(text);}catch{return reject(Error('接口未返回 JSON'));}
        if(res.statusCode<200||res.statusCode>=300)return reject(Object.assign(new Error(value.error||'平台拒绝请求'),{status:res.statusCode,issues:value.issues}));resolve(value.data);});
    });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Platform API timeout')));req.end(data);
  });
  return {context:id=>request('/api/v2/slots/'+id+'/event-state'),submit:(id,body)=>request('/api/v2/slots/'+id+'/events',body),initialize:(id,body)=>request('/api/v2/slots/'+id+'/joint-depth-baseline',body),survey:(id,body)=>request('/api/v2/slots/'+id+'/survey-depth',body),live:body=>request('/api/v2/live-pressure',body)};
}
export function sourceReader(config){
  const pool=mysql.createPool({...config.source,connectionLimit:2,waitForConnections:true,queueLimit:8,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true,connectTimeout:5000,enableKeepAlive:true});
  const table=name=>sourceTable(name,config.project,config.machine);
  const select=name=>{const {stream}=table(name);return 'SELECT /*+ MAX_EXECUTION_TIME(4000) */ `Id`,`ServerTimeStamp`,'+CHANGE_FIELDS[stream].map(field=>'`'+field+'`').join(',')+' FROM `'+config.source.database+'`.`'+name+'`';};
  const query=(sql,values=[])=>pool.query({sql,values,timeout:5000});
  async function tables(){
    const [rows]=await query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[config.source.database]);
    return rows.map(row=>row.TABLE_NAME).flatMap(name=>{try{const t=table(name);return t.date>=config.startDate?[{name,...t}]:[];}catch{return [];}}).sort((a,b)=>a.date.localeCompare(b.date)||a.stream.localeCompare(b.stream));
  }
  async function latest(name){const [rows]=await query(select(name)+' ORDER BY `Id` DESC LIMIT 1');return rows[0]??null;}
  return {tables,latest,async rows(name,id,limit){if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid batch size');const [rows]=await query(select(name)+' WHERE `Id`>CAST(? AS UNSIGNED) ORDER BY `Id` ASC LIMIT '+limit,[String(id)]);return rows;},
    async latestPressure(){const candidates=(await tables()).filter(t=>t.stream==='DA2').slice(-2).reverse();let newest=null;
      for(const t of candidates){const row=await latest(t.name);if(row&&(!newest||BigInt(row.ServerTimeStamp??'0')>BigInt(newest.ServerTimeStamp??'0')||row.ServerTimeStamp===newest.ServerTimeStamp&&BigInt(row.Id)>BigInt(newest.Id)))newest=row;}
      return newest;},close:()=>pool.end()};
}
