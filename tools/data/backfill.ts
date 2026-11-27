// The backfill (backfill.md): `node --import ./tools/data/hooks.ts tools/data/backfill.ts --source
// kraken-bulk --dir <extracted> [--dir <another>] --store <dir> [--dry]` merges each Kraken pair of
// pairs.json from the extracted daily files into `closes/kraken/<COIN>-<QUOTE>.csv` of the private
// store. Every line it prints, on every path, is one of the closed set below: names, statuses and
// whole-number counts, never a close. So that a module failing to load prints from that set too, the
// other modules, guard.ts among them, load inside main, after the handlers.
import { stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { StoreRow } from '@proofofcalm/data';

const USAGE = 'usage: --source kraken-bulk --dir <extracted> [--dir <another>] --store <dir> [--dry]';
// The store's own refusals (store.ts), already closed: a store-relative file and an error code.
const STORE_REFUSAL =
  /^refused: closes\/kraken\/[A-Z0-9]{1,12}-(EUR|USD)\.csv (is malformed|rows are malformed|cannot be (read|written) \([A-Z][A-Z0-9_]{0,31}\))$/;

const out = (line: string) => process.stdout.write(`kraken-bulk ${line}\n`);
const err = (line: string) => process.stderr.write(`kraken-bulk ${line}\n`);

class Refusal extends Error {}

// The line for any error: a refusal of this file, a store refusal, or one fixed line for the rest.
function report(error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof Refusal) err(`refused: ${message}`);
  else err(STORE_REFUSAL.test(message) ? message : 'refused: unexpected error');
  process.exitCode = 1;
}
const crash = (error: unknown) => {
  report(error);
  process.exit(1);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

function options() {
  let values: { source?: string; dir?: string[]; store?: string; dry?: boolean };
  try {
    ({ values } = parseArgs({
      options: {
        source: { type: 'string' },
        dir: { type: 'string', multiple: true },
        store: { type: 'string' },
        dry: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new Refusal(USAGE);
  }
  const { source, dir = [], store, dry = false } = values;
  if (source !== 'kraken-bulk' || dir.length === 0 || store === undefined) throw new Refusal(USAGE);
  return { dirs: dir, store, dry };
}

const isFolder = async (path: string) => (await stat(path).catch(() => undefined))?.isDirectory() === true;

// The store never lives in this repository (ADR-0036): guard.ts, the daily job's guard, refuses a path
// inside it however it is written, before any read.
async function checkFolders(dirs: readonly string[], store: string): Promise<void> {
  const { refuseInsideRepository } = await import('./guard');
  try {
    refuseInsideRepository(store);
  } catch {
    throw new Refusal('--store is inside this repository');
  }
  if (!(await isFolder(store))) throw new Refusal('--store is not a folder');
  for (const [index, dir] of dirs.entries()) {
    if (!(await isFolder(dir))) throw new Refusal(`--dir ${index + 1} is not a folder`);
  }
}

async function main(): Promise<void> {
  const { dirs, store, dry } = options();
  await checkFolders(dirs, store);
  const { PAIRS } = await import('./pairs');
  const { mergeAppend, readStore, writeStore } = await import('./store');
  const { readKrakenBulk } = await import('./kraken-bulk');
  let failedAny = false;
  for (const quote of ['EUR', 'USD'] as const) {
    const pairs = Object.entries(PAIRS).flatMap(([coin, venues]) => {
      const symbol = venues.kraken?.[quote];
      return symbol === undefined ? [] : [{ pair: `${coin}-${quote}`, symbol }];
    });
    const fresh = new Map<string, StoreRow[]>(pairs.map(({ symbol }) => [symbol, []]));
    const names = new Map(pairs.map(({ pair, symbol }) => [symbol, `${pair} (${symbol})`]));
    let failed = 0;
    let missing = 0;
    const symbols = pairs.map((entry) => entry.symbol);
    for (const [index, dir] of dirs.entries()) {
      for await (const { symbol, file } of readKrakenBulk(dir, symbols)) {
        const where = `${names.get(symbol)} in --dir ${index + 1}`;
        // A later --dir's rows come after the earlier ones', so mergeAppend keeps the first close of a day.
        if (file.status === 'ok') fresh.set(symbol, (fresh.get(symbol) ?? []).concat(file.rows));
        else if (file.status === 'missing') {
          missing += 1;
          out(`missing: ${where}`);
        } else {
          failed += 1;
          err(`failed: ${where}: ${file.reason}`);
        }
      }
    }
    let added = 0;
    let revised = 0;
    for (const { pair, symbol } of pairs) {
      const merged = mergeAppend(await readStore(store, 'kraken', pair), fresh.get(symbol) ?? []);
      added += merged.added;
      revised += merged.revised;
      if (!dry && merged.added > 0) await writeStore(store, 'kraken', pair, merged.rows);
    }
    const tail = dry ? ' (dry: nothing written)' : '';
    out(
      `${quote}: ${pairs.length} pairs, ${added} added, ${revised} revised, ${failed} failed, ${missing} missing${tail}`,
    );
    failedAny ||= failed > 0;
  }
  if (failedAny) process.exitCode = 1;
}

await main().catch(report);
