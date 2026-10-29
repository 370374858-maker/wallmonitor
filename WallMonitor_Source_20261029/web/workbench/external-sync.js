                                                                             
export function createExternalSync({ current, fetchContext, applyContext, notify }) {
  let running=false, notified='';
  return async function sync(slotId, revision=null) {
    const before=current();
    if(running||!slotId||before.slotId!==slotId||before.busy)return false;
    if(revision!=null&&Number(revision)<=Number(before.revision))return false;
    const defer=next=>{
      const key=`${slotId}:${next}`;
      if(notified!==key){notified=key;notify('有新的施工数据。当前编辑已保留，请完成或放弃编辑后刷新；保存时将校验数据版本。');}
      return false;
    };
    if(before.editing&&revision!=null)return defer(revision);
    running=true;
    try{
      const context=await fetchContext(slotId),after=current();
      if(after.slotId!==slotId||context.slot.id!==slotId||after.busy||Number(context.baseRevision)<=Number(after.revision))return false;
      if(after.editing)return defer(context.baseRevision);
      await applyContext(context);
      notified='';return true;
    }finally{running=false;}
  };
}
