// The exchange import's plan fixture (docs/DOMAIN.md §3.13, the exchange import), worked out by hand, not by
// running the code. Every refid, figure and date is invented; nothing here comes from a real export.
//
// The plan: EUR, BTC 70 %, ETH 30 % and SOL 0 %, buy day 1, from 2026-03-01 to 2026-12-01, no starting amount
// (STARTING_PLAN has 500), June skipped and August paused. Today is 2026-11-13; the dates are Lisbon's, and every
// row of FILE is at 10:00Z, so Berlin dates them alike. Before the import:
// March done (S10), April and May late, June skipped, July done (S5), August paused, September and October done
// (S1 to S4), November late, December upcoming.
//
// Stored entries:
// - S1, S2: September's one tap at Bitvavo, dated 1 Sept, BTC with the note `card` (Carla).
// - S3, S4: October's late tap, dated 3 Nov, at Bitvavo.
// - S5: Ana's July, typed by hand on 10 Nov at Bitvavo: 0.0016 BTC for 100.
// - S6: a hand extra buy of BTC on 20 Aug.
// - S7: `held` 0.05 BTC at Ledger on 2026-05-01 (Greta).
// - S8: a tombstone of M02's id; S10: M01, imported earlier.
// - S9: a move of 0.0101 BTC from Kraken to Ledger on 20 Oct.
//
// Each row of FILE, with the step of D2 that decides it (addHeld false):
// - M01 BTC 1 Mar: step 1, imported earlier (S10).
// - M02 ETH 1 Mar: step 1, deleted on this device (S8).
// - M03 BTC 10 Mar, M05 BTC 1 Apr, M08 BTC receipt 20 Apr, M09 BTC 1 May: step 5, on or before S7's 1 May:
//   4 rows, 0.0002 + 0.0012 + 0.00001 + 0.0011 = 0.00251 BTC, left out.
// - M04 ETH 12 Mar: step 6, March (11 days from 1 Mar) is done by S10: an extra buy.
// - M06 ETH 1 Apr: step 6, April's ETH. M07 ETH 14 Apr: April (13 days), filled by M06: an extra buy.
// - M10 ETH 2 May: step 6, May's ETH. M11 ETH 2 Jun: June is skipped: an extra buy.
// - M12 BTC 1 Jul: step 3, S5's month (nearest 1 Jul): looks recorded already.
// - M13 ETH 1 Jul: step 6, July is done by S5's BTC: an extra buy.
// - M14 BTC 1 Aug: step 6, August is paused: an extra buy.
// - M15 BTC 22 Aug: step 3, S6 claims it (2 days from 20 Aug): looks recorded already. It is inside S1's window
//   (17 Aug to 16 Sept) too, but step 3 runs first, and S1 would take 1 Sept's M16, nearer its due, either way.
// - M16 BTC, M17 ETH 1 Sept: step 4, replace S1 (note `card`) and S2, at Kraken.
// - M18 BTC sale 20 Oct: a sale.
// - M19 BTC, M20 ETH 2 Nov: step 4, replace S3 and S4: the late tap reaches to 4 Nov, the day after 3 Nov.
//   M20's units were cut to 10 decimals.
// - M21 BTC 5 Nov: step 6, November's BTC (4 days); its fee was taken in the coin.
// - M22 SOL 1 Nov: SOL is at 0 %: an extra buy.
// - M23 XRP: not in the plan. M24 BTC in USD: another currency.
// - M25 ETH 1 Feb: 28 days before the first buy, no month within 15 days: an extra buy.
// Left-out rows: R1 reward, R2 coin deposit, R3 withdrawal of 0.0101 BTC on 21 Oct (S9 matches it: from Kraken,
// 1 day, same units), R4 withdrawal of 0.02 BTC (no move), R5 cash, R6 within, R7 conversion, R8 unpaired,
// R9 unreadable, R10 other.
import type { ExchangeFile, LeftOutRow, Movement } from '../../src/import/exchange/kraken';
import type { ImportContext } from '../../src/import/exchange/plan';
import type { Coin } from '../../src/schema/coin';
import type { Entry } from '../../src/schema/entry';
import type { CoinId, EntityId } from '../../src/schema/ids';
import type { Plan } from '../../src/schema/plan';
import { aMove, anEntry, aPlan, BTC, date, ETH, instant, money, month, split, units } from '../builders';

const SOL: Coin = { id: 'SOL' as CoinId, name: 'Solana', geckoId: 'solana', decimals: 4 };

/** A test map from a movement's key to an id, the same for the same key (the write passes `importId`). */
export function testId(key: string): EntityId {
  let hash = 7n;
  for (const char of key) hash = (hash * 131n + BigInt(char.codePointAt(0) ?? 0)) % (1n << 120n);
  const hex = hash.toString(16).padStart(30, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(12, 15)}-8${hex.slice(15, 18)}-${hex.slice(18)}` as EntityId;
}

/** The shell's `dateOf` in a zone. */
export function zoneDate(timeZone: string) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (at: string) => date(format.format(new Date(at)));
}

export const NOW = instant('2026-11-13T12:00:00Z');
export const LISBON: ImportContext = {
  today: date('2026-11-13'),
  now: NOW,
  dateOf: zoneDate('Europe/Lisbon'),
  idOf: testId,
};
export const BERLIN: ImportContext = { ...LISBON, dateOf: zoneDate('Europe/Berlin') };

type Figures = { readonly units: string; readonly amount: string; readonly fee: string };
type Flags = Partial<Pick<Movement, 'currency' | 'unitsCut' | 'feeInCoin'>>;

/** A purchase or sale of `coin` at `at`, in EUR unless `flags` says otherwise. */
export function trade(
  refid: string,
  role: 'purchase' | 'sale',
  coin: string,
  at: string,
  figures: Figures,
  line: number,
  flags: Flags = {},
): Movement {
  return {
    key: `poc-csv-1|kraken|${refid}|${coin}|${role === 'purchase' ? 'in' : 'out'}`,
    lines: [line, line + 1],
    at: instant(at.length === 10 ? `${at}T10:00:00Z` : at),
    role,
    coin,
    units: units(figures.units),
    unitsCut: false,
    currency: 'EUR',
    amount: money(figures.amount),
    fee: money(figures.fee),
    feeInCoin: false,
    ...flags,
  };
}

const bought = (refid: string, coin: string, day: string, figures: Figures, line: number, flags: Flags = {}) =>
  trade(refid, 'purchase', coin, day, figures, line, flags);
const BTC_70 = { units: '0.0011', amount: '69.30', fee: '0.70' };
const ETH_30 = { units: '0.016', amount: '29.70', fee: '0.30' };

export const M = {
  M01: bought('TFIX-M01', 'BTC', '2026-03-01', BTC_70, 2),
  M02: bought('TFIX-M02', 'ETH', '2026-03-01', ETH_30, 4),
  M03: bought('TFIX-M03', 'BTC', '2026-03-10', { units: '0.0002', amount: '13.00', fee: '0.13' }, 6),
  M04: bought('TFIX-M04', 'ETH', '2026-03-12', { units: '0.004', amount: '9.90', fee: '0.10' }, 8),
  M05: bought('TFIX-M05', 'BTC', '2026-04-01', { units: '0.0012', amount: '69.30', fee: '0.70' }, 10),
  M06: bought('TFIX-M06', 'ETH', '2026-04-01', ETH_30, 12),
  M07: bought('TFIX-M07', 'ETH', '2026-04-14', { units: '0.005', amount: '10.00', fee: '0.10' }, 14),
  M08: {
    key: 'poc-csv-1|kraken|TFIX-M08|BTC|in',
    lines: [16],
    at: instant('2026-04-20T10:00:00Z'),
    role: 'receipt',
    coin: 'BTC',
    units: units('0.00001'),
    unitsCut: false,
    currency: null,
    amount: null,
    fee: null,
    feeInCoin: false,
  } satisfies Movement,
  M09: bought('TFIX-M09', 'BTC', '2026-05-01', BTC_70, 17),
  M10: bought('TFIX-M10', 'ETH', '2026-05-02', { units: '0.017', amount: '29.70', fee: '0.30' }, 19),
  M11: bought('TFIX-M11', 'ETH', '2026-06-02', ETH_30, 21),
  M12: bought('TFIX-M12', 'BTC', '2026-07-01', { units: '0.00161', amount: '99.00', fee: '1.00' }, 23),
  M13: bought('TFIX-M13', 'ETH', '2026-07-01', { units: '0.012', amount: '29.70', fee: '0.30' }, 25),
  M14: bought('TFIX-M14', 'BTC', '2026-08-01', { units: '0.001', amount: '69.30', fee: '0.70' }, 27),
  M15: bought('TFIX-M15', 'BTC', '2026-08-22', { units: '0.0008', amount: '50.00', fee: '0.50' }, 29),
  M16: bought('TFIX-M16', 'BTC', '2026-09-01', { units: '0.00105', amount: '69.30', fee: '0.70' }, 31),
  M17: bought('TFIX-M17', 'ETH', '2026-09-01', { units: '0.012', amount: '29.70', fee: '0.30' }, 33),
  M18: trade('TFIX-M18', 'sale', 'BTC', '2026-10-20', { units: '0.0005', amount: '40.00', fee: '0.40' }, 35),
  M19: bought('TFIX-M19', 'BTC', '2026-11-02', { units: '0.00101', amount: '69.30', fee: '0.70' }, 37),
  M20: bought('TFIX-M20', 'ETH', '2026-11-02', { units: '0.0123456789', amount: '29.70', fee: '0.30' }, 39, {
    unitsCut: true,
  }),
  M21: bought('TFIX-M21', 'BTC', '2026-11-05', { units: '0.001', amount: '69.30', fee: '0.70' }, 41, {
    feeInCoin: true,
  }),
  M22: bought('TFIX-M22', 'SOL', '2026-11-01', { units: '0.5', amount: '50.00', fee: '0.50' }, 43),
  M23: bought('TFIX-M23', 'XRP', '2026-06-01', { units: '20', amount: '30.00', fee: '0.30' }, 45),
  M24: bought('TFIX-M24', 'BTC', '2026-06-15', { units: '0.001', amount: '80.00', fee: '0.80' }, 47, {
    currency: 'USD',
  }),
  M25: bought('TFIX-M25', 'ETH', '2026-02-01', { units: '0.01', amount: '25.00', fee: '0.25' }, 49),
} as const;

const left = (
  reason: LeftOutRow['reason'],
  lines: number[],
  day: string | null,
  coin: string | null,
  amount: string | null,
) =>
  ({
    reason,
    lines,
    at: day === null ? null : instant(`${day}T10:00:00Z`),
    coin,
    units: amount === null ? null : units(amount),
    column: reason === 'unreadable' ? 'amount' : null,
  }) satisfies LeftOutRow;

export const R = {
  R1: left('reward', [51], '2026-06-30', 'ETH', '0.0021'),
  R2: left('coin-deposit', [52], '2026-06-10', 'BTC', '0.05'),
  R3: left('coin-withdrawal', [53], '2026-10-21', 'BTC', '0.0101'),
  R4: left('coin-withdrawal', [54], '2026-11-01', 'BTC', '0.02'),
  R5: left('cash', [55, 56], '2026-03-01', null, null),
  R6: left('within', [57], '2026-07-01', 'ETH', '0.1'),
  R7: left('conversion', [58, 59], '2026-07-02', null, null),
  R8: left('unpaired', [60], '2026-07-03', null, null),
  R9: left('unreadable', [61, 62], null, null, null),
  R10: left('other', [63], '2026-07-04', 'BTC', '0.001'),
} as const;

export const FILE: ExchangeFile = {
  exchange: 'kraken',
  rows: 62,
  first: instant('2026-02-01T10:00:00Z'),
  last: instant('2026-11-05T10:00:00Z'),
  movements: Object.values(M),
  leftOut: Object.values(R),
};

export const PLAN: Plan = aPlan({
  coins: [BTC, ETH, SOL],
  split: split({ BTC: '70', ETH: '30', SOL: '0' }),
  firstBuy: date('2026-03-01'),
  lastBuy: date('2026-12-01'),
  skips: [{ id: testId('skip'), slot: month('2026-06'), note: '', createdAt: instant('2026-06-01T09:00:00Z') }],
  pauses: [{ id: testId('pause'), from: date('2026-08-01'), until: date('2026-08-31'), note: '' }],
});
export const STARTING_PLAN: Plan = { ...PLAN, startingAmount: '500' as Plan['startingAmount'] };

const tap = (coin: CoinId, slot: string, day: string, amount: string, units_: string, fee: string, note = '') =>
  anEntry({
    kind: 'dca',
    coin,
    slot: month(slot),
    date: date(day),
    amount: amount as Entry['amount'],
    units: units(units_),
    fee: fee as Entry['fee'],
    note,
    venue: 'Bitvavo',
    source: 'one-tap',
    createdAt: instant(`${day}T18:00:00Z`),
    updatedAt: instant(`${day}T18:00:00Z`),
  });

export const S = {
  S1: tap(BTC.id, '2026-09', '2026-09-01', '70', '0.00106', '0.70', 'card'),
  S2: tap(ETH.id, '2026-09', '2026-09-01', '30', '0.0125', '0.30'),
  S3: tap(BTC.id, '2026-10', '2026-11-03', '70', '0.00102', '0.70'),
  S4: tap(ETH.id, '2026-10', '2026-11-03', '30', '0.0124', '0.30'),
  S5: anEntry({
    kind: 'dca',
    slot: month('2026-07'),
    date: date('2026-11-10'),
    amount: '100' as Entry['amount'],
    units: units('0.0016'),
    fee: '1.00' as Entry['fee'],
    venue: 'Bitvavo',
    createdAt: instant('2026-11-10T20:00:00Z'),
  }),
  S6: anEntry({
    kind: 'extra',
    slot: null,
    date: date('2026-08-20'),
    amount: '50' as Entry['amount'],
    units: units('0.0008'),
    fee: '0.50' as Entry['fee'],
    createdAt: instant('2026-08-20T20:00:00Z'),
  }),
  S7: anEntry({
    kind: 'held',
    slot: null,
    date: date('2026-05-01'),
    amount: null,
    units: units('0.05'),
    venue: 'Ledger',
    createdAt: instant('2026-05-01T20:00:00Z'),
  }),
  S8: anEntry({
    id: testId(M.M02.key),
    coin: ETH.id,
    slot: month('2026-03'),
    date: date('2026-03-01'),
    source: 'import-csv',
    venue: 'Kraken',
    deletedAt: instant('2026-03-05T09:00:00Z'),
  }),
  S9: aMove({ date: date('2026-10-20'), units: units('0.0101'), received: units('0.01') }),
  S10: anEntry({
    id: testId(M.M01.key),
    slot: month('2026-03'),
    date: date('2026-03-01'),
    source: 'import-csv',
    venue: 'Kraken',
  }),
} as const;

export const STORED = { plan: PLAN, entries: Object.values(S) };
export const CHOICES = { venue: 'Kraken', addHeld: false };

/** The entry the plan adds for a movement, as kind and slot say, dated as Lisbon dates it. */
export function added(movement: Movement, kind: Entry['kind'], slot: string | null, note = '', day?: string): Entry {
  const receipt = movement.role === 'receipt';
  return {
    id: testId(movement.key),
    kind,
    date: date(day ?? movement.at.slice(0, 10)),
    coin: movement.coin as CoinId,
    amount: receipt ? ('0' as Entry['amount']) : movement.amount,
    units: movement.units,
    fee: receipt ? null : movement.fee,
    note,
    slot: slot === null ? null : month(slot),
    venue: 'Kraken',
    source: 'import-csv',
    createdAt: movement.at,
    updatedAt: NOW,
    deletedAt: null,
  };
}

/** The entries FILE adds over STORED with addHeld false, each with its step, in `compareEntries` order. */
export const EXPECTED_ENTRIES: readonly Entry[] = [
  added(M.M25, 'extra', null), // step 6: no month within 15 days
  added(M.M04, 'extra', null), // step 6: March done by S10
  added(M.M06, 'dca', '2026-04'), // step 6: April's ETH
  added(M.M07, 'extra', null), // step 6: April filled by M06
  added(M.M10, 'dca', '2026-05'), // step 6: May's ETH
  added(M.M11, 'extra', null), // step 6: June skipped
  added(M.M13, 'extra', null), // step 6: July done by S5
  added(M.M14, 'extra', null), // step 6: August paused
  added(M.M16, 'dca', '2026-09', 'card'), // step 4: replaces S1
  added(M.M17, 'dca', '2026-09'), // step 4: replaces S2
  added(M.M18, 'sell', null), // a sale
  added(M.M22, 'extra', null), // SOL at 0 %
  added(M.M19, 'dca', '2026-10'), // step 4: replaces S3, the late tap
  added(M.M20, 'dca', '2026-10'), // step 4: replaces S4
  added(M.M21, 'dca', '2026-11'), // step 6: November's BTC
];

/** Hugo's three fills of 31 Oct at 23:30Z, 23:31Z and 23:40Z: 31 Oct in Lisbon, 1 Nov in Berlin. */
export const HUGO: ExchangeFile = {
  ...FILE,
  rows: 6,
  movements: [
    bought('TFIX-H1', 'BTC', '2026-10-31T23:30:00Z', { units: '0.0004', amount: '23.10', fee: '0.23' }, 2),
    bought('TFIX-H2', 'BTC', '2026-10-31T23:31:00Z', { units: '0.0004', amount: '23.10', fee: '0.23' }, 4),
    bought('TFIX-H3', 'BTC', '2026-10-31T23:40:00Z', { units: '0.0003', amount: '23.10', fee: '0.24' }, 6),
  ],
  leftOut: [],
};
