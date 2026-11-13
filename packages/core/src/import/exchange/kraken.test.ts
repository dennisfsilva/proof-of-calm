import { describe, expect, it } from 'vitest';
import { KRAKEN_SYNTHETIC } from '../../../test/exchange/kraken-synthetic.expected';
import december2025 from '../../../test/exchange/kraken-synthetic-2025-12.csv?raw';
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

  it('normalises the legacy codes and reads every K8 fiat code as money', () => {
    const header = '"txid","refid","time","type","subtype","asset","amount","fee"';
    const bonus = (n: number, asset: string) =>
      `"LSYN0${n}-AAAAA-AAAAAA","BSYN0${n}-AAAAA-AAAAAA","2025-12-01 09:00:00","invite bonus","","${asset}","1","0"`;
    const trade = (n: number, leg: string, asset: string, amount: string) =>
      `"LSYN${n}${leg}-AAAAA-AAAAAA","TSYN${n}-AAAAA-AAAAAA","2025-12-01 09:00:00","trade","","${asset}","${amount}","0"`;
    const text = [
      header,
      ...['XXBT', 'XBT', 'XETH', 'XXDG', 'XDG'].map((asset, n) => bonus(n, asset)),
      ...['ZEUR', 'ZUSD', 'ZGBP', 'CHF', 'ZCAD', 'ZJPY', 'ZAUD'].flatMap((asset, n) => [
        trade(10 + n, 'A', asset, '-10'),
        trade(10 + n, 'B', 'BTC', '0.0001'),
      ]),
    ].join('\n');
    const result = readExchangeFile(text);
    const movements = result.ok ? result.value.movements : [];
    expect(movements.map((movement) => movement.currency ?? movement.coin)).toEqual([
      ...['BTC', 'BTC', 'ETH', 'DOGE', 'DOGE'],
      ...['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY', 'AUD'],
    ]);
  });

  // "Fiat is every code K8 lists as fiat": AED is the first fiat code of K8's QUOTE_ASSETS. AED is outside
  // MINOR_UNITS, so the purchase keeps its raw figures.
  it('reads AED, a fiat code of K8 quote assets, as money', () => {
    const header = '"txid","refid","time","type","subtype","asset","amount","fee"';
    const text = [
      header,
      '"LSYN1","DSYN1","2025-12-01 09:00:00","deposit","","AED","500.00","0"',
      '"LSYN2","TSYN1","2025-12-01 09:01:00","trade","","AED","-100.00","0"',
      '"LSYN3","TSYN1","2025-12-01 09:01:00","trade","","XXBT","0.0003","0"',
    ].join('\n');
    const result = readExchangeFile(text);
    expect(result.ok && [result.value.leftOut.map((row) => [row.reason, row.coin]), result.value.movements]).toEqual([
      [['cash', 'AED']],
      [
        {
          key: 'poc-csv-1|kraken|TSYN1|BTC|in',
          lines: [3, 4],
          at: '2025-12-01T09:01:00Z',
          role: 'purchase',
          coin: 'BTC',
          units: '0.0003',
          unitsCut: false,
          currency: 'AED',
          amount: '100',
          fee: '0',
          feeInCoin: false,
        },
      ],
    ]);
  });

  // "The bonus rows K1 documents are receipts for a coin": an entry's coin is never a currency, so a bonus in
  // fiat is cash, counted with the money deposits and withdrawals.
  it('leaves a bonus in fiat out as cash, never a receipt', () => {
    const text = `"txid","refid","time","type","subtype","asset","amount","fee"\n"LSYN1","BSYN1","2025-12-01 09:00:00","invite bonus","","ZEUR","10.00","0"\n`;
    const result = readExchangeFile(text);
    expect(result.ok && [result.value.movements, result.value.leftOut]).toEqual([
      [],
      [{ reason: 'cash', lines: [2], at: '2025-12-01T09:00:00Z', coin: 'EUR', units: '10', column: null }],
    ]);
  });

  // "A row with an unreadable required cell leaves its refid's rows out whole, named by line and column."
  it.each([
    ['txid', '"LSYNé","RSYN1","2025-12-01 09:00:00","trade","BTC","1","0"', 'txid'],
    ['time', '"LSYN1","RSYN1","yesterday","trade","BTC","1","0"', 'time'],
    ['type', '"LSYN1","RSYN1","2025-12-01 09:00:00","","BTC","1","0"', 'type'],
    ['asset', '"LSYN1","RSYN1","2025-12-01 09:00:00","trade","btc","1","0"', 'asset'],
    ['amount', '"LSYN1","RSYN1","2025-12-01 09:00:00","trade","BTC","1e3","0"', 'amount'],
    ['fee', '"LSYN1","RSYN1","2025-12-01 09:00:00","trade","BTC","1","+0.1"', 'fee'],
    ['a short row', '"LSYN1","RSYN1","2025-12-01 09:00:00","trade","BTC","1"', 'fee'],
  ])('names the unreadable %s cell of a row and leaves its refid out whole', (_, row, column) => {
    const text = `"txid","refid","time","type","asset","amount","fee"\n${row}\n"LSYN2","RSYN1","2025-12-01 09:00:00","trade","EUR","-10","0"\n`;
    const result = readExchangeFile(text);
    expect(result.ok && [result.value.movements, result.value.leftOut]).toEqual([
      [],
      [{ reason: 'unreadable', lines: [2, 3], at: null, coin: null, units: null, column }],
    ]);
  });

  // D11: "a refid outside printable ASCII is unreadable"; a row without a refid has no rows to take along.
  it('leaves a row whose refid is outside printable ASCII out on its own', () => {
    const refid = `RSYN${String.fromCodePoint(0xe9)}`;
    const text = `"txid","refid","time","type","asset","amount","fee"\n"LSYN1","${refid}","2025-12-01 09:00:00","trade","BTC","1","0"\n`;
    const result = readExchangeFile(text);
    expect(result.ok && result.value.leftOut).toEqual([
      { reason: 'unreadable', lines: [2], at: null, coin: null, units: null, column: 'refid' },
    ]);
  });

  // "A row with an empty txid is a transaction Kraken did not complete (K8): it is dropped, counts in rows and in
  // first and last like an identical repeat, and leaves the other rows of its refid as they are."
  describe('a row with an empty txid', () => {
    const header = '"txid","refid","time","type","subtype","asset","amount","fee"';
    const failed = (refid: string, type: string, asset: string, amount: string) =>
      `"","${refid}","2025-12-01 09:00:00","${type}","","${asset}","${amount}","0"`;
    const done = (txid: string, refid: string, type: string, asset: string, amount: string) =>
      `"${txid}","${refid}","2025-12-01 09:01:00","${type}","","${asset}","${amount}","0"`;

    it.each([
      ['deposit', 'ZEUR', '100.00', 'cash', 'EUR', '100'],
      ['withdrawal', 'XXBT', '-0.0010', 'coin-withdrawal', 'BTC', '0.001'],
    ])('drops the failed %s and leaves the completed row of its refid', (type, asset, amount, reason, coin, units) => {
      const text = [header, failed('DSYN1', type, asset, amount), done('LSYN1', 'DSYN1', type, asset, amount)];
      const result = readExchangeFile(text.join('\n'));
      expect(result.ok && result.value).toEqual({
        exchange: 'kraken',
        rows: 2,
        first: '2025-12-01T09:00:00Z',
        last: '2025-12-01T09:01:00Z',
        movements: [],
        leftOut: [{ reason, lines: [3], at: '2025-12-01T09:01:00Z', coin, units, column: null }],
      });
    });

    it('still pairs the trade of its refid into a purchase', () => {
      const text = [
        header,
        failed('TSYN1', 'trade', 'ZEUR', '-10.00'),
        done('LSYN2', 'TSYN1', 'trade', 'ZEUR', '-10.00'),
        done('LSYN3', 'TSYN1', 'trade', 'XXBT', '0.0001'),
      ];
      const result = readExchangeFile(text.join('\n'));
      expect(result.ok && [result.value.leftOut, result.value.movements.map((m) => [m.key, m.lines, m.role])]).toEqual([
        [],
        [['poc-csv-1|kraken|TSYN1|BTC|in', [3, 4], 'purchase']],
      ]);
    });
  });

  it('has no first or last time when no time reads', () => {
    const text =
      '"txid","refid","time","type","asset","amount","fee"\n"LSYN1","RSYN1","2025-12-01","trade","BTC","1","0"';
    const result = readExchangeFile(text);
    expect(result.ok && [result.value.rows, result.value.first, result.value.last]).toEqual([1, null, null]);
  });

  it('holds no cell text other than the coin codes it normalises in any left-out row', () => {
    const result = readExchangeFile(december2025);
    const left = result.ok ? result.value.leftOut : [];
    expect(JSON.stringify(left)).not.toMatch(/SYNTH|spot|earn \/|allocation|adjustment|2025-12-32/u);
  });
});
