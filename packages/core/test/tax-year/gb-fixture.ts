// The UK's raw listing for the 2026-27 tax year (docs/DOMAIN.md §3.13), derived by hand: a BTC plan that sold
// in 2025-26 and on 2027-03-20, bought on 2027-04-06, inside the 30 days after that sale (TCGA 1992 s. 106A),
// holds a lot with no recorded cost and a one-tap purchase; ETH sold only in 2025-26, so it lists the year's
// entries alone, either side of the 5/6 April boundary. The rules are the core's view of
// `packages/content/rules/gb.json`; the span is written by hand, as the export passes it in.
import type { CalendarDate } from '../../src/dates/calendar';
import type { CountryRules } from '../../src/schema/country';
import type { Entry } from '../../src/schema/entry';
import type { CoinId } from '../../src/schema/ids';
import { anEntry, aPlan, BTC, date, ETH, instant, money, month, split, units } from '../builders';

export const GB_RULES: CountryRules = {
  code: 'GB',
  name: 'United Kingdom',
  currency: 'GBP',
  locales: ['en-GB', 'cy-GB'],
  numberFormatLocale: 'en-GB',
  dateFormatLocale: 'en-GB',
  timezones: ['Europe/London'],
  taxYear: { start: '04-06', end: '04-05' },
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'none' },
  holdingRuleOverrides: [],
  holdingRuleConditions: [],
  lotRule: 'pooled',
  lotScope: 'global',
  status: {
    version: 1,
    changedOn: date('2024-10-30'),
    changeNotice: null,
    lastReviewed: date('2026-11-05'),
    nextReviewDue: date('2027-04-06'),
  },
};

export const GB_PLAN = aPlan({
  country: 'GB',
  payCurrency: 'GBP',
  displayCurrency: 'GBP',
  coins: [BTC, ETH],
  split: split({ BTC: '80', ETH: '20' }),
  holdingRule: { kind: 'none' },
});

export const SPAN_2026_27 = { from: date('2026-04-06'), to: date('2027-04-05') };

/** The export day: after the 30 days, so the window is closed. */
export const EXPORT_DAY: CalendarDate = date('2027-05-10');

export const GB_HEADER = ['Header line, with a comma', '=a line that starts like a formula'];

type Row = {
  kind: Entry['kind'];
  on: string;
  coin?: 'BTC' | 'ETH';
  amount: string | null;
  units: string;
  fee: string | null;
  venue?: string;
  oneTap?: true;
  deleted?: true;
};

function entry(row: Row): Entry {
  return anEntry({
    kind: row.kind,
    date: date(row.on),
    coin: (row.coin ?? 'BTC') as CoinId,
    amount: row.amount === null ? null : money(row.amount),
    units: units(row.units),
    fee: row.fee === null ? null : money(row.fee),
    slot: row.kind === 'dca' ? month(row.on.slice(0, 7)) : null,
    venue: row.venue ?? null,
    source: row.oneTap ? 'one-tap' : 'manual',
    createdAt: instant(`${row.on}T09:00:00+00:00`),
    updatedAt: instant(`${row.on}T09:00:00+00:00`),
    deletedAt: row.deleted ? instant(`${row.on}T10:00:00+00:00`) : null,
  });
}

const KRAKEN = 'Kraken, UK';

/** Stored out of date order on purpose: the listing sorts. */
export const GB_ENTRIES: readonly Entry[] = [
  // BTC: listed whole up to 2027-04-05, then the purchases to 2027-05-05.
  { kind: 'sell', on: '2027-03-20', amount: '210', units: '0.003', fee: '1.05', venue: KRAKEN },
  { kind: 'dca', on: '2025-05-01', amount: '100', units: '0.0015', fee: '0.50', venue: KRAKEN },
  { kind: 'held', on: '2025-06-01', amount: null, units: '0.01', fee: null, venue: 'Ledger' },
  { kind: 'sell', on: '2026-01-15', amount: '70', units: '0.001', fee: '0.35', venue: KRAKEN },
  { kind: 'dca', on: '2026-04-05', amount: '100', units: '0.0014', fee: '0.50', venue: KRAKEN },
  { kind: 'dca', on: '2026-05-01', amount: '100', units: '0.0013', fee: '0.50', venue: KRAKEN, oneTap: true },
  { kind: 'dca', on: '2026-07-01', amount: '100', units: '0.0012', fee: '0.50', deleted: true },
  { kind: 'extra', on: '2027-04-05', amount: '50', units: '0.0007', fee: '0.25' },
  { kind: 'dca', on: '2027-04-06', amount: '100', units: '0.0014', fee: '0.50', venue: KRAKEN },
  { kind: 'sell', on: '2027-04-20', amount: '70', units: '0.001', fee: '0.35', venue: KRAKEN },
  { kind: 'dca', on: '2027-05-05', amount: '100', units: '0.0014', fee: '0.50' },
  { kind: 'extra', on: '2027-05-06', amount: '50', units: '0.0007', fee: '0.25' },
  // ETH: no sale in 2026-27, so only the year's entries.
  { kind: 'lump', on: '2025-10-01', coin: 'ETH', amount: '500', units: '0.2', fee: '2.50' },
  { kind: 'sell', on: '2026-03-01', coin: 'ETH', amount: '300', units: '0.1', fee: '1.50' },
  { kind: 'extra', on: '2026-04-05', coin: 'ETH', amount: '50', units: '0.02', fee: '0.25' },
  { kind: 'lump', on: '2026-04-06', coin: 'ETH', amount: '300', units: '0.12', fee: '1.50' },
  { kind: 'dca', on: '2027-04-05', coin: 'ETH', amount: '30', units: '0.011', fee: '0.15' },
  { kind: 'extra', on: '2027-04-06', coin: 'ETH', amount: '30', units: '0.011', fee: '0.15' },
].map((row) => entry(row as Row));
