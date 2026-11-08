// The tax-year export of a per-lot country (docs/DOMAIN.md §3.13): every lot of the year's file in pieces, one per sale
// in the year that took from it and one for what it still holds at the year end, with its cost and fee split across
// them. Data, not a computation of tax: no gain, no loss, no rate. Lots come from `matchLots` over the entries up to
// the year end, so a year's file never changes when a later year's sale is logged (the cumulative split, §3.13).
import { type CalendarDate, clampDay, dateParts } from '../dates/calendar';
import { holdingStatus, sameHoldingRule } from '../holding/eligible-from';
import { type CurrencyCode, MINOR_UNITS } from '../money/currency';
import { decimalPlaces, isPositive, type Money, type Units } from '../money/decimal';
import { cumulativeShares } from '../money/split';
import { liveEntries } from '../plan/statuses';
import { matchLots, venueGroup } from '../portfolio/lots';
import { assertNever, defined } from '../result';
import type { CountryRules, LotRule, LotScope } from '../schema/country';
import { type Entry, type EntryKind, isEstimate } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import { textCell } from './csv';

/** The days a tax year covers, named by the calendar year it ends in (a UK year 2026-27 is 2027). */
export type TaxYearSpan = { readonly endingIn: number; readonly from: CalendarDate; readonly to: CalendarDate };
type TaxYear = CountryRules['taxYear'];

const monthDay = (value: string) => [Number(value.slice(0, 2)), Number(value.slice(3, 5))] as const;

export function taxYearSpan(taxYear: TaxYear, endingIn: number): TaxYearSpan {
  const fromYear = taxYear.start > taxYear.end ? endingIn - 1 : endingIn;
  return {
    endingIn,
    from: clampDay(fromYear, ...monthDay(taxYear.start)),
    to: clampDay(endingIn, ...monthDay(taxYear.end)),
  };
}

/** The tax year a day falls in, by the calendar year that year ends in. */
export function taxYearEndingIn(date: CalendarDate, taxYear: TaxYear): number {
  return dateParts(date).year + (date.slice(5) > taxYear.end ? 1 : 0);
}

/** The years the export offers, newest first: from today's back to the first live entry's; none without entries. */
export function taxYears(entries: readonly Entry[], taxYear: TaxYear, today: CalendarDate): number[] {
  const live = liveEntries(entries);
  if (live.length === 0) return [];
  const current = taxYearEndingIn(today, taxYear);
  const first = Math.min(current, ...live.map((entry) => taxYearEndingIn(entry.date, taxYear)));
  return Array.from({ length: current - first + 1 }, (_, index) => current - index);
}

/** The latest year that has ended, else the running one, else null. */
export function defaultTaxYear(entries: readonly Entry[], taxYear: TaxYear, today: CalendarDate): number | null {
  const years = taxYears(entries, taxYear, today);
  return years[1] ?? years[0] ?? null;
}

/** The lot rules this file matches by; `unspecified` is matched first in, first out, as the Portfolio does. */
export type MatchedLotRule = Extract<LotRule, 'fifo' | 'lifo' | 'unspecified'>;

/**
 * One row: part of a lot sold in the year (`disposedOn` set), what the lot holds at the year end (`disposedOn` null),
 * or units of a sale no lot covered (`acquired` null). `costBasis` and `fee` are the lot's share; `proceeds` and
 * `disposalFee` the sale's. `eligibleFrom` by the country's holding rule; `pastHoldingRule` on the sale day or on the
 * year end (today while the year runs); both null where the country has no rule.
 */
export type LotPiece = {
  readonly kind: EntryKind | null;
  readonly acquired: CalendarDate | null;
  readonly coin: CoinId;
  readonly venue: string | null;
  readonly units: Units;
  readonly costBasis: Money | null;
  readonly fee: Money | null;
  readonly eligibleFrom: CalendarDate | null;
  readonly pastHoldingRule: boolean | null;
  readonly disposedOn: CalendarDate | null;
  readonly saleVenue: string | null;
  readonly proceeds: Money | null;
  readonly disposalFee: Money | null;
  readonly estimated: boolean;
};

/** The file's rows and what its header names: the rule, an unfinished year, and the flags of §3.13. */
export type TaxYearLots = {
  readonly span: TaxYearSpan;
  readonly currency: CurrencyCode;
  readonly lotRule: MatchedLotRule;
  readonly lotScope: LotScope;
  readonly ongoing: boolean;
  readonly pieces: readonly LotPiece[];
  /** A lot with no recorded cost. */
  readonly uncosted: boolean;
  /** A lot whose units are a one-tap estimate. */
  readonly estimated: boolean;
  /** A sale in the year that no lot covered. */
  readonly unmatched: boolean;
  /** Pieces sold at a venue other than the lot's, under per-venue matching. */
  readonly crossVenue: number;
  /** The plan keeps its own holding rule; the file dates lots by the country's. */
  readonly planRuleDiffers: boolean;
};

function matchedRule(rules: CountryRules): MatchedLotRule {
  const model = rules.computationModel;
  switch (model.kind) {
    case 'per-lot':
      break;
    case 'portfolio-wide':
    case 'wealth-snapshot':
      throw new RangeError(`No per-lot file for a ${model.kind} country`);
    default:
      return assertNever(model);
  }
  switch (rules.lotRule) {
    case 'fifo':
    case 'lifo':
    case 'unspecified':
      return rules.lotRule;
    case 'pooled':
    case 'specific':
    case 'average':
      throw new RangeError(`No per-lot file for the ${rules.lotRule} rule`);
    default:
      return assertNever(rules.lotRule);
  }
}

/** Shares of an amount by units; none of an amount not recorded. */
const shares = (total: Money | null, weights: readonly Units[], digits: number) =>
  total === null ? weights.map(() => null) : cumulativeShares(total, weights, digits);
const at = (values: readonly (Money | null)[], index: number) => values[index] ?? null;
/** The cells a piece leaves empty unless it fills them. */
const BLANK = { costBasis: null, fee: null, eligibleFrom: null, pastHoldingRule: null, saleVenue: null } as const;
const NO_SALE = { ...BLANK, disposedOn: null, proceeds: null, disposalFee: null } as const;

/** The pieces of one year's file; throws a RangeError for a country this file does not describe. */
export function taxYearLots(
  plan: Plan,
  entries: readonly Entry[],
  rules: CountryRules,
  span: TaxYearSpan,
  today: CalendarDate,
): TaxYearLots {
  const lotRule = matchedRule(rules);
  const upTo = liveEntries(entries).filter((entry) => entry.date <= span.to);
  const byId = new Map<EntityId, Entry>(upTo.map((entry) => [entry.id, entry]));
  const digits = MINOR_UNITS[plan.payCurrency];
  const yearEnd = today < span.to ? today : span.to;
  const coins = new Set<CoinId>([...plan.coins.map((coin) => coin.id), ...upTo.map((entry) => entry.coin)]);
  const pieces: LotPiece[] = [];
  for (const coin of coins) {
    const match = matchLots(upTo, coin, rules.lotScope, lotRule);
    // Each lot's takes in sale order, with the sale's proceeds and fee shares for those units.
    const taken = new Map<EntityId, { sale: Entry; units: Units; proceeds: Money | null; fee: Money | null }[]>();
    const unmatched: LotPiece[] = [];
    for (const sold of match.sales) {
      const sale = defined(byId.get(sold.id), 'sale');
      const weights = [...sold.takes.map((take) => take.units), sold.unmatched];
      const proceeds = shares(sale.amount, weights, digits);
      const fees = shares(sale.fee, weights, digits);
      sold.takes.forEach((take, index) => {
        const list = taken.get(take.lot) ?? [];
        list.push({ sale, units: take.units, proceeds: at(proceeds, index), fee: at(fees, index) });
        taken.set(take.lot, list);
      });
      if (isPositive(sold.unmatched) && sale.date >= span.from) {
        const last = sold.takes.length;
        unmatched.push({
          ...BLANK,
          kind: null,
          acquired: null,
          coin,
          venue: null,
          units: sold.unmatched,
          disposedOn: sale.date,
          saleVenue: sale.venue,
          proceeds: at(proceeds, last),
          disposalFee: at(fees, last),
          estimated: isEstimate(sale),
        });
      }
    }
    for (const lot of match.lots) {
      const entry = defined(byId.get(lot.id), 'lot');
      const takes = taken.get(lot.id) ?? [];
      const weights = [...takes.map((take) => take.units), lot.remainingUnits];
      const costs = shares(lot.cost, weights, digits);
      const fees = shares(lot.fee, weights, digits);
      const status = holdingStatus(lot.date, rules.holdingRule, rules.holdingRuleOverrides);
      const from = status.kind === 'dated' ? status.from : null;
      const piece = (index: number, units: Units, on: CalendarDate): LotPiece => ({
        ...NO_SALE,
        kind: entry.kind,
        acquired: lot.date,
        coin,
        venue: lot.venue,
        units,
        costBasis: at(costs, index),
        fee: at(fees, index),
        eligibleFrom: from,
        pastHoldingRule: from === null ? null : from <= on,
        estimated: isEstimate(entry),
      });
      takes.forEach((take, index) => {
        if (take.sale.date < span.from) return;
        pieces.push({
          ...piece(index, take.units, take.sale.date),
          disposedOn: take.sale.date,
          saleVenue: take.sale.venue,
          proceeds: take.proceeds,
          disposalFee: take.fee,
        });
      });
      if (isPositive(lot.remainingUnits)) pieces.push(piece(takes.length, lot.remainingUnits, yearEnd));
    }
    pieces.push(...unmatched);
  }
  return {
    span,
    currency: plan.payCurrency,
    lotRule,
    lotScope: rules.lotScope,
    ongoing: today <= span.to,
    pieces,
    uncosted: pieces.some((piece) => piece.acquired !== null && piece.costBasis === null),
    estimated: pieces.some((piece) => piece.estimated),
    unmatched: pieces.some((piece) => piece.acquired === null),
    crossVenue: pieces.filter(
      (piece) =>
        piece.disposedOn !== null &&
        piece.acquired !== null &&
        venueGroup(piece.venue, rules.lotScope) !== venueGroup(piece.saleVenue, rules.lotScope),
    ).length,
    planRuleDiffers: !sameHoldingRule(plan.holdingRule, rules.holdingRule),
  };
}

const COLUMNS =
  'kind,acquired,coin,venue,units,cost_basis,fee,eligible_from,past_holding_rule,disposed_on,sale_venue,proceeds,disposal_fee,units_estimated';

/** An amount at least at the currency's minor digits (a split may keep the total's own third decimal). */
function amountCell(value: Money | null, digits: number): string {
  if (value === null) return '';
  const places = decimalPlaces(value);
  if (places >= digits) return value;
  return `${value}${places === 0 ? '.' : ''}${'0'.repeat(digits - places)}`;
}

const flagCell = (value: boolean | null) => (value === null ? '' : value ? 'yes' : 'no');

/** The file: the header lines the shell words (§3.13), an empty line, the columns, one row per piece. */
export function taxYearLotsCsv(lots: TaxYearLots, header: readonly string[]): string {
  const digits = MINOR_UNITS[lots.currency];
  const rows = lots.pieces.map((piece) =>
    [
      piece.kind === 'lump' ? 'initial' : (piece.kind ?? ''),
      piece.acquired ?? '',
      textCell(piece.coin),
      textCell(piece.venue ?? ''),
      piece.units,
      amountCell(piece.costBasis, digits),
      amountCell(piece.fee, digits),
      piece.eligibleFrom ?? '',
      flagCell(piece.pastHoldingRule),
      piece.disposedOn ?? '',
      textCell(piece.saleVenue ?? ''),
      amountCell(piece.proceeds, digits),
      amountCell(piece.disposalFee, digits),
      flagCell(piece.estimated),
    ].join(','),
  );
  return [...header.map(textCell), '', COLUMNS, ...rows].join('\n');
}
