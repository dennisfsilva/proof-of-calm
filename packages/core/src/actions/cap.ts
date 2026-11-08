// The entry cap of every write from this device (docs/DOMAIN.md §6, §9): a plan holds at most MAX_ENTRIES live
// entries, the most its backup restores, so the next export of whatever a write leaves reads back.
import { MAX_ENTRIES } from '../constants';
import type { Entry } from '../schema/entry';
import type { ActionError } from './errors';

/** What the cap counts: an entry, or a draft of one. */
type Counted = Pick<Entry, 'deletedAt'>;

export type TooManyEntries = Extract<ActionError, { readonly code: 'too-many-entries' }>;

/**
 * Refuses a write that leaves more live entries than `MAX_ENTRIES` and more than before it, `before` and `after`
 * being the entries as stored without and with the write; an edit that adds no live entry, a delete and a tombstone are
 * never refused, even over the cap, and an edit that fills a new coin row counts that row. Only `deletedAt` is read, so
 * a draft whose units wait for a price counts as the row it will be.
 */
export function overCap(before: readonly Counted[], after: readonly Counted[]): TooManyEntries | null {
  const count = live(after);
  return count > MAX_ENTRIES && count > live(before) ? { code: 'too-many-entries', max: MAX_ENTRIES } : null;
}

function live(entries: readonly Counted[]): number {
  return entries.filter((entry) => entry.deletedAt === null).length;
}
