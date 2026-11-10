// Lots (docs/DOMAIN.md §3.7): the buys of a coin with the units each still holds after sales are
// matched to them. FIFO is the lot rule in Portugal and Germany; Portugal matches per platform and
// Germany per wallet, which is why entries carry an optional venue (docs/JURISDICTIONS.md §7).
import { type CalendarDate, compareDates, compareInstants, type Instant } from '../dates/calendar';
import { isPositive, type Money, max, min, minus, plus, sum, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { defined } from '../result';
import type { LotRule, LotScope } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { HoldingRuleOverride } from '../schema/holding-rule';
import type { CoinId, EntityId } from '../schema/ids';
import { entryRole, sameDayRank, unitsIn, unitsOut } from './effect';

/**
 * Where some of a lot's open units are: their venue and the day a move delivered them there, null while they are still
 * where they were bought.
 */
export type Place = { readonly venue: string | null; readonly since: CalendarDate | null; readonly units: Units };

export type Lot = {
  readonly id: EntityId;
  readonly coin: CoinId;
  readonly date: CalendarDate;
  readonly createdAt: Instant;
  readonly venue: string | null;
  readonly units: Units;
  /** Null for a `held` entry whose cost is unknown. */
  readonly cost: Money | null;
  readonly fee: Money | null;
  readonly remainingUnits: Units;
  /** The open units by place, none of them empty; they sum to `remainingUnits`. */
  readonly places: readonly Place[];
};

/** The units a sale or a move took from one lot, and the place they were held at (its venue and `since`). */
export type SaleTake = {
  readonly lot: EntityId;
  readonly units: Units;
  readonly venue: string | null;
  readonly since: CalendarDate | null;
};

/**
 * A sale's units, how many of them it took from lots with no cost (`held`, unknown cost), how many no lot held at its
 * date covered, and the lots it took from in the order taken: Σ `takes.units` + `unmatched` = `units`.
 */
export type SaleMatch = {
  readonly id: EntityId;
  readonly units: Units;
  readonly uncosted: Units;
  readonly unmatched: Units;
  readonly takes: readonly SaleTake[];
};

/**
 * A move's units sent, its fee in the coin (sent less received), how many of the units sent no piece outside its
 * destination covered at its date, and the pieces it took in the order taken, the fee's first: Σ `takes.units` +
 * `unmatched` = `units`.
 */
export type MoveMatch = {
  readonly id: EntityId;
  readonly units: Units;
  readonly fee: Units;
  readonly unmatched: Units;
  readonly takes: readonly SaleTake[];
};

/** The part of a move's fee no piece covered: the fee is taken first, so what the units received leave uncovered. */
export function feeUnmatched(move: Pick<MoveMatch, 'units' | 'fee' | 'unmatched'>): Units {
  return max(minus(move.unmatched, minus(move.units, move.fee)), '0' as Units);
}

export type LotMatch = {
  readonly lots: readonly Lot[];
  /** The coin's sales in `compareEntries` order. */
  readonly sales: readonly SaleMatch[];
  /** The coin's moves in `compareEntries` order. */
  readonly moves: readonly MoveMatch[];
  /**
   * Units sold, or paid as a move's fee, that no lot of the coin held at that date could cover: inconsistent data,
   * reported.
   */
  readonly unmatchedUnits: Units;
};

/** How the country matches and dates lots; the shell builds it from the profile (§4, `holdingContext`). */
export type HoldingContext = {
  readonly overrides: readonly HoldingRuleOverride[];
  readonly lotScope: LotScope;
  readonly lotRule: LotRule;
};

export const DEFAULT_HOLDING_CONTEXT: HoldingContext = { overrides: [], lotScope: 'global', lotRule: 'fifo' };

/** The group an entry is matched in: its venue under per-venue scope (no venue is a group of its own), else one. */
export function venueGroup(venue: string | null, scope: LotScope): string {
  return scope === 'per-venue' ? (venue ?? '') : '';
}

/**
 * The one total order of a coin's entries (DOMAIN §3.7): date, then `createdAt` as moments, then id, so no lot, held
 * figure or sale warning depends on the order of the entries array (equal `createdAt`: the prototype import).
 */
export function compareEntries(
  a: Pick<Entry, 'date' | 'createdAt' | 'id'>,
  b: Pick<Entry, 'date' | 'createdAt' | 'id'>,
) {
  return (
    compareDates(a.date, b.date) ||
    compareInstants(a.createdAt, b.createdAt) ||
    (a.id < b.id ? -1 : Number(a.id > b.id))
  );
}

/**
 * The order `matchLots` and `runningHeld` read a coin's entries in: date, then purchases before sales
 * (`sameDayRank`), then `compareEntries`, so a purchase and a sale on one date can match.
 */
export function matchingOrder(a: Entry, b: Entry): number {
  return compareDates(a.date, b.date) || sameDayRank(a) - sameDayRank(b) || compareEntries(a, b);
}

/** `places` less `units`, taken from the first place on; the places left empty go. */
function takeFromPlaces(places: readonly Place[], units: Units): Place[] {
  let toTake = units;
  return places.flatMap((place) => {
    const taken = min(place.units, toTake);
    toTake = minus(toTake, taken);
    const left = minus(place.units, taken);
    return isPositive(left) ? [{ ...place, units: left }] : [];
  });
}

/**
 * Matches the coin's sales to its purchases in one global order (`runningHeld`'s: date, purchases before sales, then
 * `compareEntries`), so a sale takes only lots bought on or before its date. A sale takes its own group's open lots
 * first (its venue under per-venue scope), the earliest first, or the latest first under LIFO; the units its group
 * cannot cover come from the other groups' lots open at that moment, in the same order. Only units no lot of the coin
 * covers then stay unmatched, so the units left in total and each sale's unmatched units never depend on the scope.
 * A move takes its units sent the same way from the pieces at its source venue, then from the pieces anywhere but its
 * destination, whatever the scope: its fee first, which leaves the lot, then the units received, which stay in their
 * lot at a place at `to` dated the move. Other lot rules (average, pooled, specific, unspecified) are matched FIFO here:
 * holding eligibility only needs remaining units, and the tax-year export names the country's own method (§3.13).
 */
export function matchLots(entries: readonly Entry[], coin: CoinId, scope: LotScope, rule: LotRule = 'fifo'): LotMatch {
  const own = liveEntries(entries)
    .filter((entry) => entry.coin === coin)
    .sort(compareEntries);

  // Each purchase becomes a lot whose remaining units, and the places holding them, the matching reduces in place.
  type Open = { entry: Entry; left: Units; places: { -readonly [key in keyof Place]: Place[key] }[] };
  const byId = new Map<EntityId, Open>();
  for (const entry of own) {
    if (entryRole(entry.kind) !== 'purchase') continue;
    const units = unitsIn(entry);
    byId.set(entry.id, { entry, left: units, places: [{ venue: entry.venue, since: null, units }] });
  }

  const matched = new Map<EntityId, Omit<SaleMatch, 'id' | 'units'>>();
  const open: Open[] = [];
  const inOrder = <T>(list: T[]) => (rule === 'lifo' ? list.reverse() : list);
  for (const entry of [...own].sort(matchingOrder)) {
    const lot = byId.get(entry.id);
    if (lot !== undefined) {
      open.push(lot);
      continue;
    }
    const move = entryRole(entry.kind) === 'move';
    const group = venueGroup(entry.venue, move ? 'per-venue' : scope);
    const pieces = open
      .flatMap((each) => each.places.map((place) => ({ lot: each, place })))
      .filter(({ place }) => !move || place.venue !== entry.to);
    const ours = (piece: (typeof pieces)[number]) =>
      venueGroup(piece.place.venue, move ? 'per-venue' : scope) === group;
    let toMatch = entry.units;
    // The units that leave the coin come first: all of a sale's, a move's fee; a move's other units change place.
    let leaving = unitsOut(entry);
    let uncosted = '0' as Units;
    const takes: SaleTake[] = [];
    for (const { lot: next, place } of [...inOrder(pieces.filter(ours)), ...inOrder(pieces.filter((p) => !ours(p)))]) {
      const taken = min(place.units, toMatch);
      if (!isPositive(taken)) continue;
      const gone = min(taken, leaving);
      place.units = minus(place.units, taken);
      next.left = minus(next.left, gone);
      leaving = minus(leaving, gone);
      toMatch = minus(toMatch, taken);
      takes.push({ lot: next.entry.id, units: taken, venue: place.venue, since: place.since });
      if (next.entry.amount === null) uncosted = plus(uncosted, taken);
      const kept = minus(taken, gone);
      if (isPositive(kept)) arrive(next.places, defined(entry.to, 'destination'), entry.date, kept);
    }
    matched.set(entry.id, { uncosted, unmatched: toMatch, takes });
  }

  const lots = [...byId.values()].map(
    ({ entry, left, places }): Lot => ({
      id: entry.id,
      coin: entry.coin,
      date: entry.date,
      createdAt: entry.createdAt,
      venue: entry.venue,
      units: entry.units,
      cost: entry.amount,
      fee: entry.fee,
      remainingUnits: left,
      places: places.filter((place) => isPositive(place.units)),
    }),
  );
  const sales: SaleMatch[] = [];
  const moves: MoveMatch[] = [];
  for (const entry of own) {
    const match = matched.get(entry.id);
    if (match === undefined) continue;
    const { unmatched, takes } = match;
    if (entryRole(entry.kind) === 'move')
      moves.push({ id: entry.id, units: entry.units, fee: unitsOut(entry), unmatched, takes });
    else sales.push({ id: entry.id, units: entry.units, ...match });
  }
  const unmatchedUnits = sum([...sales.map((sale) => sale.unmatched), ...moves.map(feeUnmatched)]);
  return { lots, sales, moves, unmatchedUnits };
}

/** Adds `units` to the lot's place at `venue` since `since`, or a new place there. */
function arrive(
  places: { venue: string | null; since: CalendarDate | null; units: Units }[],
  venue: string,
  since: CalendarDate,
  units: Units,
) {
  const place = places.find((each) => each.venue === venue && each.since === since);
  if (place === undefined) places.push({ venue, since, units });
  else place.units = plus(place.units, units);
}

/**
 * The lots as the units held count them (`bought − sold`, whatever the dates): a sale no lot held at its date could
 * cover (imported data; the save refuses it) leaves the lots more units than are held, so each sale's unmatched units,
 * in sale order, come off the oldest lots left. Units this takes from a lot with no cost join that sale's `uncosted`,
 * as in matching, so a no-cost unit is held or sold uncosted, never costed; `unmatched` and `takes` keep the match at
 * the sale's date. `sellableNow` and `portfolio` both read the lots and sales through this.
 */
export function heldLots(match: LotMatch): LotMatch {
  const left = match.lots.map((lot) => ({ lot, left: lot.remainingUnits }));
  /** Takes `excess` off the oldest lots left; the units it took from lots with no cost. */
  const takeOldest = (excess: Units) => {
    let uncosted = '0' as Units;
    for (const each of left) {
      const taken = min(each.left, excess);
      each.left = minus(each.left, taken);
      excess = minus(excess, taken);
      if (each.lot.cost === null) uncosted = plus(uncosted, taken);
    }
    return uncosted;
  };
  const sales = match.sales.map(
    (sale): SaleMatch => ({ ...sale, uncosted: plus(sale.uncosted, takeOldest(sale.unmatched)) }),
  );
  // A move's fee no piece covered leaves the coin all the same.
  for (const move of match.moves) takeOldest(feeUnmatched(move));
  const held = left.map(({ lot, left }) => ({
    ...lot,
    remainingUnits: left,
    places: takeFromPlaces(lot.places, minus(lot.remainingUnits, left)),
  }));
  return { ...match, lots: held, sales };
}

/** A live entry of a coin with the units held after it. */
export type HeldAfter = { readonly entry: Entry; readonly held: Units };

/**
 * The coin's live entries in the order `matchLots` matches one global queue (date, buys before sales, then
 * `compareEntries`), each with the units held after it: a sale that finds too few leaves 0, its excess unmatched.
 */
export function runningHeld(entries: readonly Entry[], coin: CoinId): HeldAfter[] {
  const own = liveEntries(entries)
    .filter((entry) => entry.coin === coin)
    .sort(matchingOrder);
  let held = '0' as Units;
  return own.map((entry) => {
    held = max(minus(plus(held, unitsIn(entry)), unitsOut(entry)), '0' as Units);
    return { entry, held };
  });
}

/** The coin's lots in `compareEntries` order, each with its remaining units. */
export function lots(entries: readonly Entry[], coin: CoinId, scope: LotScope, rule: LotRule = 'fifo'): readonly Lot[] {
  return matchLots(entries, coin, scope, rule).lots;
}

/** The units of a coin held at one venue; `venue` null for the units bought with none named. */
export type VenueUnits = { readonly venue: string | null; readonly units: Units };

/**
 * The units of `coin` held at each venue at the end of `date`: the live entries dated on or before it matched per venue
 * whatever the country's scope (units sit at a venue even where the law pools them), read through `heldLots`, so they
 * sum to the units held then. Venues with none left out, in the order of their first lot.
 */
export function venueUnits(
  entries: readonly Entry[],
  coin: CoinId,
  date: CalendarDate,
  rule: LotRule = 'fifo',
): readonly VenueUnits[] {
  const upTo = entries.filter((entry) => compareDates(entry.date, date) <= 0);
  return byVenue(heldLots(matchLots(upTo, coin, 'per-venue', rule)).lots);
}

/** The lots' places added up by venue, venues with none left out, in the order of their first lot. */
function byVenue(lots: readonly Lot[]): readonly VenueUnits[] {
  const units = new Map<string | null, Units>();
  for (const lot of lots) {
    for (const place of lot.places) units.set(place.venue, plus(units.get(place.venue) ?? ('0' as Units), place.units));
  }
  return [...units].map(([venue, held]) => ({ venue, units: held }));
}

const MOVE_RANK = sameDayRank({ kind: 'move' });

/**
 * The units of `coin` at each venue just before a move at its place in the matching order (`matchingOrder`): the
 * live entries before it matched per venue, as `matchLots` holds them when it reaches the move, so the units at its
 * source are those it takes there first. `stored` is the move being edited, which keeps its `createdAt` and id among
 * the date's other moves; a new move (null) comes after all of them, as `saveMove` stamps it at its `now`. `entries`
 * leave out the entries being edited. Venues with none left out, in the order of their first lot.
 */
export function venueUnitsAtMove(
  entries: readonly Entry[],
  coin: CoinId,
  date: CalendarDate,
  stored: Pick<Entry, 'createdAt' | 'id'> | null,
  rule: LotRule = 'fifo',
): readonly VenueUnits[] {
  const place = (entry: Entry) =>
    compareDates(entry.date, date) ||
    sameDayRank(entry) - MOVE_RANK ||
    (stored === null ? -1 : compareEntries(entry, { createdAt: stored.createdAt, id: stored.id, date }));
  return byVenue(
    matchLots(
      entries.filter((entry) => place(entry) < 0),
      coin,
      'per-venue',
      rule,
    ).lots,
  );
}
