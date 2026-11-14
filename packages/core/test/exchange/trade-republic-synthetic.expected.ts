// What the synthetic Trade Republic export reads as (docs/DOMAIN.md §3.13, the exchange import), worked out by hand
// from its rows. Every transaction_id, time and figure is invented; each column the reader never reads holds a
// `SENTINEL-` string, which no movement or left-out row may hold. Line numbers count the header as line 1. A
// purchase's or sale's units are |shares|, cut to 10 decimals and flagged; its amount |amount| and its fee |fee|,
// an empty fee being 0 (the amount excludes the fee).
import type { ExchangeFile, LeftOutRow, Movement } from '../../src/import/exchange/kraken';
import { instant, money, units } from '../builders';

const id = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const key = (n: number, coin: string, direction: 'in' | 'out') =>
  `poc-csv-1|trade-republic|${id(n)}|${coin}|${direction}`;
const trade = (n: number, line: number, at: string, coin: string, figures: [string, string, string]) => ({
  lines: [line],
  at: instant(at),
  coin,
  units: units(figures[0]),
  unitsCut: false,
  currency: 'EUR',
  amount: money(figures[1]),
  fee: money(figures[2]),
  feeInCoin: false,
  key: key(n, coin, 'in'),
});

const movements: Movement[] = [
  // Line 2: a one-off buy, shares 0.00052, amount −49.92, fee −1.00. Line 15 repeats it with the same cells.
  { ...trade(1, 2, '2026-05-04T08:15:30.123Z', 'BTC', ['0.00052', '49.92', '1']), role: 'purchase' },
  // Line 3: a savings-plan execution, fee empty; 0.0166123456789 has 13 decimals, cut toward zero to 10.
  {
    ...trade(2, 3, '2026-05-02T06:10:00.456Z', 'ETH', ['0.0166123456', '49.93', '0']),
    role: 'purchase',
    unitsCut: true,
  },
  // Line 5: the Saveback execution after line 4's credit, a plain buy at its amount.
  { ...trade(4, 5, '2026-05-21T06:00:00.789Z', 'BTC', ['0.000047', '4.5', '0']), role: 'purchase' },
  // Line 8: a sale, shares −0.0002, amount 19.80, fee −1.00.
  {
    ...trade(7, 8, '2026-06-10T12:00:00.000Z', 'BTC', ['0.0002', '19.8', '1']),
    role: 'sale',
    key: key(7, 'BTC', 'out'),
  },
];

const out = (reason: LeftOutRow['reason'], lines: number[], at: string, coin: string | null = null, held?: string) => ({
  reason,
  lines,
  at: instant(at),
  coin,
  units: held === undefined ? null : units(held),
  column: null,
});

const leftOut: LeftOutRow[] = [
  out('benefit', [4], '2026-05-20T10:00:00.123456Z'), // CASH / BENEFITS_SAVEBACK
  out('cash', [6], '2026-05-25T09:00:00.000001Z'), // CASH / DEPOSIT
  out('other', [7], '2026-05-26T09:30:00.200Z'), // asset class FUND
  out('coin-deposit', [9], '2026-06-01T03:00:00.321Z', 'ETH', '0.00012'), // FREE_RECEIPT
  out('coin-withdrawal', [10], '2026-06-15T09:00:00.100Z', 'BTC', '0.0001'), // FREE_DELIVERY
  out('within', [11, 12], '2026-07-01T00:00:00.000Z'), // MIGRATION −1.5 and +1.5 SOL at one instant
  out('cancelled', [13, 14], '2026-07-02T10:00:00.200Z'), // a SOL buy and its BUY_CANCELLED
  out('other', [16], '2026-07-03T08:00:00.400Z'), // a crypto row of another type
  out('cash', [17], '2026-07-04T08:00:00Z'), // CASH, its datetime without a fraction
];

export const TRADE_REPUBLIC_SYNTHETIC: ExchangeFile = {
  exchange: 'trade-republic',
  // Lines 2 to 17: the repeat of line 2 counts, and is read once.
  rows: 16,
  first: instant('2026-05-02T06:10:00.456Z'),
  last: instant('2026-07-04T08:00:00Z'),
  movements,
  leftOut,
  // Line 13: the SOL buy line 14 cancels, under the key it would have had (transaction_id 12).
  cancelled: [{ ...trade(12, 13, '2026-07-02T10:00:00.200Z', 'SOL', ['0.25', '35', '1']), role: 'purchase' }],
};
