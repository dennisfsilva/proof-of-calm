import { describe, expect, it } from 'vitest';
import synthetic from '../../../test/exchange/trade-republic-synthetic.csv?raw';
import { TRADE_REPUBLIC_SYNTHETIC } from '../../../test/exchange/trade-republic-synthetic.expected';
import { readExchangeFile } from './read';
import { TR_COLUMNS } from './trade-republic';

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
    expect(refusal(`${LEDGER}\n`)).toEqual({ ok: false, error: { code: 'no-rows', exchange: 'kraken' } });
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
      expect(refusal(text)).toEqual({ ok: false, error: { code: 'no-rows', exchange: 'kraken' } });
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
      error: { code: 'missing-columns', exchange: 'kraken', columns: ['refid', 'fee'] },
    });
  });

  // "A header holding transaction_id, asset_class and category, all of whose names are in TR_COLUMNS (a last empty
  // name dropped), is Trade Republic; with a name outside TR_COLUMNS it is `unknown-columns`, naming a column only
  // when it matches ^[a-z_]{1,40}$ and counting the others; without a TR_READ column it is `missing-columns`."
  describe('a Trade Republic export', () => {
    const header = TR_COLUMNS.map((name) => `"${name}"`).join(',');
    const row = (cells: Record<string, string>) => TR_COLUMNS.map((name) => `"${cells[name] ?? ''}"`).join(',');
    const buy = row({
      datetime: '2026-05-04T08:15:30.123Z',
      category: 'TRADING',
      type: 'BUY',
      asset_class: 'CRYPTO',
      symbol: 'BTC',
      shares: '0.00052',
      amount: '-49.92',
      currency: 'EUR',
      transaction_id: '00000000-0000-4000-8000-000000000001',
    });

    it.each([
      ['its header', header, buy],
      ['a header whose last name is empty', `${header},""`, `${buy},""`],
    ])('is read from %s', (_, names, data) => {
      const result = refusal(`${names}\n${data}\n`);
      expect(result.ok && [result.value.exchange, result.value.rows, result.value.movements.map((m) => m.key)]).toEqual(
        ['trade-republic', 1, ['poc-csv-1|trade-republic|00000000-0000-4000-8000-000000000001|BTC|in']],
      );
    });

    it('reads the synthetic export as its expected file', () => {
      expect(refusal(synthetic)).toEqual({ ok: true, value: TRADE_REPUBLIC_SYNTHETIC });
    });

    it('names each column outside the export that reads as a column name, and counts the others', () => {
      const names = `${header},"iban_hash","Max Mustermann","","${'a'.repeat(41)}","note"`;
      expect(refusal(`${names}\n${buy}\n`)).toEqual({
        ok: false,
        error: { code: 'unknown-columns', exchange: 'trade-republic', columns: ['iban_hash', 'note'], others: 3 },
      });
    });

    it('names each column the reader reads that the header lacks, before counting its rows', () => {
      const names = TR_COLUMNS.filter((name) => name !== 'shares' && name !== 'fee').join(',');
      expect(refusal(`${names}\n`)).toEqual({
        ok: false,
        error: { code: 'missing-columns', exchange: 'trade-republic', columns: ['shares', 'fee'] },
      });
    });

    it('refuses a header with no data row as no-rows', () => {
      expect(refusal(`${header}\n\n`)).toEqual({ ok: false, error: { code: 'no-rows', exchange: 'trade-republic' } });
    });

    it('is not recognised without one of transaction_id, asset_class and category', () => {
      for (const name of ['transaction_id', 'asset_class', 'category'])
        expect(refusal(`${TR_COLUMNS.filter((each) => each !== name).join(',')}\n`)).toEqual({
          ok: false,
          error: { code: 'not-recognised' },
        });
    });

    it('leaves a Kraken ledger read as Kraken', () => {
      const bonus = `"LSYN01-AAAAA-AAAAAA","QSYN01-AAAAA-AAAAAA","2025-12-01 09:00:00","invite bonus","","currency","crypto","XXBT","spot / main","0.0001","0","0.0001"`;
      const result = refusal(`${LEDGER}\n${bonus}\n`);
      expect(result.ok && result.value.exchange).toBe('kraken');
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
