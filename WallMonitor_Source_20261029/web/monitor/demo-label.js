export const isDemoSlot=slot=>typeof slot?.code==='string'&&slot.code.startsWith('DEMO-');
export const dataModeText=(slot,text)=>isDemoSlot(slot)?'模拟数据 · '+text:text;
