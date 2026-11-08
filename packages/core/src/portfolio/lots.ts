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
};

/** The units a sale took from one lot. */
export type SaleTake = { readonly lot: EntityId; readonly units: Units };

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
  const isSale = (entry: Entry) => Number(entry.kind === 'sell');
  // Stable after `compareEntries`: buys before sells on the same day, so a purchase and a sale on one date can match.
  const events = [...own].sort((a, b) => compareDates(a.date, b.date) || isSale(a) - isSale(b));

  // Each purchase becomes a lot whose remaining units the matching below reduces in place.
  const byId = new Map<EntityId, { entry: Entry; left: Units }>();
  for (const entry of own) if (entry.kind !== 'sell') byId.set(entry.id, { entry, left: entry.units });

  const matched = new Map<EntityId, Omit<SaleMatch, 'id' | 'units'>>();
  const open: { entry: Entry; left: Units }[] = [];
  const inOrder = <T>(list: T[]) => (rule === 'lifo' ? list.reverse() : list);
  for (const entry of events) {
    const lot = byId.get(entry.id);
    if (lot !== undefined) {
      open.push(lot);
      continue;
    }
    const group = venueGroup(entry.venue, scope);
    const ours = (candidate: { entry: Entry }) => venueGroup(candidate.entry.venue, scope) === group;
    let toMatch = entry.units;
    let uncosted = '0' as Units;
    const takes: SaleTake[] = [];
    for (const next of [...inOrder(open.filter(ours)), ...inOrder(open.filter((each) => !ours(each)))]) {
      const taken = min(next.left, toMatch);
      if (!isPositive(taken)) continue;
      next.left = minus(next.left, taken);
      toMatch = minus(toMatch, taken);
      takes.push({ lot: next.entry.id, units: taken });
      if (next.entry.amount === null) uncosted = plus(uncosted, taken);
    }
    matched.set(entry.id, { uncosted, unmatched: toMatch, takes });
  }

  const lots = [...byId.values()].map(
    ({ entry, left }): Lot => ({
      id: entry.id,
      coin: entry.coin,
      date: entry.date,
      createdAt: entry.createdAt,
      venue: entry.venue,
      units: entry.units,
      cost: entry.amount,
      fee: entry.fee,
      remainingUnits: left,
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
  return { ...match, lots: left.map(({ lot, left }) => ({ ...lot, remainingUnits: left })), sales };
}

/** A live entry of a coin with the units held after it. */
export type HeldAfter = { readonly entry: Entry; readonly held: Units };

/**
 * The coin's live entries in the order `matchLots` matches one global queue (date, buys before sales, then
 * `compareEntries`), each with the units held after it: a sale that finds too few leaves 0, its excess unmatched.
 */
export function runningHeld(entries: readonly Entry[], coin: CoinId): HeldAfter[] {
  const sale = (entry: Entry) => Number(entry.kind === 'sell');
  const own = liveEntries(entries)
    .filter((entry) => entry.coin === coin)
    .sort((a, b) => compareDates(a.date, b.date) || sale(a) - sale(b) || compareEntries(a, b));
  let held = '0' as Units;
  return own.map((entry) => {
    held = entry.kind === 'sell' ? max(minus(held, entry.units), '0' as Units) : plus(held, entry.units);
    return { entry, held };
  });
}

/** The coin's lots in `compareEntries` order, each with its remaining units. */
export function lots(entries: readonly Entry[], coin: CoinId, scope: LotScope, rule: LotRule = 'fifo'): readonly Lot[] {
  return matchLots(entries, coin, scope, rule).lots;
}
