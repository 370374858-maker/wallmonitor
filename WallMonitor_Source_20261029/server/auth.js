import {Router} from 'express';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {dashboardHome,legacyPagePaths} from './page-routes.js';

export const LOGIN_FAILURE_MESSAGE='密码错误或系统正在维护中';
const digest=value=>createHash('sha256').update(value).digest();
const cookieName='wall_session';
export function safeReturnPath(value){
  if(typeof value!=='string')return '/dashboard';
  try{
    const decoded=decodeURIComponent(value);
    if(!decoded.startsWith('/')||decoded.startsWith('//')||/[\\\x00-\x20]/.test(decoded))return '/dashboard';
    const path=new URL(value,'https://platform.invalid');
    if(path.origin!=='https://platform.invalid'||/^\/(auth|login)(\/|$)/.test(path.pathname))return '/dashboard';
    if(legacyPagePaths.has(decodeURIComponent(path.pathname))||path.pathname==='/embedded/workbench')return dashboardHome;
    return value;
  }catch{return '/dashboard';}
}
export function nginxCredentialVerifier(address){
  const url=new URL(address);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw new Error('AUTH_VERIFY_URL must use a fixed local 127.0.0.1 HTTP verifier');
  return async(username,password)=>{
    const response=await fetch(url,{headers:{Authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`},redirect:'manual',signal:AbortSignal.timeout(5000)});
    await response.body?.cancel();
    if(response.status===401||response.status===403)return false;
    if(response.status!==200)throw new Error('Credential verifier unavailable');
    return true;
  };
}

export function createAuth({enabled=false,verify,secureCookies=true,deviceToken='',maintenance=()=>false,now=Date.now}={}){
  if(enabled&&typeof verify!=='function')throw new Error('Enabled authentication requires a credential verifier');
  const router=Router(),sessions=new Map(),attempts=new Map();
  const isMaintaining=()=>enabled&&Boolean(typeof maintenance==='function'?maintenance():maintenance);
  const lifetime=8*60*60*1000,windowMs=15*60*1000;
  const tokenKey=token=>digest(token).toString('hex');
  const getToken=req=>req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const session=req=>{const key=tokenKey(getToken(req)),value=sessions.get(key);if(value&&value.until>now())return value;sessions.delete(key);return null;};
  const clearCookie=res=>res.clearCookie(cookieName,{httpOnly:true,sameSite:'strict',secure:secureCookies,path:'/'});
  const sameOrigin=(req,res,next)=>{
    if(req.get('origin')!==`${req.protocol}://${req.get('host')}`||req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'请从本平台页面提交。'});
    next();
  };
  router.use('/auth',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/auth/status',(req,res)=>res.json({enabled,authenticated:enabled&&!isMaintaining()&&Boolean(session(req)),...(isMaintaining()?{maintenance:true}:{})}));
  router.post('/auth/login',sameOrigin,async(req,res)=>{
    if(isMaintaining())return res.status(503).json({error:LOGIN_FAILURE_MESSAGE});
    if(!enabled)return res.status(503).json({error:'当前环境未启用登录验证，请先完成服务器认证配置。'});
    if(secureCookies&&!req.secure)return res.status(400).json({error:'请通过 HTTPS 登录。'});
    const {username,password}=req.body||{};
    if(typeof username!=='string'||!username.trim()||username.length>128||/[:\r\n]/.test(username)||typeof password!=='string'||!password||password.length>1024)return res.status(400).json({error:'请填写有效的账号和密码。'});
    const stamp=now();
    for(const [key,v]of attempts)if(stamp-v.since>=windowMs)attempts.delete(key);
    const key=req.ip,attempt=attempts.get(key)||{since:stamp,count:0};
    if(attempt.count>=10||attempts.size>=10000&&!attempts.has(key)){res.set('Retry-After','900');return res.status(429).json({error:'尝试次数过多，请 15 分钟后再试。'});}
    attempt.count++;attempts.set(key,attempt);
    try{
      if(!await verify(username.trim(),password))return res.status(401).json({error:LOGIN_FAILURE_MESSAGE});
      for(const [id,value]of sessions)if(value.until<=stamp)sessions.delete(id);
      sessions.delete(tokenKey(getToken(req)));
      if(sessions.size>=10000)return res.status(503).json({error:LOGIN_FAILURE_MESSAGE});
      const token=randomBytes(32).toString('base64url');sessions.set(tokenKey(token),{until:stamp+lifetime});
      res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:secureCookies,maxAge:lifetime,path:'/'});
      return res.json({ok:true,next:safeReturnPath(req.body.next)});
    }catch{return res.status(503).json({error:LOGIN_FAILURE_MESSAGE});}
  });
  router.post('/auth/logout',sameOrigin,(req,res)=>{sessions.delete(tokenKey(getToken(req)));clearCookie(res);res.json({ok:true});});
  const publicPaths=new Set(['/login','/login/','/login/index.html','/login/login.css','/login/login.js','/assets/brand/powerchina-horizontal.png']);
  router.use((req,res,next)=>{
    if(!enabled)return next();
    if(['GET','HEAD'].includes(req.method)&&publicPaths.has(req.path))return next();
    const eventPath=/^\/api\/v2\/slots\/[^/]+\/events$/.test(req.path);
    const eventContext=/^\/api\/v2\/slots\/[^/]+\/event-state$/.test(req.path);
    const baselinePath=/^\/api\/v2\/slots\/[^/]+\/joint-depth-baseline$/.test(req.path);
    const surveyPath=/^\/api\/v2\/slots\/[^/]+\/survey-depth$/.test(req.path);
    const deviceAccess=(req.method==='POST'&&(eventPath||baselinePath||surveyPath||['/api/v2/device-events','/api/v2/telemetry','/api/v2/joint-operations','/api/v2/live-pressure'].includes(req.path)))||(req.method==='GET'&&eventContext);
    if(deviceAccess&&deviceToken){
      const supplied=req.get('authorization')||'';
      if(timingSafeEqual(digest(supplied),digest(`Bearer ${deviceToken}`))){
        req.eventSource='device';
        res.set('Cache-Control','no-store');
        return next();
      }
    }
    if(isMaintaining()){
      res.set('Cache-Control','no-store');
      if(req.path.startsWith('/api/'))return res.status(503).json({error:LOGIN_FAILURE_MESSAGE,login:'/login'});
      return res.redirect(303,`/login?next=${encodeURIComponent(safeReturnPath(req.originalUrl))}`);
    }
    if(session(req)){
      if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');
      if(!['GET','HEAD','OPTIONS'].includes(req.method))return sameOrigin(req,res,next);
      return next();
    }
    res.set('Cache-Control','no-store');
    if(req.path.startsWith('/api/'))return res.status(401).json({error:'登录已失效，请重新登录。',login:'/login'});
    if(!['GET','HEAD'].includes(req.method))return res.status(401).json({error:'请先登录。'});
    res.redirect(303,`/login?next=${encodeURIComponent(safeReturnPath(req.originalUrl))}`);
  });
  return router;
}
