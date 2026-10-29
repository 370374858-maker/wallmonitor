import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import mysql from 'mysql2/promise';
import {sourceTable,SOURCE_FIELDS,sourceId,normalizeSourceRow} from '../shared/telemetry.js';

const configPath=process.argv[2];
if(!configPath)throw new Error('Usage: node integration/source-collector.mjs <private-config.json>');
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(config.source.host!=='127.0.0.1'||config.source.port!==3306)throw new Error('Source must be the local device database');
const endpoint=new URL(config.endpoint);
if(endpoint.protocol!=='https:'||!['127.0.0.1','localhost'].includes(endpoint.hostname))throw new Error('Use a fixed local HTTPS receiver');
const ca=readFileSync(config.caFile),collector=config.collectorId;
const db=await mysql.createConnection({...config.source,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true,decimalNumbers:false,connectTimeout:5000,enableKeepAlive:true});
await db.query('SET SESSION MAX_EXECUTION_TIME=4000');
await db.query('SET SESSION TRANSACTION READ ONLY');
let stop=false,round=0,lastTablesAt=0,tables=[],sourceLost=false;
db.connection.on('error',()=>{sourceLost=true;});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
function api(body){
  const data=JSON.stringify({collectorId:collector,...body});
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(endpoint,{method:'POST',ca,headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)},timeout:12000},res=>{
      let text='';res.setEncoding('utf8');res.on('data',part=>{text+=part;if(text.length>2e6)req.destroy(new Error('Response limit'));});
      res.on('end',()=>{
        let parsed;try{parsed=JSON.parse(text);}catch{return reject(new Error('Receiver returned invalid JSON'));}
        if(res.statusCode>=200&&res.statusCode<300)return resolve(parsed.data);
        reject(Object.assign(new Error(parsed.error||'Receiver rejected request'),{status:res.statusCode}));
      });
    });
    req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Receiver timeout')));req.end(data);
  });
}
async function transmit(body){
  const request={...body,requestId:randomUUID()};
  let last;
  for(let attempt=0;attempt<3&&!stop;attempt++){
    try{return await api(request);}catch(error){last=error;if(error.status&&error.status<500)throw error;await sleep(500*(attempt+1));}
  }
  throw last||new Error('Collector stopped');
}
function wire(row,stream){
  const value={id:sourceId(row.Id),timestamp:row.ServerTimeStamp==null?null:String(row.ServerTimeStamp),values:Object.fromEntries(SOURCE_FIELDS[stream].map(f=>[f,row[f]]))};
  normalizeSourceRow(value,stream);return value;
}
try{
  while(!stop){
    try{
      const state=await api({action:'state'}),binding=state.binding;
      if(binding.mode==='paused'){await sleep(3000);continue;}
      if(binding.config.surfaceSync?.enabled===true){
                                                                                                     
        const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10).replaceAll('-','');
        const name=`DA1_${binding.project}_${binding.machine}_${today}`;
        sourceTable(name,binding.project,binding.machine);
        try{
          const [current]=await db.query('SELECT `Id`,`ServerTimeStamp`,`R30`,`R32` FROM `'+config.source.database+'`.`'+name+'` ORDER BY `Id` DESC LIMIT 1');
          if(current.length)await api({action:'surface',table:name,row:wire(current[0],'DA1')});
        }catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
      }
      if(Date.now()-lastTablesAt>30000){
        const [found]=await db.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[config.source.database]);
        tables=found.map(r=>r.TABLE_NAME).filter(name=>{try{const t=sourceTable(name,binding.project,binding.machine);return t.date>=binding.config.startDate&&!(t.stream==='DA1'&&binding.config.surfaceSync?.enabled===true);}catch{return false;}});
        lastTablesAt=Date.now();
      }
      const cursors=new Map(state.cursors.map(c=>[c.source_table+':'+c.lane,c]));
      for(const table of tables){
        if(stop)break;
        const {stream,date}=sourceTable(table,binding.project,binding.machine);
        const select='SELECT `Id`,`ServerTimeStamp`,'+SOURCE_FIELDS[stream].map(f=>'`'+f+'`').join(',')+' FROM `'+config.source.database+'`.`'+table+'`';
        let c=cursors.get(table+':forward');
        if(!c){
                                                                                                 
          let floor='0';
          if(date===binding.config.startDate){
            const [tail]=await db.query(select+' ORDER BY `Id` DESC LIMIT 120');
            if(tail.length){const first=BigInt(sourceId(tail.at(-1).Id));floor=(first>0n?first-1n:0n).toString();}
          }
          c={last_source_id:floor,lower_bound_id:floor};
        }
        const [rows]=await db.execute(select+' WHERE `Id` > CAST(? AS UNSIGNED) ORDER BY `Id` ASC LIMIT 500',[c.last_source_id]);
        await transmit({action:'batch',table,lane:'forward',fromId:c.last_source_id,floorId:c.lower_bound_id,rows:rows.map(r=>wire(r,stream))});
        cursors.set(table+':forward',c);
      }
                                                                                                 
      if(tables.length&&!stop){
        const table=tables[round++%tables.length],{stream}=sourceTable(table,binding.project,binding.machine);
        const f=cursors.get(table+':forward');
        const c=cursors.get(table+':reconcile')||{last_source_id:f.lower_bound_id,lower_bound_id:f.lower_bound_id};
        const select='SELECT `Id`,`ServerTimeStamp`,'+SOURCE_FIELDS[stream].map(v=>'`'+v+'`').join(',')+' FROM `'+config.source.database+'`.`'+table+'` WHERE `Id` > CAST(? AS UNSIGNED) ORDER BY `Id` ASC LIMIT 500';
        const [rows]=await db.execute(select,[c.last_source_id]);
        await transmit({action:'batch',table,lane:'reconcile',fromId:c.last_source_id,floorId:c.lower_bound_id,rows:rows.map(r=>wire(r,stream))});
      }
      await sleep(config.pollMs||2000);
    }catch(error){
                                                                                        
      console.error(JSON.stringify({at:new Date().toISOString(),code:error.code||error.status||'COLLECTOR_ERROR',message:error.status?error.message:'Source or receiver unavailable; retrying without advancing unconfirmed progress'}));
      if(sourceLost||['PROTOCOL_CONNECTION_LOST','PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR','PROTOCOL_ENQUEUE_AFTER_QUIT','ECONNRESET','ECONNREFUSED','EPIPE'].includes(error.code))throw new Error('Source connection lost; service restart required');
      await sleep(5000);
    }
  }
}finally{await db.end();}
