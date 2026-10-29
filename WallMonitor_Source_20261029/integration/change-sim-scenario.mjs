export function changeSimulation({now=Date.now(),project='895',machine='1'}={}){
  const base=Math.floor(now/1000)*1000-40*60000;
  const rows=[];
  const add=(stream,id,minutes,values)=>{
    const stamp=base+minutes*60000,date=new Date(stamp+8*3600000).toISOString().slice(0,10).replaceAll('-','');
    rows.push({stream,table:`${stream}_${project}_${machine}_${date}`,row:{Id:String(id),ServerTimeStamp:String(stamp/1000),W1:Number(project),W2:Number(machine),...values}});
  };
  for(const [index,[minute,depth]]of [[0,60],[5,60],[10,59.8],[11,59.5],[12,59.5],[20,59],[39,59]].entries())add('DA1',index+1,minute,{R32:depth,R30:100-depth});
  const list=[
    [0,80,.2,18,80,.15,17],
    [2,80,.2,9,80,.15,8],
    [8,79.8,.2,25.6,80,.15,11],
    [9,79.8,.2,12,80,.15,10],
    [14,79.6,.2,27.2,80,.15,12],
    [15,79.6,.2,10,80,.15,9],
    [25,79.3,.3,23.4,79.85,.15,22.1],
    [26,79.3,.3,9,79.85,.15,8],
    [39,79.3,.3,2,79.85,.15,5]
  ];
  for(const [index,[minute,left,pullLeft,pLeft,right,pullRight,pRight]]of list.entries())add('DA2',index+1,minute,{R3:left,R2:pullLeft,R1:pLeft,R18:right,R17:pullRight,R16:pRight});
  return {createdAt:new Date(now).toISOString(),baseline:new Date(base-60000).toISOString(),startDate:new Date(base+8*3600000).toISOString().slice(0,10),rows,expected:{measurements:4,jointEvents:3,totalEvents:7,actualDepth:59,actualHeight:41,jointDepths:{left:79.3,right:79.85},leftPulls:[.2,.2,.3],rightPulls:[.15],jointRecordPressures:{left:23.4,right:22.1},originalTimesPreserved:true}};
}
