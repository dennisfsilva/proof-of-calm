// The tax-year raw listing (docs/DOMAIN.md §3.13) for the lot rules the app does not match (`pooled`, `specific`,
// `average`): the entries an accountant needs to do the matching, whole, never matched here.
import { POOLED_MATCH_DAYS } from '../constants';
import { addDays, type CalendarDate } from '../dates/calendar';
import { holdingStatus } from '../holding/eligible-from';
import type { Money, Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { compareEntries } from '../portfolio/lots';
import { coinsWithEntries } from '../portfolio/portfolio';
import type { CountryRules, LotRule } from '../schema/country';
import { type Entry, type EntryKind, isEstimate } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import { textCell } from './csv';

/** One entry as listed: a purchase fills cost, fee and holding date, a sale its proceeds and fee. */
export type PoolRow = {
  readonly kind: EntryKind;
  readonly date: CalendarDate;
  readonly coin: CoinId;
  readonly venue: string | null;
  readonly units: Units;
  readonly costBasis: Money | null;
  readonly fee: Money | null;
  readonly eligibleFrom: CalendarDate | null;
  readonly proceeds: Money | null;
  readonly disposalFee: Money | null;
  readonly estimated: boolean;
};

export type TaxYearPool = {
  readonly span: { readonly from: CalendarDate; readonly to: CalendarDate };
  readonly lotRule: LotRule;
  /** The year's last day has not passed on the export day. */
  readonly ongoing: boolean;
  /** `pooled` only: the 30 days after the year are not over, so a later purchase can still join the file. */
  readonly windowOpen: boolean;
  readonly rows: readonly PoolRow[];
  /** A purchase listed with no recorded cost (a `held` entry without one). */
  readonly uncosted: boolean;
  /** A one-tap purchase's units are listed (`isEstimate`). */
  readonly estimated: boolean;
};

const COLUMNS = [
  'kind',
  'date',
  'coin',
  'venue',
  'units',
  'cost_basis',
  'fee',
  'eligible_from',
  'proceeds',
  'disposal_fee',
  'units_estimated',
];

function poolRow(entry: Entry, rules: CountryRules): PoolRow {
  const sale = entry.kind === 'sell';
  // The country's rule with its overrides, not the plan's: the file gives the accountant the legal date.
  const status = holdingStatus(entry.date, rules.holdingRule, rules.holdingRuleOverrides);
  return {
    kind: entry.kind,
    date: entry.date,
    coin: entry.coin,
    venue: entry.venue,
    units: entry.units,
    costBasis: sale ? null : entry.amount,
    fee: sale ? null : entry.fee,
    eligibleFrom: !sale && status.kind === 'dated' ? status.from : null,
    proceeds: sale ? entry.amount : null,
    disposalFee: sale ? entry.fee : null,
    estimated: isEstimate(entry),
  };
}

/**
 * A coin with a sale dated in the span lists every live entry dated on or before `span.to` (the pool needs the
 * earlier sales), and under `pooled` also the purchases of the `POOLED_MATCH_DAYS` after it that the log holds;
 * any other coin lists its entries dated in the span. The plan's coins in order, then the others; each coin's
 * entries in `compareEntries` order.
 */
export function taxYearPool(
  plan: Plan,
  entries: readonly Entry[],
  rules: CountryRules,
  span: { readonly from: CalendarDate; readonly to: CalendarDate },
  today: CalendarDate,
): TaxYearPool {
  const live = liveEntries(entries).sort(compareEntries);
  const pooled = rules.lotRule === 'pooled';
  const windowEnd = addDays(span.to, POOLED_MATCH_DAYS);
  const inSpan = (entry: Entry) => span.from <= entry.date && entry.date <= span.to;
  const rows = coinsWithEntries(plan, live).flatMap((coin) => {
    const own = live.filter((entry) => entry.coin === coin);
    const sold = own.some((entry) => entry.kind === 'sell' && inSpan(entry));
    const listed = sold
      ? (entry: Entry) => entry.date <= span.to || (pooled && entry.kind !== 'sell' && entry.date <= windowEnd)
      : inSpan;
    return own.filter(listed).map((entry) => poolRow(entry, rules));
  });
  return {
    span,
    lotRule: rules.lotRule,
    ongoing: today <= span.to,
    windowOpen: pooled && today <= windowEnd,
    rows,
    uncosted: rows.some((row) => row.kind !== 'sell' && row.costBasis === null),
    estimated: rows.some((row) => row.estimated),
  };
}

/**
 * The CSV, laid out as the per-lot file: each header line on its own row as one text cell, an empty row, then the
 * columns. Coin and venue go through `textCell`; dates are ISO, amounts and units as stored; `kind` takes the Log
 * CSV's codes (`lump` as `initial`).
 */
export function taxYearPoolCsv(pool: TaxYearPool, header: readonly string[]): string {
  const rows = pool.rows.map((row) =>
    [
      row.kind === 'lump' ? 'initial' : row.kind,
      row.date,
      textCell(row.coin),
      textCell(row.venue ?? ''),
      row.units,
      row.costBasis ?? '',
      row.fee ?? '',
      row.eligibleFrom ?? '',
      row.proceeds ?? '',
      row.disposalFee ?? '',
      row.estimated ? 'yes' : 'no',
    ].join(','),
  );
  return [...header.map(textCell), '', COLUMNS.join(','), ...rows].join('\n');
}
