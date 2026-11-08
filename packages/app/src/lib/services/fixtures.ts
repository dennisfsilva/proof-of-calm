// One plan with a history, for the component tests, the stories (`parameters.snapshot`) and the e2e
// seed: a Portugal plan of BTC 70 % and ETH 30 %, 100 EUR a month from April 2026 to March 2027 after
// a 1000 EUR lump, held under the 365-day rule with a sell window from September 2029. Its entries are
// the lump, five dca months, one extra buy, one sale; July is skipped. It is meant to be seen at two
// dates: in the buying phase (`buy`, October's buy not yet logged) and inside the sell window (`sell`).
import type { CalendarDate, Coin, Entry, EntryKind, Instant, MonthKey, Plan } from '@proofofcalm/core';
import { EMPTY_SNAPSHOT } from '../adapters/memory-store';
import type { Snapshot } from '../ports';

export const FIXTURE_DATES = { buy: '2026-10-20', sell: '2030-03-15' } as const;
export type FixturePhase = keyof typeof FIXTURE_DATES;

/** 10:00 UTC on the phase's date, which is the same date in Lisbon, the test clock's zone. */
export const fixtureNowMs = (phase: FixturePhase): number => Date.parse(`${FIXTURE_DATES[phase]}T10:00:00Z`);

const at = (date: string) => `${date}T18:00:00+01:00` as Instant;
const BTC = { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 } as Coin;
const ETH = { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 } as Coin;

type Row = readonly [kind: EntryKind, date: string, coin: Coin, amount: string, units: string];

/** In id order, as the store keeps them: the ids count up in this list's order. */
const ROWS: readonly Row[] = [
  ['lump', '2026-04-05', BTC, '700', '0.0125'],
  ['lump', '2026-04-05', ETH, '300', '0.12'],
  ...['2026-04', '2026-05', '2026-06', '2026-08', '2026-09'].flatMap((slot): Row[] => [
    ['dca', `${slot}-05`, BTC, '70', '0.00121'],
    ['dca', `${slot}-05`, ETH, '30', '0.0118'],
  ]),
  ['extra', '2026-06-18', BTC, '200', '0.0036'],
  ['sell', '2026-09-20', ETH, '150', '0.06'],
];

const entityId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as Entry['id'];

export function fixtureSnapshot(): Snapshot {
  const plan: Plan = {
    id: entityId(1000),
    schemaVersion: 3,
    country: 'PT' as Plan['country'],
    countryRuleVersion: 2,
    payCurrency: 'EUR',
    displayCurrency: 'EUR',
    coins: [BTC, ETH],
    split: { BTC: '70', ETH: '30' } as Plan['split'],
    monthlyAmount: '100' as Plan['monthlyAmount'],
    startingAmount: '1000' as Plan['startingAmount'],
    firstBuy: '2026-04-05' as CalendarDate,
    buyDay: 5,
    lastBuy: '2027-03-05' as CalendarDate,
    holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
    sellWindow: { opens: '2029-09-01', closes: '2030-08-31', exitBy: '2030-12-31' } as Plan['sellWindow'],
    references: {},
    expectations: {},
    pauses: [],
    skips: [{ id: entityId(2000), slot: '2026-07' as MonthKey, note: '', createdAt: at('2026-07-05') }],
    endedBuyingOn: null,
    sellChecks: { part1: false, part2: false, part3: false },
    why: '',
    templateId: null,
    // Nothing recorded yet: onboarding writes the acknowledgement (docs/DOMAIN.md §2.1).
    riskAcknowledgedAt: null,
    riskWordingVersion: 0,
    createdAt: at('2026-04-05'),
    updatedAt: at('2026-07-05'),
  };
  const entries = ROWS.map(
    ([kind, date, coin, amount, units], index): Entry => ({
      id: entityId(index + 1),
      kind,
      date: date as CalendarDate,
      coin: coin.id,
      amount: amount as Entry['amount'],
      units: units as Entry['units'],
      fee: null,
      note: '',
      slot: kind === 'dca' ? (date.slice(0, 7) as MonthKey) : null,
      venue: null,
      source: 'manual',
      createdAt: at(date),
      updatedAt: at(date),
      deletedAt: null,
    }),
  );
  return { ...EMPTY_SNAPSHOT, plan, entries };
}
