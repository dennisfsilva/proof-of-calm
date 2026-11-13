import { describe, expect, it } from 'vitest';
import { readExchangeFile } from './read';

// "Text starting with `PK\^C\^D` is `zip`; a header with ordertxid and pair is `kraken-trades`; a header whose
// names, a last empty one dropped, are all among the ledger's (txid, refid, time, type, subtype, aclass,
// subclass, asset, wallet, amount, fee, balance, amountusd) is a Kraken ledger, which is `missing-columns`,
// naming each, when it lacks txid, refid, time, type, asset, amount or fee; a ledger with no data row is
// `no-rows`; anything else is `not-recognised`."
// "No refusal, left-out row or thrown error holds a cell's text." (docs/DOMAIN.md §3.13)
const LEDGER = '"txid","refid","time","type","subtype","aclass","subclass","asset","wallet","amount","fee","balance"';
const refusal = (text: string) => readExchangeFile(text);

describe('readExchangeFile', () => {
  it('refuses a ZIP by its first bytes', () => {
    expect(refusal('PK\u0003\u0004\u0014\u0000\u0008\u0000ledgers.csv')).toEqual({ ok: false, error: { code: 'zip' } });
  });

  it("refuses Kraken's trades file by its ordertxid and pair columns", () => {
    const trades = 'txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers\n';
    expect(refusal(`${trades}TSYN01-AAAAA-AAAAAA,OSYN01-AAAAA-AAAAAA,XXBTZEUR,2025-12-01 09:00:00.0000,buy`)).toEqual({
      ok: false,
      error: { code: 'kraken-trades' },
    });
  });

  it('does not recognise a random CSV, a backup, an empty text or a header with a column the ledger lacks', () => {
    for (const text of [
      'date,coin,amount\n2025-12-01,BTC,10\n',
      '{"format":"proof-of-calm","schemaVersion":5,"plan":null,"entries":[]}',
      '',
      `${LEDGER.replace('"balance"', '"balance","price"')}\n`,
      `${LEDGER.replace('"balance"', '"","balance"')}\n`,
      '""\n',
    ]) {
      expect(refusal(text)).toEqual({ ok: false, error: { code: 'not-recognised' } });
    }
  });

  it('refuses a ledger with a header alone as no-rows', () => {
    expect(refusal(`${LEDGER}\n`)).toEqual({ ok: false, error: { code: 'no-rows' } });
  });

  // "A blank line (one empty cell, or every cell empty) is not a row: the reader skips it, it counts nowhere, and
  // a ledger with only blank lines after its header is `no-rows`."
  describe('a blank line', () => {
    const bonus = (n: number) =>
      `"LSYN0${n}-AAAAA-AAAAAA","QSYN0${n}-AAAAA-AAAAAA","2025-12-01 09:00:00","invite bonus","","currency","crypto","XXBT","spot / main","0.0001","0","0.0001"`;

    it.each([
      ['LF', `${LEDGER}\n\n`],
      ['CRLF', `${LEDGER}\r\n\r\n`],
      ['empty cells', `${LEDGER}\n,,,\n\n`],
    ])('after the header alone is no-rows (%s)', (_, text) => {
      expect(refusal(text)).toEqual({ ok: false, error: { code: 'no-rows' } });
    });

    it('after the last row counts nowhere', () => {
      const result = refusal(`${LEDGER}\n${bonus(1)}\n\n`);
      expect(result.ok && [result.value.rows, result.value.movements.length, result.value.leftOut]).toEqual([1, 1, []]);
    });

    it("between two rows keeps the second row's line in the file", () => {
      const result = refusal(`${LEDGER}\n${bonus(1)}\n\n${bonus(2)}\n`);
      expect(result.ok && [result.value.rows, result.value.movements.map((movement) => movement.lines)]).toEqual([
        2,
        [[2], [4]],
      ]);
    });
  });

  it('names each required column a ledger lacks, before counting its rows', () => {
    expect(refusal('"txid","time","type","subtype","aclass","asset","amount","balance"\n')).toEqual({
      ok: false,
      error: { code: 'missing-columns', columns: ['refid', 'fee'] },
    });
  });

  // K8's ledger headers: one ends in an empty name (a trailing comma), two add amountusd, which the reader
  // never reads.
  it.each([
    [
      'a header whose last name is empty',
      '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance",""',
      '"0.0001","0","0.0001",""',
    ],
    [
      'a header that adds amountusd',
      '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance","amountusd"',
      '"0.0001","0","0.0001","not a number"',
    ],
  ])('reads %s as a Kraken ledger', (_, header, figures) => {
    const row = `"LSYN01-AAAAA-AAAAAA","QSYN01-AAAAA-AAAAAA","2025-12-01 09:00:00","invite bonus","","currency","XXBT",${figures}`;
    const result = refusal(`${header}\n${row}\n`);
    expect(result.ok && result.value.movements.map((movement) => [movement.role, movement.coin])).toEqual([
      ['receipt', 'BTC'],
    ]);
  });

  it('reads a ledger without the optional subtype column', () => {
    const result = refusal(
      '"txid","refid","time","type","asset","amount","fee"\n"LSYN01-AAAAA-AAAAAA","QSYN01-AAAAA-AAAAAA","2025-12-01 09:00:00","invite bonus","XXBT","0.0001","0"\n',
    );
    expect(result.ok && result.value.movements.map((movement) => [movement.role, movement.coin])).toEqual([
      ['receipt', 'BTC'],
    ]);
  });
});
