import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, units } from '../../../test/builders';
import { fileOf, type World, world } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, trade } from '../../../test/exchange/plan-fixture';
import { IMPORT_RECORDED_CHECKS } from '../../constants';
import { addDays } from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { liveEntries } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import { applyExchangeImport } from './apply';
import type { ExchangeFile } from './kraken';
import { planExchangeImport } from './plan';
import { changedLog, importRemedies, type Stored } from './plan-remedy';

// The Matching entries' sentence over generated files and Logs (docs/DOMAIN.md §3.13, "Lines that ask for a change"),
// before importing, after importing the shown plan and after a shorter export was stored first: whoever follows it
// ends with the Log one import leaves, less the row, plus the dates the row recorded, at the same Invested, and a third
// import adds nothing. Whoever imports the shown plan first and then follows the sentence shown before the import is
// allowed the delete and ends with the same Log and Invested.

const run = (drawn: World, entries: readonly Entry[], file: ExchangeFile) =>
  planExchangeImport(file, { plan: drawn.plan, entries }, { addHeld: drawn.addHeld, venue: drawn.venue }, LISBON);
/** Choosing the file again opens a new preview, its box unticked. */
const anew = (drawn: World, entries: readonly Entry[]) =>
  planExchangeImport(drawn.file, { plan: drawn.plan, entries }, { addHeld: false, venue: drawn.venue }, LISBON);
const imported = (drawn: World, entries: readonly Entry[], file: ExchangeFile) =>
  applyExchangeImport(entries, run(drawn, entries, file), NOW).entries;
const seen = (entries: readonly Entry[]) =>
  liveEntries(entries)
    .map(({ updatedAt: _, ...rest }) => JSON.stringify(rest))
    .sort();

/** The file's rows up to an instant, the shorter export stored before the whole file. */
function prefix(file: ExchangeFile, cut: number) {
  const instants = [...new Set(file.movements.map((movement) => movement.at))].sort();
  const last = instants[cut % (instants.length + 1)] ?? '';
  return fileOf(file.movements.filter((movement) => movement.at < last));
}

const orders = (drawn: World, cut: number): [string, Stored][] => [
  ['before', { plan: drawn.plan, entries: drawn.entries }],
  ['after', { plan: drawn.plan, entries: imported(drawn, drawn.entries, drawn.file) }],
  ['shorter', { plan: drawn.plan, entries: imported(drawn, drawn.entries, prefix(drawn.file, cut)) }],
];

/** Follows the sentence on one row and checks the Log it leaves against the one an import leaves. */
function follow(drawn: World, stored: Stored, entry: Entry) {
  const shown = run(drawn, stored.entries, drawn.file);
  const once = applyExchangeImport(stored.entries, shown, NOW).entries;
  const row = liveEntries(stored.entries).filter((each) => transactionKey(each) === transactionKey(entry));
  const ids = new Set(row.map((each) => each.id));
  const changed = changedLog(stored, { kind: 'delete', ids: [...ids] }, LISBON);
  expect(changed).not.toBeNull();
  const again = anew(drawn, changed as Entry[]);
  const final = applyExchangeImport(changed as Entry[], again, NOW).entries;
  const recorded = new Set(
    shown.recorded
      .filter((item) => ids.has(item.entry.id))
      .flatMap((item) => item.dates.map((d) => `${item.coin}|${d}`)),
  );
  const before = new Set(shown.entries.map((each) => each.id));
  const added = again.entries.filter((each) => !before.has(each.id));
  expect(added.length).toBeGreaterThan(0);
  expect(added.every((each) => recorded.has(`${each.coin}|${each.date}`))).toBe(true);
  // A monthly buy the row held frees its month, so the file's purchase replaces that month's one-tap estimate.
  const freed = new Set(added.filter((each) => each.kind === 'dca').map((each) => `${each.coin}|${each.slot}`));
  const replaced = new Set(
    again.replaced.flatMap((item) =>
      item.estimates.filter((each) => freed.has(`${each.coin}|${each.slot}`)).map((each) => each.id),
    ),
  );
  const kept = liveEntries(once).filter((each) => !ids.has(each.id) && !replaced.has(each.id));
  const expected = [...kept, ...added];
  expect(seen(final)).toEqual(seen(expected));
  expect(portfolio(drawn.plan, final).invested).toBe(portfolio(drawn.plan, expected).invested);
  expect(run(drawn, final, drawn.file).entries).toEqual([]);
}

/**
 * Imports the shown plan first, then follows the sentence shown before the import: the Log allows the delete, and the
 * Log and Invested end as following it first leaves them.
 */
function importFirst(drawn: World, stored: Stored, entry: Entry) {
  const key = transactionKey(entry);
  const deleteRow = (entries: readonly Entry[]) => {
    const ids = liveEntries(entries).filter((each) => transactionKey(each) === key);
    return changedLog({ plan: drawn.plan, entries }, { kind: 'delete', ids: ids.map((each) => each.id) }, LISBON);
  };
  const later = deleteRow(imported(drawn, stored.entries, drawn.file));
  expect(later).not.toBeNull();
  const finish = (entries: readonly Entry[]) => applyExchangeImport(entries, anew(drawn, entries), NOW).entries;
  const [first, then] = [finish(deleteRow(stored.entries) as Entry[]), finish(later as Entry[])];
  expect(seen(then)).toEqual(seen(first));
  expect(portfolio(drawn.plan, then).invested).toBe(portfolio(drawn.plan, first).invested);
}

/**
 * The property runs 300 times and the five-year file once, each with a 60 s timeout (the core's default is Vitest's
 * 5 s). Measured on 2026-11-14, with each row checked before and after importing first, under the full core suite with
 * coverage, seeds 1 to 8 (fast-check's global seed): the worst was 3.12 s for the property and 2.12 s for the five-year
 * file (520 purchases, 120 entries typed by hand, 12 rows planned again in two orders; both seed 5), so six times the
 * worst, the margin budgeted for CI's slower runner, is 18.7 s, under a third of the timeout (20 s). The plan's own
 * properties took at most 3.19 s (seed 5). Of the 300 worlds, 23 to 30 reach a sentence before importing, 24 to 31
 * after it and 22 to 29 after a shorter export.
 */
const RUNS = { numRuns: 300 };
const TIMEOUT = 60_000;

describe('importRemedies, over generated files and Logs', () => {
  it(
    'following the sentence, before or after importing, leaves the Log one import leaves, less the row, plus its dates',
    () => {
      const reached = { before: 0, after: 0, shorter: 0 };
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          for (const [order, stored] of orders(drawn, cut)) {
            const { recorded } = importRemedies(drawn.file, stored, drawn.addHeld, LISBON);
            if (recorded.size > 0) reached[order as keyof typeof reached] += 1;
            for (const entry of liveEntries(stored.entries).filter((each) => recorded.has(each.id))) {
              follow(drawn, stored, entry);
              importFirst(drawn, stored, entry);
            }
          }
        }),
        RUNS,
      );
      // About a tenth of the worlds reach the sentence in each order (the note above), so the property is not vacuous.
      expect(Object.values(reached).every((count) => count > 0)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'checks a five-year weekly file against a Log typed by hand every month, at most the capped rows',
    () => {
      const plan = aPlan({ firstBuy: date('2021-11-01'), lastBuy: date('2026-12-01') });
      const weeks = Array.from({ length: 260 }, (_, week) => addDays(date('2021-11-01'), week * 7));
      const file = fileOf(
        weeks.flatMap((day, week) =>
          (['BTC', 'ETH'] as const).map((coin, index) =>
            trade(`W${week}`, 'purchase', coin, day, { units: '0.0005', amount: '25', fee: '0' }, week * 4 + index * 2),
          ),
        ),
      );
      const firsts = [...new Map(weeks.map((day) => [day.slice(0, 7), day])).entries()].reverse();
      const entries = firsts.flatMap(([slot, day]) =>
        (['BTC', 'ETH'] as const).map((coin) =>
          anEntry({ coin: coin as CoinId, date: day, slot: month(slot), amount: money('25'), units: units('0.0005') }),
        ),
      );
      expect([file.movements.length, entries.length]).toEqual([520, 120]);
      const { recorded } = importRemedies(file, { plan, entries }, false, LISBON);
      expect(recorded.size).toBe(2 * IMPORT_RECORDED_CHECKS);
    },
    TIMEOUT,
  );
});
