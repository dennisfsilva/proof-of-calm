// Test builders: a valid plan and entry, overridden field by field. Ids are fixed strings; nothing here
// is random, so failures reproduce.
import type { CalendarDate, Instant, MonthKey } from '../src/dates/calendar';
import type { Money, Percent, Units } from '../src/money/decimal';
import type { Coin } from '../src/schema/coin';
import type { Entry } from '../src/schema/entry';
import type { CoinId, EntityId } from '../src/schema/ids';
import type { Plan, Split } from '../src/schema/plan';

export const date = (value: string) => value as CalendarDate;
export const month = (value: string) => value as MonthKey;
export const instant = (value: string) => value as Instant;
export const money = (value: string) => value as Money;
export const units = (value: string) => value as Units;
const percent = (value: string) => value as Percent;
const coinId = (value: string) => value as CoinId;

let sequence = 0;
/** A deterministic UUID-shaped id, unique within a test run. */
export function id(): EntityId {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}` as EntityId;
}

export const BTC: Coin = { id: coinId('BTC'), name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 };
export const ETH: Coin = { id: coinId('ETH'), name: 'Ethereum', geckoId: 'ethereum', decimals: 6 };

export function split(shares: Record<string, string>): Split {
  return Object.fromEntries(Object.entries(shares).map(([coin, share]) => [coin, percent(share)])) as Split;
}

export function aPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: id(),
    schemaVersion: 3,
    country: 'PT',
    countryRuleVersion: 1,
    payCurrency: 'EUR',
    displayCurrency: 'EUR',
    coins: [BTC, ETH],
    split: split({ BTC: '70', ETH: '30' }),
    monthlyAmount: money('100'),
    startingAmount: money('0'),
    firstBuy: date('2026-01-01'),
    buyDay: 1,
    lastBuy: date('2026-12-01'),
    holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
    sellWindow: null,
    references: {},
    expectations: {},
    pauses: [],
    skips: [],
    endedBuyingOn: null,
    sellChecks: { part1: false, part2: false, part3: false },
    why: '',
    templateId: null,
    riskAcknowledgedAt: null,
    riskWordingVersion: 0,
    createdAt: instant('2026-01-01T09:00:00+00:00'),
    updatedAt: instant('2026-01-01T09:00:00+00:00'),
    ...overrides,
  };
}

export { PreviousBuildPlanSchema } from './previous-build';

/** The plan as the previous build stored and exported it: schema version 2, with no acknowledgement fields. */
export function asV2Plan(plan: Plan): Record<string, unknown> {
  const { riskAcknowledgedAt: _at, riskWordingVersion: _version, ...rest } = plan;
  return { ...rest, schemaVersion: 2 };
}

export function anEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: id(),
    kind: 'dca',
    date: date('2026-01-01'),
    coin: coinId('BTC'),
    amount: money('70'),
    units: units('0.001'),
    fee: null,
    note: '',
    slot: month('2026-01'),
    venue: null,
    source: 'manual',
    createdAt: instant('2026-01-01T09:00:00+00:00'),
    updatedAt: instant('2026-01-01T09:00:00+00:00'),
    deletedAt: null,
    ...overrides,
  };
}
