import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAuth,nginxCredentialVerifier,safeReturnPath} from '../server/auth.js';

async function fixture(t,options={}){
  const app=express();app.use(express.json());
  app.use(createAuth({enabled:true,secureCookies:false,verify:async(u,p)=>u==='tester'&&p==='test-only',...options}));
  app.use((req,res)=>res.json({protected:true,source:req.eventSource||'manual'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(path,init={})=>fetch(origin+path,{redirect:'manual',...init});
  const login=(body={},headers={})=>request('/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify({username:'tester',password:'test-only',...body})});
  return {origin,request,login};
}
test('login protects pages and APIs, keeps credentials server-side, and invalidates logout',async t=>{
  const {origin,request,login}=await fixture(t);
  let r=await request('/dashboard?slot=a');assert.equal(r.status,303);assert.match(r.headers.get('location'),/^\/login\?next=/);
  r=await request('/api/v2/slots');assert.equal(r.status,401);assert.equal(r.headers.get('www-authenticate'),null);
  assert.equal((await request('/login')).status,200);
  assert.equal((await request('/login/login.css')).status,200);
  r=await login({password:'incorrect'});assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
  r=await login({next:'/dashboard?slot=a#record'});assert.equal(r.status,200);
  const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.doesNotMatch(cookie,/test-only|tester/);
  assert.equal((await r.json()).next,'/dashboard?slot=a#record');
  const headers={Cookie:cookie.split(';')[0]};
  assert.equal((await request('/api/v2/slots',{headers})).status,200);
  assert.equal((await request('/api/v2/slots',{headers:{Cookie:'wall_session=forged'}})).status,401);
  assert.equal((await request('/api/v2/slots',{method:'POST',headers})).status,403);
  assert.equal((await request('/api/v2/slots',{method:'POST',headers:{...headers,Origin:origin}})).status,200);
  assert.equal((await request('/auth/logout',{method:'POST',headers:{...headers,Origin:origin}})).status,200);
  assert.equal((await request('/api/v2/slots',{headers})).status,401);
});
test('sessions expire, rotate on relogin, and login attempts are rate limited',async t=>{
  let clock=0;const {request,login}=await fixture(t,{now:()=>clock});
  let r=await login();const first=r.headers.get('set-cookie').split(';')[0];
  r=await login({}, {Cookie:first});const second=r.headers.get('set-cookie').split(';')[0];
  assert.notEqual(first,second);
  assert.equal((await request('/api/v2/slots',{headers:{Cookie:first}})).status,401);
  clock=8*3600000+1;
  assert.equal((await request('/api/v2/slots',{headers:{Cookie:second}})).status,401);
  for(let i=0;i<10;i++)assert.equal((await login({password:'wrong'})).status,401);
  r=await login();assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'900');
  clock+=15*60000;assert.equal((await login()).status,200);
});
test('cross-origin, insecure login, and unavailable verification fail closed',async t=>{
  const {login}=await fixture(t);
  assert.equal((await login({}, {Origin:'https://other.invalid'})).status,403);
  assert.equal((await login({}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  const secure=await fixture(t,{secureCookies:true});assert.equal((await secure.login()).status,400);
  const broken=await fixture(t,{verify:async()=>{throw Error('internal secret');}});
  const r=await broken.login();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/internal secret/);
  assert.throws(()=>createAuth({enabled:true}));
});
test('manual sessions and machine credentials reach the same save route with trusted provenance',async t=>{
  const {request,login,origin}=await fixture(t,{deviceToken:'test-device-token'});
  const path='/api/v2/slots/123/events',headers={Authorization:'Bearer test-device-token'};
  let response=await request(path,{method:'POST',headers});
  assert.equal(response.status,200);assert.equal((await response.json()).source,'device');
  assert.equal((await request('/api/v2/slots/123/event-state',{headers})).status,200);
  for(const [method,suffix]of [['GET','events'],['POST','event-state'],['POST','events/preview'],['POST','events/revise'],['DELETE','events'],['PUT','monitoring-policy']]){
    assert.equal((await request('/api/v2/slots/123/'+suffix,{method,headers})).status,401);
  }
  assert.equal((await request(path,{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
  response=await login();const cookie=response.headers.get('set-cookie').split(';')[0];
  response=await request(path,{method:'POST',headers:{Cookie:cookie,Origin:origin}});
  assert.equal(response.status,200);assert.equal((await response.json()).source,'manual');
  assert.equal((await request(path,{method:'POST',headers:{Cookie:cookie}})).status,403);
});
test('device credential only permits device ingestion, never administration',async t=>{
  const {request}=await fixture(t,{deviceToken:'test-device-token'});
  const headers={Authorization:'Bearer test-device-token'};
  assert.equal((await request('/api/v2/device-events',{method:'POST',headers})).status,200);
  assert.equal((await request('/api/v2/device-events',{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await request('/api/v2/slots',{method:'POST',headers})).status,401);
  assert.equal((await request('/api/v2/device-events',{headers})).status,401);
  assert.equal((await request('/api/v2/telemetry',{method:'POST',headers})).status,200);
  assert.equal((await request('/api/v2/telemetry/status',{headers})).status,401);
  assert.equal((await request('/api/v2/telemetry',{headers})).status,401);
  for(const path of ['/api/v2/joint-operations','/api/v2/live-pressure','/api/v2/slots/test/joint-depth-baseline','/api/v2/slots/test/survey-depth']){
    assert.equal((await request(path,{method:'POST',headers})).status,200);
    assert.equal((await request(path,{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
    assert.equal((await request(path,{headers})).status,401);
  }
  assert.equal((await request('/api/v2/slots/test/live-pressure',{headers})).status,401);
});
test('local auth-disabled mode remains accessible; return paths cannot escape site',async t=>{
  const {request}=await fixture(t,{enabled:false});assert.equal((await request('/dashboard')).status,200);
  assert.deepEqual(await (await request('/auth/status')).json(),{enabled:false,authenticated:false});
  for(const path of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/%2f%2fevil.invalid','/%5cevil.invalid','/auth/status','/login','/a/../login','/%00','/%zz'])assert.equal(safeReturnPath(path),'/dashboard',path);
  assert.equal(safeReturnPath('/dashboard?slot=a#record'),'/dashboard?slot=a#record');
  for(const address of ['https://127.0.0.1:4180','http://evil.invalid','http://user:pass@127.0.0.1:4180'])assert.throws(()=>nginxCredentialVerifier(address));
});
test('loopback verifier accepts success, rejects bad accounts and rejects unexpected status',async t=>{
  const app=express();app.get('/verify',(req,res)=>res.status(req.get('authorization')===`Basic ${Buffer.from('tester:test-only').toString('base64')}`?200:401).end());
  app.get('/broken',(_req,res)=>res.status(302).end());
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const address=`http://127.0.0.1:${server.address().port}`;
  const verify=nginxCredentialVerifier(address+'/verify');
  assert.equal(await verify('tester','test-only'),true);assert.equal(await verify('tester','wrong'),false);
  await assert.rejects(nginxCredentialVerifier(address+'/broken')('tester','test-only'));
});


test('maintenance flag blocks correct-password login and protected sessions until disabled',async t=>{
 let maintaining=false;const {request,login}=await fixture(t,{maintenance:()=>maintaining});
 const first=await login(),cookie=first.headers.get('set-cookie').split(';')[0];
 maintaining=true;let response=await login();assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.deepEqual(await response.json(),{error:'密码错误或系统正在维护中'});
 assert.deepEqual(await(await request('/auth/status',{headers:{Cookie:cookie}})).json(),{enabled:true,authenticated:false,maintenance:true});
 response=await request('/api/v2/slots',{headers:{Cookie:cookie}});assert.equal(response.status,503);assert.equal((await response.json()).error,'密码错误或系统正在维护中');
 assert.equal((await request('/dashboard',{headers:{Cookie:cookie}})).status,303);assert.equal((await request('/login')).status,200);
 maintaining=false;assert.equal((await login()).status,200);assert.equal((await request('/api/v2/slots',{headers:{Cookie:cookie}})).status,200);
});
test('bad password and verifier outage use the same user-requested message',async t=>{
 const ordinary=await fixture(t),broken=await fixture(t,{verify:async()=>{throw Error('secret details');}});
 assert.deepEqual(await(await ordinary.login({password:'wrong'})).json(),{error:'密码错误或系统正在维护中'});
 assert.deepEqual(await(await broken.login()).json(),{error:'密码错误或系统正在维护中'});
});
