import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver, type TransactionDraft } from '../../actions/entries';
import { transactionKey } from '../../log/group';
import { liveEntries } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import { applyExchangeImport } from './apply';
import type { ExchangeFile, Movement } from './kraken';
import { planExchangeImport } from './plan';
import type { EstimateLine } from './plan-lines';
import { importRemedies } from './plan-remedy';

// The estimate line (docs/DOMAIN.md §3.13, "Lines that ask for a change"): each test makes the change the line asks for
// as the Log writes it (`saveTransaction` on the whole row: the purchase's date, the file's cost and units), plans the
// file again and checks what Invested counts: before importing, after importing the shown plan, and after a shorter
// export was stored first. Today is 13 Nov 2026.

let line = 2;
const buy = (coin: string, day: string, amount: string, held: string) => {
  line += 2;
  return trade(`L${line}`, 'purchase', coin, day, { units: held, amount, fee: '0' }, line);
};
const [BTC, ETH] = ['BTC' as CoinId, 'ETH' as CoinId];
const tap = (slot: string, day: string, overrides: Partial<Entry> = {}) =>
  anEntry({
    coin: BTC,
    slot: month(slot),
    date: date(day),
    amount: money('100'),
    units: units('0.0010'),
    source: 'one-tap',
    venue: 'Bitvavo',
    ...overrides,
  });
const hand = (overrides: Partial<Entry>) => anEntry({ source: 'manual', amount: money('100'), ...overrides });

type Case = { readonly plan: Plan; readonly file: readonly Movement[]; readonly entries: readonly Entry[] };
const ONE = aPlan({
  firstBuy: date('2026-03-01'),
  lastBuy: date('2026-12-01'),
  split: split({ BTC: '100', ETH: '0' }),
});
const TWO = aPlan({ firstBuy: date('2026-03-01'), lastBuy: date('2026-12-01') });

const planOf = (c: Case, entries: readonly Entry[], file: ExchangeFile = fileOf(c.file)) =>
  planExchangeImport(file, { plan: c.plan, entries }, { venue: null, addHeld: false }, LISBON);
const imported = (c: Case, entries: readonly Entry[], file?: ExchangeFile) =>
  applyExchangeImport(entries, planOf(c, entries, file), NOW).entries;
const on = (movement: Movement) => LISBON.dateOf(movement.at);
const estimates = (c: Case, entries: readonly Entry[]) =>
  importRemedies(fileOf(c.file), { plan: c.plan, entries }, false, LISBON).estimates;
const invested = (c: Case, entries: readonly Entry[]) => portfolio(c.plan, imported(c, entries)).invested;
const recordedBy = (c: Case, entries: readonly Entry[], id: Entry['id']) =>
  planOf(c, entries).recorded.find((item) => item.entry.id === id)?.dates ?? [];
const shorter = (c: Case, keep: (day: string) => boolean) =>
  imported(c, c.entries, fileOf(c.file.filter((movement) => keep(on(movement)))));
/** A line in short: its estimates' notes, month, date, the added ids and the other month. */
const brief = (each: EstimateLine) => [each.estimates.map((e) => e.note), each.month, each.date, each.other];

type Figures = Partial<Record<string, { readonly amount: string; readonly units: string }>>;
/** Edit entry on the estimate's Log row, as its form saves it: kind, month, fee, venue and note kept. */
function edit(c: Case, entries: readonly Entry[], estimate: Entry, day: string, figures: Figures) {
  const row = liveEntries(entries).filter((entry) => transactionKey(entry) === transactionKey(estimate));
  const [first] = row as [Entry];
  const rows = row.map((entry) => {
    const typedIn = figures[entry.coin];
    return typedIn === undefined
      ? { coin: entry.coin, entry: entry.id, amount: entry.amount, units: entry.units }
      : { coin: entry.coin, entry: entry.id, amount: money(typedIn.amount), units: units(typedIn.units) };
  });
  const draft = {
    kind: 'dca',
    date: date(day),
    slot: first.slot,
    fee: null,
    note: first.note,
    venue: first.venue,
    rows,
  };
  const saved = saveTransaction(draft as TransactionDraft, {
    plan: c.plan,
    entries,
    editing: row,
    ids: row.map((_, index) => testId(`typed|${index}`)),
    now: NOW,
    source: 'manual',
  });
  return saved.ok ? storedOver(entries, saved.value) : null;
}

/** Ana: October tapped late on 10 Nov, November tapped on its day, and October's purchase made on `day`. */
const ana = (day: string): Case => {
  const october = buy('BTC', day, '100', '0.0012');
  return {
    plan: ONE,
    file: [buy('BTC', '2026-09-02', '100', '0.0011'), october, buy('BTC', '2026-11-01', '100', '0.0013')],
    entries: [tap('2026-10', '2026-11-10', { note: 'E' }), tap('2026-11', '2026-11-01', { note: 'N' })],
  };
};
const E = (c: Case) => c.entries[0] as Entry;
const BOUGHT = { BTC: { amount: '100', units: '0.0012' } };

describe('the estimate line', () => {
  describe.each([
    ['Ana*', '2026-10-19'],
    ['Ana**', '2026-10-29'],
    ['Ana***', '2026-10-25'],
  ])('%s, October bought on %s', (_, day) => {
    const c = ana(day);

    it('before importing: the line, and its change records the purchase by October (300, not 400)', () => {
      expect(estimates(c, c.entries).map(brief)).toEqual([[['E'], '2026-10', day, '2026-11']]);
      expect(invested(c, c.entries)).toBe('400');
      const changed = edit(c, c.entries, E(c), day, BOUGHT) as Entry[];
      expect(recordedBy(c, changed, E(c).id)).toEqual([day]);
      expect(planOf(c, changed).entries.map((entry) => [entry.date, entry.slot])).toEqual([
        ['2026-09-02', '2026-09'],
        ['2026-11-01', '2026-11'],
      ]);
      expect(planOf(c, changed).replaced.flatMap((item) => item.estimates.map((e) => e.note))).toEqual(['N']);
      expect([estimates(c, changed), invested(c, changed)]).toEqual([[], '300']);
    });

    it('after importing first: no line, the purchase is stored and 400 stays (not built)', () => {
      const first = imported(c, c.entries);
      expect(liveEntries(first).some((entry) => entry.date === day && entry.source === 'import-csv')).toBe(true);
      expect([estimates(c, first), invested(c, first)]).toEqual([[], '400']);
    });

    it('after an export to 30 Sep: the line, and its change works', () => {
      const first = shorter(c, (each) => each <= '2026-09-30');
      expect(estimates(c, first).map(brief)).toEqual([[['E'], '2026-10', day, '2026-11']]);
      const changed = edit(c, first, E(c), day, BOUGHT) as Entry[];
      expect([recordedBy(c, changed, E(c).id), estimates(c, changed), invested(c, changed)]).toEqual([
        [day],
        [],
        '300',
      ]);
    });

    it('after an export from 13 Oct: no line', () => {
      expect(
        estimates(
          c,
          shorter(c, (each) => each >= '2026-10-13'),
        ),
      ).toEqual([]);
    });
  });

  it("Ana*'s line names the purchase as this import adds it", () => {
    const c = ana('2026-10-19');
    const [only] = estimates(c, c.entries) as [EstimateLine];
    expect([only.estimates, only.added.map((entry) => [entry.id, entry.units, entry.amount])]).toEqual([
      [E(c)],
      [[testId((c.file[1] as Movement).key), '0.0012', '100']],
    ]);
  });

  describe('PLAIN: October tapped 24 Oct, a hand November of 200 on 1 Nov, a hand extra buy of 100 on 22 Oct', () => {
    const c: Case = {
      plan: ONE,
      file: [
        buy('BTC', '2026-10-19', '300', '0.0036'),
        buy('BTC', '2026-10-22', '100', '0.0012'),
        buy('BTC', '2026-11-01', '100', '0.0012'),
      ],
      entries: [
        tap('2026-10', '2026-10-24', { note: 'E' }),
        hand({ slot: month('2026-11'), date: date('2026-11-01'), amount: money('200'), note: 'HN' }),
        hand({ kind: 'extra', slot: null, date: date('2026-10-22'), note: 'R' }),
      ],
    };
    const [, HN, R] = c.entries as [Entry, Entry, Entry];

    it('the line; its change records 19 Oct by E, HN records 22 Oct and 1 Nov, R nothing, nothing added (600)', () => {
      expect(estimates(c, c.entries).map(brief)).toEqual([[['E'], '2026-10', '2026-10-19', '2026-11']]);
      const changed = edit(c, c.entries, E(c), '2026-10-19', { BTC: { amount: '300', units: '0.0036' } }) as Entry[];
      expect([E(c), HN, R].map((entry) => recordedBy(c, changed, entry.id))).toEqual([
        ['2026-10-19'],
        ['2026-10-22', '2026-11-01'],
        [],
      ]);
      expect([planOf(c, changed).entries, estimates(c, changed), invested(c, changed)]).toEqual([[], [], '600']);
    });

    it('the date-only change, the counterexample: nothing is replaced and 19 Oct is recorded only by R (400)', () => {
      const changed = edit(c, c.entries, E(c), '2026-10-19', {}) as Entry[];
      const again = planOf(c, changed);
      expect([again.replaced, recordedBy(c, changed, E(c).id), recordedBy(c, changed, R.id)]).toEqual([
        [],
        [],
        ['2026-10-19'],
      ]);
      expect(invested(c, changed)).toBe('400');
    });
  });

  describe('P3 with June tapped late on 20 Jul and its purchase made on 26 Jun', () => {
    const c: Case = {
      plan: ONE,
      file: [
        buy('BTC', '2026-05-02', '100', '0.0011'),
        buy('BTC', '2026-06-26', '200', '0.0024'),
        buy('BTC', '2026-07-02', '100', '0.0012'),
      ],
      entries: [
        tap('2026-06', '2026-07-20', { note: 'June' }),
        hand({ slot: month('2026-05'), date: date('2026-05-02'), units: units('0.0011'), note: 'May' }),
      ],
    };
    const JUNE = { BTC: { amount: '200', units: '0.0024' } };

    it.each([
      ['before importing', c.entries],
      ['after an export to 31 May', shorter(c, (each) => each <= '2026-05-31')],
    ])('%s: the line, and 26 Jun is recorded by June (400)', (_, entries) => {
      expect(estimates(c, entries).map(brief)).toEqual([[['June'], '2026-06', '2026-06-26', '2026-07']]);
      const changed = edit(c, entries, E(c), '2026-06-26', JUNE) as Entry[];
      expect([recordedBy(c, changed, E(c).id), estimates(c, changed), invested(c, changed)]).toEqual([
        ['2026-06-26'],
        [],
        '400',
      ]);
    });

    it('with an empty Log, and MAY: no line of any month', () => {
      expect(estimates({ ...c, entries: [] }, [])).toEqual([]);
      const may: Case = {
        plan: { ...ONE, firstBuy: date('2026-05-01') },
        file: [buy('BTC', '2026-05-02', '100', '0.0011'), buy('BTC', '2026-06-26', '100', '0.0012')],
        entries: [],
      };
      expect(estimates(may, [])).toEqual([]);
    });
  });

  it.each([
    ['5 Oct', '2026-10-05', true],
    ['16 Oct', '2026-10-16', false],
    ['30 Sep', '2026-09-30', true],
  ])('a live hand monthly buy for October on %s: the line shows (%s) exactly when its change works', (_, day, line) => {
    const base = ana('2026-10-19');
    const c = { ...base, entries: [...base.entries, hand({ slot: month('2026-10'), date: date(day), note: 'H' })] };
    const changed = edit(c, c.entries, E(c), '2026-10-19', BOUGHT) as Entry[];
    const works =
      recordedBy(c, changed, E(c).id).includes(date('2026-10-19')) && planOf(c, changed).entries.length === 2;
    expect([estimates(c, c.entries).length > 0, works]).toEqual([line, line]);
  });

  describe('two coins on one tap', () => {
    const row = (day: string) => [
      tap('2026-10', day, { note: 'B' }),
      tap('2026-10', day, { coin: ETH, amount: money('30'), units: units('0.01'), note: 'Z' }),
    ];
    const BOTH = { BTC: { amount: '70', units: '0.0011' }, ETH: { amount: '30', units: '0.012' } };

    it.each([
      ['24 Oct', '2026-10-24'],
      ['10 Nov', '2026-11-10'],
    ])('BTC bought 19 Oct and ETH 23 Oct, tapped %s: no line', (_, day) => {
      const c: Case = {
        plan: TWO,
        file: [buy('BTC', '2026-10-19', '70', '0.0011'), buy('ETH', '2026-10-23', '30', '0.012')],
        entries: row(day),
      };
      expect(estimates(c, c.entries)).toEqual([]);
    });

    it('both bought 19 Oct: one line names both, and the change records both', () => {
      const c: Case = {
        plan: TWO,
        file: [buy('BTC', '2026-10-19', '70', '0.0011'), buy('ETH', '2026-10-19', '30', '0.012')],
        entries: row('2026-11-10'),
      };
      const [only] = estimates(c, c.entries) as [EstimateLine];
      expect([brief(only), only.added.map((entry) => entry.coin)]).toEqual([
        [['B', 'Z'], '2026-10', '2026-10-19', '2026-11'],
        [BTC, ETH],
      ]);
      const changed = edit(c, c.entries, E(c), '2026-10-19', BOTH) as Entry[];
      const [b, z] = liveEntries(changed) as [Entry, Entry];
      expect([recordedBy(c, changed, b.id), recordedBy(c, changed, z.id), planOf(c, changed).entries]).toEqual([
        ['2026-10-19'],
        ['2026-10-19'],
        [],
      ]);
      expect(invested(c, changed)).toBe('100');
    });

    it('a monthly buy of one coin and an extra buy of the other on that date: no line', () => {
      const c: Case = {
        plan: ONE,
        file: [buy('BTC', '2026-10-19', '70', '0.0011'), buy('ETH', '2026-10-19', '30', '0.012')],
        entries: row('2026-11-10'),
      };
      expect(planOf(c, c.entries).entries.map((entry) => entry.kind)).toEqual(['dca', 'extra']);
      expect(estimates(c, c.entries)).toEqual([]);
    });
  });

  it('extra buys: the purchase after the last month of the plan', () => {
    const base = ana('2026-10-19');
    const c = { ...base, plan: { ...ONE, lastBuy: date('2026-10-01') }, entries: [E(base)] };
    expect(estimates(c, c.entries).map(brief)).toEqual([[['E'], '2026-10', '2026-10-19', null]]);
    const changed = edit(c, c.entries, E(c), '2026-10-19', BOUGHT) as Entry[];
    expect([recordedBy(c, changed, E(c).id), estimates(c, changed)]).toEqual([['2026-10-19'], []]);
  });

  it('no line: two estimates for October, a hand entry in the row, or a month the plan does not hold', () => {
    const base = ana('2026-10-19');
    const twice = { ...base, entries: [...base.entries, tap('2026-10', '2026-11-08', { note: 'E2' })] };
    expect(estimates(twice, twice.entries)).toEqual([]);
    const mixed = { ...base, entries: [...base.entries, hand({ slot: month('2026-10'), date: date('2026-11-10') })] };
    expect(estimates(mixed, mixed.entries)).toEqual([]);
    const lost = { ...base, plan: { ...ONE, firstBuy: date('2026-11-01') } };
    expect(estimates(lost, lost.entries)).toEqual([]);
  });

  it('equal units: the change keeps the estimate one-tap (`savedSource`), so the check decides and shows no line', () => {
    const base = ana('2026-10-19');
    const c = { ...base, entries: [tap('2026-10', '2026-11-10', { note: 'E', units: units('0.0012') }), E(base)] };
    const equal = { ...base, entries: [c.entries[0] as Entry, base.entries[1] as Entry] };
    expect(estimates(equal, equal.entries)).toEqual([]);
    const changed = edit(equal, equal.entries, E(equal), '2026-10-19', BOUGHT) as Entry[];
    expect(liveEntries(changed).map((entry) => entry.source)).toEqual(['one-tap', 'one-tap']);
  });

  // CI's seed 1965070715 of the estimate line's property, in one coin: a Coins added entry of 0.0021 BTC on 15 Oct
  // guards March's late purchase of 0.0021 (step 4), so the sale of 0.00016 on 14 Sep it reaches has no cover (the
  // tap is a one-tap estimate) and stays out. The line's change types the purchase into the tap, which then covers it.
  it('a sale the shown plan leaves out uncovered comes in once the change covers it, as `keepsPromise` allows', () => {
    const sale = trade('S1', 'sale', 'BTC', '2026-09-14', { units: '0.00016', amount: '5', fee: '0' }, 90);
    const held = hand({ kind: 'held', date: date('2026-10-15'), amount: null, units: units('0.0021'), slot: null });
    const c: Case = {
      plan: ONE,
      file: [buy('BTC', '2026-03-17', '100', '0.0021'), sale],
      entries: [tap('2026-03', '2026-03-01'), held],
    };
    const ticked = importRemedies(fileOf(c.file), { plan: c.plan, entries: c.entries }, true, LISBON).estimates;
    expect(ticked.map(brief)).toEqual([[[''], '2026-03', '2026-03-17', '2026-04']]);
    expect(planOf(c, c.entries).uncovered.map((each) => [each.date, each.units])).toEqual([['2026-09-14', '0.00016']]);
    const changed = edit(c, c.entries, E(c), '2026-03-17', { BTC: { amount: '100', units: '0.0021' } }) as Entry[];
    const again = planOf(c, changed);
    expect(recordedBy(c, changed, E(c).id)).toEqual(['2026-03-17']);
    expect([again.uncovered, again.entries.map((entry) => [entry.kind, entry.date, entry.units])]).toEqual([
      [],
      [['sell', '2026-09-14', '0.00016']],
    ]);
  });
});
