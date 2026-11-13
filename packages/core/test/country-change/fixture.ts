// The country change's fixture (docs/DOMAIN.md §6 "Change country", §7), derived by hand, not by the
// prototype, which has no change of country: 14 monthly buys on the 29th from September 2023 to October
// 2024, so one falls on 29 February 2024, and a sell window that opens on the day the last buy passes
// Portugal's 365 days, one day before it passes Germany's year. The rules are the core's view of the
// three profiles; the app's tests check them against `countryRules(loadProfile(code))`, so a profile
// that changes fails there instead of drifting here.
import type { CountryRules } from '../../src/schema/country';
import type { Entry } from '../../src/schema/entry';
import type { Plan } from '../../src/schema/plan';
import { anEntry, aPlan, BTC, date, instant, money, month, split, units } from '../builders';

const reviewed = (on: string, due: string) => ({
  version: 1,
  changedOn: date(on),
  changeNotice: null,
  lastReviewed: date(on),
  nextReviewDue: date(due),
});

export const FIXTURE_RULES = {
  PT: {
    code: 'PT',
    name: 'Portugal',
    currency: 'EUR',
    locales: ['pt-PT'],
    numberFormatLocale: 'pt-PT',
    dateFormatLocale: 'pt-PT',
    timezones: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
    englishConfidence: 'low',
    taxYear: { start: '01-01', end: '12-31' },
    computationModel: { kind: 'per-lot' },
    holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
    holdingRuleOverrides: [],
    holdingRuleConditions: [
      'Tax-free only when the counterparty is tax-resident in the EU, the EEA, or a treaty jurisdiction (declared in Anexo G Q18B otherwise).',
      'Exempt sales must still be declared (Anexo G1 Q7).',
      'Whether the holding period carries across a crypto-to-crypto swap is unsettled. Proof of Calm treats a swap as a sale and a new purchase, so a new holding period starts for the coins received.',
      'Loss of Portuguese tax residence counts as a disposal (art. 10 n.º 25 CIRS, numbered n.º 22 in 2023–2025 documents).',
    ],
    lotRule: 'fifo',
    lotScope: 'per-venue',
    status: {
      ...reviewed('2026-11-05', '2027-11-02'),
      version: 2,
      changedOn: date('2026-11-05'),
      changeNotice:
        'Portugal lowered six IRS bracket rates for 2026 income. The 28% rate and the 365‑day rule are unchanged.',
    },
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    locales: ['de-DE'],
    numberFormatLocale: 'de-DE',
    dateFormatLocale: 'de-DE',
    timezones: ['Europe/Berlin', 'Europe/Busingen'],
    taxYear: { start: '01-01', end: '12-31' },
    computationModel: { kind: 'per-lot' },
    holdingRule: { kind: 'years', years: 1, effect: 'exempt' },
    holdingRuleOverrides: [],
    holdingRuleConditions: [
      'A swap or a purchase paid in crypto starts a new holding period for the coins received.',
      "Gifts keep the giver's holding period.",
    ],
    lotRule: 'fifo',
    lotScope: 'per-venue',
    status: { ...reviewed('2026-11-05', '2027-01-01'), changedOn: date('2026-10-16') },
  },
  XX: {
    code: 'XX',
    name: 'Other country',
    currency: 'EUR',
    locales: ['und'],
    numberFormatLocale: 'und',
    dateFormatLocale: 'und',
    timezones: ['UTC'],
    taxYear: { start: '01-01', end: '12-31' },
    computationModel: { kind: 'per-lot' },
    holdingRule: { kind: 'none' },
    holdingRuleOverrides: [],
    holdingRuleConditions: [],
    lotRule: 'unspecified',
    lotScope: 'global',
    status: reviewed('2026-10-17', '2027-10-17'),
  },
} as const satisfies Record<'PT' | 'DE' | 'XX', CountryRules>;

export type FixtureCountry = keyof typeof FIXTURE_RULES;

/** The buy days, each with the day it passes each country's rule (XX has none: the purchase date). */
export const BUYS = [
  { date: '2023-09-29', PT: '2024-09-28', DE: '2024-09-30' },
  { date: '2023-10-29', PT: '2024-10-28', DE: '2024-10-30' },
  { date: '2023-11-29', PT: '2024-11-28', DE: '2024-11-30' },
  { date: '2023-12-29', PT: '2024-12-28', DE: '2024-12-30' },
  { date: '2024-01-29', PT: '2025-01-28', DE: '2025-01-30' },
  // 365 days from 29 February is 28 February; a year from it is 28 February (clamped), so 1 March.
  { date: '2024-02-29', PT: '2025-02-28', DE: '2025-03-01' },
  { date: '2024-03-29', PT: '2025-03-29', DE: '2025-03-30' },
  { date: '2024-04-29', PT: '2025-04-29', DE: '2025-04-30' },
  { date: '2024-05-29', PT: '2025-05-29', DE: '2025-05-30' },
  { date: '2024-06-29', PT: '2025-06-29', DE: '2025-06-30' },
  { date: '2024-07-29', PT: '2025-07-29', DE: '2025-07-30' },
  { date: '2024-08-29', PT: '2025-08-29', DE: '2025-08-30' },
  { date: '2024-09-29', PT: '2025-09-29', DE: '2025-09-30' },
  { date: '2024-10-29', PT: '2025-10-29', DE: '2025-10-30' },
] as const;

/** Opens the day the last buy passes Portugal's rule: in time there, a day early in Germany. */
const WINDOW = { opens: date('2025-10-29'), closes: date('2025-12-31'), exitBy: date('2026-06-30') };

/** The plan in a country, its window accepted where it opens early (Germany). */
export function fixturePlan(country: FixtureCountry): Plan {
  const rules = FIXTURE_RULES[country];
  return aPlan({
    country: rules.code,
    holdingRule: rules.holdingRule,
    coins: [BTC],
    split: split({ BTC: '100' }),
    monthlyAmount: money('100'),
    startingAmount: money('0'),
    firstBuy: date('2023-09-29'),
    buyDay: 29,
    lastBuy: date('2024-10-29'),
    sellWindow: country === 'DE' ? { ...WINDOW, acceptedEarlyOpen: true } : WINDOW,
    createdAt: instant('2023-09-01T09:00:00+01:00'),
    updatedAt: instant('2024-10-29T09:00:00+00:00'),
  });
}

export const FIXTURE_ENTRIES: readonly Entry[] = BUYS.map((buy) =>
  anEntry({
    date: date(buy.date),
    slot: month(buy.date.slice(0, 7)),
    amount: money('100'),
    units: units('0.0025'),
    createdAt: instant(`${buy.date}T10:00:00+00:00`),
    updatedAt: instant(`${buy.date}T10:00:00+00:00`),
  }),
);

/**
 * What each change reports: the rule moves in every case, so Germany's acceptance never survives; the
 * currency never moves (all three pay in EUR). The window opens early only under Germany's rule.
 */
export const CASES = [
  { from: 'PT', to: 'DE', issues: ['sell-window-before-eligibility'] },
  { from: 'DE', to: 'PT', issues: [] },
  { from: 'PT', to: 'XX', issues: [] },
  { from: 'XX', to: 'DE', issues: ['sell-window-before-eligibility'] },
] as const satisfies readonly { from: FixtureCountry; to: FixtureCountry; issues: readonly string[] }[];
