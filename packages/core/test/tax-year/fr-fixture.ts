// The French tax-year fixture (docs/DOMAIN.md §3.13, the `portfolio-wide` model), derived by hand: the year 2026, one
// block per sale dated in it, each with the holdings just before the sale and the gross sums of the purchases logged
// before it. Each figure of fr-2026.csv is worked out here, not by running the code. Closes are given for BTC and
// missing for ETH (it has closes on the neighbouring days only, which are never read).
//
// Entries, in `compareEntries` order:
// - BTC lump 2025-02-01 0.2 for 10000, fee 10
// - ETH extra 2025-06-01 2 for 4000, fee 2
// - BTC held 2025-12-15 0.1 with no recorded cost: units count, the cost does not, held_without_cost 1
// - BTC sell 2025-12-20 0.05 for 4500, fee 2: before the year, so no block; its units leave the holding
// - ETH held 2026-02-01 0.5 at cost 0: a recorded cost, so it adds 0 and is not counted as without cost
// - BTC dca 2026-03-01 0.01 for 800, fee 0.4
// - BTC sell 2026-04-15 0.12 for 8000, fee 4, at Kraken: cession 1
// - BTC dca 2026-05-01 one tap 0.012345 for 1000, no fee: BTC's units are estimated from here
// - ETH extra 2026-07-01 1 for 3000, deleted: counted nowhere
// - ETH sell 2026-09-20 2.5 for 6250.25, no fee: cession 2, the whole ETH holding
// - BTC sell 2027-01-10 0.01 for 1000: after the year, no block
//
// Cession 1, 2026-04-15:
// - BTC held 0.2 + 0.1 − 0.05 + 0.01 = 0.26, the coin sold: price 8000 ÷ 0.12 = 66666.666… → 66666.67 (four
//   significant figures, never fewer than two decimals, as the log CSV); value 8000 × 0.26 ÷ 0.12 = 17333.333… →
//   17333.33
// - ETH held 2 + 0.5 = 2.5: no close dated 2026-04-15, so price and value are empty, and so is the estimate
// - costs 10000 + 4000 + 0 + 800 = 14800.00; fees 10 + 2 + 0.4 = 12.40; one `held` entry without cost
//
// Cession 2, 2026-09-20:
// - BTC held 0.26 − 0.12 + 0.012345 = 0.152345, a one-tap entry counts (yes): close 65432.1, value
//   0.152345 × 65432.1 = 9968.2532745 → 9968.25
// - ETH held 2.5, the coin sold, the whole holding: price 6250.25 ÷ 2.5 = 2500.1; value 6250.25 × 2.5 ÷ 2.5 =
//   6250.25, exactly the sale price
// - estimate 9968.25 + 6250.25 = 16218.50, the sum of the written cells; the sale row is estimated (BTC's units)
// - costs 14800 + 1000 = 15800.00; fees 12.40; one `held` entry without cost; the sale fee is empty, never 0
import type { CountryRules } from '../../src/schema/country';
import type { Entry } from '../../src/schema/entry';
import type { Plan } from '../../src/schema/plan';
import type { PriceHistories, PriceHistory } from '../../src/schema/prices';
import { anEntry, aPlan, BTC, date, ETH, instant, money, month, units } from '../builders';
import { NL_RULES } from './nl-fixture';

/** The core's view of the French profile (packages/content/rules/fr.json). */
export const FR_RULES: CountryRules = {
  ...NL_RULES,
  code: 'FR',
  name: 'France',
  locales: ['fr-FR'],
  numberFormatLocale: 'fr-FR',
  dateFormatLocale: 'fr-FR',
  timezones: ['Europe/Paris'],
  computationModel: { kind: 'portfolio-wide' },
};
export const FR_PLAN: Plan = aPlan({ country: 'FR', coins: [BTC, ETH], holdingRule: { kind: 'none' } });
export const SPAN_2026 = { endingIn: 2026, from: date('2026-01-01'), to: date('2026-12-31') };
export const EXPORT_DAY = date('2027-02-10');

export const at = (day: string, time = '09:00:00') => instant(`${day}T${time}+00:00`);
export const entry = (kind: Entry['kind'], day: string, coin: Entry['coin'], fields: Partial<Entry>): Entry =>
  anEntry({
    kind,
    date: date(day),
    coin,
    slot: kind === 'dca' ? month(day.slice(0, 7)) : null,
    createdAt: at(day),
    ...fields,
  });

export const FR_ENTRIES: readonly Entry[] = [
  entry('lump', '2025-02-01', BTC.id, { units: units('0.2'), amount: money('10000'), fee: money('10') }),
  entry('held', '2025-12-15', BTC.id, { units: units('0.1'), amount: null }),
  entry('sell', '2025-12-20', BTC.id, { units: units('0.05'), amount: money('4500'), fee: money('2') }),
  entry('dca', '2026-03-01', BTC.id, { units: units('0.01'), amount: money('800'), fee: money('0.4') }),
  entry('sell', '2026-04-15', BTC.id, {
    units: units('0.12'),
    amount: money('8000'),
    fee: money('4'),
    venue: 'Kraken',
  }),
  entry('dca', '2026-05-01', BTC.id, { units: units('0.012345'), amount: money('1000'), source: 'one-tap' }),
  entry('sell', '2027-01-10', BTC.id, { units: units('0.01'), amount: money('1000') }),
  entry('extra', '2025-06-01', ETH.id, { units: units('2'), amount: money('4000'), fee: money('2') }),
  entry('held', '2026-02-01', ETH.id, { units: units('0.5'), amount: money('0') }),
  entry('extra', '2026-07-01', ETH.id, { units: units('1'), amount: money('3000'), deletedAt: at('2026-07-02') }),
  entry('sell', '2026-09-20', ETH.id, { units: units('2.5'), amount: money('6250.25') }),
];

const closes = (values: Record<string, string>) => Object.entries(values) as unknown as PriceHistory;

/** Daily closes in euro: BTC's on both sale days and around them, ETH's only on the days around them. */
export const FR_HISTORIES = {
  currency: 'EUR',
  coins: {
    BTC: closes({ '2026-04-15': '81000', '2026-09-19': '64000', '2026-09-20': '65432.1', '2026-09-21': '66000' }),
    ETH: closes({ '2026-04-14': '2400', '2026-09-21': '2600' }),
  },
} as unknown as PriceHistories;

/** The header lines the shell would pass; their wording is not the core's. */
export const FR_HEADER = ['Header line one', '=a second line'];
