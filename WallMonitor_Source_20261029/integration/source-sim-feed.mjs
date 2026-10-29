import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
export async function runSimulationFeed(c){
  if(c.source.host!=='127.0.0.1'||c.source.port!==3307||!/^wm_source_sim_\d{8}$/.test(c.source.database)||!/^sim_template_DA2$/.test(c.template))throw Error('Simulation writer is restricted to its dedicated database');
  if(!Number.isInteger(c.intervalMs)||c.intervalMs<1000||!Number.isInteger(c.maxLiveRows)||c.maxLiveRows<20||c.maxLiveRows>1000)throw Error('Invalid simulation limits');
  if(!/^\d{1,10}$/.test(c.project)||!/^\d{1,10}$/.test(c.machine))throw Error('Invalid simulation identity');
  const db=mysql.createPool({...c.source,connectionLimit:1,supportBigNumbers:true,bigNumberStrings:true});let stop=false;const signal=()=>{stop=true;};
  process.once('SIGTERM',signal);process.once('SIGINT',signal);
  console.log(JSON.stringify({status:'started',simulation:true,maxLiveRows:c.maxLiveRows,intervalMs:c.intervalMs}));
  try{while(!stop){
    const now=Date.now(),stamp=String(Math.floor(now/1000)),date=new Date(now+8*3600000).toISOString().slice(0,10).replaceAll('-','');
    const table=`DA2_${c.project}_${c.machine}_${date}`,qualified='`'+c.source.database+'`.`'+table+'`';
    await db.query('CREATE TABLE IF NOT EXISTS '+qualified+' LIKE `'+c.source.database+'`.`'+c.template+'`');
    const left=Number((11+5*Math.sin(now/4000)).toFixed(2)),right=Number((8+3*Math.cos(now/5000)).toFixed(2));
    await db.execute('INSERT INTO '+qualified+' (`Id`,`ServerTimeStamp`,`W1`,`W2`,`R3`,`R2`,`R1`,`R18`,`R17`,`R16`) VALUES(?,?,?,?,?,?,?,?,?,?)',[(BigInt(now)*1000n).toString(),stamp,Number(c.project),Number(c.machine),c.final.leftDepth,c.final.leftPull,left,c.final.rightDepth,c.final.rightPull,right]);
    const [tail]=await db.query('SELECT `Id` FROM '+qualified+' WHERE `Id`>100000 ORDER BY `Id` DESC LIMIT '+c.maxLiveRows);
    if(tail.length===c.maxLiveRows)await db.execute('DELETE FROM '+qualified+' WHERE `Id`>100000 AND `Id`<?',[tail.at(-1).Id]);
    for(let remaining=c.intervalMs;remaining>0&&!stop;remaining-=Math.min(remaining,200))await new Promise(resolve=>setTimeout(resolve,Math.min(remaining,200)));
  }}finally{process.removeListener('SIGTERM',signal);process.removeListener('SIGINT',signal);await db.end();}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node integration/source-sim-feed.mjs <private-simulation-config.json>');
  await runSimulationFeed(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
}
