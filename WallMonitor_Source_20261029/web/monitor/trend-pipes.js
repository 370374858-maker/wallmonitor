import {pipeLabel} from '../../shared/pipe-labels.js';
export const TREND_PIPES = Object.freeze([
  Object.freeze({ id: 't1', label: '浇筑管 1' }),
  Object.freeze({ id: 't2', label: '浇筑管 2' }),
  Object.freeze({ id: 't3', label: '浇筑管 3' }),
  Object.freeze({ id: 'left', label: '左接头管' }),
  Object.freeze({ id: 'right', label: '右接头管' })
]);

export function configuredTrendPipeIds(slot) {
  const ids = Array.from({ length: slot?.tremieCount || 0 }, (_, index) => `t${index + 1}`);
  if (slot?.jointLayout === 'left' || slot?.jointLayout === 'both') ids.push('left');
  if (slot?.jointLayout === 'right' || slot?.jointLayout === 'both') ids.push('right');
  return ids;
}

                                                                         
                                                                         
export function pipeTrendRows(rows, id) {
  return rows.map(row => ({ ...row,
    theoreticalEmbedment: row[`${id}TheoreticalEmbedment`] ?? null,
    actualEmbedment: row[`${id}ActualEmbedment`] ?? null
  }));
}

export function pipeCsvColumns(slot) {
  return TREND_PIPES.flatMap(({ id, label }) => [
    { key: `${id}ActualEmbedment`, label: `${slot?pipeLabel(slot,id):label}实测埋深(m)` },
    { key: `${id}TheoreticalEmbedment`, label: `${slot?pipeLabel(slot,id):label}理论埋深(m)` }
  ]);
}
