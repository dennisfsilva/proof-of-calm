// What both synthetic Kraken ledgers read as (docs/DOMAIN.md §3.13, the exchange import), worked out by
// hand from their rows. The two files hold the same rows under the two headers (the December 2025 header,
// K7; the legacy header without subclass and wallet, K8), so they read the same. Every txid, refid, time and
// figure is invented. Line numbers count the header as line 1. For a purchase or sale, v is the coin fee ×
// fiat amount ÷ coin amount, half-even at the currency's minor unit; units is the coin amount less (a
// purchase) or plus (a sale) the coin fee; a left-out row's units are |amount − fee|.
import type { ExchangeFile, LeftOutRow, Movement } from '../../src/import/exchange/kraken';
import { instant, money, units } from '../builders';

const key = (refid: string, coin: string, direction: 'in' | 'out') => `poc-csv-1|kraken|${refid}|${coin}|${direction}`;

const movements: Movement[] = [
  // Lines 2 and 3: EUR −100.0000 fee 0.2600; BTC 0.0011000000 fee −0.0000000000 (a negative zero, read as 0).
  // v = 0 × 100 ÷ 0.0011 = 0; units 0.0011 − 0; amount 100 − 0; fee 0.26 + 0.
  {
    key: key('TQ1AAA-SYNTH-000001', 'BTC', 'in'),
    lines: [2, 3],
    at: instant('2025-12-01T09:00:00.1234Z'),
    role: 'purchase',
    coin: 'BTC',
    units: units('0.0011'),
    unitsCut: false,
    currency: 'EUR',
    amount: money('100'),
    fee: money('0.26'),
    feeInCoin: false,
  },
  // Lines 4 and 5: EUR −50.0000 fee 0.0000; ETH 0.0200000000 fee 0.0000340000.
  // v = 0.000034 × 50 ÷ 0.02 = 0.085, half-even at 2 places 0.08; units 0.02 − 0.000034 = 0.019966;
  // amount 50 − 0.08 = 49.92; fee 0 + 0.08 = 0.08.
  {
    key: key('TQ1AAA-SYNTH-000002', 'ETH', 'in'),
    lines: [4, 5],
    at: instant('2025-12-02T10:15:30.5000Z'),
    role: 'purchase',
    coin: 'ETH',
    units: units('0.019966'),
    unitsCut: false,
    currency: 'EUR',
    amount: money('49.92'),
    fee: money('0.08'),
    feeInCoin: true,
  },
  // Lines 6 and 7: spend EUR −25.0000 fee 0.3700 at 18:20:00; receive SOL 0.1500000000 fee 0 at 18:20:02,
  // the coin row's time. v = 0; units 0.15; amount 25; fee 0.37.
  {
    key: key('TQ1AAA-SYNTH-000003', 'SOL', 'in'),
    lines: [6, 7],
    at: instant('2025-12-03T18:20:02.0000Z'),
    role: 'purchase',
    coin: 'SOL',
    units: units('0.15'),
    unitsCut: false,
    currency: 'EUR',
    amount: money('25'),
    fee: money('0.37'),
    feeInCoin: false,
  },
  // Lines 8 and 9: BTC −0.0005000000 fee 0.0000050000; EUR 45.0000 fee 0.1200: a sale.
  // v = 0.000005 × 45 ÷ 0.0005 = 0.45; units 0.0005 + 0.000005 = 0.000505; amount 45 + 0.45 = 45.45;
  // fee 0.12 + 0.45 = 0.57.
  {
    key: key('TQ1AAA-SYNTH-000004', 'BTC', 'out'),
    lines: [8, 9],
    at: instant('2025-12-04T08:00:00Z'),
    role: 'sale',
    coin: 'BTC',
    units: units('0.000505'),
    unitsCut: false,
    currency: 'EUR',
    amount: money('45.45'),
    fee: money('0.57'),
    feeInCoin: true,
  },
  // Lines 10 and 11: USD −60.0000 fee 0.1500; BTC 0.0007000000 fee 0. v = 0; units 0.0007; amount 60; fee 0.15.
  {
    key: key('TQ1AAA-SYNTH-000005', 'BTC', 'in'),
    lines: [10, 11],
    at: instant('2025-12-05T12:00:00.0001Z'),
    role: 'purchase',
    coin: 'BTC',
    units: units('0.0007'),
    unitsCut: false,
    currency: 'USD',
    amount: money('60'),
    fee: money('0.15'),
    feeInCoin: false,
  },
  // Line 14: invite bonus BTC 0.0000500000 fee 0: a receipt, units 0.00005 − 0.
  {
    key: key('BQ1AAA-SYNTH-000007', 'BTC', 'in'),
    lines: [14],
    at: instant('2025-12-07T00:00:00Z'),
    role: 'receipt',
    coin: 'BTC',
    units: units('0.00005'),
    unitsCut: false,
    currency: null,
    amount: null,
    fee: null,
    feeInCoin: false,
  },
  // Lines 26 and 27: XXBT 0.0003000000 fee 0 (BTC); ZEUR −30.0000 fee 0.0800 (EUR). units 0.0003; amount 30;
  // fee 0.08.
  {
    key: key('TQ1AAA-SYNTH-000018', 'BTC', 'in'),
    lines: [26, 27],
    at: instant('2025-12-16T16:00:00Z'),
    role: 'purchase',
    coin: 'BTC',
    units: units('0.0003'),
    unitsCut: false,
    currency: 'EUR',
    amount: money('30'),
    fee: money('0.08'),
    feeInCoin: false,
  },
  // Lines 29 and 30: BTC 0.000123456789 fee 0 (12 places, cut toward zero to 10: 0.0001234567); EUR −10.0000
  // fee 0.0300. amount 10; fee 0.03.
  {
    key: key('TQ1AAA-SYNTH-000020', 'BTC', 'in'),
    lines: [29, 30],
    at: instant('2025-12-18T09:09:09Z'),
    role: 'purchase',
    coin: 'BTC',
    units: units('0.0001234567'),
    unitsCut: true,
    currency: 'EUR',
    amount: money('10'),
    fee: money('0.03'),
    feeInCoin: false,
  },
  // Lines 31 and 32: EUR −20.0000 fee −0.0500 (a negative fee, read as 0.05); ETH 0.0080000000 fee 0.
  // units 0.008; amount 20; fee 0.05.
  {
    key: key('TQ1AAA-SYNTH-000021', 'ETH', 'in'),
    lines: [31, 32],
    at: instant('2025-12-19T10:00:00Z'),
    role: 'purchase',
    coin: 'ETH',
    units: units('0.008'),
    unitsCut: false,
    currency: 'EUR',
    amount: money('20'),
    fee: money('0.05'),
    feeInCoin: false,
  },
  // Lines 46 and 47: JPY −1500.00 fee 4.00; BTC 0.0001000000 fee 0.0000001000. JPY is outside MINOR_UNITS,
  // so amount 1500 and fee 4 stay raw; units 0.0001 − 0.0000001 = 0.0000999.
  {
    key: key('TQ1AAA-SYNTH-000029', 'BTC', 'in'),
    lines: [46, 47],
    at: instant('2025-12-27T10:00:00Z'),
    role: 'purchase',
    coin: 'BTC',
    units: units('0.0000999'),
    unitsCut: false,
    currency: 'JPY',
    amount: money('1500'),
    fee: money('4'),
    feeInCoin: true,
  },
];

const one = (reason: LeftOutRow['reason'], line: number, at: string, coin: string, amount: string): LeftOutRow => ({
  reason,
  lines: [line],
  at: instant(at),
  coin,
  units: units(amount),
  column: null,
});
const group = (reason: LeftOutRow['reason'], lines: number[], at: string | null, column: string | null = null) => ({
  reason,
  lines,
  at: at === null ? null : instant(at),
  coin: null,
  units: null,
  column,
});

const leftOut: LeftOutRow[] = [
  // Lines 12 and 13: BTC −0.0002000000 and ETH 0.0060000000: two coin legs.
  group('conversion', [12, 13], '2025-12-06T07:30:00Z'),
  // Line 15: staking DOT.S 0.0123000000 fee 0.
  one('reward', 15, '2025-12-08T01:00:00Z', 'DOT', '0.0123'),
  // Line 16: earn, reward, ETH 0.0001000000 fee 0.
  one('reward', 16, '2025-12-08T02:00:00Z', 'ETH', '0.0001'),
  // Lines 17 and 18: earn, allocation, ETH −0.0100000000 and 0.0100000000, each fee 0.
  one('within', 17, '2025-12-09T09:00:00Z', 'ETH', '0.01'),
  one('within', 18, '2025-12-09T09:00:00Z', 'ETH', '0.01'),
  // Line 19: transfer DOT −1.0000000000; line 20: transfer DOT.S 1.0000000000; each fee 0.
  one('within', 19, '2025-12-10T09:00:00Z', 'DOT', '1'),
  one('within', 20, '2025-12-10T09:00:05Z', 'DOT', '1'),
  // Line 21: deposit BTC 0.0100000000 fee 0.
  one('coin-deposit', 21, '2025-12-11T11:00:00Z', 'BTC', '0.01'),
  // Line 22: withdrawal BTC −0.0050000000 fee 0.0001000000: |−0.005 − 0.0001| = 0.0051.
  one('coin-withdrawal', 22, '2025-12-12T11:00:00Z', 'BTC', '0.0051'),
  // Line 23: deposit EUR 500.0000 fee 0.
  one('cash', 23, '2025-12-13T11:00:00Z', 'EUR', '500'),
  // Line 24: withdrawal ZEUR −100.0000 fee 0.0900: |−100 − 0.09| = 100.09.
  one('cash', 24, '2025-12-14T11:00:00Z', 'EUR', '100.09'),
  // Line 25: adjustment ETH 0.0002000000 fee 0.
  one('other', 25, '2025-12-15T11:00:00Z', 'ETH', '0.0002'),
  // Line 28: deposit KFEE 100.00 fee 0.00.
  one('within', 28, '2025-12-17T00:00:00Z', 'KFEE', '100'),
  // Line 33: withdrawal EUR −0.0000 (a negative zero, read as 0) fee 0.0000.
  one('cash', 33, '2025-12-20T10:00:00Z', 'EUR', '0'),
  // Line 34: one BTC leg of its refid.
  group('unpaired', [34], '2025-12-21T10:00:00Z'),
  // Lines 35 and 36: line 35's time, 2025-12-32 10:00:00, is no date.
  group('unreadable', [35, 36], null, 'time'),
  // Line 37 repeats line 2 cell for cell, so it is dropped.
  // Lines 38 and 40 hold one txid with different cells, so both refids go: lines 38 and 39, and 40 and 41.
  group('unreadable', [38, 39], null, 'txid'),
  group('unreadable', [40, 41], null, 'txid'),
  // Lines 42 and 43: EUR −100.0000 and USD 110.0000: two fiat legs.
  group('cash', [42, 43], '2025-12-25T10:00:00Z'),
  // Lines 44 and 45: BTC −0.0000000000 (read as 0) and EUR 0.0000: the coin leg is neither positive nor negative.
  group('unpaired', [44, 45], '2025-12-26T10:00:00Z'),
  // Line 48: an empty refid.
  group('unreadable', [48], null, 'refid'),
];

export const KRAKEN_SYNTHETIC: ExchangeFile = {
  exchange: 'kraken',
  // Lines 2 to 48.
  rows: 47,
  // Line 2's time; line 48's, the latest of the readable times.
  first: instant('2025-12-01T09:00:00.1234Z'),
  last: instant('2025-12-28T10:00:00Z'),
  movements,
  leftOut,
  cancelled: [],
};
