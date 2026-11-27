// Synthetic values only (ADR-0036, Reading of 2026-11-27): made-up timestamps and closes in the
// archive's shape, never a real Kraken figure.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type KrakenFile, plainDecimal, readKrakenBulk, readKrakenFile } from './kraken-bulk';

// 2020-01-01, 2020-01-02 and 2020-01-04 at 00:00 UTC: no row for the 3rd, a day without trades.
const DAY1 = 1_577_836_800;
const DAY2 = DAY1 + 86_400;
const DAY4 = DAY1 + 3 * 86_400;
const row = (seconds: number | string, close: string) => `${seconds},1,2,0.5,${close},10,3\n`;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kraken-bulk-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const file = async (name: string, text: string) => {
  const path = join(dir, name);
  await writeFile(path, text, 'utf8');
  return path;
};

describe('plainDecimal', () => {
  it('keeps a plain decimal, normalised', () => {
    expect(plainDecimal('101.50')).toBe('101.5');
    expect(plainDecimal('0.000123')).toBe('0.000123');
  });

  it('writes an exponent-notation close as the exact plain decimal', () => {
    expect(plainDecimal('1.2e-05')).toBe('0.000012');
    expect(plainDecimal('7.0123456789012345678e-06')).toBe('0.0000070123456789012345678');
    expect(plainDecimal('3E-1')).toBe('0.3');
    expect(plainDecimal('1.25e+2')).toBe('125');
    expect(plainDecimal('5e3')).toBe('5000');
    expect(plainDecimal('0.5e1')).toBe('5');
  });

  it('refuses anything else that is not a decimal', () => {
    for (const text of ['', 'abc', '1,5', '01.5', '1.', '.5', '1e', 'e5', '1.2e-5000', 'NaN', 'Infinity', ' 1']) {
      expect(plainDecimal(text)).toBeNull();
    }
  });
});

describe('readKrakenFile', () => {
  it('maps each row to its UTC date and close, keeping a gap as a gap', async () => {
    const path = await file('XBTEUR_1440.csv', row(DAY1, '100.5') + row(DAY2, '101') + row(DAY4, '99.25'));
    expect(await readKrakenFile(path)).toEqual({
      status: 'ok',
      rows: [
        { date: '2020-01-01', close: '100.5' },
        { date: '2020-01-02', close: '101' },
        { date: '2020-01-04', close: '99.25' },
      ],
    });
  });

  it('reads CRLF line ends and an exponent-notation close', async () => {
    const path = await file('PEPEEUR_1440.csv', `${DAY1},1,1,1,1.5e-05,1,1\r\n${DAY2},1,1,1,0.00002,1,1\r\n`);
    expect(await readKrakenFile(path)).toEqual({
      status: 'ok',
      rows: [
        { date: '2020-01-01', close: '0.000015' },
        { date: '2020-01-02', close: '0.00002' },
      ],
    });
  });

  it('fails the whole file on a malformed row, with a reason word', async () => {
    const cases: [string, string][] = [
      [`${row(DAY1, '100')}${DAY2},1,2,0.5,101,10\n`, 'fields'],
      [`${row(DAY1, '100')}\n`, 'fields'],
      [row(DAY1 + 3600, '100'), 'timestamp'],
      [row('1577836800.0', '100'), 'timestamp'],
      [row('-86400', '100'), 'timestamp'],
      [row(DAY1, '100') + row(DAY2, 'x'), 'close'],
      [row(DAY1, '0'), 'close'],
      [row(DAY1, '-1'), 'close'],
      [row(DAY2, '100') + row(DAY1, '101'), 'order'],
      [row(DAY1, '100') + row(DAY1, '100'), 'order'],
    ];
    for (const [text, reason] of cases) {
      const path = await file('XBTEUR_1440.csv', text);
      expect(await readKrakenFile(path)).toEqual({ status: 'failed', reason });
    }
  });

  it('says missing for an absent file and unreadable for a folder in its place', async () => {
    expect(await readKrakenFile(join(dir, 'XBTEUR_1440.csv'))).toEqual({ status: 'missing' });
    await mkdir(join(dir, 'ETHEUR_1440.csv'));
    expect(await readKrakenFile(join(dir, 'ETHEUR_1440.csv'))).toEqual({ status: 'failed', reason: 'unreadable' });
  });
});

describe('readKrakenBulk', () => {
  it('streams each symbol of the folder in the order given', async () => {
    await file('XBTEUR_1440.csv', row(DAY1, '100'));
    await file('ETHEUR_1440.csv', row(DAY1, 'x'));
    const seen: { symbol: string; file: KrakenFile }[] = [];
    for await (const entry of readKrakenBulk(dir, ['ETHEUR', 'XBTEUR', 'SOLEUR'])) seen.push(entry);
    expect(seen).toEqual([
      { symbol: 'ETHEUR', file: { status: 'failed', reason: 'close' } },
      { symbol: 'XBTEUR', file: { status: 'ok', rows: [{ date: '2020-01-01', close: '100' }] } },
      { symbol: 'SOLEUR', file: { status: 'missing' } },
    ]);
  });

  it('refuses a symbol that could leave the folder', async () => {
    const read = async () => {
      for await (const _ of readKrakenBulk(dir, ['../XBTEUR'])) return;
    };
    await expect(read()).rejects.toThrow('refused: unknown symbol');
  });
});
