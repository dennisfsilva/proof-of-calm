import { TR_COLUMNS } from '@proofofcalm/core';

// A synthetic Trade Republic transaction export (ADR-0056: every id and figure invented) for fixtureSnapshot's plan
// seen at fixtureNowMs('buy'), 2026-10-20: October's BTC and ETH monthly buys on the 5th, a BTC buy with a Saveback
// credit (an extra buy), then one row of each kind the import leaves out: the credit, a card payment, a fund, coins
// received and sent out, a migration within the exchange, a token swap, a cancelled buy and an unreadable time.

type Row = readonly [
  datetime: string,
  category: string,
  type: string,
  assetClass: string,
  symbol: string,
  shares: string,
  amount: string,
  fee: string,
];

/** An export of the given rows, numbered by transaction_id, with the columns the reader never reads filled in. */
export function tradeRepublicExport(rows: readonly Row[]): string {
  const lines = rows.map(([datetime, category, type, asset_class, symbol, shares, amount, fee], index) => {
    const transaction_id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const cells: Record<string, string> = { datetime, category, type, asset_class, symbol, shares, amount, fee };
    const row: Record<string, string> = { ...cells, transaction_id, currency: 'EUR', name: 'SYNTHETIC' };
    return TR_COLUMNS.map((name) => `"${row[name] ?? ''}"`).join(',');
  });
  return [TR_COLUMNS.map((name) => `"${name}"`).join(','), ...lines].join('\n');
}

export const TRADE_REPUBLIC_OCTOBER = tradeRepublicExport([
  ['2026-10-05T08:00:00.000Z', 'TRADING', 'BUY', 'CRYPTO', 'BTC', '0.0012', '-70.00', '-1.00'],
  ['2026-10-05T08:05:00.000Z', 'TRADING', 'BUY', 'CRYPTO', 'ETH', '0.012', '-30.00', '-1.00'],
  ['2026-10-06T09:00:00.000Z', 'CASH', 'BENEFITS_SAVEBACK', '', '', '', '4.50', ''],
  ['2026-10-07T06:00:00.000Z', 'TRADING', 'BUY', 'CRYPTO', 'BTC', '0.00005', '-4.50', ''],
  ['2026-10-08T10:00:00.000Z', 'CASH', 'CARD_TRANSACTION', '', '', '', '-12.00', ''],
  ['2026-10-09T10:00:00.000Z', 'TRADING', 'BUY', 'FUND', 'SYNTHETF01', '1', '-100.00', ''],
  ['2026-10-10T03:00:00.000Z', 'DELIVERY', 'FREE_RECEIPT', 'CRYPTO', 'ETH', '0.00012', '', ''],
  ['2026-10-11T09:00:00.000Z', 'DELIVERY', 'FREE_DELIVERY', 'CRYPTO', 'BTC', '-0.0001', '', ''],
  ['2026-10-12T00:00:00.000Z', 'DELIVERY', 'MIGRATION', 'CRYPTO', 'BTC', '-0.001', '', ''],
  ['2026-10-12T00:00:00.000Z', 'DELIVERY', 'MIGRATION', 'CRYPTO', 'BTC', '0.001', '', ''],
  ['2026-10-13T10:00:00.000Z', 'TRADING', 'BUY', 'CRYPTO', 'ETH', '0.005', '-15.00', ''],
  ['2026-10-13T10:05:00.000Z', 'TRADING', 'BUY_CANCELLED', 'CRYPTO', 'ETH', '-0.005', '15.00', ''],
  ['2026-10-14T00:00:00.000Z', 'DELIVERY', 'MIGRATION', 'CRYPTO', 'MATIC', '-2', '', ''],
  ['2026-10-14T00:00:00.000Z', 'DELIVERY', 'MIGRATION', 'CRYPTO', 'POL', '2', '', ''],
  ['14 Oct 2026', 'TRADING', 'BUY', 'CRYPTO', 'BTC', '0.0001', '-7.00', ''],
]);
