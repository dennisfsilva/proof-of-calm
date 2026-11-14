import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, units } from '../../../test/builders';
import { fileOf, type World, world } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, trade } from '../../../test/exchange/plan-fixture';
import { IMPORT_ESTIMATE_CHECKS, IMPORT_RECORDED_CHECKS, IMPORT_REMEDY_MAX_MOVEMENTS } from '../../constants';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { isPositive, type Money, plus, sum, type Units } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import { slots } from '../../plan/slots';
import { liveEntries } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import { applyExchangeImport } from './apply';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, planExchangeImport } from './plan';
import type { EstimateLine } from './plan-lines';
import { changedLog, importRemedies, type LogChange, type StartingRemedy, type Stored } from './plan-remedy';

// The Matching entries' sentence over generated files and Logs (docs/DOMAIN.md §3.13, "Lines that ask for a change"),
// before importing, after importing the shown plan and after a shorter export was stored first: whoever follows it
// ends with the Log one import leaves, less the row, plus the dates the row recorded, at the same Invested, and a third
// import adds nothing. Whoever imports the shown plan first and then follows the sentence shown before the import is
// allowed the delete and ends with the same Log and Invested. The starting line's instruction, followed as the Log makes
// it in the same three orders, records its date by the lump and keeps every other date group of the preview.

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

/**
 * Follows the sentence on one row and checks the Log it leaves against the one an import leaves, both unticked: the
 * file chosen again opens unticked, so the box's own purchases are no line the sentence promises to keep.
 */
function follow(drawn: World, stored: Stored, entry: Entry) {
  const shown = anew(drawn, stored.entries);
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
  expect(anew(drawn, final).entries).toEqual([]);
}

/**
 * Imports the shown plan first, then follows the sentence shown before the import: the Log allows the delete, and the
 * Log and Invested end as following it first leaves them, with the box set again as it was in the new preview, since
 * the import made first took the box's own purchases.
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
  const first = imported(drawn, deleteRow(stored.entries) as Entry[], drawn.file);
  const then = finish(later as Entry[]);
  expect(seen(then)).toEqual(seen(first));
  expect(portfolio(drawn.plan, then).invested).toBe(portfolio(drawn.plan, first).invested);
}

/**
 * The property runs 300 times and the five-year file once, each with a 60 s timeout (the core's default is Vitest's
 * 5 s). Measured on 2026-11-14, with each row checked before and after importing first, the Log as shown compared
 * unticked, under the full core suite with coverage, seeds 1 to 8 (fast-check's global seed): the worst was 2.35 s for
 * the property (seed 3) and 2.15 s for the five-year file (520 purchases, the bound then, 120 entries
 * typed by hand, 12 rows planned again in two orders; seed 1), so six times the worst, the margin budgeted for CI's
 * slower runner, is 14.1 s, under a third of the timeout (20 s). Of the 300 worlds, 23 to 31 reach a sentence before
 * importing, 24 to 31 after it and 22 to 30 after a shorter export.
 *
 * With the starting line's property (300 worlds, half of them drawn with a starting purchase), measured again on
 * 2026-11-14 the same way, seeds 1 to 8: the worst was 2.87 s for the sentence's property (seed 2), 2.57 s for the
 * starting line's (seed 6) and 1.50 s for the five-year file with its lump state (no seed), so six times the worst is
 * 17.2 s, under a third of the timeout. Of the 300 worlds, 124 to 146 reach the starting line in each order, 135 to 171 times as a record and
 * 219 to 288 as a change across the three orders. Measured again after a one-tap `lump` claims in step 2, its date
 * near the file's, seeds 1 to 8: the worst was 2.77 s (the sentence's property, seed 3); six times it, 16.6 s.
 *
 * The bound, measured on 2026-11-14 on this desktop without coverage, two coins, three runs of three calls each. Before
 * the estimate line, a Log typed by hand every month took 505 to 557 ms at 520 movements weekly over five years and 504
 * to 517 ms daily (one plan 24 to 30 ms), 659 to 666 ms at 600, 976 to 981 ms at 730, 2,364 to 2,370 ms at 1,460 and
 * 7 to 9 s on a five-year daily file (3,652); the starting line's check, a starting amount whose first week's purchases
 * are its parts and a hand row of lumps (the second state below), added about 35 ms. The estimate line's worst state
 * (the fourth below: the plan's last 24 months with nine dates each, every other one tapped and bought late, the months
 * between and every earlier month typed by hand, so 12 rows of the sentence in two orders and the estimate rows once
 * over 120 entries) took 892 to 902 ms at 520 movements with 12 estimate rows checked and 738 to 741 ms with
 * `IMPORT_ESTIMATE_CHECKS` (6); at 6 rows it took 629 to 634 ms at 440 movements, 600 to 605 ms at 420 and 567 to 571
 * ms at 400, where the hand-only weekly Log took 366 to 373 ms and the lump state 368 to 376 ms (each state built at
 * that many movements: fewer weeks, or nine dates a month cut at the bound). So the bound is 400, the largest round
 * figure that keeps every state under about 600 ms on this desktop.
 *
 * With the estimate line's property (300 worlds, half of them drawn with a late purchase and a one-tap row), measured on
 * 2026-11-14 under the full core suite with coverage, seeds 1 to 8: the worst was 3.04 s for the sentence's property
 * (seed 3), 2.66 s for the starting line's (seed 4), 1.03 s for the estimate line's (seed 3) and 2.54 s for the
 * five-year file with its three states (seed 7), so six times the worst is 18.3 s, under a third of the timeout. Of the
 * 300 worlds, 68 to 88 reach the estimate line before importing and 51 to 72 after a shorter export; after importing the
 * file none does, since its purchase is then stored.
 *
 * With the bound at 400 and the worst state added, measured again on 2026-11-14 the same way, seeds 1 to 8: the worst
 * was 3.15 s for the sentence's property (seed 3), 2.81 s for the starting line's (seed 6), 1.04 s for the estimate
 * line's (seed 3) and 2.22 s for the file at the bound with its four states (seed 5), so six times the worst is 18.9 s,
 * under a third of the timeout.
 */
const RUNS = { numRuns: 300 };
const TIMEOUT = 60_000;

/**
 * A world of a plan with a starting amount whose file also holds a purchase of each coin's part on one date, 40 days
 * before the first buy to 15 after, up to 40 off the part, and whose Log holds the generator's lumps, none, or a hand
 * row of lumps of the parts on the first buy instead, so both instructions are reached.
 */
const startWorld = fc
  .record({
    drawn: world.filter((each) => isPositive(each.plan.startingAmount)),
    offset: fc.integer({ min: -40, max: 15 }),
    off: fc.integer({ min: -40, max: 40 }),
    lumps: fc.constantFrom('kept', 'none', 'hand'),
  })
  .map(({ drawn, offset, off, lumps }): World => {
    const parts = plannedParts(drawn.plan, drawn.plan.startingAmount);
    const day = addDays(drawn.plan.firstBuy, offset);
    const starts = parts.map((part, index) =>
      trade(
        `START-${index}`,
        'purchase',
        part.coin,
        day,
        {
          units: '0.0125',
          amount: plus(part.amount, money(String(off))),
          fee: '0',
        },
        900 + 2 * index,
      ),
    );
    const rows = parts.map((part) =>
      anEntry({ kind: 'lump', coin: part.coin, slot: null, date: drawn.plan.firstBuy, amount: part.amount }),
    );
    const others = drawn.entries.filter((entry) => lumps === 'kept' || entry.kind !== 'lump');
    return {
      ...drawn,
      file: fileOf([...drawn.file.movements, ...starts], drawn.file.leftOut),
      entries: lumps === 'hand' ? [...others, ...rows] : others,
    };
  });

/**
 * A world whose file also holds a purchase of each coin's monthly part 16 to 27 days after a month's due date, past its
 * reach, and whose Log holds a one-tap row for that month dated 3 days before its due date to 40 after, so the estimate
 * line is reached.
 */
const estimateWorld = fc
  .record({
    drawn: world,
    which: fc.nat(),
    late: fc.integer({ min: 16, max: 27 }),
    tapped: fc.integer({ min: -3, max: 40 }),
  })
  .map(({ drawn, which, late, tapped }): World => {
    const months = slots(drawn.plan);
    const slot = months[which % months.length] as (typeof months)[number];
    const parts = plannedParts(drawn.plan, drawn.plan.monthlyAmount);
    const buys = parts.map((part, index) =>
      trade(
        `LATE-${index}`,
        'purchase',
        part.coin,
        addDays(slot.due, late),
        { units: '0.0021', amount: part.amount, fee: '0' },
        950 + 2 * index,
      ),
    );
    const row = parts.map((part) =>
      anEntry({
        coin: part.coin,
        slot: slot.key,
        date: addDays(slot.due, tapped),
        amount: part.amount,
        source: 'one-tap',
      }),
    );
    return {
      ...drawn,
      file: fileOf([...drawn.file.movements, ...buys], drawn.file.leftOut),
      entries: [...drawn.entries, ...row],
    };
  });

/**
 * Follows the estimate line as the Log makes it (`changedLog`, Edit entry on the row: its date and each staying coin's
 * cost and units set to the file's). Returns what goes wrong, none when the file chosen again records the date by each
 * coin's estimate, adds every other date group as the preview shown, and leaves nothing for a third import.
 */
function followEstimate(drawn: World, stored: Stored, line: EstimateLine) {
  const ofCoin = (coin: CoinId) => line.added.filter((entry) => entry.coin === coin);
  const row = liveEntries(stored.entries).filter(
    (entry) => transactionKey(entry) === transactionKey(line.estimates[0] as Entry),
  );
  const figures = new Map(
    line.estimates.map((each) => [
      each.id,
      {
        amount: sum(ofCoin(each.coin).map((entry) => entry.amount as Money)),
        units: sum(ofCoin(each.coin).map((entry) => entry.units)),
      },
    ]),
  );
  const changed = changedLog(stored, { kind: 'edit', row, date: line.date, figures }, LISBON);
  if (changed === null) return ['refused'];
  const shown = anew(drawn, stored.entries);
  const again = anew(drawn, changed);
  const touched = new Set(line.estimates.map((each) => `${each.coin}|${line.date}|purchase`));
  const rest = (plan: ExchangeImportPlan) =>
    plan.entries
      .filter((entry) => !touched.has(groupOf(entry)))
      .map(({ updatedAt: _, ...each }) => JSON.stringify(each))
      .sort();
  const final = applyExchangeImport(changed, again, NOW).entries;
  return [
    ...line.estimates.flatMap((each) =>
      again.recorded.some((item) => item.entry.id === each.id && item.dates.includes(line.date))
        ? []
        : [`${each.coin} not recorded by its estimate`],
    ),
    ...(JSON.stringify(rest(again)) === JSON.stringify(rest(shown)) ? [] : ['another group changed']),
    ...(anew(drawn, final).entries.length === 0 ? [] : ['a third import adds']),
  ];
}

type Figure = { readonly amount: Money; readonly units: Units };
/** The file's purchases of a coin on a date that no stored entry holds, summed: the figures the starting line names. */
function figuresOn(drawn: World, entries: readonly Entry[], coin: CoinId, day: CalendarDate): Figure {
  const known = new Set(entries.map((entry) => entry.id));
  const movements = drawn.file.movements.filter(
    (movement) =>
      movement.coin === coin &&
      movement.role === 'purchase' &&
      LISBON.dateOf(movement.at) === day &&
      !known.has(LISBON.idOf(movement.key)),
  );
  return {
    amount: sum(movements.map((movement) => movement.amount as Money)),
    units: sum(movements.map((movement) => movement.units)),
  };
}
const roleOf = (entry: Entry) => (entry.kind === 'sell' ? 'sale' : entry.kind === 'held' ? 'receipt' : 'purchase');
const groupOf = (entry: Entry) => `${entry.coin}|${entry.date}|${roleOf(entry)}`;

/**
 * Follows the starting line's instruction as the Log makes it (`changedLog`): Record a purchase of the whole starting
 * amount on its date with the file's figures, or Edit entry on a row of lumps to them. Returns what goes wrong, none when
 * the Log takes the change and the file chosen again (unticked) records the date by the lump of each coin, adds every
 * other date group exactly as the preview shown, but those the edited row recorded before, tombstones the same
 * estimates, and leaves nothing for a third import.
 */
function followStart(drawn: World, stored: Stored, line: StartingRemedy, lumps: readonly Entry[]) {
  const coins = line.kind === 'record' ? plannedParts(drawn.plan, drawn.plan.startingAmount).map((p) => p.coin) : [];
  const change: LogChange =
    line.kind === 'record'
      ? {
          kind: 'record',
          draft: {
            kind: 'lump',
            date: line.date,
            slot: null,
            fee: null,
            note: '',
            venue: null,
            rows: coins.map((coin) => ({ coin, ...figuresOn(drawn, stored.entries, coin, line.date) })),
          },
        }
      : {
          kind: 'edit',
          row: lumps,
          date: line.date,
          figures: new Map(lumps.map((each) => [each.id, figuresOn(drawn, stored.entries, each.coin, line.date)])),
        };
  const changed = changedLog(stored, change, LISBON);
  if (changed === null) return ['refused'];
  const shown = anew(drawn, stored.entries);
  const again = anew(drawn, changed);
  const ids = new Set(lumps.map((each) => each.id));
  const before = shown.recorded.filter((item) => ids.has(item.entry.id));
  const touched = new Set([
    ...[...coins, ...lumps.map((each) => each.coin)].map((coin) => `${coin}|${line.date}|purchase`),
    ...before.flatMap((item) => item.dates.map((day) => `${item.coin}|${day}|purchase`)),
  ]);
  const rest = (plan: ExchangeImportPlan) =>
    plan.entries
      .filter((entry) => !touched.has(groupOf(entry)))
      .map(({ updatedAt: _, ...each }) => JSON.stringify(each))
      .sort();
  // A date the edited row recorded before may come back as a monthly buy, which frees its month's one-tap estimate.
  const freed = new Set(
    again.entries
      .filter((entry) => touched.has(groupOf(entry)) && entry.kind === 'dca')
      .map((e) => `${e.coin}|${e.slot}`),
  );
  const tombstones = (plan: ExchangeImportPlan) =>
    [
      ...new Set(
        plan.replaced.flatMap((item) =>
          item.estimates.filter((each) => !freed.has(`${each.coin}|${each.slot}`)).map((each) => each.id),
        ),
      ),
    ].sort();
  const final = applyExchangeImport(changed, again, NOW).entries;
  const same = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b);
  return [
    ...[...new Set([...coins, ...lumps.map((each) => each.coin)])].flatMap((coin) => [
      ...(again.recorded.some(
        (item) => item.entry.kind === 'lump' && item.coin === coin && item.dates.includes(line.date),
      )
        ? []
        : [`${coin} not recorded by its lump`]),
      ...(again.entries.some((entry) => groupOf(entry) === `${coin}|${line.date}|purchase`) ? [`${coin} added`] : []),
    ]),
    ...(same(rest(again), rest(shown)) ? [] : ['another group changed']),
    ...(same(tombstones(again), tombstones(shown)) ? [] : ['another estimate tombstoned']),
    ...(anew(drawn, final).entries.length === 0 ? [] : ['a third import adds']),
  ];
}

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
    'following the starting line, before or after importing, records its date by the lump and keeps every other group',
    () => {
      const reached = { before: 0, after: 0, shorter: 0, record: 0, change: 0 };
      fc.assert(
        fc.property(fc.oneof(world, startWorld), fc.nat(), (drawn, cut) => {
          for (const [order, stored] of orders(drawn, cut)) {
            const { starting } = importRemedies(drawn.file, stored, drawn.addHeld, LISBON);
            if (starting === null) continue;
            reached[order as keyof typeof reached] += 1;
            reached[starting.kind] += 1;
            const lumps = liveEntries(stored.entries).filter((entry) => entry.kind === 'lump');
            // A record is made on the Log as it is; a change on one row of lumps, the person's own row of them.
            const keys = [...new Set(lumps.map(transactionKey))];
            const rows =
              starting.kind === 'record' ? [[]] : keys.map((key) => lumps.filter((e) => transactionKey(e) === key));
            const problems = rows.map((row) => followStart(drawn, stored, starting, row));
            expect(problems.some((each) => each.length === 0) ? [] : problems).toEqual([]);
          }
        }),
        RUNS,
      );
      // Each order and each instruction is reached (the note above), so the property is not vacuous.
      expect(Object.values(reached).every((count) => count > 0)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'following the estimate line, before importing or after a shorter export, records its date by the estimates',
    () => {
      const reached = { before: 0, after: 0, shorter: 0 };
      fc.assert(
        fc.property(fc.oneof(world, estimateWorld), fc.nat(), (drawn, cut) => {
          for (const [order, stored] of orders(drawn, cut)) {
            const { estimates } = importRemedies(drawn.file, stored, drawn.addHeld, LISBON);
            if (estimates.length > 0) reached[order as keyof typeof reached] += 1;
            expect(estimates.map((line) => followEstimate(drawn, stored, line))).toEqual(estimates.map(() => []));
          }
        }),
        RUNS,
      );
      // Before importing and after a shorter export the line is reached (the note above), so the property is not
      // vacuous; after importing the file the purchase is stored and no line shows (it is checked before the import).
      expect([reached.before > 0, reached.after, reached.shorter > 0]).toEqual([true, 0, true]);
    },
    TIMEOUT,
  );

  it(
    'checks a weekly file at the bound against a Log typed by hand every month, at most the capped rows',
    () => {
      const plan = aPlan({ firstBuy: date('2021-11-01'), lastBuy: date('2026-12-01') });
      const weeks = Array.from({ length: IMPORT_REMEDY_MAX_MOVEMENTS / 2 }, (_, week) =>
        addDays(date('2021-11-01'), week * 7),
      );
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
      expect([file.movements.length, entries.length]).toEqual([IMPORT_REMEDY_MAX_MOVEMENTS, 92]);
      const { recorded } = importRemedies(file, { plan, entries }, false, LISBON);
      expect(recorded.size).toBe(2 * IMPORT_RECORDED_CHECKS);
      // One movement more and no row is checked.
      const longer = fileOf([
        ...file.movements,
        trade('W200', 'purchase', 'BTC', date('2026-11-01'), { units: '0.0005', amount: '25', fee: '0' }, 2000),
      ]);
      expect(importRemedies(longer, { plan, entries }, false, LISBON).recorded.size).toBe(0);
      // A starting amount bought in the first week and a hand row of lumps dated later: the starting line's change is
      // checked in both orders too (the bound's measured state, the note above).
      const parts = { BTC: '700', ETH: '300' } as const;
      const starting = { ...plan, startingAmount: money('1000') };
      const first = fileOf(
        file.movements.map((movement, index) =>
          index < 2 ? { ...movement, amount: money(parts[movement.coin as keyof typeof parts]) } : movement,
        ),
      );
      const lumps = (['BTC', 'ETH'] as const).map((coin) =>
        anEntry({
          kind: 'lump',
          coin: coin as CoinId,
          date: date('2021-11-12'),
          slot: null,
          amount: money(parts[coin]),
          units: units('0.001'),
        }),
      );
      const log = [...entries.filter((entry) => entry.slot !== month('2021-11')), ...lumps];
      const remedies = importRemedies(first, { plan: starting, entries: log }, false, LISBON);
      expect(remedies.starting).toEqual({ kind: 'change', date: '2021-11-01' });
      // Every other month tapped and its purchase made late, on its 19th, and the months between typed by hand on their
      // 1st, each date in five fills of each coin (every day is in some month's reach, so a weekly file leaves no
      // estimate): the estimate line's change is checked on the capped rows too.
      const months = firsts
        .map(([slot]) => slot)
        .reverse()
        .slice(0, 40);
      const late = fileOf(
        months.flatMap((slot, index) =>
          (['BTC', 'ETH'] as const).flatMap((coin, which) =>
            Array.from({ length: 5 }, (_, fill) =>
              trade(
                `T${index}-${which}-${fill}`,
                'purchase',
                coin,
                date(`${slot}-${index % 2 === 0 ? '19' : '01'}`),
                { units: '0.0001', amount: '5', fee: '0' },
                index * 20 + which * 10 + fill * 2,
              ),
            ),
          ),
        ),
      );
      const rows = months.flatMap((slot, index) =>
        (['BTC', 'ETH'] as const).map((coin) =>
          index % 2 === 0
            ? anEntry({ coin: coin as CoinId, date: date(`${slot}-10`), slot: month(slot), source: 'one-tap' })
            : anEntry({ coin: coin as CoinId, date: date(`${slot}-01`), slot: month(slot), amount: money('25') }),
        ),
      );
      expect([late.movements.length, rows.length]).toEqual([IMPORT_REMEDY_MAX_MOVEMENTS, 80]);
      const both = importRemedies(late, { plan, entries: rows }, false, LISBON);
      expect([both.recorded.size, both.estimates.length]).toEqual([2 * IMPORT_RECORDED_CHECKS, IMPORT_ESTIMATE_CHECKS]);
      // The worst state (the note above): the plan's last 24 months with nine dates each of both coins, cut at the
      // bound; every other month tapped on its 10th and bought on its 17th to 25th, the months between and every earlier
      // month typed by hand on their 1st, so 12 rows of the sentence in two orders and the capped estimate rows once.
      const keys = Array.from({ length: 60 }, (_, index) => {
        const at = 10 + index;
        return `${2021 + Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`;
      });
      const recent = keys.slice(36);
      const many = fileOf(
        recent
          .flatMap((slot, index) =>
            Array.from({ length: 9 }, (_, day) =>
              (['BTC', 'ETH'] as const).map((coin, which) =>
                trade(
                  `M${index}-${day}-${which}`,
                  'purchase',
                  coin,
                  date(`${slot}-${String((index % 2 === 0 ? 1 : 17) + day).padStart(2, '0')}`),
                  { units: '0.0005', amount: '25', fee: '0' },
                  index * 40 + day * 4 + which * 2,
                ),
              ),
            ).flat(),
          )
          .slice(0, IMPORT_REMEDY_MAX_MOVEMENTS),
      );
      const mixed = keys.flatMap((slot, index) =>
        (['BTC', 'ETH'] as const).map((coin) =>
          index >= 36 && index % 2 === 1
            ? anEntry({ coin: coin as CoinId, date: date(`${slot}-10`), slot: month(slot), source: 'one-tap' })
            : anEntry({
                coin: coin as CoinId,
                date: date(`${slot}-01`),
                slot: month(slot),
                amount: money('25'),
                units: units('0.0005'),
              }),
        ),
      );
      expect([many.movements.length, mixed.length]).toEqual([IMPORT_REMEDY_MAX_MOVEMENTS, 120]);
      const worst = importRemedies(many, { plan, entries: mixed }, false, LISBON);
      expect([worst.recorded.size, worst.estimates.length]).toEqual([
        2 * IMPORT_RECORDED_CHECKS,
        IMPORT_ESTIMATE_CHECKS,
      ]);
    },
    TIMEOUT,
  );
});
