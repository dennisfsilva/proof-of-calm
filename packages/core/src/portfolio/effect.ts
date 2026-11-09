// What each entry kind does to the units of its coin (docs/DOMAIN.md §3.7): a purchase brings units in, a sale takes
// them out, a move takes out only its fee in the coin. Every figure that asks whether an entry adds or removes units reads it here, so a new kind is handled once.
import { minus, type Units } from '../money/decimal';
import { assertNever } from '../result';
import type { Entry, EntryKind } from '../schema/entry';

export type EntryRole = 'purchase' | 'move' | 'sale';

/** The role of a kind: `held` brings units in like a buy, though its cost may be unknown. */
export function entryRole(kind: EntryKind): EntryRole {
  switch (kind) {
    case 'dca':
    case 'lump':
    case 'extra':
    case 'held':
      return 'purchase';
    case 'move':
      return 'move';
    case 'sell':
      return 'sale';
    default:
      return assertNever(kind);
  }
}

type Moving = Pick<Entry, 'kind' | 'units' | 'received'>;
type Rank = 0 | 1 | 2;

type Effect = {
  readonly in: (entry: Moving) => Units;
  readonly out: (entry: Moving) => Units;
  /** The place of a same-day entry in the matching order: purchases, moves, then sales (`matchLots`, `runningHeld`). */
  readonly rank: Rank;
};

const NONE = '0' as Units;

// One row per role: a new role does not build until it states its units and its place in the day.
const EFFECTS: { readonly [role in EntryRole]: Effect } = {
  purchase: { in: (entry) => entry.units, out: () => NONE, rank: 0 },
  // A move keeps the units it delivers: only its fee in the coin, the units sent less those received, leaves.
  move: { in: () => NONE, out: (entry) => minus(entry.units, entry.received ?? entry.units), rank: 1 },
  sale: { in: () => NONE, out: (entry) => entry.units, rank: 2 },
};

/** Units the entry adds to its coin; 0 for a sale. */
export function unitsIn(entry: Moving): Units {
  return EFFECTS[entryRole(entry.kind)].in(entry);
}

/** Units the entry takes from its coin; 0 for a purchase, a move's fee in the coin. */
export function unitsOut(entry: Moving): Units {
  return EFFECTS[entryRole(entry.kind)].out(entry);
}

/** The entry's place among its coin's entries of one date, before `compareEntries`: purchases, moves, then sales. */
export function sameDayRank(entry: Pick<Entry, 'kind'>): Rank {
  return EFFECTS[entryRole(entry.kind)].rank;
}
