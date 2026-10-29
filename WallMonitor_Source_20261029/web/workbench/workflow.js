export const WORKSPACE_TABS = {record:['record','history','record-edit'],'slot-info':['slot','slot-ledger','slot-edit']};
export const WORKFLOW_TABS = Object.values(WORKSPACE_TABS).flat();
export const workspaceFor = tab => WORKSPACE_TABS['slot-info'].includes(tab) ? 'slot-info' : 'record';
export const isSlotTab = tab => tab === 'slot' || tab === 'slot-edit';
export const isRecordTab = tab => tab === 'record' || tab === 'record-edit';
export function nextWorkflowTab(tab, key) {
  const tabs=WORKSPACE_TABS[workspaceFor(tab)],index=tabs.indexOf(tab);
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs.at(-1);
  if (key === 'ArrowRight') return tabs[(index + 1) % tabs.length];
  if (key === 'ArrowLeft') return tabs[(index + tabs.length - 1) % tabs.length];
  return null;
}
