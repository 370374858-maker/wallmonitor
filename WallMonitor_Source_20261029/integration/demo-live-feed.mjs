import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {httpPoster} from './mock-joint-backend.mjs';

export async function runDemoPressureFeed({config,post,signal,now=Date.now,wait=ms=>new Promise(resolve=>{
  const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};
  const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});
}),onError=error=>console.error(error.message)}){
  if(!config?.slotCode?.startsWith('DEMO-')||!config.slotId||config.intervalMs!==2000)throw Error('Demo pressure requires an explicit DEMO slot and a two-second interval');
  let sent=0;
  while(!signal?.aborted){
    const stamp=Math.floor(now()/1000)*1000,phase=stamp/1000/8;
    const pressures={left:Number((12+5*Math.sin(phase)).toFixed(2)),right:Number((9+3*Math.cos(phase*.8)).toFixed(2))};
    try{
      const result=await post('/api/v2/live-pressure',{slotId:config.slotId,deviceId:'demo-pressure-feed',observedAt:new Date(stamp).toISOString(),pressures});
      if(result.status!==200||result.body.data.storedRows!==0)throw Error('Demo pressure rejected or unexpected storage behavior');
      sent++;
    }catch(error){onError(error);}
    if(!signal?.aborted)await wait(config.intervalMs);
  }
  return {sent,businessEventsWritten:0};
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2]||!process.argv.includes('--allow-demo-pressure'))throw Error('Explicit demo pressure flag and configuration are required');
  const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if(!config?.slotCode?.startsWith('DEMO-')||!config.slotId||config.intervalMs!==2000)throw Error('Invalid demo configuration');
  if(process.argv.includes('--check-config')){
    console.log(JSON.stringify({configurationValid:true,slotCode:config.slotCode,storage:'memory-only'}));
  }else{
  const controller=new AbortController();for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>controller.abort());
  console.log(JSON.stringify({demoPressure:true,slotCode:config.slotCode,storage:'memory-only',intervalMs:config.intervalMs}));
  await runDemoPressureFeed({config,post:httpPoster(config),signal:controller.signal});
  }
}
