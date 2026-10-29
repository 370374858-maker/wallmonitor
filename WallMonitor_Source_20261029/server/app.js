import {createServer as createHttpsServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {createLocalCredentialVerifier} from './portable-auth.mjs';
import express from 'express';
import {existsSync} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes.js';
import { checkDatabase, pool } from './db.js';
import { config } from './config.js';
import { workbenchRouter } from './workbench/routes.js';
import { browserSafety, apiNotFound, pageNotFound } from './http-safety.js';
import {createAuth,nginxCredentialVerifier} from './auth.js';
import {staticCacheHeaders} from './static-cache.js';
import {createPageRouter} from './page-routes.js';

const app = express();
                                                                       
if (process.env.TRUST_PROXY === 'loopback') app.set('trust proxy', 'loopback');
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(currentDir, '..', 'web');
const echartsDir = path.resolve(currentDir, '..', 'node_modules', 'echarts', 'dist');

app.disable('x-powered-by');
app.use(browserSafety);
app.use(express.json({ limit: '8mb' }));
app.get('/internal/offline-health',async(req,res)=>{
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if(!local||!process.env.LOCAL_HEALTH_TOKEN||req.get('x-wall-health')!==process.env.LOCAL_HEALTH_TOKEN)return res.status(404).end();
  try{await checkDatabase();const [[tables]]=await pool.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cw_slot','cw_record','cw_revision','cw_revision_record','cw_event','cw_event_request','cw_device_event_request','cw_event_audit')");if(Number(tables.n)!==8)throw new Error('Database schema not ready');res.set('Cache-Control','no-store').json({ready:true,tables:Number(tables.n)});}catch{res.status(503).json({ready:false});}
});
const authEnabled=process.env.AUTH_ENABLED==='true';
app.use(createAuth({enabled:authEnabled,verify:authEnabled?(process.env.AUTH_PROVIDER==='local'?createLocalCredentialVerifier(process.env.AUTH_LOCAL_USERS):nginxCredentialVerifier(process.env.AUTH_VERIFY_URL)):undefined,
  maintenance:()=>existsSync(process.env.AUTH_MAINTENANCE_FILE||'/etc/wall-monitor/maintenance.flag'),
  secureCookies:process.env.AUTH_COOKIE_SECURE!=='false',deviceToken:process.env.DEVICE_API_TOKEN||''}));
app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/login',(_request,response)=>response.set('Cache-Control','no-store').sendFile(path.join(webDir,'login','index.html')));
app.use('/api/v2', workbenchRouter);
app.use('/api', apiRouter);
app.use('/api', apiNotFound);
app.use(createPageRouter(webDir));
app.get('/workbench-domain.js', (_request, response) => {staticCacheHeaders(response,'construction.js');response.sendFile(path.resolve(currentDir, '..', 'shared', 'construction.js'));});
app.get(['/pipe-labels.js','/shared/pipe-labels.js'],(_request,response)=>{staticCacheHeaders(response,'pipe-labels.js');response.sendFile(path.resolve(currentDir,'..','shared','pipe-labels.js'));});
app.get('/shared/pouring-order.js', (_request, response) => {staticCacheHeaders(response,'pouring-order.js');response.sendFile(path.resolve(currentDir, '..', 'shared', 'pouring-order.js'));});
app.get('/shared/policy-intervals.js', (_request, response) => {staticCacheHeaders(response,'policy-intervals.js');response.sendFile(path.resolve(currentDir, '..', 'shared', 'policy-intervals.js'));});
app.get('/shared/joint-depth-state.js',(_request,response)=>{staticCacheHeaders(response,'joint-depth-state.js');response.sendFile(path.resolve(currentDir,'..','shared','joint-depth-state.js'));});
app.use('/vendor', express.static(echartsDir, { etag:true, setHeaders:staticCacheHeaders }));
app.use(express.static(webDir, {
  etag: true,
  setHeaders:staticCacheHeaders
}));
app.use(pageNotFound);

app.use((error, _request, response, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  response.status(status).json({
    error: status >= 500 ? 'Internal server error' : error.message,
    detail: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

const pfxPath=process.env.TLS_PFX_PATH;
const listener=pfxPath?createHttpsServer({pfx:readFileSync(pfxPath),passphrase:process.env.TLS_PFX_PASSWORD},app):app;
const server = listener.listen(config.port, config.host, async () => {
  const address = (pfxPath?'https://':'http://') + config.host + ':' + config.port;
  try {
    const database = await checkDatabase();
    console.log('[ready] ' + address);
    console.log('[database] ' + database.db + ' @ MySQL ' + database.version);
  } catch (error) {
    console.error('[ready] ' + address);
    console.error('[database unavailable] ' + error.message);
  }
});

async function shutdown(signal) {
  console.log('[' + signal + '] shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
