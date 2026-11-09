import type { Entry } from '../schema/entry';

/**
 * The Log's transaction: entries with the same kind, date and (for monthly buys) slot are one row
 * (docs/DOMAIN.md §3.9, the prototype's grouping key); a move is a row of its own, keyed by its id.
 */
export function transactionKey(entry: Pick<Entry, 'id' | 'kind' | 'date' | 'slot'>): string {
  if (entry.kind === 'move') return `move|${entry.date}|${entry.id}`;
  return `${entry.kind}|${entry.date}|${entry.kind === 'dca' ? (entry.slot ?? '') : ''}`;
}
