import {Router} from 'express';
import path from 'node:path';

export const dashboardHome='/dashboard#overview';
export const legacyPagePaths=new Set(['/', '/index.html', '/workbench', '/workbench/', '/workbench/index.html',
  '/monitor', '/monitor/', '/monitor/index.html', '/dashboard/', '/dashboard/index.html']);

export function createPageRouter(webDir){
  const router=Router({strict:true});
  const home=(_req,res)=>res.set('Cache-Control','no-store').redirect(303,dashboardHome);
                                                                   
  router.get([...legacyPagePaths],(req,res)=>{
                                                                          
    if(req.query.embedded==='monitor'&&req.get('sec-fetch-dest')==='iframe'){
      const query=new URL(req.originalUrl,'http://local.invalid').search;
      return res.set('Cache-Control','no-store').redirect(303,'/embedded/workbench'+query);
    }
    return home(req,res);
  });
  router.get('/embedded/workbench',(req,res)=>{
    if(req.query.embedded!=='monitor'||req.get('sec-fetch-dest')==='document')return home(req,res);
    return res.set('Cache-Control','no-store').sendFile(path.join(webDir,'workbench','index.html'));
  });
  router.get('/dashboard',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(webDir,'monitor','index.html')));
  return router;
}
