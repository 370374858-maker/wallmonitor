                                                                                        
export const EMBEDDED_HISTORY_PAGE_SIZE = 50;
export function historyPath(slotId, embedded, offset = 0) {
  return `/slots/${encodeURIComponent(slotId)}/records?limit=${embedded ? EMBEDDED_HISTORY_PAGE_SIZE : 50}&offset=${Math.max(0, Math.trunc(Number(offset) || 0))}&order=truck-asc`;
}
