import { describe, expect, it } from 'vitest';
import { aMove, anEntry, aPlan, date, instant, money, month, units } from '../../../test/builders';
import { CHOICES, FILE, LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { LeftOutRow, Movement } from './kraken';
import { type ExchangeImportPlan, planExchangeImport, shownPlaces } from './plan';

// Steps 1, 3 and 4 of the exchange import's plan and its move check (docs/DOMAIN.md §3.13), each case on its own
// synthetic rows, so no fixture whose counts another test pins grows.

const PLAIN = aPlan({ firstBuy: date('2026-03-01'), lastBuy: date('2026-12-01') });
const STARTING = { ...PLAIN, startingAmount: money('500') };
const buy = (ref: string, coin: string, at: string, units_: string, amount = '70') =>
  trade(ref, 'purchase', coin, at, { units: units_, amount, fee: '0.70' }, 2);
const receipt = (ref: string, at: string, units_: string): Movement => ({
  ...buy(ref, 'BTC', at, units_),
  role: 'receipt',
  currency: null,
  amount: null,
  fee: null,
});
const held = (day: string, units_: string, amount: string | null, coin = 'BTC') =>
  anEntry({
    kind: 'held',
    coin: coin as CoinId,
    slot: null,
    date: date(day),
    amount: amount === null ? null : money(amount),
    units: units(units_),
    venue: 'Ledger',
  });
const lump = (day: string, source: Entry['source']) =>
  anEntry({ kind: 'lump', slot: null, date: date(day), amount: money('500'), units: units('0.008'), source });
const withdrawal = (coin: string, at: string, units_: string): LeftOutRow => ({
  reason: 'coin-withdrawal',
  lines: [9],
  at: instant(`${at}T10:00:00Z`),
  coin,
  units: units(units_),
  column: null,
});
const move = (coin: string, day: string, units_: string) =>
  aMove({ coin: coin as CoinId, date: date(day), units: units(units_), received: units(units_) });

function run(
  plan: Plan,
  entries: readonly Entry[],
  movements: readonly Movement[],
  extra: { leftOut?: readonly LeftOutRow[]; cancelled?: readonly Movement[]; addHeld?: boolean } = {},
) {
  const { leftOut = [], cancelled = [], addHeld = false } = extra;
  const file = { ...FILE, movements, leftOut, cancelled };
  return planExchangeImport(file, { plan, entries }, { ...CHOICES, addHeld }, LISBON);
}
const kinds = (plan: ExchangeImportPlan) => plan.entries.map((entry) => `${entry.date}:${entry.kind}:${entry.slot}`);

describe('step 3: the starting amount', () => {
  it('P6 defaults: lump saved 2 Jul, bought 10 Jun: 10 Jun left out and named', () => {
    const p6 = { ...PLAIN, startingAmount: money('1000'), firstBuy: date('2026-07-02'), buyDay: 2 };
    const file = [buy('P6-0610', 'BTC', '2026-06-10', '0.0125', '1000'), buy('P6-0802', 'BTC', '2026-08-02', '0.001')];
    const plan = run(p6, [lump('2026-07-02', 'one-tap')], file);
    expect(plan.startingAmount).toEqual({ purchases: 1, firstBuy: '2026-07-02', through: '2026-07-17' });
    expect(kinds(plan)).toEqual(['2026-08-02:dca:2026-08']);
    expect(plan.replaced).toEqual([]);
  });

  it('a purchase 90 days before the first buy in a plan with a starting amount is left out', () => {
    const plan = run(STARTING, [], [buy('S-1201', 'ETH', '2025-12-01', '0.02')]);
    expect(plan.startingAmount).toEqual({ purchases: 1, firstBuy: '2026-03-01', through: '2026-03-16' });
    expect(plan.entries).toEqual([]);
  });

  it("a hand lump with a starting amount of 0 leaves its coin's earlier purchases out", () => {
    const file = [
      buy('L-0110', 'BTC', '2026-01-10', '0.001'),
      buy('L-0110E', 'ETH', '2026-01-10', '0.02'),
      buy('L-0201', 'BTC', '2026-02-01', '0.008', '500'),
      buy('L-0301', 'BTC', '2026-03-01', '0.001'),
      buy('L-0401', 'BTC', '2026-04-01', '0.001'),
    ];
    const plan = run(PLAIN, [lump('2026-02-01', 'manual')], file);
    expect(plan.recorded.map((each) => each.dates)).toEqual([['2026-02-01']]);
    expect(plan.startingAmount).toEqual({ purchases: 2, firstBuy: '2026-03-01', through: '2026-03-16' });
    expect(kinds(plan)).toEqual(['2026-01-10:extra:null', '2026-04-01:dca:2026-04']);
  });

  it('without a starting amount or a lump it is an extra buy', () => {
    const ethLump = { ...lump('2026-03-01', 'manual'), coin: 'ETH' as CoinId };
    const plan = run(PLAIN, [ethLump], [buy('X-1201', 'BTC', '2025-12-01', '0.001')]);
    expect([plan.startingAmount, kinds(plan)]).toEqual([null, ['2025-12-01:extra:null']]);
    const without = run(PLAIN, [], [buy('X-1201', 'ETH', '2025-12-01', '0.02', '30')]);
    expect([without.startingAmount, kinds(without)]).toEqual([null, ['2025-12-01:extra:null']]);
  });

  it("Kai: tapped lump and the first monthly buy on 1 Mar both left out, March's estimate kept", () => {
    const estimate = anEntry({ slot: month('2026-03'), date: date('2026-03-01'), source: 'one-tap' });
    const file = [buy('K-0301A', 'BTC', '2026-03-01', '0.008', '500'), buy('K-0301B', 'BTC', '2026-03-01', '0.001')];
    const plan = run(STARTING, [lump('2026-03-01', 'one-tap'), estimate], file);
    expect(plan.startingAmount).toEqual({ purchases: 2, firstBuy: '2026-03-01', through: '2026-03-16' });
    expect([plan.entries, plan.replaced]).toEqual([[], []]);
  });
});

describe('step 4: the coins the person added', () => {
  const eth = (n: number) => buy(`P4-${n}`, 'ETH', `2026-${String(n).padStart(2, '0')}-01`, '0.012', '30');

  it('P4: Coins added 0.0018 ETH on 9 Nov holds back no purchase of more units', () => {
    const file = [3, 4, 5, 6, 7, 8, 9, 10].map(eth);
    const plan = run(PLAIN, [held('2026-11-09', '0.0018', null, 'ETH')], file);
    expect(plan.held).toBeNull();
    expect(plan.entries.filter((entry) => entry.kind === 'dca')).toHaveLength(8);
  });

  it('Greta**: purchases of at most 0.0039 BTC on or before her 15 Jul Coins added are asked about', () => {
    const file = [3, 4, 5, 6, 7, 8].map((n) => buy(`G-${n}`, 'BTC', `2026-0${n}-01`, '0.0008'));
    const plan = run(PLAIN, [held('2026-07-15', '0.0039', '350')], file);
    expect(plan.held?.coins).toEqual([
      expect.objectContaining({ purchases: 5, units: '0.004', through: '2026-07-15', heldUnits: '0.0039' }),
    ]);
    expect(kinds(plan)).toEqual(['2026-08-01:dca:2026-08']);
  });

  it('a Coins added entry at cost 0 holds back no purchase but holds back receipts of at most its units', () => {
    const file = [buy('Z-0401', 'BTC', '2026-04-01', '0.001'), receipt('Z-0501', '2026-05-01', '0.00001')];
    const plan = run(PLAIN, [held('2026-06-01', '0.01', '0')], file);
    expect(plan.held?.coins).toEqual([expect.objectContaining({ purchases: 1, units: '0.00001' })]);
    expect(kinds(plan)).toEqual(['2026-04-01:dca:2026-04']);
    const small = run(PLAIN, [held('2026-06-01', '0.000001', '0')], file);
    expect([small.held, small.entries]).toHaveLength(2);
    expect(small.held).toBeNull();
    expect(kinds(small)).toEqual(['2026-04-01:dca:2026-04', '2026-05-01:held:null']);
  });

  it('an empty cost guards purchases of at most its units', () => {
    const file = [buy('E-0401', 'BTC', '2026-04-01', '0.0008'), buy('E-0501', 'BTC', '2026-05-01', '0.0015')];
    const plan = run(PLAIN, [held('2026-06-01', '0.001', null)], file);
    expect(plan.held?.coins).toEqual([expect.objectContaining({ purchases: 1, units: '0.0008' })]);
    expect(kinds(plan)).toEqual(['2026-05-01:dca:2026-05']);
  });

  it('a purchase of more units on a date with one that fits goes on to the later steps, as a file without the other would', () => {
    const file = [buy('W-1', 'BTC', '2026-04-01', '0.0008'), buy('W-2', 'BTC', '2026-04-01T15:00:00Z', '0.0015')];
    const plan = run(PLAIN, [held('2026-06-01', '0.001', null)], file);
    expect(plan.held?.coins).toEqual([expect.objectContaining({ purchases: 1, units: '0.0008' })]);
    expect(plan.entries.map((entry) => entry.units)).toEqual(['0.0015']);
    expect(run(PLAIN, [held('2026-06-01', '0.001', null)], file.slice(1)).entries).toEqual(plan.entries);
    const ticked = run(PLAIN, [held('2026-06-01', '0.001', null)], file, { addHeld: true });
    expect(ticked.entries.map((entry) => entry.units)).toEqual(['0.0008', '0.0015']);
  });

  it('each Coins added entry guards the dates on or before its own date, and the line names the latest that guards', () => {
    const file = [buy('T-0301', 'BTC', '2026-03-01', '0.001'), buy('T-0501', 'BTC', '2026-05-01', '0.001')];
    const plan = run(PLAIN, [held('2026-04-01', '0.05', null), held('2026-06-01', '0.0001', null)], file);
    expect(plan.held?.coins).toEqual([
      expect.objectContaining({ purchases: 1, through: '2026-04-01', heldDate: '2026-04-01', heldUnits: '0.05' }),
    ]);
    expect(kinds(plan)).toEqual(['2026-05-01:dca:2026-05']);
  });
});

describe('step 1: what an earlier import stored and this file changes', () => {
  it('a stored buy the file pairs with a cancellation is named; a tombstoned or unknown one is not', () => {
    const [live, gone, unknown] = ['C1', 'C2', 'C3'].map((ref) => buy(ref, 'BTC', '2026-05-04', '0.001')) as [
      Movement,
      Movement,
      Movement,
    ];
    const stored = anEntry({ id: testId(live.key), date: date('2026-05-04'), source: 'import-csv' });
    const deleted = { ...stored, id: testId(gone.key), deletedAt: instant('2026-05-05T09:00:00Z') };
    const plan = run(PLAIN, [stored, deleted], [], { cancelled: [live, gone, unknown] });
    expect(plan.cancelled).toEqual([{ entry: stored, estimates: [] }]);
    expect(run(PLAIN, [], [], { cancelled: [live] }).cancelled).toEqual([]);
  });

  // Review: "Log holds a one-tap BTC estimate for May 2026 (dated 1 May). A Trade Republic export that ends before the
  // cancellation is imported first: it stores buy B1 (4 May, 0.001 BTC) as May's monthly buy and tombstones the
  // estimate. The whole file then names B1 under `cancelled`, and the person deletes it as the line says. Result: May
  // has no live entry at all. One import of the whole file keeps the estimate live."
  it('a cancelled monthly buy that replaced an estimate carries it, so the line can say deleting it leaves May without it', () => {
    const tap = anEntry({ slot: month('2026-05'), date: date('2026-05-01'), source: 'one-tap', venue: 'Bitvavo' });
    const b1 = buy('B1', 'BTC', '2026-05-04', '0.001');
    const part = run(PLAIN, [tap], [b1]);
    expect(part.replaced.flatMap((each) => each.estimates)).toEqual([tap]);
    const log = [{ ...tap, deletedAt: NOW }, ...part.entries];
    const whole = run(PLAIN, log, [], { cancelled: [b1] });
    expect(whole.cancelled).toEqual([{ entry: part.entries[0], estimates: [log[0]] }]);
    expect(run(PLAIN, [tap], [], { cancelled: [b1] }).replaced).toEqual([]);
    // A later purchase of May is an extra beside the live B1, so deleting B1 still leaves May without a monthly buy.
    const b2 = buy('B2', 'BTC', '2026-05-20', '0.001');
    expect(run(PLAIN, log, [b2], { cancelled: [b1] }).cancelled).toEqual([
      { entry: part.entries[0], estimates: [log[0]] },
    ]);
    // A monthly buy of May the person recorded keeps the month, so nothing is carried.
    const hand = anEntry({ slot: month('2026-05'), date: date('2026-05-02'), source: 'manual', venue: 'Kraken' });
    expect(run(PLAIN, [...log, hand], [], { cancelled: [b1] }).cancelled).toEqual([
      { entry: part.entries[0], estimates: [] },
    ]);
    // An extra buy carries none, whatever the Log holds for its month.
    const extra = { ...(part.entries[0] as Entry), kind: 'extra' as const, slot: null };
    expect(run(PLAIN, [log[0] as Entry, extra], [], { cancelled: [b1] }).cancelled).toEqual([
      { entry: extra, estimates: [] },
    ]);
  });

  it('a stored folded receipt with fewer units is named with both figures', () => {
    const [grew, same, fewer] = [
      receipt('F1', '2026-10-31', '0.00008'),
      receipt('F2', '2026-10-31', '0.00003'),
      receipt('F3', '2026-10-31', '0.00001'),
    ];
    const stored = (movement: Movement, units_: string): Entry => ({
      ...held('2026-10-31', units_, '0'),
      id: testId(movement.key),
      source: 'import-csv',
    });
    const log = [stored(grew, '0.00005'), stored(same, '0.00003'), stored(fewer, '0.00002')];
    const plan = run(PLAIN, log, [grew, same, fewer]);
    expect(plan.short).toEqual([{ entry: log[0], units: '0.00008' }]);
    expect(plan.imported).toBe(3);
    const tombstoned = { ...(log[0] as Entry), deletedAt: instant('2026-11-01T09:00:00Z') };
    expect(run(PLAIN, [tombstoned], [grew]).short).toEqual([]);
  });

  it('a receipt compares at the places the preview shows, so typing the figure it names ends the line', () => {
    const below = receipt('F4', '2026-10-31', '0.0000500040');
    const above = receipt('F5', '2026-10-31', '0.0000500060');
    const stored = (movement: Movement, units_: string): Entry => ({
      ...held('2026-10-31', units_, '0'),
      id: testId(movement.key),
      source: 'import-csv',
    });
    expect(run(PLAIN, [stored(below, '0.00005')], [below]).short).toEqual([]);
    const log = [stored(above, '0.00005')];
    expect(run(PLAIN, log, [above]).short).toEqual([{ entry: log[0], units: '0.0000500060' }]);
    expect(run(PLAIN, [stored(above, '0.00005001')], [above]).short).toEqual([]);
  });
});

describe('the move check, at the places the preview shows', () => {
  const logged = (rows: readonly LeftOutRow[], moves: readonly Entry[]) =>
    run(PLAIN, moves, [], { leftOut: rows }).withdrawals;

  it('shows a coin at its decimals in the plan, and 8 places for a coin it does not list', () => {
    expect([shownPlaces(PLAIN, 'BTC'), shownPlaces(PLAIN, 'ETH'), shownPlaces(PLAIN, 'DOGE')]).toEqual([8, 6, 8]);
  });

  it('a 13-decimal withdrawal matches a move of its shown figure', () => {
    const row = withdrawal('BTC', '2026-10-21', '0.0100000000004');
    expect(logged([row], [move('BTC', '2026-10-21', '0.01')])).toEqual({
      logged: [{ coin: 'BTC', units: '0.0100000000004', count: 1 }],
      notLogged: [],
    });
  });

  it('a 10-decimal ETH withdrawal matches a move typed at 6 places, half-even', () => {
    const row = withdrawal('ETH', '2026-10-21', '0.0123445000');
    expect(logged([row], [move('ETH', '2026-10-21', '0.012344')]).logged).toHaveLength(1);
    expect(logged([row], [move('ETH', '2026-10-21', '0.012345')]).logged).toEqual([]);
  });

  it('two withdrawals equal at the shown places take one move each', () => {
    const rows = [withdrawal('BTC', '2026-10-21', '0.01000000001'), withdrawal('BTC', '2026-10-21', '0.01000000002')];
    const one = move('BTC', '2026-10-21', '0.01');
    expect(logged(rows, [one, { ...one, id: testId('second') }]).logged).toEqual([
      { coin: 'BTC', units: '0.02000000003', count: 2 },
    ]);
    expect(logged(rows, [one])).toEqual({
      logged: [{ coin: 'BTC', units: '0.01000000001', count: 1 }],
      notLogged: [{ coin: 'BTC', units: '0.01000000002', count: 1 }],
    });
  });
});
