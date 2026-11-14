import { describe, expect, it } from 'vitest';
import { aPlan, date } from '../../../test/builders';
import december2025 from '../../../test/exchange/kraken-synthetic-2025-12.csv?raw';
import { LISBON } from '../../../test/exchange/plan-fixture';
import { planExchangeImport } from './plan';
import { readExchangeFile } from './read';

// The pins of apps/web/e2e/exchange-import.spec.ts, derived here over the spec's own file: a EUR plan of BTC 70 % and
// ETH 30 % with buy day 1 from 1 Dec 2025, nothing logged, on 20 Jan 2026, imports the synthetic Kraken ledger.

describe('planExchangeImport over the e2e spec’s Kraken ledger', () => {
  it('adds every December purchase date as its monthly buy, the sale and the invite bonus', () => {
    const read = readExchangeFile(december2025);
    if (!read.ok) throw new Error('the synthetic ledger reads');
    const plan = aPlan({ firstBuy: date('2025-12-01'), lastBuy: date('2026-11-01'), buyDay: 1 });
    const context = { ...LISBON, today: date('2026-01-20') };
    const planned = planExchangeImport(read.value, { plan, entries: [] }, { venue: 'Kraken', addHeld: false }, context);
    const rows = planned.entries
      .map((entry) => [entry.date, entry.kind, entry.coin, entry.slot])
      .sort((a, b) => ((a[0] as string) < (b[0] as string) ? 1 : -1));
    expect(rows).toEqual([
      ['2025-12-19', 'dca', 'ETH', '2026-01'],
      ['2025-12-18', 'dca', 'BTC', '2026-01'],
      ['2025-12-16', 'dca', 'BTC', '2025-12'],
      ['2025-12-07', 'held', 'BTC', null],
      ['2025-12-04', 'sell', 'BTC', null],
      ['2025-12-02', 'dca', 'ETH', '2025-12'],
      ['2025-12-01', 'dca', 'BTC', '2025-12'],
    ]);
    expect(planned.replaced).toEqual([]);
  });
});
