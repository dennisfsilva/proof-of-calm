// What each entry kind does to the units of its coin (docs/DOMAIN.md §3.7): a purchase brings units in, a sale takes
// them out. Every figure that asks whether an entry adds or removes units reads it here, so a new kind is handled once.
import type { Units } from '../money/decimal';
import { assertNever } from '../result';
import type { Entry, EntryKind } from '../schema/entry';

export type EntryRole = 'purchase' | 'sale';

/** The role of a kind: `held` brings units in like a buy, though its cost may be unknown. */
export function entryRole(kind: EntryKind): EntryRole {
  switch (kind) {
    case 'dca':
    case 'lump':
    case 'extra':
    case 'held':
      return 'purchase';
    case 'sell':
      return 'sale';
    default:
      return assertNever(kind);
  }
}

type Moving = Pick<Entry, 'kind' | 'units'>;

type Effect = {
  readonly in: (entry: Moving) => Units;
  readonly out: (entry: Moving) => Units;
  /** The place of a same-day entry in the matching order: purchases, then sales (`matchLots`, `runningHeld`). */
  readonly rank: 0 | 2;
};

const NONE = '0' as Units;

// One row per role: a new role does not build until it states its units and its place in the day.
const EFFECTS: { readonly [role in EntryRole]: Effect } = {
  purchase: { in: (entry) => entry.units, out: () => NONE, rank: 0 },
  sale: { in: () => NONE, out: (entry) => entry.units, rank: 2 },
};

/** Units the entry adds to its coin; 0 for a sale. */
export function unitsIn(entry: Moving): Units {
  return EFFECTS[entryRole(entry.kind)].in(entry);
}

/** Units the entry takes from its coin; 0 for a purchase. */
export function unitsOut(entry: Moving): Units {
  return EFFECTS[entryRole(entry.kind)].out(entry);
}

/** The entry's place among its coin's entries of one date, before `compareEntries`: purchases first, then sales. */
export function sameDayRank(entry: Pick<Entry, 'kind'>): 0 | 2 {
  return EFFECTS[entryRole(entry.kind)].rank;
}
