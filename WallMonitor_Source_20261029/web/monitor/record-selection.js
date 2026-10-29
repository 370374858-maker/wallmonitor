export const TREND_PAGE_SIZE = 4;
export const ALERT_PAGE_SIZE = 8;

export function pageItems(items, page = 0, size = TREND_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(0, Math.min(pages - 1, Number.isFinite(page) ? Math.trunc(page) : 0));
  return { items: items.slice(current * size, (current + 1) * size), page: current, pages, total: items.length };
}
export const selectedTrendRow = (rows, id) => rows.find(row => row.id === id) || rows.at(-1) || null;

                                                                              
                                                                                
                                                                        
export function createSnapshotLoader({ fetchRecord, pending, ready, empty, failed }) {
  let generation = 0, activeKey = '', cachedKey = '', cachedRecord = null, inflight = null;
  return {
    clear() { ++generation; activeKey = ''; inflight = null; cachedKey = ''; cachedRecord = null; empty(); },
    async select(slot, row, latest = null) {
      if (!row) { this.clear(); return; }
      const key = `${slot.id}:${slot.dataRevision || 0}:${row.id}`;
      if (key === activeKey && inflight) return inflight;
      activeKey = key;
      inflight = null;
      const turn = ++generation;
      const current = () => turn === generation && key === activeKey;
      if (row.id === latest?.id) { ready(latest, slot); return; }
      if (key === cachedKey) { ready(cachedRecord, slot); return; }
      pending(row);
      const promise = (async () => {
        try {
          const record = await Promise.resolve().then(() => fetchRecord(slot.id, row.id));
          if (!current()) return;
          if (record.id !== row.id || (record.slotId && record.slotId !== slot.id)) throw new Error('车次快照与所选记录不一致');
          cachedKey = key; cachedRecord = record;
          ready(record, slot);
        } catch (error) { if (current()) failed(error); }
        finally { if (current()) inflight = null; }
      })();
      inflight = promise;
      return promise;
    }
  };
}
