// The Dutch tax-year fixture (docs/DOMAIN.md §3.13, the `wealth-snapshot` model), derived by hand: the year 2026,
// its 1 January value the holdings at the end of 2025-12-31 priced at that day's closes, its year-end value the
// holdings at the end of 2026-12-31 at that day's closes. Each figure of nl-2026.csv is worked out here, not by
// running the code.
//
// BTC:
// - lump 2025-03-01 0.2 for 12000, fee 12; dca 2025-12-01 0.05 for 4000, fee 2; held 2025-12-31 0.1 at cost 5000
//   (dated on the eve, so it counts on 1 January): 0.35 on 1 January
// - in 2026: dca 2026-01-01 0.01 for 900, fee 0.45 (on the reference day, so bought in the year, not held on
//   1 January); dca 2026-02-01 one tap 0.012345 for 1000, no fee; bought 0.022345 for 1900.00, fees 0.45
// - held 2026-05-10 0.02 with no recorded cost: held 0.02, cost empty
// - sell 2026-09-15 0.1 for 9500, fee 4.75
// - dca 2027-01-01 0.01 for 1000, fee 0.5: after the year, counted nowhere
// - year end: 0.35 + 0.022345 + 0.02 − 0.1 = 0.292345
//
// ETH:
// - extra 2025-06-01 3 for 6000, fee 3; sell 2025-11-01 0.5 for 1500, fee 1.5: 2.5 on 1 January
// - held 2026-03-01 0.5 at cost 0: held 0.5, cost 0.00
// - an extra 2026-04-01 of 1 deleted: counted nowhere
// - sell 2026-12-31 1 for 3200, fee 1.6 (on the year end, so counted in it): sold 1 for 3200.00, fees 1.60
// - year end: 2.5 + 0.5 − 1 = 2
//
// Values, each cell half-even at two decimals:
// - 1 January: BTC 0.35 × 87654.321 = 30679.01235 → 30679.01; ETH 2.5 × 3001.05 = 7502.625 → 7502.62 (a tie,
//   kept even); total of the written cells 30679.01 + 7502.62 = 38181.63 (the exact 38181.63735 would round to
//   38181.64: the total is the sum of the cells, docs/DOMAIN.md §3.13)
// - 31 December: BTC 0.292345 × 95000.5 = 27772.9211725 → 27772.92; ETH 2 × 3500.25 = 7000.5 → 7000.50; total
//   27772.92 + 7000.50 = 34773.42
// - the totals of the other amounts: bought 1900.00 + 0.00, fees 0.45 + 0.00; held cost BTC empty, so the total is
//   empty; proceeds 9500.00 + 3200.00 = 12700.00; sale fees 4.75 + 1.60 = 6.35
import type { CountryRules } from '../../src/schema/country';
import type { Entry } from '../../src/schema/entry';
import type { Plan } from '../../src/schema/plan';
import type { PriceHistories, PriceHistory } from '../../src/schema/prices';
import { anEntry, aPlan, BTC, date, ETH, instant, money, month, units } from '../builders';
import { FIXTURE_RULES } from '../country-change/fixture';

const { englishConfidence, ...portugal } = FIXTURE_RULES.PT;

/** The core's view of the Dutch profile (packages/content/rules/nl.json). */
export const NL_RULES: CountryRules = {
  ...portugal,
  code: 'NL',
  name: 'Netherlands',
  locales: ['nl-NL'],
  numberFormatLocale: 'nl-NL',
  dateFormatLocale: 'nl-NL',
  timezones: ['Europe/Amsterdam'],
  computationModel: { kind: 'wealth-snapshot', date: '01-01' },
  holdingRule: { kind: 'none' },
  holdingRuleConditions: [],
  lotRule: 'unspecified',
  lotScope: 'global',
};
export const NL_PLAN: Plan = aPlan({ country: 'NL', coins: [BTC, ETH], holdingRule: { kind: 'none' } });
export const SPAN_2026 = { endingIn: 2026, from: date('2026-01-01'), to: date('2026-12-31') };
export const EXPORT_DAY = date('2027-02-10');

const at = (day: string) => instant(`${day}T09:00:00+00:00`);
const entry = (kind: Entry['kind'], day: string, coin: Entry['coin'], fields: Partial<Entry>): Entry =>
  anEntry({
    kind,
    date: date(day),
    coin,
    slot: kind === 'dca' ? month(day.slice(0, 7)) : null,
    createdAt: at(day),
    ...fields,
  });

export const NL_ENTRIES: readonly Entry[] = [
  entry('lump', '2025-03-01', BTC.id, { units: units('0.2'), amount: money('12000'), fee: money('12') }),
  entry('dca', '2025-12-01', BTC.id, { units: units('0.05'), amount: money('4000'), fee: money('2') }),
  entry('held', '2025-12-31', BTC.id, { units: units('0.1'), amount: money('5000') }),
  entry('dca', '2026-01-01', BTC.id, { units: units('0.01'), amount: money('900'), fee: money('0.45') }),
  entry('dca', '2026-02-01', BTC.id, { units: units('0.012345'), amount: money('1000'), source: 'one-tap' }),
  entry('held', '2026-05-10', BTC.id, { units: units('0.02'), amount: null }),
  entry('sell', '2026-09-15', BTC.id, { units: units('0.1'), amount: money('9500'), fee: money('4.75') }),
  entry('dca', '2027-01-01', BTC.id, { units: units('0.01'), amount: money('1000'), fee: money('0.5') }),
  entry('extra', '2025-06-01', ETH.id, { units: units('3'), amount: money('6000'), fee: money('3') }),
  entry('sell', '2025-11-01', ETH.id, { units: units('0.5'), amount: money('1500'), fee: money('1.5') }),
  entry('held', '2026-03-01', ETH.id, { units: units('0.5'), amount: money('0') }),
  entry('extra', '2026-04-01', ETH.id, { units: units('1'), amount: money('2000'), deletedAt: at('2026-04-02') }),
  entry('sell', '2026-12-31', ETH.id, { units: units('1'), amount: money('3200'), fee: money('1.6') }),
];

const closes = (values: Record<string, string>) => Object.entries(values) as unknown as PriceHistory;

/** Daily closes in euro around both dates; the neighbours are there to show they are never read. */
export const NL_HISTORIES = {
  currency: 'EUR',
  coins: {
    BTC: closes({ '2025-12-30': '87000', '2025-12-31': '87654.321', '2026-01-01': '88000', '2026-12-31': '95000.5' }),
    ETH: closes({ '2025-12-31': '3001.05', '2026-01-01': '3100', '2026-12-30': '3400', '2026-12-31': '3500.25' }),
  },
} as unknown as PriceHistories;

/** The header lines the shell would pass; their wording is not the core's. */
export const NL_HEADER = ['Header line one', '=a second line'];
