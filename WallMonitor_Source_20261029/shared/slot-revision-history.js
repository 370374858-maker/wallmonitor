const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export function slotChanges(before={},after={}){
 const changes=[],add=(field,label,a,b,unit='')=>{if(!same(a,b))changes.push({field,label,before:a??null,after:b??null,unit});};
 for(const [field,label,unit]of [['code','槽段编号',''],['width','宽度','m'],['depth','槽深','m'],['thickness','厚度','m'],['initialConcreteHeight','初始混凝土面高','m'],['initialObservedAt','初始观测时间',''],['tremieCount','浇筑管数量','根'],['jointLayout','接头管位置',''],['jointDiameter','接头管直径','m']])add(field,label,before?.[field],after?.[field],unit);
 const count=Math.max(before?.tremieInitialDepths?.length??0,after?.tremieInitialDepths?.length??0);
 for(let i=0;i<count;i++){
  add('tremieLabels.'+i,`浇筑管 ${i+1} 序号`,before?.tremieLabels?.[i],after?.tremieLabels?.[i]);
  add('tremieInitialDepths.'+i,`浇筑管 ${i+1} 初始管底测深`,before?.tremieInitialDepths?.[i],after?.tremieInitialDepths?.[i],'m');
 }
 for(const side of ['left','right'])add('jointInitialDepths.'+side,`${side==='left'?'左':'右'}接头管初始管底测深`,before?.jointInitialDepths?.[side],after?.jointInitialDepths?.[side],'m');
 add('jointDepthInitialization','接头管初始化状态',before?.jointDepthInitialization?.mode,after?.jointDepthInitialization?.mode);
 return changes;
}
export function revisionHistoryDetails({result={},reason='',slotBefore={},slotAfter={}}){
 const survey=slotAfter?.slotDepthSurvey,previous=slotBefore?.slotDepthSurvey;
 const surveyChanged=survey&&!same(survey.sourceRow,previous?.sourceRow);
 const origin=result.origin??(surveyChanged||/^设备.*初始化|^设备实测槽深|^自动更新槽深/.test(reason)?'device':'manual');
 return {origin,observedAt:result.observedAt??(origin==='device'&&surveyChanged?survey.observedAt:null),sourceRow:result.sourceRow??(origin==='device'&&surveyChanged?survey.sourceRow:null),changes:slotChanges(slotBefore,slotAfter)};
}
