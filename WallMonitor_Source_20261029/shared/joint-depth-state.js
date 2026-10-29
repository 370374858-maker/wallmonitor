export const jointDepthPending=(slot,side)=>slot?.jointDepthInitialization?.mode==='source-first-depth'
  &&slot.jointDepthInitialization.sides?.[side]?.state==='pending';
export const initialJointDepth=(slot,side)=>jointDepthPending(slot,side)?null:slot?.jointInitialDepths?.[side]??null;
