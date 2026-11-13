import { describe, expect, it } from 'vitest';
import december2025 from '../../../test/exchange/kraken-synthetic-2025-12.csv?raw';
import { KRAKEN_SYNTHETIC } from '../../../test/exchange/kraken-synthetic.expected';
import legacy from '../../../test/exchange/kraken-synthetic-legacy.csv?raw';
import { readExchangeFile } from './read';

// The Kraken ledger reader (docs/DOMAIN.md §3.13, the exchange import) against synthetic files, one per
// header variant, worked out by hand in kraken-synthetic.expected.ts.
describe('readExchangeFile on a Kraken ledger (golden)', () => {
  it.each([
    ['the December 2025 header', december2025],
    ['the legacy header without subclass and wallet', legacy],
  ])('reads %s exactly as worked out by hand', (_, text) => {
    expect(readExchangeFile(text)).toEqual({ ok: true, value: KRAKEN_SYNTHETIC });
  });

  it('reads the columns by name, in any order', () => {
    const lines = december2025.split('\n').map((line) => line.split(','));
    const reversed = lines.map((cells) => cells.toReversed().join(',')).join('\n');
    expect(readExchangeFile(reversed)).toEqual({ ok: true, value: KRAKEN_SYNTHETIC });
  });

  it('normalises the legacy codes and reads every K6 fiat code as money', () => {
    const header = '"txid","refid","time","type","subtype","asset","amount","fee"';
    const bonus = (n: number, asset: string) =>
      `"LSYN0${n}-AAAAA-AAAAAA","BSYN0${n}-AAAAA-AAAAAA","2025-12-01 09:00:00","invite bonus","","${asset}","1","0"`;
    const trade = (n: number, asset: string, amount: string) =>
      `"LSYN${n}-AAAAA-AAAAAA","TSYN${n}-AAAAA-AAAAAA","2025-12-01 09:00:00","trade","","${asset}","${amount}","0"`;
    const text = [
      header,
      ...['XXBT', 'XBT', 'XETH', 'XXDG', 'XDG'].map((asset, n) => bonus(n, asset)),
      ...['ZEUR', 'ZUSD', 'ZGBP', 'CHF', 'ZCAD', 'ZJPY', 'ZAUD'].flatMap((asset, n) => [
        trade(10 + n, asset, '-10'),
        trade(10 + n, 'BTC', '0.0001'),
      ]),
    ].join('\n');
    const result = readExchangeFile(text);
    const movements = result.ok ? result.value.movements : [];
    expect(movements.map((movement) => movement.currency ?? movement.coin)).toEqual([
      ...['BTC', 'BTC', 'ETH', 'DOGE', 'DOGE'],
      ...['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY', 'AUD'],
    ]);
  });

  it('holds no cell text other than the coin codes it normalises in any left-out row', () => {
    const result = readExchangeFile(december2025);
    const left = result.ok ? result.value.leftOut : [];
    expect(JSON.stringify(left)).not.toMatch(/SYNTH|spot|earn \/|allocation|adjustment|2025-12-32/u);
  });
});
