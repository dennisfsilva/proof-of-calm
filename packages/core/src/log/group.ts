import type { Entry } from '../schema/entry';

/**
 * The Log's transaction: entries with the same kind, date and (for monthly buys) slot are one row
 * (docs/DOMAIN.md §3.9, the prototype's grouping key).
 */
export function transactionKey(entry: Pick<Entry, 'kind' | 'date' | 'slot'>): string {
  return `${entry.kind}|${entry.date}|${entry.kind === 'dca' ? (entry.slot ?? '') : ''}`;
}
