import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, instant, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, trade } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver } from '../../actions/entries';
import type { Instant } from '../../dates/calendar';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { Plan } from '../../schema/plan';
import { applyExchangeImport } from './apply';
import type { Movement } from './kraken';
import { planExchangeImport } from './plan';
import { estimateLines } from './plan-lines';

// Step 5's gate (docs/DOMAIN.md §3.13): a coin's live one-tap estimates for a month are tombstoned only when this
// import adds a monthly buy of the coin for it and the exchange-imported monthly buys of the coin for it, live ones of
// any file plus this import's, fees excluded, come to at least half the largest of those estimates. Each walk imports
// as the Log does and reads Invested and the units Portfolio shows. Today is 13 Nov 2026.

let line = 2;
const buy = (coin: string, day: string, amount: string, held: string, fee = '0') => {
  line += 2;
  return trade(`E${line}`, 'purchase', coin, day, { units: held, amount, fee }, line);
};
const tap = (coin: string, slot: string, day: string, amount: string, held: string, venue = 'Trade Republic') =>
  anEntry({
    coin: coin as Entry['coin'],
    slot: month(slot),
    date: date(day),
    amount: money(amount),
    units: units(held),
    source: 'one-tap',
    venue,
  });

const BTC_ONLY = (monthly: string, firstBuy = '2026-08-01') =>
  aPlan({ firstBuy: date(firstBuy), monthlyAmount: money(monthly), split: split({ BTC: '100', ETH: '0' }) });
const HALVES = aPlan({
  firstBuy: date('2026-08-01'),
  monthlyAmount: money('200'),
  split: split({ BTC: '50', ETH: '50' }),
});

const planOf = (plan: Plan, entries: readonly Entry[], file: readonly Movement[], venue = 'Trade Republic') =>
  planExchangeImport(fileOf(file), { plan, entries }, { venue, addHeld: false }, LISBON);
/** Imports each file in turn, as the Log does. */
const importAll = (plan: Plan, entries: readonly Entry[], ...files: (readonly Movement[])[]) =>
  files.reduce((log, file) => applyExchangeImport(log, planOf(plan, log, file), NOW).entries, entries);
const invested = (plan: Plan, entries: readonly Entry[]) => portfolio(plan, entries).invested;
const btc = (plan: Plan, entries: readonly Entry[]) =>
  portfolio(plan, entries).positions.find((each) => each.coin === 'BTC')?.units;
const keptMonths = (plan: Plan, entries: readonly Entry[], file: readonly Movement[]) =>
  planOf(plan, entries, file).kept.map((group) => [group.estimates.map((each) => each.slot), group.imported]);
/** The live one-tap estimates and the live monthly buys of BTC for September, to set two Logs side by side. */
const september = (entries: readonly Entry[]) => {
  const live = entries.filter(
    (each) => each.deletedAt === null && each.kind === 'dca' && each.coin === 'BTC' && each.slot === '2026-09',
  );
  return {
    estimates: live.filter((each) => each.source === 'one-tap').map((each) => each.amount),
    buys: live
      .filter((each) => each.source !== 'one-tap')
      .map((each) => [each.source, each.amount, each.date, each.units]),
  };
};
/** The Log once `shown` is written and the person deletes the monthly buys its cancelled lines name. */
const namedDeleted = (entries: readonly Entry[], shown: ReturnType<typeof planExchangeImport>) => {
  const named = new Set(shown.cancelled.map((each) => each.entry.id));
  return applyExchangeImport(entries, shown, NOW).entries.map((entry) =>
    named.has(entry.id) ? { ...entry, deletedAt: NOW } : entry,
  );
};

// Bruno taps 200 a month for August to October and imports Trade Republic's Saveback of 1.37 a month.
const BRUNO = BTC_ONLY('200');
const BRUNO_LOG = [
  tap('BTC', '2026-08', '2026-08-01', '200', '0.002'),
  tap('BTC', '2026-09', '2026-09-01', '200', '0.002'),
  tap('BTC', '2026-10', '2026-10-01', '200', '0.002'),
];
const SAVEBACK = ['2026-08-05', '2026-09-05', '2026-10-05'].map((day) => buy('BTC', day, '1.37', '0.0000137'));
const KRAKEN = ['2026-08-02', '2026-09-02', '2026-10-02'].map((day) => buy('BTC', day, '200', '0.002'));

describe('planExchangeImport, the estimates a month keeps', () => {
  it('Bruno: the Saveback keeps 3 estimates, 604.11 and 0.0060411 BTC; chosen again, it keeps none', () => {
    const shown = planOf(BRUNO, BRUNO_LOG, SAVEBACK);
    expect(shown.replaced).toEqual([]);
    expect(keptMonths(BRUNO, BRUNO_LOG, SAVEBACK)).toEqual([
      [['2026-08'], '1.37'],
      [['2026-09'], '1.37'],
      [['2026-10'], '1.37'],
    ]);
    expect(shown.kept.map((group) => group.by.length)).toEqual([1, 1, 1]);
    expect(shown.entries.map((entry) => [entry.kind, entry.slot])).toEqual([
      ['dca', '2026-08'],
      ['dca', '2026-09'],
      ['dca', '2026-10'],
    ]);
    const log = importAll(BRUNO, BRUNO_LOG, SAVEBACK);
    expect([invested(BRUNO, log), btc(BRUNO, log)]).toEqual(['604.11', '0.0060411']);
    expect(planOf(BRUNO, log, SAVEBACK).kept).toEqual([]);
  });

  it('Bruno in two imports, August first: 604.11, the whole file keeping September and October', () => {
    const august = SAVEBACK.slice(0, 1);
    const after = importAll(BRUNO, BRUNO_LOG, august);
    expect(keptMonths(BRUNO, after, SAVEBACK).map(([slots]) => slots)).toEqual([['2026-09'], ['2026-10']]);
    expect(invested(BRUNO, importAll(BRUNO, after, SAVEBACK))).toBe('604.11');
  });

  it("Bruno, then a Kraken file at 200 a month, either order: 604.11; after Trade Republic's, it replaces 3", () => {
    const after = importAll(BRUNO, BRUNO_LOG, SAVEBACK);
    const then = planOf(BRUNO, after, KRAKEN, 'Kraken');
    expect([then.replaced.flatMap((group) => group.estimates).length, then.kept]).toEqual([3, []]);
    expect(invested(BRUNO, importAll(BRUNO, BRUNO_LOG, SAVEBACK, KRAKEN))).toBe('604.11');
    expect(invested(BRUNO, importAll(BRUNO, BRUNO_LOG, KRAKEN, SAVEBACK))).toBe('604.11');
  });

  it('Bruno has no estimate line: his purchases fall inside their months', () => {
    expect(estimateLines({ plan: BRUNO, entries: BRUNO_LOG }, planOf(BRUNO, BRUNO_LOG, SAVEBACK))).toEqual([]);
  });

  it('Carla at 200: 99.99 keeps it, 100 (a tie) and 100.01 replace it: 299.99, 100 and 100.01', () => {
    const carla = [tap('BTC', '2026-09', '2026-09-01', '200', '0.002')];
    const of = (amount: string) =>
      invested(BRUNO, importAll(BRUNO, carla, [buy('BTC', '2026-09-03', amount, '0.001')]));
    expect(['99.99', '100', '100.01'].map(of)).toEqual(['299.99', '100', '100.01']);
    // Fees are excluded: 99.99 with a fee of 0.02 still comes to less than half.
    expect(keptMonths(BRUNO, carla, [buy('BTC', '2026-09-03', '99.99', '0.001', '0.02')])).toEqual([
      [['2026-09'], '99.99'],
    ]);
  });

  it('Carla 60 then 140 in two imports, the 60 first: 260 between, 200 at the end', () => {
    const carla = [tap('BTC', '2026-09', '2026-09-01', '200', '0.002')];
    const file = [buy('BTC', '2026-09-03', '60', '0.0006'), buy('BTC', '2026-09-10', '140', '0.0014')];
    const between = importAll(BRUNO, carla, file.slice(0, 1));
    expect(invested(BRUNO, between)).toBe('260');
    expect(keptMonths(BRUNO, between, file)).toEqual([]);
    expect(planOf(BRUNO, between, file).replaced.map((group) => group.estimates.length)).toEqual([1]);
    expect(invested(BRUNO, importAll(BRUNO, between, file))).toBe('200');
  });

  it('at 70: 34.99 keeps the estimate, 35 and 35.01 replace it', () => {
    const plan = BTC_ONLY('70');
    const log = [tap('BTC', '2026-09', '2026-09-01', '70', '0.0007')];
    const of = (amount: string) => invested(plan, importAll(plan, log, [buy('BTC', '2026-09-02', amount, '0.0003')]));
    expect(['34.99', '35', '35.01'].map(of)).toEqual(['104.99', '35', '35.01']);
  });

  it('two estimates for one month, 120 then 200, go together by the largest: 60, 99.99 and 100 give 380, 419.99, 100', () => {
    const log = [
      tap('BTC', '2026-09', '2026-09-01', '120', '0.0012'),
      tap('BTC', '2026-09', '2026-09-02', '200', '0.002'),
    ];
    const file = (amount: string) => [buy('BTC', '2026-09-03', amount, '0.0006')];
    expect(keptMonths(BRUNO, log, file('60'))).toEqual([[['2026-09', '2026-09'], '60']]);
    const of = (amount: string) => invested(BRUNO, importAll(BRUNO, log, file(amount)));
    expect(['60', '99.99', '100'].map(of)).toEqual(['380', '419.99', '100']);
  });

  it("two coins: only ETH's imported buys reach half, so only ETH's estimate goes: 180, 120 on main", () => {
    const log = [
      tap('BTC', '2026-09', '2026-09-01', '60', '0.0006'),
      tap('ETH', '2026-09', '2026-09-01', '140', '0.05'),
    ];
    const file = [buy('BTC', '2026-09-03', '20', '0.0002'), buy('ETH', '2026-09-03', '100', '0.04')];
    const shown = planOf(HALVES, log, file);
    expect(shown.replaced.flatMap((group) => group.estimates.map((each) => each.coin))).toEqual(['ETH']);
    expect(shown.kept.flatMap((group) => group.estimates.map((each) => each.coin))).toEqual(['BTC']);
    expect(invested(HALVES, importAll(HALVES, log, file))).toBe('180');
  });

  it('Kay: 49.93 on 2 and 16 Mar against a tap of 100: 149.93 between the imports, 99.86 at the end', () => {
    const plan = BTC_ONLY('100', '2026-03-01');
    const log = [tap('BTC', '2026-03', '2026-03-01', '100', '0.001')];
    const file = [buy('BTC', '2026-03-02', '49.93', '0.0005'), buy('BTC', '2026-03-16', '49.93', '0.0005')];
    const between = importAll(plan, log, file.slice(0, 1));
    expect(invested(plan, between)).toBe('149.93');
    expect(invested(plan, importAll(plan, between, file))).toBe('99.86');
    expect(invested(plan, importAll(plan, log, file))).toBe('99.86');
  });

  it("Jo and Dora: Trade Republic's 1.37 beside a tap of 200, whatever venue the tap carries: 201.37", () => {
    const file = [buy('BTC', '2026-09-05', '1.37', '0.0000137')];
    for (const venue of ['Bitvavo', 'Trade Republic']) {
      const log = [tap('BTC', '2026-09', '2026-09-01', '200', '0.002', venue)];
      expect(invested(BRUNO, importAll(BRUNO, log, file))).toBe('201.37');
    }
  });

  it('Max: 100 against a tap of 200 replaces it, 99.99 keeps the next: 399.99, a stated cost', () => {
    const log = [
      tap('BTC', '2026-09', '2026-09-01', '200', '0.002'),
      tap('BTC', '2026-10', '2026-10-01', '200', '0.002'),
    ];
    const file = [buy('BTC', '2026-09-02', '100', '0.001'), buy('BTC', '2026-10-02', '99.99', '0.001')];
    expect(invested(BRUNO, importAll(BRUNO, log, file))).toBe('399.99');
  });

  it('Nina: an earlier export stores 60, the whole file holds 50 and cancels the 60: 250 in parts and at once', () => {
    const log = [tap('BTC', '2026-09', '2026-09-01', '200', '0.002')];
    const [b1, b2] = [buy('BTC', '2026-09-02', '60', '0.0006'), buy('BTC', '2026-09-03', '50', '0.0005')];
    const whole = (entries: readonly Entry[]) =>
      planExchangeImport(
        { ...fileOf([b2]), cancelled: [b1] },
        { plan: BRUNO, entries },
        { venue: 'Kraken', addHeld: false },
        LISBON,
      );
    const part = importAll(BRUNO, log, [b1]);
    expect(invested(BRUNO, part)).toBe('260');
    // The 60 the file names for deletion is no imported buy of September's: 50 alone is under half of 200.
    const shown = whole(part);
    expect([shown.replaced, shown.kept.map((group) => group.imported)]).toEqual([[], ['50']]);
    expect(shown.cancelled.map((line) => [line.entry.amount, line.estimates])).toEqual([['60', []]]);
    const named = new Set(shown.cancelled.map((line) => line.entry.id));
    const deleted = applyExchangeImport(part, shown, NOW).entries.map((entry) =>
      named.has(entry.id) ? { ...entry, deletedAt: NOW } : entry,
    );
    expect(invested(BRUNO, deleted)).toBe('250');
    expect(invested(BRUNO, applyExchangeImport(log, whole(log), NOW).entries)).toBe('250');
  });

  it('Nina, both buys in the earlier export: 110 replaces the tap, so the cancelled 60 names it, live once (250)', () => {
    const log = [tap('BTC', '2026-09', '2026-09-01', '200', '0.002')];
    const [b1, b2] = [buy('BTC', '2026-09-02', '60', '0.0006'), buy('BTC', '2026-09-03', '50', '0.0005')];
    const whole = (entries: readonly Entry[]) =>
      planExchangeImport(
        { ...fileOf([b2]), cancelled: [b1] },
        { plan: BRUNO, entries },
        { venue: 'Kraken', addHeld: false },
        LISBON,
      );
    const part = importAll(BRUNO, log, [b1, b2]);
    expect(invested(BRUNO, part)).toBe('110');
    // Deleting the 60 leaves 50 of September's imported buys, under half of the tap the earlier import tombstoned.
    const shown = whole(part);
    expect(shown.cancelled.map((line) => [line.entry.amount, line.estimates.map((each) => each.id)])).toEqual([
      ['60', log.map((each) => each.id)],
    ]);
    const named = new Set(shown.cancelled.map((line) => line.entry.id));
    const deleted = applyExchangeImport(part, shown, NOW).entries.map((entry) =>
      named.has(entry.id) ? { ...entry, deletedAt: NOW } : entry,
    );
    expect(invested(BRUNO, deleted)).toBe('50');
    expect(invested(BRUNO, applyExchangeImport(log, whole(log), NOW).entries)).toBe('250');
    // The named 200 is live in one import and tombstoned in two; September's monthly buys are the same in both.
    const one = september(applyExchangeImport(log, whole(log), NOW).entries);
    expect([september(deleted), one]).toEqual([
      { estimates: [], buys: one.buys },
      { estimates: ['200'], buys: [['import-csv', '50', '2026-09-03', '0.0005']] },
    ]);
  });
});

// Step 1's named monthly buy counts every tombstoned estimate of its coin and month: a tombstone does not record who
// made it, and the import write, the Log's delete and its row edit each stamp one instant over several rows. These pin
// the stated cost: an estimate deleted or cleared by hand can show the line where one import keeps no estimate.
describe('planExchangeImport, the estimates a cancelled monthly buy carries', () => {
  const HAND = instant('2026-11-01T08:00:00Z');
  const EARLIER = instant('2026-11-10T09:30:00Z');
  const LATER = instant('2026-11-12T18:00:00Z');
  const deletedByHand = (entry: Entry) => ({ ...entry, deletedAt: HAND, updatedAt: HAND });
  /** Imports `file` at `at`, as the Log does: the plan and the write read one instant. */
  const importAt = (log: readonly Entry[], file: readonly Movement[], at: Instant) =>
    applyExchangeImport(
      log,
      planExchangeImport(
        fileOf(file),
        { plan: BRUNO, entries: log },
        { venue: 'Kraken', addHeld: false },
        {
          ...LISBON,
          now: at,
        },
      ),
      at,
    ).entries;
  const whole = (entries: readonly Entry[], held: Movement, named: Movement) =>
    planExchangeImport(
      { ...fileOf([held]), cancelled: [named] },
      { plan: BRUNO, entries },
      { venue: 'Kraken', addHeld: false },
      LISBON,
    );
  const carriedOf = (shown: ReturnType<typeof whole>) =>
    shown.cancelled.map((each) => [each.entry.amount, each.estimates.map((estimate) => estimate.amount)]);

  it('the cost: a hand-deleted 200 beside a live 60, 40 then a whole file of 35 that cancels it carries both', () => {
    const log = [
      deletedByHand(tap('BTC', '2026-09', '2026-09-01', '200', '0.002')),
      tap('BTC', '2026-09', '2026-09-02', '60', '0.0006'),
    ];
    const [b1, b2] = [buy('BTC', '2026-09-03', '40', '0.0004'), buy('BTC', '2026-09-04', '35', '0.00035')];
    const part = importAt(log, [b1], EARLIER);
    expect(invested(BRUNO, part)).toBe('40');
    // A tombstone does not record who made it, so the hand-deleted 200 counts too: 70 is under half of 200 and the line
    // shows, where one import of the whole file keeps no estimate (70 is at least the live 60).
    expect(carriedOf(whole(part, b2, b1))).toEqual([['40', ['200', '60']]]);
    const one = applyExchangeImport(log, whole(log, b2, b1), NOW).entries;
    expect([invested(BRUNO, one), one.filter((each) => each.deletedAt === null && each.source === 'one-tap')]).toEqual([
      '35',
      [],
    ]);
    // Once the person deletes the named 40, the two Logs are equal: no estimate is live in either.
    expect([september(namedDeleted(part, whole(part, b2, b1))), september(one)]).toEqual([
      { estimates: [], buys: [['import-csv', '35', '2026-09-04', '0.00035']] },
      { estimates: [], buys: [['import-csv', '35', '2026-09-04', '0.00035']] },
    ]);
  });

  it('the mirror: the 100 the earlier import replaced still goes with its cancelled 60, the hand-deleted 200 too', () => {
    const log = [
      deletedByHand(tap('BTC', '2026-09', '2026-09-01', '200', '0.002')),
      tap('BTC', '2026-09', '2026-09-02', '100', '0.001'),
    ];
    const [b1, b2] = [buy('BTC', '2026-09-03', '60', '0.0006'), buy('BTC', '2026-09-04', '40', '0.0004')];
    const part = importAt(log, [b1], EARLIER);
    expect(invested(BRUNO, part)).toBe('60');
    // 40 left is under half of 100: one import of the whole file keeps the 100 live (140).
    expect(carriedOf(whole(part, b2, b1))).toEqual([['60', ['200', '100']]]);
    expect(invested(BRUNO, applyExchangeImport(log, whole(log, b2, b1), NOW).entries)).toBe('140');
    // Once the person deletes the named 60: the 100 is live in one import and tombstoned in two, the 200 in neither.
    const one = september(applyExchangeImport(log, whole(log, b2, b1), NOW).entries);
    expect([september(namedDeleted(part, whole(part, b2, b1))), one]).toEqual([
      { estimates: [], buys: one.buys },
      { estimates: ['100'], buys: [['import-csv', '40', '2026-09-04', '0.0004']] },
    ]);
  });

  it('the cost through a Log edit: clearing the 200 from its row with the imported 40 shows the line for 40', () => {
    const log = [tap('BTC', '2026-09', '2026-09-03', '200', '0.002')];
    const [b1, b2] = [buy('BTC', '2026-09-03', '40', '0.0004'), buy('BTC', '2026-09-04', '30', '0.0003')];
    const part = importAt(log, [b1], EARLIER);
    // 40 is under half of 200, so the estimate stays live in one Log row with the imported buy (same kind, date, slot).
    const live = part.filter((each) => each.deletedAt === null);
    const estimate = live.find((each) => each.source === 'one-tap');
    const imported = live.find((each) => each.source !== 'one-tap');
    if (estimate === undefined || imported === undefined) throw new Error('the row holds the estimate and the buy');
    expect([imported.source, imported.date, imported.slot]).toEqual(['import-csv', estimate.date, estimate.slot]);
    const { amount, units, coin, id } = imported;
    const saved = saveTransaction(
      {
        kind: 'dca',
        date: imported.date,
        slot: imported.slot,
        fee: imported.fee,
        note: '',
        venue: imported.venue,
        rows: [{ coin, entry: id, amount, units }],
      },
      { plan: BRUNO, entries: part, editing: [estimate, imported], ids: [], now: LATER, source: 'manual' },
    );
    const edited = storedOver(part, saved.ok ? saved.value : []);
    // The edit stamps the buy it keeps and the estimate it drops at one instant, as an import write does.
    const cleared = edited.find((each) => each.id === estimate.id);
    expect([cleared?.deletedAt, edited.find((each) => each.id === id)?.updatedAt]).toEqual([LATER, LATER]);
    expect(carriedOf(whole(edited, b2, b1))).toEqual([['40', ['200']]]);
    // Once the person deletes the named 40: the 200 cleared by hand is live in one import (30 against 200) and
    // tombstoned in two; September's monthly buys are the same in both.
    const one = september(applyExchangeImport(log, whole(log, b2, b1), NOW).entries);
    expect([september(namedDeleted(edited, whole(edited, b2, b1))), one]).toEqual([
      { estimates: [], buys: one.buys },
      { estimates: ['200'], buys: [['import-csv', '30', '2026-09-04', '0.0003']] },
    ]);
  });

  // The line reads the Log once this import is applied: its entries added and the estimates it replaces tombstoned.
  it('P1: the 600 that replaced a tap of 1000 goes with it and with the 200 this import replaces (150 and 1350)', () => {
    const a = tap('BTC', '2026-09', '2026-09-01', '1000', '0.01');
    const [b1, b2] = [buy('BTC', '2026-09-03', '600', '0.006'), buy('BTC', '2026-09-04', '150', '0.0015')];
    // A tap for a month already done comes in as a JSON import brings one (Today offers none, DOMAIN §3.2).
    const b = tap('BTC', '2026-09', '2026-09-05', '200', '0.002');
    const part = [...importAt([a], [b1], EARLIER), b];
    expect(invested(BRUNO, part)).toBe('800');
    // 150 replaces the 200 (at least half of it) and is under half of the 1000 the earlier import replaced.
    expect(whole(part, b2, b1).replaced.map((group) => group.estimates.map((each) => each.amount))).toEqual([['200']]);
    expect(carriedOf(whole(part, b2, b1))).toEqual([['600', ['1000', '200']]]);
    // Once the person deletes the named 600, the two Logs differ only by the 1000 and the 200, which one import keeps.
    const one = applyExchangeImport([a, b], whole([a, b], b2, b1), NOW).entries;
    const two = namedDeleted(part, whole(part, b2, b1));
    expect([invested(BRUNO, two), invested(BRUNO, one)]).toEqual(['150', '1350']);
    expect([september(two), september(one)]).toEqual([
      { estimates: [], buys: [['import-csv', '150', '2026-09-04', '0.0015']] },
      { estimates: ['1000', '200'], buys: [['import-csv', '150', '2026-09-04', '0.0015']] },
    ]);
  });

  it('P2: the cost: a hand-deleted 1000 and the 200 this import replaces go with the cancelled 50, Logs equal', () => {
    const log = [
      deletedByHand(tap('BTC', '2026-09', '2026-09-01', '1000', '0.01')),
      tap('BTC', '2026-09', '2026-09-02', '200', '0.002'),
    ];
    const [b1, b2] = [buy('BTC', '2026-09-03', '50', '0.0005'), buy('BTC', '2026-09-04', '150', '0.0015')];
    const part = importAt(log, [b1], EARLIER);
    // 50 is under half of the live 200, so the earlier import keeps it.
    expect(invested(BRUNO, part)).toBe('250');
    expect(carriedOf(whole(part, b2, b1))).toEqual([['50', ['1000', '200']]]);
    // Once the person deletes the named 50, the two Logs are equal: one import keeps no estimate live either.
    const one = applyExchangeImport(log, whole(log, b2, b1), NOW).entries;
    const two = namedDeleted(part, whole(part, b2, b1));
    expect([september(two), invested(BRUNO, two)]).toEqual([september(one), '150']);
    expect(september(one)).toEqual({ estimates: [], buys: [['import-csv', '150', '2026-09-04', '0.0015']] });
  });

  it('no line: a live 200 kept beside an earlier 50, then a whole file of 150 that cancels the 50 replaces it', () => {
    const log = [tap('BTC', '2026-09', '2026-09-02', '200', '0.002')];
    const [b1, b2] = [buy('BTC', '2026-09-03', '50', '0.0005'), buy('BTC', '2026-09-04', '150', '0.0015')];
    const part = importAt(log, [b1], EARLIER);
    expect(invested(BRUNO, part)).toBe('250');
    // 150 reaches half the 200 it replaces, so the largest it counts is the 200 and the line does not show.
    expect(carriedOf(whole(part, b2, b1))).toEqual([['50', []]]);
    expect(september(namedDeleted(part, whole(part, b2, b1)))).toEqual(
      september(applyExchangeImport(log, whole(log, b2, b1), NOW).entries),
    );
  });

  it('no line: a 250 tapped after the 50 replaced a 70, then the same file again; one import keeps all three', () => {
    const seventy = tap('BTC', '2026-09', '2026-09-01', '70', '0.0007');
    const b1 = buy('BTC', '2026-09-03', '50', '0.0005');
    // A tap for a month already done comes in as a JSON import brings one (Today offers none, DOMAIN §3.2).
    const later = tap('BTC', '2026-09', '2026-09-05', '250', '0.0025');
    const part = [...importAt([seventy], [b1], EARLIER), later];
    // The earlier import's 50 reaches half the 70 and replaces it; the whole file stores nothing new and replaces none.
    expect(part.find((each) => each.id === seventy.id)?.deletedAt).toBe(EARLIER);
    const again = planExchangeImport(
      fileOf([b1]),
      { plan: BRUNO, entries: part },
      { venue: 'Kraken', addHeld: false },
      LISBON,
    );
    expect([again.entries, again.replaced, again.cancelled]).toEqual([[], [], []]);
    const two = applyExchangeImport(part, again, NOW).entries;
    expect(september(two)).toEqual({ estimates: ['250'], buys: [['import-csv', '50', '2026-09-03', '0.0005']] });
    // One import over a Log holding both taps: 50 is under half of the 250, so all three stay live (370).
    const one = importAt([seventy, later], [b1], NOW);
    expect(september(one)).toEqual({ estimates: ['70', '250'], buys: september(two).buys });
    expect([invested(BRUNO, two), invested(BRUNO, one)]).toEqual(['300', '370']);
  });

  it('no line: a second 70 tapped after the 50 replaced the first, then a whole file that cancels the 50', () => {
    const first = tap('BTC', '2026-09', '2026-09-01', '70', '0.0007');
    const b1 = buy('BTC', '2026-09-03', '50', '0.0005');
    // A tap for a month already done comes in as a JSON import brings one (Today offers none, DOMAIN §3.2).
    const second = tap('BTC', '2026-09', '2026-09-05', '70', '0.0007');
    const part = [...importAt([first], [b1], EARLIER), second];
    expect(part.find((each) => each.id === first.id)?.deletedAt).toBe(EARLIER);
    const cancelling = (entries: readonly Entry[]) =>
      planExchangeImport(
        { ...fileOf([]), cancelled: [b1] },
        { plan: BRUNO, entries },
        { venue: 'Kraken', addHeld: false },
        LISBON,
      );
    // The line names the 50 and carries nothing: September keeps the second 70 live, a monthly buy not imported.
    expect(carriedOf(cancelling(part))).toEqual([['50', []]]);
    const two = namedDeleted(part, cancelling(part));
    expect(september(two)).toEqual({ estimates: ['70'], buys: [] });
    const stored = part.find((each) => each.source === 'import-csv');
    expect(two.filter((each) => each.deletedAt !== null).map((each) => each.id)).toEqual([first.id, stored?.id]);
    // One import over a Log holding both taps imports nothing and replaces nothing: both 70s stay live (140).
    const once = cancelling([first, second]);
    expect([once.entries, once.replaced, once.cancelled]).toEqual([[], [], []]);
    const one = applyExchangeImport([first, second], once, NOW).entries;
    expect(september(one)).toEqual({ estimates: ['70', '70'], buys: [] });
    expect([invested(BRUNO, two), invested(BRUNO, one)]).toEqual(['70', '140']);
  });
});
