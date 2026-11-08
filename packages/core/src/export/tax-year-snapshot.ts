// The tax-year export of a `wealth-snapshot` country (docs/DOMAIN.md §3.13, the Netherlands): the holdings valued at
// the start of the reference day (the end of the day before), the year's purchases, `held` entries and sales per coin,
// and the holdings at the year end. Data, not a computation of tax: no deemed return, no allowance, no rate.
import { addDays, type CalendarDate, clampDay, dateParts } from '../dates/calendar';
import { type SnapshotValue, snapshotValue } from '../market/snapshot';
import { type CurrencyCode, MINOR_UNITS } from '../money/currency';
import { decimalPlaces, type Money, plus, round, sum, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { coinsWithEntries } from '../portfolio/portfolio';
import { assertNever } from '../result';
import type { CountryRules, MonthDay } from '../schema/country';
import { type Entry, isEstimate } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import type { PriceHistories } from '../schema/prices';
import { textCell } from './csv';
import type { TaxYearSpan } from './tax-year';

/**
 * One coin's year: its units and value on the reference date, the year's `dca`, `lump` and `extra` purchases, its
 * `held` entries (`heldCost` null when one has no recorded cost), its sales, and its units and value at the year end
 * (null while the year runs). A value is null when its close is missing.
 */
export type SnapshotRow = {
  readonly coin: CoinId;
  readonly openingUnits: Units;
  readonly openingValue: Money | null;
  readonly boughtUnits: Units;
  readonly boughtAmount: Money;
  readonly boughtFee: Money;
  readonly heldUnits: Units;
  readonly heldCost: Money | null;
  readonly soldUnits: Units;
  readonly proceeds: Money;
  readonly saleFee: Money;
  readonly closingUnits: Units | null;
  readonly closingValue: Money | null;
};

export type TaxYearSnapshot = {
  readonly span: TaxYearSpan;
  readonly currency: CurrencyCode;
  /** The model's date inside the span. */
  readonly reference: CalendarDate;
  /** The value at the end of the day before `reference`. */
  readonly opening: SnapshotValue;
  /** The value at the end of `span.to`; null while today ≤ `span.to`. */
  readonly closing: SnapshotValue | null;
  readonly rows: readonly SnapshotRow[];
  readonly ongoing: boolean;
  /** A `held` entry in the year with no recorded cost. */
  readonly uncosted: boolean;
  /** A one-tap entry dated on or before `span.to`, whose units count in the file. */
  readonly estimated: boolean;
  /** A `held` entry dated in the year. */
  readonly heldInYear: boolean;
};

function referenceDate(rules: CountryRules, span: TaxYearSpan): CalendarDate {
  const model = rules.computationModel;
  switch (model.kind) {
    case 'wealth-snapshot':
      return within(model.date, span);
    case 'per-lot':
    case 'portfolio-wide':
      throw new RangeError(`No snapshot file for a ${model.kind} country`);
    default:
      return assertNever(model);
  }
}

/** The day `MM-DD` falls on inside the span. */
function within(day: MonthDay, span: TaxYearSpan): CalendarDate {
  const parts = [Number(day.slice(0, 2)), Number(day.slice(3, 5))] as const;
  const year = dateParts(span.from).year;
  const first = clampDay(year, ...parts);
  return first < span.from ? clampDay(year + 1, ...parts) : first;
}

const ZERO = '0' as Money & Units;
type Flows = Pick<
  SnapshotRow,
  'boughtUnits' | 'boughtAmount' | 'boughtFee' | 'heldUnits' | 'heldCost' | 'soldUnits' | 'proceeds' | 'saleFee'
>;
const NONE: Flows = {
  boughtUnits: ZERO,
  boughtAmount: ZERO,
  boughtFee: ZERO,
  heldUnits: ZERO,
  heldCost: ZERO,
  soldUnits: ZERO,
  proceeds: ZERO,
  saleFee: ZERO,
};

/** One entry of the year added to a coin's flows. */
function addEntry(flows: Flows, entry: Entry): Flows {
  // Every kind but `held` keeps an amount above 0 (docs/DOMAIN.md §2.2); only `held` may lack one.
  const amount = entry.amount ?? ZERO;
  const fee = entry.fee ?? ZERO;
  switch (entry.kind) {
    case 'dca':
    case 'lump':
    case 'extra':
      return {
        ...flows,
        boughtUnits: plus(flows.boughtUnits, entry.units),
        boughtAmount: plus(flows.boughtAmount, amount),
        boughtFee: plus(flows.boughtFee, fee),
      };
    case 'held':
      return {
        ...flows,
        heldUnits: plus(flows.heldUnits, entry.units),
        heldCost: flows.heldCost === null || entry.amount === null ? null : plus(flows.heldCost, entry.amount),
      };
    case 'sell':
      return {
        ...flows,
        soldUnits: plus(flows.soldUnits, entry.units),
        proceeds: plus(flows.proceeds, amount),
        saleFee: plus(flows.saleFee, fee),
      };
    default:
      return assertNever(entry.kind);
  }
}

/** A coin's units and value in a snapshot; units of 0 or less are none, worth 0. */
function coinIn(snapshot: SnapshotValue, coin: CoinId): { units: Units; value: Money | null } {
  return snapshot.coins.find((held) => held.coin === coin) ?? { units: ZERO, value: ZERO };
}

/** One year's snapshot file; throws a RangeError for a country whose model is not `wealth-snapshot`. */
export function taxYearSnapshot(
  plan: Plan,
  entries: readonly Entry[],
  rules: CountryRules,
  span: TaxYearSpan,
  histories: PriceHistories,
  today: CalendarDate,
): TaxYearSnapshot {
  const reference = referenceDate(rules, span);
  const eve = addDays(reference, -1);
  const live = liveEntries(entries);
  const ongoing = today <= span.to;
  const opening = snapshotValue(plan, live, histories, eve);
  const closing = ongoing ? null : snapshotValue(plan, live, histories, span.to);
  const inYear = live.filter((entry) => reference <= entry.date && entry.date <= span.to);
  const rows = coinsWithEntries(plan, live).flatMap((coin): SnapshotRow[] => {
    const own = inYear.filter((entry) => entry.coin === coin);
    const start = coinIn(opening, coin);
    if (own.length === 0 && !opening.coins.some((held) => held.coin === coin)) return [];
    const end = closing === null ? { units: null, value: null } : coinIn(closing, coin);
    return [
      {
        coin,
        openingUnits: start.units,
        openingValue: start.value,
        ...own.reduce(addEntry, NONE),
        closingUnits: end.units,
        closingValue: end.value,
      },
    ];
  });
  return {
    span,
    currency: plan.payCurrency,
    reference,
    opening,
    closing,
    rows,
    ongoing,
    uncosted: rows.some((row) => row.heldCost === null),
    estimated: live.some((entry) => entry.date <= span.to && isEstimate(entry)),
    heldInYear: inYear.some((entry) => entry.kind === 'held'),
  };
}

/** An amount half-even at the currency's minor digits, padded to them; empty for none. */
export function roundedAmountCell(value: Money | null, digits: number): string {
  if (value === null) return '';
  const rounded = round(value, digits, 'half-even');
  const places = decimalPlaces(rounded);
  return places === digits ? rounded : `${rounded}${places === 0 ? '.' : ''}${'0'.repeat(digits - places)}`;
}

/** The sum of a column's written cells, empty when one of them is (docs/DOMAIN.md §3.13). */
export const writtenTotalCell = (cells: readonly string[], digits: number) =>
  cells.includes('') ? '' : roundedAmountCell(sum(cells as Money[]), digits);

/**
 * The file, laid out as the per-lot file: each header line as one text cell, an empty row, the columns, one `coin`
 * row per coin, then a `total` row whose units cells are empty and whose amounts sum the written cells above.
 */
export function taxYearSnapshotCsv(snapshot: TaxYearSnapshot, header: readonly string[]): string {
  const digits = MINOR_UNITS[snapshot.currency];
  const opening = snapshot.reference.slice(5);
  const closing = snapshot.span.to.slice(5);
  const columns = [
    'row',
    'coin',
    `units_on_${opening}`,
    `value_on_${opening}`,
    'bought_units',
    'bought_amount',
    'bought_fee',
    'held_units',
    'held_cost',
    'sold_units',
    'sold_proceeds',
    'sold_fee',
    `units_on_${closing}`,
    `value_on_${closing}`,
  ];
  const amount = (value: Money | null) => roundedAmountCell(value, digits);
  const rows = snapshot.rows.map((row) => [
    'coin',
    textCell(row.coin),
    row.openingUnits,
    amount(row.openingValue),
    row.boughtUnits,
    amount(row.boughtAmount),
    amount(row.boughtFee),
    row.heldUnits,
    amount(row.heldCost),
    row.soldUnits,
    amount(row.proceeds),
    amount(row.saleFee),
    row.closingUnits ?? '',
    amount(row.closingValue),
  ]);
  const sumOf = (pick: (row: SnapshotRow) => Money | null) =>
    writtenTotalCell(
      snapshot.rows.map((row) => amount(pick(row))),
      digits,
    );
  const total = [
    'total',
    '',
    '',
    sumOf((row) => row.openingValue),
    '',
    sumOf((row) => row.boughtAmount),
    sumOf((row) => row.boughtFee),
    '',
    sumOf((row) => row.heldCost),
    '',
    sumOf((row) => row.proceeds),
    sumOf((row) => row.saleFee),
    '',
    sumOf((row) => row.closingValue),
  ];
  return [...header.map(textCell), '', columns.join(','), ...[...rows, total].map((row) => row.join(','))].join('\n');
}
