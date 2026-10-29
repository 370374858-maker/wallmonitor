import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

                                                                                      
export async function runMockPull({post,slotId,deviceId='mock-joint-machine',operationId,pipeId='left',pressures=[4,9,18,27,19,8,2],pullLength=.15,
  now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),intervalMs=1000,retry=true,onSample=()=>{}}){
  if(!operationId||!slotId||!pressures.length||!Number.isFinite(pullLength)||pullLength<=0)throw Error('Simulator configuration is incomplete');
  const startedAt=new Date(Math.floor(now()/1000)*1000).toISOString();
  let maximum=0;
  const samples=[];
  for(let i=0;i<pressures.length;i++){
    const observedAt=new Date(Math.floor(now()/1000)*1000).toISOString(),pressure=pressures[i];maximum=Math.max(maximum,pressure);
    const frame={slotId,deviceId,observedAt,pressures:{[pipeId]:pressure}};
    const response=await post('/api/v2/live-pressure',frame);
    if(response.status!==200)throw Error('Live sample failed HTTP '+response.status+': '+JSON.stringify(response.body));
    samples.push({observedAt,pressure,cumulativeLift:pullLength*i/Math.max(1,pressures.length-1)});await onSample(frame,response);
    await wait(intervalMs);
  }
  const endedAt=new Date(Math.floor(now()/1000)*1000).toISOString();
  const operation={slotId,deviceId,operationId,pipeId,startedAt,endedAt,pullLength,maxPressure:maximum};
  const result=await post('/api/v2/joint-operations',operation);
  if(![200,201].includes(result.status))throw Error('Operation failed HTTP '+result.status+': '+JSON.stringify(result.body));
  let repeated=null;
  if(retry){repeated=await post('/api/v2/joint-operations',operation);if(repeated.status!==200||repeated.body.data.replayed!==true)throw Error('Operation retry did not return the saved receipt');}
  return {samples,operation,result,retry:repeated};
}
export function httpPoster({baseUrl,token,caFile}){
  const base=new URL(baseUrl),ca=caFile?fs.readFileSync(caFile):undefined;
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&base.hostname==='127.0.0.1'))throw Error('Use HTTPS, or an isolated loopback test server');
  const transport=base.protocol==='https:'?https:http;
  return (route,body)=>new Promise((resolve,reject)=>{
    const data=Buffer.from(JSON.stringify(body));
    const req=transport.request(new URL(route,base),{method:'POST',ca,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Content-Length':data.length},timeout:10000},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text)})}catch{reject(Error('Non-JSON HTTP response'))}});});
    req.on('error',reject);req.on('timeout',()=>req.destroy(Error('HTTP timeout; retry the same operation identity')));req.end(data);
  });
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const filename=process.argv[2];
  if(!filename||!process.argv.includes('--allow-test-data'))throw Error('Usage: node mock-joint-backend.mjs mock-config.json --allow-test-data');
  const cfg=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  if(!cfg.testSlotCode?.endsWith('TEST')&&!cfg.testSlotCode?.startsWith('QA-'))throw Error('Choose a dedicated test slot code');
  const post=httpPoster({...cfg,caFile:cfg.caFile?path.resolve(path.dirname(filename),cfg.caFile):undefined});
  const result=await runMockPull({...cfg,operationId:cfg.operationId||'mock-'+Date.now(),post,onSample:frame=>console.log(JSON.stringify({observedAt:frame.observedAt,pressures:frame.pressures}))});
  console.log(JSON.stringify({finished:true,liveSamples:result.samples.length,completedOperations:1,pullLength:result.operation.pullLength,maxPressure:result.operation.maxPressure,retryReplayed:result.retry?.body.data.replayed}));
}
