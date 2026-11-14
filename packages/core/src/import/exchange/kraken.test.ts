import { describe, expect, it } from 'vitest';
import { KRAKEN_SYNTHETIC } from '../../../test/exchange/kraken-synthetic.expected';
import december2025 from '../../../test/exchange/kraken-synthetic-2025-12.csv?raw';
import { KRAKEN_SYNTHETIC_FOLD } from '../../../test/exchange/kraken-synthetic-fold.expected';
import foldDecember2025 from '../../../test/exchange/kraken-synthetic-fold-2025-12.csv?raw';
import foldLegacy from '../../../test/exchange/kraken-synthetic-fold-legacy.csv?raw';
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

  // "A code ending in one of K8's staked suffixes loses the longest one it ends in, then any other dot suffix is
  // cut at the dot, then the legacy map applies; every such code is a balance within Kraken, whose rewards are
  // named under the coin before the suffix." K8's _normalise_asset strips .S from ETH2.S and maps ETH2 to
  // nothing, so ETH2.S stays ETH2.
  it.each([
    ['a staking row on DOT28.S', 'staking', 'DOT28.S', 'reward', 'DOT'],
    ['a transfer on SOL03.S', 'transfer', 'SOL03.S', 'within', 'SOL'],
    ['a staking row on ETH2.S', 'staking', 'ETH2.S', 'reward', 'ETH2'],
    ['a transfer on XXBT.M', 'transfer', 'XXBT.M', 'within', 'BTC'],
  ])('reads %s under the coin before the staked suffix', (_, type, asset, reason, coin) => {
    const text = `"txid","refid","time","type","subtype","asset","amount","fee"\n"LSYN1","SSYN1","2025-12-01 09:00:00","${type}","","${asset}","1","0"\n`;
    const result = readExchangeFile(text);
    expect(result.ok && result.value.leftOut.map((row) => [row.reason, row.coin])).toEqual([[reason, coin]]);
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
        cancelled: [],
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

// "Fills: one entry per refid, coin and direction" (ADR-0056) holds for receipts too: the receipts of one refid and
// coin fold into one movement, and a receipt of the coin its refid's purchase bought is left out, since its key is
// the purchase's (ADR-0056, Corrections, 2026-11-13).
describe('readExchangeFile folds the receipts of one refid and coin', () => {
  const header = '"txid","refid","time","type","subtype","asset","amount","fee"';
  const row = (txid: string, refid: string, time: string, type: string, asset: string, amount: string, fee = '0') =>
    `"${txid}","${refid}","2025-12-0${time}","${type}","","${asset}","${amount}","${fee}"`;
  const read = (...rows: string[]) => {
    const result = readExchangeFile([header, ...rows].join('\n'));
    return result.ok ? result.value : null;
  };

  it('reads two invite-bonus rows under one refid as one receipt with the summed units and both lines', () => {
    const file = read(
      row('LSYN1', 'BSYN1', '2 09:00:00', 'invite bonus', 'BTC', '0.00003'),
      row('LSYN2', 'BSYN1', '1 09:00:00', 'invite bonus', 'XXBT', '0.00005', '0.000001'),
    );
    expect([file?.movements, file?.leftOut]).toEqual([
      [
        {
          key: 'poc-csv-1|kraken|BSYN1|BTC|in',
          lines: [2, 3],
          at: '2025-12-01T09:00:00Z',
          role: 'receipt',
          coin: 'BTC',
          units: '0.000079',
          unitsCut: false,
          currency: null,
          amount: null,
          fee: null,
          feeInCoin: false,
        },
      ],
      [],
    ]);
  });

  // "units over 10 decimals are cut toward zero and flagged", after the sum: two rows of 5 × 10⁻¹¹ make 10⁻¹⁰.
  it('cuts the summed units, not each row', () => {
    const file = read(
      row('LSYN1', 'BSYN1', '1 09:00:00', 'invite bonus', 'BTC', '0.00000000005'),
      row('LSYN2', 'BSYN1', '1 09:00:00', 'invite bonus', 'BTC', '0.00000000005'),
      row('LSYN3', 'BSYN2', '1 09:00:00', 'invite bonus', 'BTC', '0.00000000015'),
      row('LSYN4', 'BSYN2', '1 09:00:00', 'invite bonus', 'BTC', '0.00000000001'),
    );
    expect(file?.movements.map((movement) => [movement.lines, movement.units, movement.unitsCut])).toEqual([
      [[2, 3], '0.0000000001', false],
      [[4, 5], '0.0000000001', true],
    ]);
  });

  // An entry of 0 units fails EntrySchema, and the write then refuses the whole file: such a row is unreadable.
  it('leaves a purchase, a sale or a folded receipt whose units are 0 after the cut out as unreadable in amount', () => {
    const file = read(
      row('LSYN1', 'TSYN1', '1 09:00:00', 'trade', 'EUR', '-0.01'),
      row('LSYN2', 'TSYN1', '1 09:00:00', 'trade', 'BTC', '0.00000000004'),
      row('LSYN3', 'TSYN2', '1 09:00:00', 'trade', 'EUR', '0.01'),
      row('LSYN4', 'TSYN2', '1 09:00:00', 'trade', 'BTC', '-0.00000000009'),
      row('LSYN5', 'TSYN3', '1 09:00:00', 'trade', 'EUR', '-10.00'),
      row('LSYN6', 'TSYN3', '1 09:00:00', 'trade', 'BTC', '0.0001', '0.0001'),
      row('LSYN7', 'BSYN1', '1 09:00:00', 'invite bonus', 'BTC', '0.00000000004'),
      row('LSYN8', 'BSYN2', '1 09:00:00', 'invite bonus', 'BTC', '0.00001'),
    );
    expect([file?.movements.map((m) => m.lines), file?.leftOut.map((r) => [r.reason, r.lines, r.column])]).toEqual([
      [[9]],
      [
        ['unreadable', [2, 3], 'amount'],
        ['unreadable', [4, 5], 'amount'],
        ['unreadable', [6, 7], 'amount'],
        ['unreadable', [8], 'amount'],
      ],
    ]);
  });

  it('leaves a bonus under a trade’s refid for the coin it bought out as unpaired, named by its line', () => {
    const file = read(
      row('LSYN1', 'TSYN1', '1 09:00:00', 'trade', 'ZEUR', '-10.00'),
      row('LSYN2', 'TSYN1', '1 09:00:00', 'trade', 'XXBT', '0.0001'),
      row('LSYN3', 'TSYN1', '1 09:00:01', 'invite bonus', 'BTC', '0.00001'),
      row('LSYN4', 'TSYN1', '1 09:00:02', 'invite bonus', 'ETH', '0.001'),
    );
    expect([file?.movements.map((m) => [m.key, m.lines, m.role, m.units, m.amount]), file?.leftOut]).toEqual([
      [
        ['poc-csv-1|kraken|TSYN1|BTC|in', [2, 3], 'purchase', '0.0001', '10'],
        ['poc-csv-1|kraken|TSYN1|ETH|in', [5], 'receipt', '0.001', null],
      ],
      [{ reason: 'unpaired', lines: [4], at: '2025-12-01T09:00:01Z', coin: null, units: null, column: null }],
    ]);
  });

  it('keeps a bonus under a sale’s refid for the coin it sold, since the sale’s key is out', () => {
    const file = read(
      row('LSYN1', 'TSYN1', '1 09:00:00', 'trade', 'EUR', '10.00'),
      row('LSYN2', 'TSYN1', '1 09:00:00', 'trade', 'BTC', '-0.0001'),
      row('LSYN3', 'TSYN1', '1 09:00:01', 'invite bonus', 'BTC', '0.00001'),
    );
    expect([file?.movements.map((m) => m.key), file?.leftOut]).toEqual([
      ['poc-csv-1|kraken|TSYN1|BTC|out', 'poc-csv-1|kraken|TSYN1|BTC|in'],
      [],
    ]);
  });

  it.each([
    ['the December 2025 header', foldDecember2025],
    ['the legacy header without subclass and wallet', foldLegacy],
  ])('reads the fold file under %s exactly as worked out by hand', (_, text) => {
    expect(readExchangeFile(text)).toEqual({ ok: true, value: KRAKEN_SYNTHETIC_FOLD });
  });

  it('gives the same keys for the same rows in a legacy and a December 2025 file', () => {
    const keys = (text: string) => {
      const result = readExchangeFile(text);
      return result.ok ? result.value.movements.map((movement) => movement.key) : [];
    };
    // The legacy fold file names XXBT and ZEUR where the December 2025 one names BTC and EUR.
    const xxbt = [foldLegacy, foldDecember2025].map((text) => text.match(/"XXBT"/gu)?.length);
    expect(xxbt).toEqual([4, undefined]);
    expect(keys(foldLegacy)).toEqual(keys(foldDecember2025));
    expect(keys(foldLegacy)).toContain('poc-csv-1|kraken|BQ1AAA-SYNTH-000030|BTC|in');
    expect(new Set(keys(foldLegacy)).size).toBe(keys(foldLegacy).length);
  });
});
