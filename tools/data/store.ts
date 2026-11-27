// The private store of per-exchange daily closes (ADR-0036, Reading of 2026-11-27; README.md): one CSV
// per exchange and pair, `closes/<exchange>/<COIN>-<QUOTE>.csv` under the store's directory. A stored
// close is never overwritten; a revised one is only counted. Every error names the file and nothing
// else, so no close reaches a log.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { compare, compareDates } from '@proofofcalm/core';
import { type Exchange, ExchangeSchema, STORE_HEADER, type StoreRow, StoreRowsSchema } from '@proofofcalm/data';

// A coin id of capitals and digits and a collected quote: nothing that could leave the store's folder.
const PAIR = /^[A-Z0-9]{1,12}-(EUR|USD)$/;

/** The store file of one exchange and pair (`BTC-EUR`), refused for anything outside the closed set. */
export function storePath(dir: string, exchange: Exchange, pair: string): string {
  if (!ExchangeSchema.safeParse(exchange).success) throw new Error('refused: unknown exchange');
  if (!PAIR.test(pair)) throw new Error('refused: unknown pair');
  return join(dir, 'closes', exchange, `${pair}.csv`);
}

const fileName = (exchange: Exchange, pair: string) => `closes/${exchange}/${pair}.csv`;

/** The file's text as rows: the header, then `date,close` per line, checked by `StoreRowsSchema`. */
export function parseStore(text: string, exchange: Exchange, pair: string): StoreRow[] {
  const refused = new Error(`refused: ${fileName(exchange, pair)} is malformed`);
  const lines = text.split('\n');
  if (lines.shift() !== STORE_HEADER || lines.pop() !== '') throw refused;
  const cells = lines.map((line) => line.split(','));
  if (cells.some((cell) => cell.length !== 2)) throw refused;
  const parsed = StoreRowsSchema.safeParse(cells.map(([date, close]) => ({ date, close })));
  if (!parsed.success) throw refused;
  return parsed.data;
}

/** Rows as the file's text, the header first and a newline after every line. */
export function formatStore(rows: readonly StoreRow[]): string {
  return [STORE_HEADER, ...rows.map((row) => `${row.date},${row.close}`)].map((line) => `${line}\n`).join('');
}

/** The stored rows of one exchange and pair; a pair with no file yet starts empty. */
export async function readStore(dir: string, exchange: Exchange, pair: string): Promise<StoreRow[]> {
  let text: string;
  try {
    text = await readFile(storePath(dir, exchange, pair), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return parseStore(text, exchange, pair);
}

/** Writes the rows whole, through a temporary file renamed over the old one; bad rows write nothing. */
export async function writeStore(
  dir: string,
  exchange: Exchange,
  pair: string,
  rows: readonly StoreRow[],
): Promise<void> {
  const path = storePath(dir, exchange, pair);
  if (!StoreRowsSchema.safeParse(rows).success) {
    throw new Error(`refused: ${fileName(exchange, pair)} rows are malformed`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, formatStore(rows), 'utf8');
  await rename(`${path}.tmp`, path);
}

/**
 * The stored rows with the new dates added, ascending. A new row whose date is stored, or came earlier
 * in `fresh`, with a different close is a revision: the first close stays and the row is only counted.
 */
export function mergeAppend(
  old: readonly StoreRow[],
  fresh: readonly StoreRow[],
): { rows: StoreRow[]; added: number; revised: number } {
  const byDate = new Map(old.map((row) => [row.date, row]));
  let added = 0;
  let revised = 0;
  for (const row of fresh) {
    const stored = byDate.get(row.date);
    if (stored === undefined) {
      byDate.set(row.date, row);
      added += 1;
    } else if (compare(stored.close, row.close) !== 0) {
      revised += 1;
    }
  }
  const rows = [...byDate.values()].sort((a, b) => compareDates(a.date, b.date));
  return { rows, added, revised };
}
