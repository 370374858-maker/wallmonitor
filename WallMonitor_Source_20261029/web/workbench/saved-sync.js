                                                                              
                                                                             
export function createSavedSync({current,applyContext,notifySaved,fetchSlots,applySlots,onError}){
  return async (result,context)=>{
    const before=current(),slotId=context?.slot?.id||result.events?.[0]?.slotId||before.slotId;
    if(context&&slotId===before.slotId&&Number(context.baseRevision)>=Number(before.revision))applyContext(context);
    const revision=Number(context?.baseRevision??result.baseRevision);
    notifySaved({slotId,baseRevision:revision});
    if(!context)return;
    try{
      const slots=await fetchSlots(),after=current();
      if(after.slotId===slotId&&Number(after.revision)===revision)applySlots(slots);
    }catch(error){onError(error);}
  };
}
