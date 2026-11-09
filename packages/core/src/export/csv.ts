// The Log as CSV (docs/DOMAIN.md §3.13), ported from the prototype's csvText(): one line per entry in
// date order, the price derived from amount and units as the entry form derives it (§6, never 0 for a coin
// under a cent), the date each purchase passes the rule, and the venue; a move adds where it went and how many units
// arrived.
import { PRICE_FIGURES } from '../constants';
import { compareDates, compareInstants } from '../dates/calendar';
import { holdingStatus } from '../holding/eligible-from';
import { type CurrencyCode, MINOR_UNITS } from '../money/currency';
import { type Money, type Price, quotientSignificant, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { entryRole } from '../portfolio/effect';
import { DEFAULT_HOLDING_CONTEXT, type HoldingContext } from '../portfolio/eligibility';
import type { Entry } from '../schema/entry';
import type { Plan } from '../schema/plan';

const HEADER = [
  'date',
  'coin',
  'kind',
  'slot',
  'amount',
  'currency',
  'units',
  'price',
  'fee',
  'holding_eligible_from',
  'note',
  'venue',
  'to_venue',
  'units_received',
];

/**
 * A free-text cell (the note here, the venue in the tax-year file) or a coin, since a CoinId may start with
 * - (-A1 reads as the formula =-A1): the text, and every piece of it after a ;, a CR or an LF, that starts
 * with = + - @ a tab or a CR is prefixed with ', so that a spreadsheet shows the text and never runs it as
 * a formula, also one that splits a double-clicked file on ; and so ends a record at a quoted line break
 * (a de or pt locale, #207); then RFC 4180 quoting. The file stays comma-separated. The other cells need
 * neither: dates, kinds, slots and currency codes start with a digit or a letter by their schemas, and an
 * entry's amount, units and fee are never negative (EntrySchema), so neither is the price.
 */
export function textCell(text: string): string {
  // The match takes only the separator, so in a run (a CR first, ;;=, \r\r=) every separator is tried; no
  // lookbehind, which Safari before 16.4 cannot parse.
  const safe = (/^[=+\-@\t\r]/u.test(text) ? "'" : '') + text.replace(/[;\r\n](?=[=+\-@\t\r])/gu, "$&'");
  return /[",\n\r]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function eligibleFrom(plan: Plan, entry: Entry, context: HoldingContext): string {
  if (entryRole(entry.kind) !== 'purchase') return '';
  const status = holdingStatus(entry.date, plan.holdingRule, context.overrides);
  return status.kind === 'dated' ? status.from : '';
}

/** amount ÷ units as the entry form derives it (§6): never 0 for a coin under a cent; also the French file's price. */
export function loggedPrice(amount: Money, units: Units, currency: CurrencyCode): Price {
  return quotientSignificant<Price>(amount, units, PRICE_FIGURES, MINOR_UNITS[currency], 'half-even');
}

/** The implied price as the entry form derives it; empty for coins held with no recorded cost. */
function priceCell(plan: Plan, entry: Entry): string {
  return entry.amount === null ? '' : loggedPrice(entry.amount, entry.units, plan.payCurrency);
}

export function logCsv(
  plan: Plan,
  entries: readonly Entry[],
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
): string {
  const rows = liveEntries(entries)
    .sort((a, b) => compareDates(a.date, b.date) || compareInstants(a.createdAt, b.createdAt))
    .map((entry) =>
      [
        entry.date,
        textCell(entry.coin),
        entry.kind === 'lump' ? 'initial' : entry.kind,
        entry.slot ?? '',
        entry.amount ?? '',
        plan.payCurrency,
        entry.units,
        priceCell(plan, entry),
        entry.fee ?? '',
        eligibleFrom(plan, entry, context),
        textCell(entry.note),
        textCell(entry.venue ?? ''),
        textCell(entry.to ?? ''),
        entry.received ?? '',
      ].join(','),
    );
  return [HEADER.join(','), ...rows].join('\n');
}
