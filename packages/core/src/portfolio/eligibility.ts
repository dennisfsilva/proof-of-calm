// Holding eligibility per coin and across the portfolio (docs/DOMAIN.md §3.7), ported from the
// prototype's eligibility() and dateHint() and made per lot, per venue and per acquisition-date rule.
import { type CalendarDate, compareDates } from '../dates/calendar';
import { eligibleFrom, ruleFor, sameHoldingRule } from '../holding/eligible-from';
import {
  compare,
  isPositive,
  isZero,
  type Money,
  minus,
  plus,
  product,
  type Ratio,
  ratio,
  sum,
  type Units,
} from '../money/decimal';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import type { PriceSnapshot } from '../schema/prices';
import {
  DEFAULT_HOLDING_CONTEXT,
  type HoldingContext,
  heldLots,
  type Lot,
  lots,
  matchingOrder,
  matchLots,
  type Place,
  venueGroup,
} from './lots';
import { portfolio } from './portfolio';

// The context lives beside the matching, which `portfolio` reads too (no import cycle); exported here as before.
export { DEFAULT_HOLDING_CONTEXT, type HoldingContext };

/**
 * The context for a plan in a country. Acquisition-date overrides apply only while the plan uses the
 * country's own rule: a custom rule from Settings applies to every purchase (docs/JURISDICTIONS.md §5).
 */
export function holdingContext(plan: Plan, rules: CountryRules | null): HoldingContext {
  if (rules === null) return DEFAULT_HOLDING_CONTEXT;
  return {
    overrides: sameHoldingRule(plan.holdingRule, rules.holdingRule) ? rules.holdingRuleOverrides : [],
    lotScope: rules.lotScope,
    lotRule: rules.lotRule,
  };
}

/** When one lot passes its rule. */
export function lotEligibleFrom(plan: Plan, lot: Pick<Lot, 'date'>, context: HoldingContext): CalendarDate {
  return eligibleFrom(lot.date, ruleFor(lot.date, plan.holdingRule, context.overrides));
}

function isEligible(plan: Plan, lot: Lot, context: HoldingContext, at: CalendarDate): boolean {
  return (
    ruleFor(lot.date, plan.holdingRule, context.overrides).kind === 'none' || lotEligibleFrom(plan, lot, context) <= at
  );
}

export type CoinEligibility = {
  readonly coin: CoinId;
  readonly units: Units;
  readonly eligibleUnits: Units;
  /** eligibleUnits / units. */
  readonly fraction: Ratio;
};

export type Eligibility = {
  readonly coins: readonly CoinEligibility[];
  /** Weighted share of the holdings past the rule, 0 to 1; null with nothing held. */
  readonly share: Ratio | null;
  /** The day the last purchase with units left passes the rule; null where no rule applies. */
  readonly allEligibleBy: CalendarDate | null;
};

/**
 * Units of `coin` past the rule on `at`, after sales are matched to lots: those of `venue`'s group when one is
 * named (under global scope that is every lot), else of every group.
 */
export function eligibleUnits(
  plan: Plan,
  entries: readonly Entry[],
  coin: CoinId,
  at: CalendarDate,
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
  venue?: string | null,
): Units {
  const inGroup = (place: Place) =>
    venue === undefined || venueGroup(place.venue, context.lotScope) === venueGroup(venue, context.lotScope);
  return sum(
    lots(entries, coin, context.lotScope, context.lotRule)
      .filter((lot) => isEligible(plan, lot, context, at))
      .flatMap((lot) => lot.places.filter(inGroup).map((place) => place.units)),
  );
}

/**
 * Per held coin, the units past the rule and their fraction. The portfolio share weights the
 * fractions by value where coins are priced, else by amount invested (as the prototype).
 */
export function eligibility(
  plan: Plan,
  entries: readonly Entry[],
  prices: PriceSnapshot | null,
  today: CalendarDate,
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
): Eligibility {
  const held = portfolio(plan, entries, prices).positions.filter((position) => isPositive(position.units));
  const rows = held.map((position) => {
    const eligible = eligibleUnits(plan, entries, position.coin, today, context);
    // A sale larger than the holdings it could match leaves fewer units than the eligible lots: cap.
    const capped = compare(eligible, position.units) > 0 ? position.units : eligible;
    const coin: CoinEligibility = {
      coin: position.coin,
      units: position.units,
      eligibleUnits: capped,
      fraction: ratio(capped, position.units, 12),
    };
    return { position, coin };
  });
  const coins = rows.map((row) => row.coin);

  if (plan.holdingRule.kind === 'none' && context.overrides.length === 0) {
    return { coins, share: held.length > 0 ? ('1' as Ratio) : null, allEligibleBy: null };
  }

  let valued = '0' as Money;
  let valuedTotal = '0' as Money;
  let invested = '0' as Money;
  let investedTotal = '0' as Money;
  for (const { position, coin } of rows) {
    if (position.value !== null) {
      valued = plus(valued, product<Money>(position.value, coin.fraction));
      valuedTotal = plus(valuedTotal, position.value);
    }
    invested = plus(invested, product<Money>(position.invested, coin.fraction));
    investedTotal = plus(investedTotal, position.invested);
  }
  const share = isPositive(valuedTotal)
    ? ratio(valued, valuedTotal, 12)
    : isPositive(investedTotal)
      ? ratio(invested, investedTotal, 12)
      : null;

  let allEligibleBy: CalendarDate | null = null;
  for (const position of held) {
    for (const lot of lots(entries, position.coin, context.lotScope, context.lotRule)) {
      if (isZero(lot.remainingUnits) || ruleFor(lot.date, plan.holdingRule, context.overrides).kind === 'none')
        continue;
      const from = lotEligibleFrom(plan, lot, context);
      if (allEligibleBy === null || from > allEligibleBy) allEligibleBy = from;
    }
  }
  return { coins, share, allEligibleBy };
}

export type Sellable = {
  /** Units past the rule today. */
  readonly now: Units;
  /** The units that pass the rule later, by the date they do. */
  readonly later: readonly { readonly from: CalendarDate; readonly units: Units }[];
};

/** "0.1234 BTC sellable now · 0.0100 BTC from 12 Mar 2030" (docs/CONTENT-STYLE.md §3). */
export function sellableNow(
  plan: Plan,
  entries: readonly Entry[],
  coin: CoinId,
  today: CalendarDate,
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
): Sellable {
  // The lots `portfolio` reads too, so no unit is called sellable that is not held.
  const open = heldLots(matchLots(entries, coin, context.lotScope, context.lotRule)).lots.filter((lot) =>
    isPositive(lot.remainingUnits),
  );
  const now = sum(open.filter((lot) => isEligible(plan, lot, context, today)).map((lot) => lot.remainingUnits));
  const byDate = new Map<CalendarDate, Units>();
  for (const lot of open) {
    if (isEligible(plan, lot, context, today)) continue;
    const from = lotEligibleFrom(plan, lot, context);
    byDate.set(from, plus(byDate.get(from) ?? ('0' as Units), lot.remainingUnits));
  }
  const later = [...byDate.entries()].sort(([a], [b]) => compareDates(a, b)).map(([from, units]) => ({ from, units }));
  return { now, later };
}

export type SaleWarning = {
  /** The id of the draft sale it is on, so a reader of the whole draft can tell its sales apart. */
  readonly sale: EntityId;
  readonly coin: CoinId;
  readonly sold: Units;
  readonly eligible: Units;
};

/** A draft sale as the save stores it: the id and `createdAt` of the entry it keeps, else a fresh id at the save. */
export type DraftSale = Pick<Entry, 'id' | 'coin' | 'units' | 'venue' | 'createdAt'>;

/**
 * For each coin of a draft sale: when its own group's lots (`venueGroup` of its venue) give it fewer units past the rule
 * on `date` than it sells, the data for "Only X of the Y sold are past the holding rule on this date. The rest may be
 * taxed." The matching may also give it another group's lots for units its group cannot cover; the warning leaves those
 * out, so it warns more, never less. The sales are matched as the save stores them: the entries less the draft's and the
 * `replaced` ones (the save replaces or deletes those), plus the draft's sales on `date`, in the order `matchLots` takes
 * them (`matchingOrder`), with the profile's lot rule and scope. Never blocks the save (port of the prototype's
 * dateHint(), which counted every lot).
 */
export function saleWarning(
  plan: Plan,
  entries: readonly Entry[],
  draft: readonly DraftSale[],
  date: CalendarDate,
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
  replaced: readonly EntityId[] = [],
): SaleWarning[] {
  const left = new Set([...draft.map((sale) => sale.id), ...replaced]);
  const sales = draft.map(
    (sale): Entry => ({
      ...sale,
      kind: 'sell',
      date,
      amount: '0' as Money,
      fee: null,
      note: '',
      slot: null,
      source: 'manual',
      updatedAt: sale.createdAt,
      deletedAt: null,
    }),
  );
  const stored = [...entries.filter((entry) => !left.has(entry.id)), ...sales];
  return sales.flatMap((sale) => {
    if (!isPositive(sale.units)) return [];
    // What the matching has reached by this sale (purchases of its day first, then the sales before it), with and
    // without it: the units of its group's lots past the rule that it takes.
    const before = stored.filter((entry) => matchingOrder(entry, sale) < 0);
    const eligible = minus(
      eligibleUnits(plan, before, sale.coin, date, context, sale.venue),
      eligibleUnits(plan, [...before, sale], sale.coin, date, context, sale.venue),
    );
    return compare(sale.units, eligible) > 0 ? [{ sale: sale.id, coin: sale.coin, sold: sale.units, eligible }] : [];
  });
}
