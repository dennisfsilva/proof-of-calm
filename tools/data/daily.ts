// The daily job (daily.md): `node --import ./tools/data/hooks.ts tools/data/daily.ts --store <dir> [--dry]
// [--today YYYY-MM-DD]` reads each exchange's closes of every pair in pairs.json and appends them to the
// private store (ADR-0036, Reading of 2026-11-27; ADR-0058). Every line it prints, on every path, is one
// of the closed set below: names, dates, statuses and whole-number counts, never a close. So that a module
// failing to load prints from that set too, the pipeline's modules load after the handlers, by import().
import { stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { CalendarDate } from '@proofofcalm/core';
import type { Exchange } from '@proofofcalm/data';
import { refuseInsideRepository } from './guard.ts';
import type { Source, SourceIo } from './sources/source.ts';

/** How many days before today each exchange's window starts; it ends yesterday. Coinbase stays off. */
const WINDOW_DAYS: Record<Exchange, number | null> = {
  // Every complete day of the endpoint's latest 720 candles: the first run fills two years, a missed day heals.
  kraken: 720,
  // Yesterday only, with no catch-up (ADR-0036, Reading of 2026-11-23).
  bitstamp: 1,
  coinbase: null,
};

/**
 * The order the exchanges run in: first the one whose day cannot be read again (Bitstamp: yesterday
 * only), then Kraken, whose window heals a missed day, so a slow or failing Kraken never costs Bitstamp's.
 */
const ORDER: readonly Exchange[] = ['bitstamp', 'kraken', 'coinbase'];

/** Consecutive unreachable pairs after which an exchange's remaining pairs fail unread. */
const STOP_AFTER = 3;

/** The least time between two requests to one exchange (Kraken: one a second per address). */
const PACE_MS = 1000;

const QUOTES = ['EUR', 'USD'] as const;

// The store's own refusals (store.ts), already closed: a store-relative file and an error code.
const STORE_REFUSAL =
  /^refused: closes\/(kraken|bitstamp)\/[A-Z0-9]{1,12}-(EUR|USD)\.csv (is malformed|rows are malformed|cannot be (read|written) \([A-Z][A-Z0-9_]{0,31}\))$/;
// A reader's refusals (sources/read.ts): the exchange, its symbol and a status, or an unknown pair.
const READER_REFUSAL =
  /^refused: (kraken|bitstamp) (unknown pair|[A-Za-z0-9]{1,24} (rate limited|unreachable|http \d{3}|error|malformed|out of window))$/;

export type DailyOptions = { readonly store: string; readonly dry: boolean; readonly today: CalendarDate };
type Print = { readonly out: (line: string) => void; readonly err: (line: string) => void };

/** A refusal of the job's own: the part after `daily refused: `. */
class Refusal extends Error {}

const message = (error: unknown): string => (error instanceof Error ? error.message : '');

/** The one line printed for an error that stops the run. */
export function line(error: unknown): string {
  if (error instanceof Refusal) return `daily refused: ${error.message}`;
  return STORE_REFUSAL.test(message(error)) ? message(error) : 'daily refused: unexpected error';
}

/**
 * Runs every exchange's pairs into the store, in `ORDER`; false when a pair failed. A store refusal stops
 * the run; `STOP_AFTER` unreachable pairs in a row stop that exchange, its remaining pairs failed unread.
 */
export async function runDaily(
  options: DailyOptions,
  io: SourceIo,
  print: Print,
  sources?: Record<Exchange, Source | null>,
): Promise<boolean> {
  const { addDays } = await import('@proofofcalm/core');
  const { pace } = await import('./pace.ts');
  const { PAIRS } = await import('./pairs.ts');
  const { mergeAppend, readStore, writeStore } = await import('./store.ts');
  const readers = sources ?? (await import('./sources/index.ts')).SOURCES;
  let clean = true;
  for (const exchange of ORDER) {
    const source = readers[exchange];
    const days = WINDOW_DAYS[exchange];
    if (source === null || days === null) {
      print.out(`${exchange}: off`);
      continue;
    }
    // One pacer per exchange and run, so the spacing holds across all its pairs.
    const paced = pace(PACE_MS, io);
    const from = addDays(options.today, -days);
    const to = addDays(options.today, -1);
    // Unreachable pairs in a row, across both quotes: an outage costs STOP_AFTER timeouts, not one per pair.
    let unreachable = 0;
    for (const quote of QUOTES) {
      const pairs = Object.entries(PAIRS).flatMap(([coin, venues]) => {
        const symbol = venues[exchange]?.[quote];
        return symbol === undefined ? [] : [{ pair: `${coin}-${quote}`, symbol }];
      });
      let added = 0;
      let revised = 0;
      let failed = 0;
      for (const { pair, symbol } of pairs) {
        if (unreachable >= STOP_AFTER) {
          failed += 1;
          continue;
        }
        const stored = await readStore(options.store, exchange, pair);
        let fresh: Awaited<ReturnType<Source['closes']>>;
        try {
          fresh = await source.closes(symbol, from, to, paced);
          unreachable = 0;
        } catch (error) {
          failed += 1;
          const refusal = message(error);
          const closed = READER_REFUSAL.test(refusal);
          print.err(closed ? refusal : `refused: ${exchange} ${symbol} unexpected error`);
          unreachable = closed && refusal.endsWith(' unreachable') ? unreachable + 1 : 0;
          if (unreachable === STOP_AFTER) print.err(`${exchange}: stopped after ${STOP_AFTER} unreachable`);
          continue;
        }
        const merged = mergeAppend(stored, fresh);
        added += merged.added;
        revised += merged.revised;
        if (!options.dry && merged.added > 0) await writeStore(options.store, exchange, pair, merged.rows);
      }
      const tail = options.dry ? ' (dry: nothing written)' : '';
      print.out(
        `${exchange} ${quote}: ${pairs.length} pairs, ${added} added, ${revised} revised, ${failed} failed${tail}`,
      );
      clean &&= failed === 0;
    }
  }
  return clean;
}

// A calendar date that exists (`2026-02-30` does not).
const isDate = (text: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);

function options(args: string[], now: Date): DailyOptions {
  let values: { store?: string; dry?: boolean; today?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: { store: { type: 'string' }, dry: { type: 'boolean' }, today: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new Refusal('usage');
  }
  const { store, dry = false, today = now.toISOString().slice(0, 10) } = values;
  if (store === undefined || !isDate(today)) throw new Refusal('usage');
  return { store, dry, today: today as CalendarDate };
}

async function entry(): Promise<void> {
  const crash = (error: unknown) => {
    process.stderr.write(`${line(error)}\n`);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
  try {
    // The one read of the clock that decides the windows (UTC today, unless --today names one).
    const settings = options(process.argv.slice(2), new Date());
    try {
      refuseInsideRepository(settings.store);
    } catch {
      throw new Refusal('--store is inside this repository');
    }
    if (!(await stat(settings.store).catch(() => undefined))?.isDirectory())
      throw new Refusal('--store is not a folder');
    const io: SourceIo = {
      fetch: (input, init) => fetch(input, init),
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      now: () => new Date(),
      timeout: (ms) => AbortSignal.timeout(ms),
    };
    const print = {
      out: (text: string) => process.stdout.write(`${text}\n`),
      err: (text: string) => process.stderr.write(`${text}\n`),
    };
    process.exitCode = (await runDaily(settings, io, print)) ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${line(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await entry();
