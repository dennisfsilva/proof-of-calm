import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, trade } from '../../../test/exchange/plan-fixture';
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
  });
});
