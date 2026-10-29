import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateChangeConfig} from '../shared/change-sync.js';
import {ChangeSyncEngine} from './change-sync-engine.mjs';
import {AtomicStateStore,platformApi,sourceReader} from './change-sync-runtime.mjs';

export async function runChangeCollector(config){
  const c=validateChangeConfig(config),source=sourceReader(c),store=new AtomicStateStore(c.stateFile),release=await store.lock();
  const engine=new ChangeSyncEngine({config:c,source,api:platformApi(c.platform),store});
  let stopped=false;const stop=()=>{stopped=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const loop=async(name,action)=>{let lastError='',lastLog=0;while(!stopped){const started=Date.now();
    try{await action();if(lastError)console.log(JSON.stringify({at:new Date().toISOString(),worker:name,status:'recovered'}));lastError='';}
    catch(error){const text=error.status?error.message:(error.code||error.message||'UNAVAILABLE');if(text!==lastError||Date.now()-lastLog>60000){console.error(JSON.stringify({at:new Date().toISOString(),worker:name,status:'retrying',code:error.status||error.code||'SYNC_ERROR',message:text}));lastError=text;lastLog=Date.now();}}
    for(let left=Math.max(0,c.pollMs-(Date.now()-started));left>0&&!stopped;left-=Math.min(left,200))await sleep(Math.min(left,200));
  }};
  try{await engine.load();console.log(JSON.stringify({status:'started',collectorId:c.collectorId,slotId:c.slotId,pollMs:c.pollMs,rawSamplesArchived:false}));
    await Promise.all([loop('archive',()=>engine.archiveOnce()),loop('live-pressure',()=>engine.liveOnce())]);
  }finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);await source.close();await release();}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const name=process.argv[2];if(!name)throw Error('Usage: node integration/change-collector.mjs <private-config.json>');
  const c=JSON.parse(fs.readFileSync(path.resolve(name),'utf8'));
  await runChangeCollector(c);
}
