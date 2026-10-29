import {createWriteStream,mkdirSync,appendFileSync,existsSync} from 'node:fs';
import {Console} from 'node:console';
import dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
let installRoot=path.dirname(fileURLToPath(import.meta.url));
while(!existsSync(path.join(installRoot,'config/platform.env'))){const parent=path.dirname(installRoot);if(parent===installRoot)throw new Error('Platform configuration was not found');installRoot=parent;}
dotenv.config({path:path.join(installRoot,'config/platform.env'),quiet:true});
const logs=path.join(installRoot,'logs');
mkdirSync(logs,{recursive:true});
global.console=new Console({stdout:createWriteStream(path.join(logs,'platform.out.log'),{flags:'a'}),stderr:createWriteStream(path.join(logs,'platform.err.log'),{flags:'a'})});
process.on('uncaughtExceptionMonitor',error=>appendFileSync(path.join(logs,'platform.err.log'),new Date().toISOString()+' '+String(error.stack??error)+'\n'));
await import('./app.js');
