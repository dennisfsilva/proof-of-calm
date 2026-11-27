import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StoreRow } from '@proofofcalm/data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatStore, mergeAppend, parseStore, readStore, storePath, writeStore } from './store.ts';

// Synthetic closes only (ADR-0036, Reading of 2026-11-27): no exchange's figure enters this file.
const row = (date: string, close: string) => ({ date, close }) as StoreRow;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'closes-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the store file', () => {
  it('lives at closes/<exchange>/<COIN>-<QUOTE>.csv under the directory', () => {
    expect(storePath(dir, 'kraken', 'BTC-EUR')).toBe(join(dir, 'closes', 'kraken', 'BTC-EUR.csv'));
  });

  it('refuses an exchange or a pair outside the closed set, so no path leaves the store', () => {
    expect(() => storePath(dir, 'nowhere' as 'kraken', 'BTC-EUR')).toThrow('refused: unknown exchange');
    for (const pair of ['BTC-GBP', '../BTC-EUR', 'btc-eur', 'BTC', 'BTC-EUR/x']) {
      expect(() => storePath(dir, 'kraken', pair)).toThrow('refused: unknown pair');
    }
  });

  it('round-trips rows through the CSV text, header first and one row per line', () => {
    const rows = [row('2020-01-01', '10.5'), row('2020-01-02', '11'), row('2020-01-04', '0.000123')];
    const text = formatStore(rows);
    expect(text).toBe('date,close\n2020-01-01,10.5\n2020-01-02,11\n2020-01-04,0.000123\n');
    expect(parseStore(text, 'kraken', 'BTC-EUR')).toEqual(rows);
  });

  it('writes and reads the same rows back', async () => {
    const rows = [row('2021-03-01', '1.25'), row('2021-03-02', '1.5')];
    await writeStore(dir, 'bitstamp', 'ETH-USD', rows);
    expect(readFileSync(storePath(dir, 'bitstamp', 'ETH-USD'), 'utf8')).toBe(formatStore(rows));
    expect(await readStore(dir, 'bitstamp', 'ETH-USD')).toEqual(rows);
  });

  it('starts empty when the pair has no file yet', async () => {
    expect(await readStore(dir, 'kraken', 'SOL-EUR')).toEqual([]);
  });

  it('reads a file holding only the header as empty', () => {
    expect(parseStore('date,close\n', 'kraken', 'BTC-EUR')).toEqual([]);
  });

  it('refuses a malformed file through StoreRowsSchema, naming the file and no value', async () => {
    const refused = 'refused: closes/kraken/BTC-EUR.csv is malformed';
    const bad = [
      '',
      'day,close\n2020-01-01,1\n',
      'date,close\n2020-01-01,1,2\n',
      'date,close\n2020-02-30,1\n',
      'date,close\n2020-01-01,1e3\n',
      'date,close\n2020-01-01,0\n',
      'date,close\n2020-01-01,-1\n',
      'date,close\n2020-01-02,1\n2020-01-01,1\n',
      'date,close\n2020-01-01,1\n2020-01-01,2\n',
      'date,close\n2020-01-01,1\n\n2020-01-02,1\n',
      'date,close\r\n2020-01-01,1\r\n',
    ];
    for (const text of bad) {
      expect(() => parseStore(text, 'kraken', 'BTC-EUR'), JSON.stringify(text)).toThrow(refused);
    }
    mkdirSync(join(dir, 'closes', 'kraken'), { recursive: true });
    writeFileSync(storePath(dir, 'kraken', 'BTC-EUR'), 'date,close\n2020-01-01,secret-value\n');
    const error = await readStore(dir, 'kraken', 'BTC-EUR').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(refused);
    expect(String((error as Error).cause ?? '')).toBe('');
  });

  it('refuses to write rows that are out of order or not decimals, leaving no file', async () => {
    await expect(
      writeStore(dir, 'kraken', 'BTC-EUR', [row('2020-01-02', '1'), row('2020-01-01', '1')]),
    ).rejects.toThrow('refused: closes/kraken/BTC-EUR.csv rows are malformed');
    expect(await readStore(dir, 'kraken', 'BTC-EUR')).toEqual([]);
  });
});

// A file-system failure names the store-relative file and the error's code, never the store's
// location or Node's own text, and carries no cause a later script could print.
async function refusal(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  const { message, cause } = error as Error;
  expect(message).not.toContain(dir);
  expect(message).not.toMatch(/illegal operation|not a directory|operation not permitted/i);
  expect(cause).toBeUndefined();
  return error as Error;
}

describe('the store on a failing file system', () => {
  it('refuses to write under a closes that is a file, naming the file and the code only', async () => {
    writeFileSync(join(dir, 'closes'), 'not a folder\n');
    const error = await refusal(writeStore(dir, 'kraken', 'BTC-EUR', [row('2020-01-01', '1')]));
    expect(error.message).toMatch(/^refused: closes\/kraken\/BTC-EUR\.csv cannot be written \([A-Z]+\)$/);
  });

  it('refuses to read a store file that is a folder, naming the file and the code only', async () => {
    mkdirSync(storePath(dir, 'kraken', 'BTC-EUR'), { recursive: true });
    const error = await refusal(readStore(dir, 'kraken', 'BTC-EUR'));
    expect(error.message).toMatch(/^refused: closes\/kraken\/BTC-EUR\.csv cannot be read \([A-Z]+\)$/);
  });

  it('removes the temporary file when the rename fails, leaving the folder as it was', async () => {
    const path = storePath(dir, 'kraken', 'BTC-EUR');
    mkdirSync(join(path, 'held'), { recursive: true });
    const error = await refusal(writeStore(dir, 'kraken', 'BTC-EUR', [row('2020-01-01', '1')]));
    expect(error.message).toMatch(/^refused: closes\/kraken\/BTC-EUR\.csv cannot be written \([A-Z]+\)$/);
    expect(readdirSync(join(dir, 'closes', 'kraken'))).toEqual(['BTC-EUR.csv']);
  });

  it('keeps the store refusals of an unknown pair ahead of the file system', async () => {
    await expect(readStore(dir, 'kraken', '../BTC-EUR')).rejects.toThrow(/^refused: unknown pair$/);
  });
});

describe('mergeAppend', () => {
  it('appends new dates in ascending order and counts them', () => {
    const old = [row('2020-01-02', '2'), row('2020-01-04', '4')];
    const fresh = [row('2020-01-05', '5'), row('2020-01-01', '1'), row('2020-01-03', '3')];
    expect(mergeAppend(old, fresh)).toEqual({
      rows: [
        row('2020-01-01', '1'),
        row('2020-01-02', '2'),
        row('2020-01-03', '3'),
        row('2020-01-04', '4'),
        row('2020-01-05', '5'),
      ],
      added: 3,
      revised: 0,
    });
  });

  it('keeps the stored close when a new row revises it, and only counts it', () => {
    const old = [row('2020-01-01', '1'), row('2020-01-02', '2')];
    const fresh = [row('2020-01-02', '2.5'), row('2020-01-03', '3')];
    expect(mergeAppend(old, fresh)).toEqual({
      rows: [row('2020-01-01', '1'), row('2020-01-02', '2'), row('2020-01-03', '3')],
      added: 1,
      revised: 1,
    });
  });

  it('counts the same close written another way as neither added nor revised', () => {
    const old = [row('2020-01-01', '1.5')];
    expect(mergeAppend(old, [row('2020-01-01', '1.50')])).toEqual({ rows: old, added: 0, revised: 0 });
  });

  it('keeps the first of two new rows for one date and counts the other as revised', () => {
    expect(mergeAppend([], [row('2020-01-01', '1'), row('2020-01-01', '2')])).toEqual({
      rows: [row('2020-01-01', '1')],
      added: 1,
      revised: 1,
    });
  });

  it('leaves its inputs as they were', () => {
    const old = [row('2020-01-02', '2')];
    const fresh = [row('2020-01-01', '1')];
    mergeAppend(old, fresh);
    expect(old).toEqual([row('2020-01-02', '2')]);
    expect(fresh).toEqual([row('2020-01-01', '1')]);
  });
});
