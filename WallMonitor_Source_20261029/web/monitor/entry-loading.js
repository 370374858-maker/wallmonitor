                                                                                   
export function createEntryLoading({render, schedule=setTimeout, cancel=clearTimeout, delay=45000}) {
  let timer=null, waiting=false;
  const stop=()=>{if(timer!==null)cancel(timer);timer=null;};
  return {
    start(){stop();waiting=true;render({visible:true,retry:false,message:'正在加载施工页面…'});
      timer=schedule(()=>{timer=null;if(waiting)render({visible:true,retry:true,message:'施工页面加载较慢，请检查网络，或点击重新加载。'});},delay);},
    ready(){waiting=false;stop();render({visible:false,retry:false,message:'独立事件录入'});},
    failed(message){waiting=false;stop();render({visible:true,retry:true,message:message||'施工页面加载失败，请点击重新加载。'});},
    dispose(){waiting=false;stop();}
  };
}
