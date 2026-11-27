// Kraken's downloadable OHLCVT archive (ADR-0036, Reading of 2026-11-27; backfill.md): one daily file
// per pair, `<ALTNAME>_1440.csv`, no header, seven columns (unix seconds of the day's 00:00 UTC, open,
// high, low, close, volume, trades), a day without trades left out. Only the close is kept. A file
// with one malformed row fails as a whole and adds nothing; a failure carries a reason word, never the
// row, so no close reaches a log.
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fromEpochDay, isPositive, type Price, parseDecimal } from '@proofofcalm/core';
import type { StoreRow } from '@proofofcalm/data';

/** Why a file adds nothing: the closed set a failed line prints. */
export type FailReason = 'fields' | 'timestamp' | 'close' | 'order' | 'unreadable';
export type KrakenFile =
  | { status: 'ok'; rows: StoreRow[] }
  | { status: 'missing' }
  | { status: 'failed'; reason: FailReason };

// A mantissa and an exponent of at most three digits: PEPE's closes come as `1.2e-05`.
const EXPONENT = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d{1,3})$/;

/**
 * A close as a plain decimal string: a plain one normalised, an exponent-notation one shifted digit by
 * digit, so no `Number` touches it; null for anything else.
 */
export function plainDecimal(text: string): Price | null {
  const plain = parseDecimal<Price>(text);
  const match = plain === null ? EXPONENT.exec(text) : null;
  if (match === null) return plain;
  const [, whole = '', fraction = '', exponent = ''] = match;
  const digits = whole + fraction;
  const point = whole.length + Number.parseInt(exponent, 10);
  let shifted: string;
  if (point <= 0) shifted = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) shifted = digits + '0'.repeat(point - digits.length);
  else shifted = `${digits.slice(0, point)}.${digits.slice(point)}`;
  const trimmed = shifted
    .replace(/^0+(?=\d)/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return parseDecimal<Price>(trimmed);
}

const DAY_SECONDS = 86_400;
// 9999-12-31, the last day a `YYYY-MM-DD` date can hold.
const LAST_DAY = 2_932_896;

type Parsed = { day: number; row: StoreRow } | FailReason;

function parseRow(line: string): Parsed {
  const fields = line.split(',');
  if (fields.length !== 7) return 'fields';
  const [time = '', , , , close = ''] = fields;
  if (!/^\d{1,12}$/.test(time)) return 'timestamp';
  const seconds = Number.parseInt(time, 10);
  if (seconds % DAY_SECONDS !== 0 || seconds / DAY_SECONDS > LAST_DAY) return 'timestamp';
  const value = plainDecimal(close);
  if (value === null || !isPositive(value)) return 'close';
  const day = seconds / DAY_SECONDS;
  return { day, row: { date: fromEpochDay(day), close: value } };
}

/** One daily file, read line by line: its rows, `missing` when it is absent, or why it fails. */
export async function readKrakenFile(path: string): Promise<KrakenFile> {
  const input = createReadStream(path, { encoding: 'utf8' });
  try {
    await once(input, 'open');
  } catch (error) {
    return (error as { code?: unknown } | null)?.code === 'ENOENT'
      ? { status: 'missing' }
      : { status: 'failed', reason: 'unreadable' };
  }
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  const rows: StoreRow[] = [];
  let previous = -1;
  try {
    for await (const line of lines) {
      const parsed = parseRow(line);
      if (typeof parsed === 'string') return { status: 'failed', reason: parsed };
      if (parsed.day <= previous) return { status: 'failed', reason: 'order' };
      previous = parsed.day;
      rows.push(parsed.row);
    }
  } catch {
    return { status: 'failed', reason: 'unreadable' };
  } finally {
    lines.close();
    input.destroy();
  }
  return { status: 'ok', rows };
}

// Kraken's AssetPairs altnames, as pairs.ts checks them: nothing that could leave the folder.
const SYMBOL = /^[A-Za-z0-9]{1,24}$/;

/** The daily file of each symbol in an extracted archive folder, in the order given. */
export async function* readKrakenBulk(
  dir: string,
  symbols: readonly string[],
): AsyncIterable<{ symbol: string; file: KrakenFile }> {
  for (const symbol of symbols) {
    if (!SYMBOL.test(symbol)) throw new Error('refused: unknown symbol');
    yield { symbol, file: await readKrakenFile(join(dir, `${symbol}_1440.csv`)) };
  }
}
