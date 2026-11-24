import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, split, units } from '../../../test/builders';
import { coverCut } from '../../../test/exchange/plan-cover';
import { CHOICES, FILE, LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import { WINDOW_93 } from '../../../test/exchange/plan-seeds';
import { minus, plus, type Units } from '../../money/decimal';
import { defaultFee, lastVenue, oneTapEntries } from '../../plan/parts';
import { actionsNow, liveEntries, primaryAction } from '../../plan/statuses';
import { matchLots } from '../../portfolio/lots';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { PriceSnapshot } from '../../schema/prices';
import { applyExchangeImport } from './apply';
import type { ExchangeFile, LeftOutRow, Movement } from './kraken';
import { planExchangeImport } from './plan';
import { leftOutFrom } from './plan-guards';

// The sale guard's cover across imports (docs/DOMAIN.md §3.13 step 4): the entries other imports stored before the
// file's earliest left-out purchase, the one-tap `lump` at its own units, and each sale decided alone. Every walk is
// the design check's of 2026-11-23, on its own synthetic rows.

const PLAIN = aPlan({ firstBuy: date('2026-03-01'), lastBuy: date('2026-12-01') });
const [BTC, ETH] = ['BTC' as CoinId, 'ETH' as CoinId];
const buy = (ref: string, day: string, units_: string, amount = '1400') =>
  trade(ref, 'purchase', 'BTC', day, { units: units_, amount, fee: '1' }, 2);
const sell = (ref: string, day: string, units_: string, amount = '900') =>
  trade(ref, 'sale', 'BTC', day, { units: units_, amount, fee: '1' }, 4);
const held = (day: string, units_: string, amount: string | null) =>
  anEntry({
    kind: 'held',
    slot: null,
    date: date(day),
    amount: amount === null ? null : money(amount),
    units: units(units_),
    venue: 'Ledger',
  });
/** Trade Republic's file: the coins came from Kraken, so the deposit is left out. */
const DEPOSIT: LeftOutRow = { reason: 'coin-deposit', lines: [9], at: null, coin: 'BTC', units: null, column: null };
type Import = { readonly movements: readonly Movement[]; readonly addHeld?: boolean; readonly tr?: boolean };
const fileOf = ({ movements, tr = false }: Import): ExchangeFile =>
  tr ? { ...FILE, exchange: 'trade-republic', movements, leftOut: [DEPOSIT] } : { ...FILE, movements, leftOut: [] };
const planOf = (plan: Plan, entries: readonly Entry[], file: Import, context = LISBON) =>
  planExchangeImport(
    fileOf(file),
    { plan, entries },
    { venue: file.tr === true ? 'Trade Republic' : CHOICES.venue, addHeld: file.addHeld ?? false },
    context,
  );
/** `coin` the Log holds: every live entry's units, a sale's taken away. */
const holding = (coin: string) => (entries: readonly Entry[]) =>
  liveEntries(entries)
    .filter((entry) => entry.coin === coin && entry.kind !== 'move')
    .reduce(
      (total, entry) => (entry.kind === 'sell' ? minus(total, entry.units) : plus(total, entry.units)),
      units('0'),
    );
const [btc, eth] = [holding('BTC'), holding('ETH')];
/** The imports in order, from `entries`: what the Log holds after each, and the Log after the last. */
function walk(plan: Plan, entries: readonly Entry[], imports: readonly Import[], context = LISBON) {
  const after: Units[] = [];
  let log = entries;
  for (const file of imports) {
    log = applyExchangeImport(log, planOf(plan, log, file, context), NOW).entries;
    after.push(btc(log));
  }
  return { after, log };
}
const sold = (log: readonly Entry[]) => liveEntries(log).filter((entry) => entry.kind === 'sell').length;
const unmatched = (log: readonly Entry[]) => matchLots(liveEntries(log), BTC, 'global').unmatchedUnits;

describe('a sale another import covers', () => {
  // B1: export A buys 0.02 BTC on 1 Jun 2025; export B sells 0.01 on 1 Sep 2026 for €900; a gift of 0.0001 BTC is
  // typed as Coins added on 1 Oct 2026, so it reaches the sale.
  const A = { movements: [buy('A-buy', '2025-06-01', '0.02')] };
  const B = { movements: [sell('B-sale', '2026-09-01', '0.01')] };
  const gift = (cost: string | null) => held('2026-10-01', '0.0001', cost);

  it('a sale another export covers is imported after it, whatever the Coins added entry cost', () => {
    for (const cost of ['0', '5', null]) {
      const afterA = walk(PLAIN, [gift(cost)], [A]).log;
      const plan = planOf(PLAIN, afterA, B);
      expect([plan.entries.map((entry) => entry.kind), plan.uncovered]).toEqual([['sell'], []]);
      expect(walk(PLAIN, afterA, [B]).after).toEqual(['0.0101']);
    }
  });

  it('imported first, it stays out until chosen again after the export that covers it', () => {
    expect(planOf(PLAIN, [gift('0')], B).uncovered).toEqual([
      {
        id: testId(B.movements[0]?.key as string),
        coin: 'BTC',
        date: '2026-09-01',
        units: '0.01',
        amount: '900',
        reach: { kind: 'held', units: '0.0001', date: '2026-10-01' },
      },
    ]);
    expect(walk(PLAIN, [gift('0')], [B, A, B]).after).toEqual(['0.0001', '0.0201', '0.0101']);
  });

  it("Trade Republic's sale of coins bought at Kraken: Kraken then Trade Republic, or Trade Republic first and again", () => {
    const T = { ...B, tr: true };
    expect(walk(PLAIN, [gift('0')], [A, T]).after).toEqual(['0.0201', '0.0101']);
    expect(walk(PLAIN, [gift('0')], [T, A, T]).after).toEqual(['0.0001', '0.0201', '0.0101']);
  });

  it('the gate in another file: 0.01999999 and 0.02 cover a 0.02 sale, 0.02000001 sold is left out', () => {
    const afterA = walk(PLAIN, [gift(null)], [A]).log;
    const out = (sale: string) => planOf(PLAIN, afterA, { movements: [sell('B-gate', '2026-09-01', sale)] }).uncovered;
    expect([out('0.01999999'), out('0.02')]).toEqual([[], []]);
    expect(out('0.02000001')).toHaveLength(1);
  });

  it('N5: a purchase the gift holds back after the other export leaves the sale imported, unticked and ticked', () => {
    const afterA = walk(PLAIN, [gift(null)], [A]).log;
    const file = { movements: [buy('B-0801', '2026-08-01', '0.00005', '5'), ...B.movements] };
    for (const addHeld of [false, true]) {
      const plan = planOf(PLAIN, afterA, { ...file, addHeld });
      expect([plan.uncovered, plan.entries.filter((entry) => entry.kind === 'sell').length]).toEqual([[], 1]);
    }
  });

  it('the defaults walk: yearly files with Coins added typed on the first buy day hold 0.23 as one file does', () => {
    const plan = aPlan({ firstBuy: date('2026-11-23'), lastBuy: date('2027-11-01') });
    const today = { ...LISBON, today: date('2026-11-23') };
    const coinsAdded = held('2026-11-23', '0.05', null);
    const y2024 = { movements: ['2024-03-01', '2024-06-01', '2024-09-01'].map((d) => buy(`D-${d}`, d, '0.1')) };
    for (const small of ['2025-06-05', '2025-01-05']) {
      const y2025 = { movements: [sell('D-sale', '2025-02-10', '0.12'), buy(`D-${small}`, small, '0.001', '50')] };
      const whole = { movements: [...y2024.movements, ...y2025.movements] };
      expect(walk(plan, [coinsAdded], [y2024, y2025], today).after.at(-1)).toBe('0.23');
      expect(walk(plan, [coinsAdded], [whole], today).after).toEqual(['0.23']);
    }
  });

  it('B2c, yearly DCA files: 0.8 unticked and 0.824 ticked, whole or by year', () => {
    const y2024 = [
      buy('C-0115', '2024-01-15', '1', '40000'),
      ...['2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01'].map((d) => buy(`C-${d}`, d, '0.002', '80')),
    ];
    const y2025 = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((m) => buy(`C-2025-${m}`, `2025-0${m}-01`, '0.002', '80')),
      sell('C-sale', '2025-09-01', '0.6', '57000'),
    ];
    const entries = [held('2026-11-10', '0.4', '1000')];
    for (const [addHeld, holds] of [
      [false, '0.8'],
      [true, '0.824'],
    ] as const) {
      const byYear = walk(PLAIN, entries, [
        { movements: y2024, addHeld },
        { movements: y2025, addHeld },
      ]);
      expect([byYear.after.at(-1), sold(byYear.log)]).toEqual([holds, 1]);
      expect(walk(PLAIN, entries, [{ movements: [...y2024, ...y2025], addHeld }]).after).toEqual([holds]);
    }
  });
});

describe("Greta's sale and the coins another import bought (the cover's date gate)", () => {
  // Greta: Coins added 0.4 BTC on 10 Nov 2026 nets her Kraken history: four purchases of 0.25 BTC in 2025, 0.6 sold on
  // 1 Sep 2025, 0.002 bought on 1 Nov 2026. Trade Republic holds 0.7 BTC more; she holds 1.1.
  const greta = aPlan({
    firstBuy: date('2026-11-01'),
    lastBuy: date('2027-06-01'),
    startingAmount: money('0'),
    split: split({ BTC: '100', ETH: '0' }),
  });
  const DECEMBER = { ...LISBON, today: date('2026-12-05') };
  const history = ['2025-02-01', '2025-04-01', '2025-06-01', '2025-08-01'].map((d, n) =>
    buy(`G-${n}`, d, '0.25', '20000'),
  );
  const sale = sell('G-sale', '2025-09-01', '0.6', '57000');
  const kraken = { movements: [...history, sale, buy('G-1101', '2026-11-01', '0.002', '100')] };
  const tr = (day: string) => ({ movements: [buy(`TR-${day}`, day, '0.7', '56000')], tr: true });
  const entries = [held('2026-11-10', '0.4', '1000')];
  const holds = (imports: readonly Import[]) => walk(greta, entries, imports, DECEMBER).after.at(-1);

  it('Trade Republic first: bought before the first purchase the file holds back, it covers the sale (0.5)', () => {
    expect(['2025-01-31', '2025-02-01', '2025-02-02'].map((day) => holds([tr(day), kraken]))).toEqual([
      '0.5',
      '1.1',
      '1.1',
    ]);
    expect(holds([kraken, tr('2025-01-31')])).toBe('1.1');
  });

  it('Trade Republic bought on 15 Jun 2025 covers nothing in either order: one sale left out each (pin)', () => {
    const trFirst = walk(greta, entries, [tr('2025-06-15')], DECEMBER).log;
    expect([planOf(greta, trFirst, kraken, DECEMBER).uncovered.length, holds([tr('2025-06-15'), kraken])]).toEqual([
      1,
      '1.1',
    ]);
    expect([planOf(greta, entries, kraken, DECEMBER).uncovered.length, holds([kraken, tr('2025-06-15')])]).toEqual([
      1,
      '1.1',
    ]);
  });

  it('B3w: a window holding only the sale, after Trade Republic, stores it; the whole file then keeps 0.5', () => {
    for (const day of ['2025-06-15', '2024-12-01']) expect(holds([tr(day), { movements: [sale] }, kraken])).toBe('0.5');
  });

  it('N3: Trade Republic stored, then Kraken leaves the sale out unticked and adds it ticked: 1.502', () => {
    const trFirst = walk(greta, entries, [tr('2025-06-15')], DECEMBER).log;
    const ticked = planOf(greta, trFirst, { ...kraken, addHeld: true }, DECEMBER);
    expect([ticked.uncovered, ticked.entries.filter((entry) => entry.kind === 'sell').length]).toEqual([[], 1]);
    expect(holds([tr('2025-06-15'), kraken, { ...kraken, addHeld: true }])).toBe('1.502');
  });

  it('B4: an export holding only the sale, then the whole file, holds 0.4 (pin)', () => {
    expect(holds([{ movements: [sale] }, kraken])).toBe('0.4');
  });

  it('a prefix that holds none of the left-out purchases stores the sale the whole file leaves out (pin)', () => {
    // Seed 13's first world (DOMAIN §3.13 step 5's exception), its BTC rows and the prefix's ETH rows: first buy 1 Mar
    // 2026, a starting amount of 500; another import's Coins added entry of 0.12409 BTC on 30 Jan. The prefix is the
    // file's first 3 rows; the whole file also buys BTC on 27 Jan, 29 Jan and 2 Feb, which step 3 leaves out (F = 27 Jan),
    // so the other import's entry, dated on or after F, no longer counts.
    const plan = aPlan({ firstBuy: date('2026-03-01'), startingAmount: money('500') });
    const other = { ...held('2026-01-30', '0.12409', null), source: 'import-csv' as const, id: testId('other|held') };
    const prefix = [
      trade('P1', 'purchase', 'ETH', '2026-10-17', { units: '0.34112', amount: '300', fee: '1' }, 2),
      trade('P2', 'purchase', 'ETH', '2026-10-17T10:01:00Z', { units: '0.00884', amount: '30', fee: '1' }, 4),
      sell('S', '2026-01-30T23:30:00Z', '0.12409'),
    ];
    const whole = [
      ...prefix,
      ...[
        ['2026-01-27', '0.06251'],
        ['2026-01-27T10:01:00Z', '0.51424'],
        ['2026-01-29', '0.90801'],
        ['2026-02-02', '0.10677'],
        ['2026-02-02T10:01:00Z', '0.05009'],
      ].map(([day, units_], index) => buy(`B${index}`, day as string, units_ as string)),
    ];
    const once = planOf(plan, [other], { movements: whole, addHeld: true });
    expect([once.startingAmount?.items[0]?.date, once.uncovered.map(({ date: on }) => on)]).toEqual([
      '2026-01-27',
      ['2026-01-30'],
    ]);
    const first = planOf(plan, [other], { movements: prefix, addHeld: true });
    expect([first.startingAmount, sold(first.entries)]).toEqual([null, 1]);
    const one = walk(plan, [other], [{ movements: whole, addHeld: true }]);
    const two = walk(
      plan,
      [other],
      [
        { movements: prefix, addHeld: true },
        { movements: whole, addHeld: true },
      ],
    );
    expect([one.after, two.after, sold(one.log), sold(two.log)]).toEqual([['0.12409'], ['0', '0'], 0, 1]);
  });

  it("a window from 11 Dec counts another import's Coins added entry for the 6 Mar sale the whole file leaves out, in either order; recorded, the left-out purchases end it", () => {
    // Seed 93's world (WINDOW_93, step 5's exception): the whole file's F is 10 Dec, so the other import's entry of 11
    // Dec no longer counts; the window from 13 Dec has F 13 Dec and counts it. A hand lump recording both left-out
    // purchases leaves the starting amount nothing, so the two imports agree.
    const [{ plan, entries, file }] = WINDOW_93;
    const choices = { venue: 'Kraken', addHeld: false };
    const window = { ...file, movements: file.movements.slice(1) };
    const planned = (log: readonly Entry[], of: ExchangeFile) =>
      planExchangeImport(of, { plan, entries: log }, choices, LISBON);
    const after = (log: readonly Entry[], files: readonly ExchangeFile[]) => {
      const last = files.reduce((acc, of) => applyExchangeImport(acc, planned(acc, of), NOW).entries, log);
      return [eth(last), sold(last)];
    };
    const once = planned(entries, file);
    expect(once.uncovered.map(({ units: held_, date: on, reach }) => [held_, on, reach.kind])).toEqual([
      ['0.50046', '2026-03-06', 'starting'],
    ]);
    expect(once.startingAmount?.items[0]?.date).toBe('2025-12-10');
    const part = planned(entries, window);
    const sales = part.entries.filter((entry) => entry.kind === 'sell').map((entry) => entry.id);
    expect([leftOutFrom(part.startingAmount, part.held).get(ETH), sales.length]).toEqual(['2025-12-13', 1]);
    expect([...coverCut(entries, file, part, once)]).toEqual(sales);
    expect([after(entries, [file]), after(entries, [window, file]), after(entries, [file, window])]).toEqual([
      ['0.50046', 0],
      ['0', 1],
      ['0', 1],
    ]);
    const recorded = [
      ...entries,
      anEntry({
        kind: 'lump',
        slot: null,
        coin: ETH,
        date: date('2025-12-10'),
        amount: money('1823'),
        units: units('0.55843'),
      }),
    ];
    expect(planned(recorded, file).recorded.map((item) => item.dates)).toEqual([['2025-12-10', '2025-12-13']]);
    expect([after(recorded, [window, file]), after(recorded, [file, window])]).toEqual([
      ['0.55843', 1],
      ['0.55843', 1],
    ]);
  });

  it('a prefix to 9 Mar whose hand extra buy claims the purchase the whole file leaves out stores the sale, and so do two date ranges', () => {
    // A hand extra buy of 10 Mar claims the whole file's 11 Mar purchase, so step 3 leaves out 8 Mar's and the 9 Mar
    // sale is uncovered; the prefix holds no 11 Mar, so the extra buy claims 8 Mar and the sale is stored.
    const plan = aPlan({ firstBuy: date('2026-03-01'), startingAmount: money('500') });
    const extra = { kind: 'extra' as const, slot: null, coin: BTC };
    const log = [
      anEntry({ ...extra, date: date('2026-03-10'), amount: money('70'), units: units('0.001'), source: 'manual' }),
      anEntry({
        ...extra,
        id: testId('tr|0308'),
        date: date('2026-03-08'),
        amount: money('700'),
        units: units('0.01'),
        venue: 'Trade Republic',
        source: 'import-csv',
      }),
    ];
    const rows = [
      trade('R1', 'purchase', 'BTC', '2026-03-08', { units: '0.01', amount: '700', fee: '0' }, 2),
      trade('R2', 'sale', 'BTC', '2026-03-09', { units: '0.01', amount: '720', fee: '0' }, 4),
      trade('R3', 'purchase', 'BTC', '2026-03-11', { units: '0.001', amount: '70', fee: '0' }, 6),
    ];
    const [whole, prefix, last] = [{ movements: rows }, { movements: rows.slice(0, 2) }, { movements: rows.slice(2) }];
    const once = planOf(plan, log, whole);
    expect([
      once.recorded.map((item) => item.dates),
      once.startingAmount?.items.map((item) => item.date),
      once.uncovered.map((sale) => sale.date),
    ]).toEqual([[['2026-03-11']], ['2026-03-08'], ['2026-03-09']]);
    const first = planOf(plan, log, prefix);
    expect([first.recorded.map((item) => item.dates), first.startingAmount, sold(first.entries)]).toEqual([
      [['2026-03-08']],
      null,
      1,
    ]);
    const held_ = (imports: readonly Import[]) => {
      const walked = walk(plan, log, imports).log;
      return [btc(walked), sold(walked)];
    };
    expect([held_([whole]), held_([prefix, whole]), held_([whole, prefix]), held_([prefix, last])]).toEqual([
      ['0.011', 0],
      ['0.001', 1],
      ['0.001', 1],
      ['0.001', 1],
    ]);
  });
});

describe('each sale decided alone', () => {
  const coinsAdded = held('2026-11-10', '0.4', '1000');

  it('N1: a hand sale between two exports never lessens the cover: the Log holds −0.0049, 0.005 unmatched', () => {
    const gift = held('2026-10-01', '0.0001', '0');
    const afterA = walk(PLAIN, [gift], [{ movements: [buy('A-buy', '2025-06-01', '0.02')] }]).log;
    const hand = anEntry({
      kind: 'sell',
      slot: null,
      date: date('2026-01-15'),
      units: units('0.015'),
      amount: money('1000'),
    });
    const { after, log } = walk(PLAIN, [...afterA, hand], [{ movements: [sell('B-sale', '2026-09-01', '0.01')] }]);
    expect([after, unmatched(log)]).toEqual([['-0.0049'], '0.005']);
  });

  it('the A walk: unticked 0.1 with 0.3 unmatched, ticked 0.4 (pin)', () => {
    const file = [
      buy('P1', '2025-02-01', '0.5', '40000'),
      buy('P2', '2025-03-01', '0.3', '24000'),
      sell('S1', '2025-06-01', '0.4', '36000'),
      sell('S2', '2025-08-01', '0.4', '36000'),
    ];
    const unticked = walk(PLAIN, [coinsAdded], [{ movements: file }]);
    expect([unticked.after, unmatched(unticked.log)]).toEqual([['0.1'], '0.3']);
    expect(walk(PLAIN, [coinsAdded], [{ movements: file, addHeld: true }]).after).toEqual(['0.4']);
  });

  it('A2: unticked the April sale is left out (0.5); ticked both are stored (0.2) (pin)', () => {
    const file = [
      buy('Q1', '2025-02-01', '0.5', '40000'),
      buy('Q2', '2025-03-01', '0.3', '24000'),
      sell('T1', '2025-04-01', '0.6', '54000'),
      sell('T2', '2025-08-01', '0.4', '36000'),
    ];
    const unticked = walk(PLAIN, [coinsAdded], [{ movements: file }]);
    const ticked = walk(PLAIN, [coinsAdded], [{ movements: file, addHeld: true }]);
    expect([unticked.after, sold(unticked.log), ticked.after, sold(ticked.log)]).toEqual([['0.5'], 1, ['0.2'], 2]);
  });

  it('R: imported ticked, then the same file again, leaves the sale out both times: 0.7 (pin)', () => {
    const file = [buy('R1', '2025-03-01', '0.3', '24000'), sell('R2', '2025-06-01', '0.5', '45000')];
    for (const again of [false, true])
      expect(
        walk(
          PLAIN,
          [coinsAdded],
          [
            { movements: file, addHeld: true },
            { movements: file, addHeld: again },
          ],
        ).after,
      ).toEqual(['0.7', '0.7']);
  });
});

describe('a one-tap starting amount in the cover', () => {
  // P6: first buy 2 Jul 2026, a starting amount of €1,000, BTC 100 %. Tapped at €82,000, the lump holds 0.01219512 BTC;
  // the file buys 0.0125 BTC for €1,000 on 30 Jun and sells on 10 Jul, which the starting amount reaches.
  const P6 = aPlan({
    firstBuy: date('2026-07-02'),
    startingAmount: money('1000'),
    split: split({ BTC: '100', ETH: '0' }),
  });
  const tap = (day: string, price = '82000') => {
    const prices = { at: NOW, prices: { BTC: { EUR: price }, ETH: { EUR: '2500' } } } as unknown as PriceSnapshot;
    const action = primaryAction(actionsNow(P6, [], date(day)));
    if (action?.kind !== 'lump') throw new Error(`Today leads with ${action?.kind} on ${day}, not lump`);
    const ids = P6.coins.map((coin) => testId(`tap|${day}|${coin.id}`));
    const drafts = oneTapEntries({
      plan: P6,
      action,
      prices,
      today: date(day),
      fee: defaultFee([]),
      ids,
      now: NOW,
      venue: lastVenue([]),
    });
    return drafts.map((draft): Entry => ({ ...draft, units: draft.units as Units }));
  };
  const JUNE = buy('L1', '2026-06-30', '0.0125', '1000');
  const sale = (units_: string, day = '2026-07-10') => sell(`L2-${units_}-${day}`, day, units_, '1010');
  const stored = (entries: readonly Entry[], movements: readonly Movement[]) =>
    planOf(P6, entries, { movements }).entries.some((entry) => entry.kind === 'sell');

  it('the stated cost: the lump counts at its own units, so a sale of the file units it records stays out (pin)', () => {
    for (const day of ['2026-06-30', '2026-07-02', '2026-07-03']) {
      expect(tap(day).map((entry) => entry.units)).toEqual(['0.01219512']);
      for (const units_ of ['0.01219513', '0.01249999', '0.0125'])
        expect(stored(tap(day), [JUNE, sale(units_)])).toBe(false);
      expect(stored(tap(day), [JUNE, sale('0.01219512')])).toBe(true);
    }
    expect(stored(tap('2026-06-30'), [JUNE, sale('0.01250001')])).toBe(false);
    expect(stored(tap('2026-07-02'), [JUNE, sale('0.0125', '2026-07-01')])).toBe(false);
  });

  it("one file or two, the 0.0125 sale stays out; the lump's units changed to the file's import it (pin)", () => {
    const once = walk(P6, tap('2026-06-30'), [{ movements: [JUNE, sale('0.0125')] }]);
    const twice = walk(P6, tap('2026-06-30'), [{ movements: [JUNE] }, { movements: [sale('0.0125')] }]);
    expect([once.after, twice.after]).toEqual([['0.01219512'], ['0.01219512', '0.01219512']]);
    const edited = once.log.map((entry) =>
      entry.kind === 'lump' ? { ...entry, units: units('0.0125'), source: 'manual' as const } : entry,
    );
    const again = walk(P6, edited, [{ movements: [JUNE, sale('0.0125')] }]);
    expect([again.after, sold(again.log), unmatched(again.log)]).toEqual([['0'], 1, '0']);
  });

  it('an estimate above the file units counts at its own: at €78,000, 0.0128 is stored, 0.01282052 is not (pin)', () => {
    const lump = tap('2026-06-30', '78000');
    expect(lump.map((entry) => entry.units)).toEqual(['0.01282051']);
    expect([stored(lump, [JUNE, sale('0.0128')]), stored(lump, [JUNE, sale('0.01282052')])]).toEqual([true, false]);
  });

  it("a prefix without the lump's date moves its claim to 5 Dec; its own units keep both imports' sales out", () => {
    // Seed 13's ETH world: the one-tap lump of 30 counts at its own 0.001 ETH in either import, whichever date it claims,
    // so neither the prefix nor the whole file stores a sale its units do not reach.
    const plan = aPlan({ firstBuy: date('2026-03-15'), startingAmount: money('500') });
    const tapped = anEntry({
      kind: 'lump',
      slot: null,
      coin: ETH,
      date: date('2025-12-04'),
      amount: money('30'),
      units: units('0.001'),
      source: 'one-tap',
    });
    const ether = (ref: string, kind: 'purchase' | 'sale', day: string, figures: [string, string], line: number) =>
      trade(ref, kind, 'ETH', day, { units: figures[0], amount: figures[1], fee: '0' }, line);
    const prefix = {
      movements: [
        ether('E1', 'purchase', '2025-12-05', ['0.55623', '360.50'], 2),
        ether('E2', 'sale', '2026-02-22T10:01:00Z', ['0.49880', '341.50'], 4),
        ether('E3', 'sale', '2026-02-22T10:02:00Z', ['0.41170', '653.50'], 6),
      ],
    };
    const whole = { movements: [...prefix.movements, ether('E4', 'purchase', '2025-12-04', ['0.16378', '674.50'], 8)] };
    const claims = (log: readonly Entry[], file: Import) =>
      planOf(plan, log, file).recorded.flatMap((item) => item.dates);
    const one = walk(plan, [tapped], [prefix, whole]).log;
    const two = walk(plan, [tapped], [whole, prefix]).log;
    const afterPrefix = walk(plan, [tapped], [prefix]).log;
    expect([claims([tapped], whole), claims([tapped], prefix), claims(afterPrefix, whole)]).toEqual([
      ['2025-12-04'],
      ['2025-12-05'],
      ['2025-12-04'],
    ]);
    expect([eth(one), sold(one), eth(two), sold(two)]).toEqual(['0.001', 0, '0.001', 0]);
  });
});
