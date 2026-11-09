// Lots (docs/DOMAIN.md §3.7): the buys of a coin with the units each still holds after sales are
// matched to them. FIFO is the lot rule in Portugal and Germany; Portugal matches per platform and
// Germany per wallet, which is why entries carry an optional venue (docs/JURISDICTIONS.md §7).
import { type CalendarDate, compareDates, compareInstants, type Instant } from '../dates/calendar';
import { isPositive, type Money, max, min, minus, plus, sum, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import type { LotRule, LotScope } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { HoldingRuleOverride } from '../schema/holding-rule';
import type { CoinId, EntityId } from '../schema/ids';
import { entryRole, sameDayRank, unitsIn, unitsOut } from './effect';

/**
 * Where some of a lot's open units are: their venue and the day they arrived there, null while they are still where
 * they were bought (no entry moves units between venues yet).
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

/** The units a sale took from one lot, and the venue they were held at. */
export type SaleTake = { readonly lot: EntityId; readonly units: Units; readonly venue: string | null };

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

export type LotMatch = {
  readonly lots: readonly Lot[];
  /** The coin's sales in `compareEntries` order. */
  readonly sales: readonly SaleMatch[];
  /** Units sold that no lot of the coin held at the sale's date could cover: inconsistent data, reported. */
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
 * cannot cover come from the other groups' lots open at that moment, in the same order (the Log has no record of a move
 * between venues yet). Only units no lot of the coin covers then stay unmatched, so the units left in total and each
 * sale's unmatched units never depend on the scope. Other lot rules (average, pooled, specific, unspecified) are
 * matched FIFO here: holding eligibility only needs remaining units, and the tax-year export names the country's own
 * method (§3.13).
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
    const group = venueGroup(entry.venue, scope);
    const pieces = open.flatMap((each) => each.places.map((place) => ({ lot: each, place })));
    const ours = (piece: (typeof pieces)[number]) => venueGroup(piece.place.venue, scope) === group;
    let toMatch = unitsOut(entry);
    let uncosted = '0' as Units;
    const takes: SaleTake[] = [];
    for (const { lot: next, place } of [...inOrder(pieces.filter(ours)), ...inOrder(pieces.filter((p) => !ours(p)))]) {
      const taken = min(place.units, toMatch);
      if (!isPositive(taken)) continue;
      place.units = minus(place.units, taken);
      next.left = minus(next.left, taken);
      toMatch = minus(toMatch, taken);
      takes.push({ lot: next.entry.id, units: taken, venue: place.venue });
      if (next.entry.amount === null) uncosted = plus(uncosted, taken);
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
  const sales = own.flatMap((entry): SaleMatch[] => {
    const sale = matched.get(entry.id);
    return sale === undefined ? [] : [{ id: entry.id, units: entry.units, ...sale }];
  });
  return { lots, sales, unmatchedUnits: sum(sales.map((sale) => sale.unmatched)) };
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
  const sales = match.sales.map((sale): SaleMatch => {
    let excess = sale.unmatched;
    let uncosted = sale.uncosted;
    for (const each of left) {
      const taken = min(each.left, excess);
      each.left = minus(each.left, taken);
      excess = minus(excess, taken);
      if (each.lot.cost === null) uncosted = plus(uncosted, taken);
    }
    return { ...sale, uncosted };
  });
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
  const byVenue = new Map<string | null, Units>();
  for (const lot of heldLots(matchLots(upTo, coin, 'per-venue', rule)).lots) {
    for (const { venue, units } of lot.places) byVenue.set(venue, plus(byVenue.get(venue) ?? ('0' as Units), units));
  }
  return [...byVenue].map(([venue, units]) => ({ venue, units }));
}
