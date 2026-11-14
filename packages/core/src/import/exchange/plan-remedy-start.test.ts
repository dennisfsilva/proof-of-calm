import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver, type TransactionDraft } from '../../actions/entries';
import { MAX_ENTRIES } from '../../constants';
import { actionsNow, liveEntries, primaryAction } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import { applyExchangeImport } from './apply';
import type { ExchangeFile, Movement } from './kraken';
import { planExchangeImport } from './plan';
import { importRemedies, startingRemedies } from './plan-remedy';

// The starting line's instruction (docs/DOMAIN.md §3.13 step 3, "Lines that ask for a change"): each test makes the
// change as the Log writes it (`saveTransaction`), plans the file again and checks that Invested counts the starting
// amount at most once at every step: before importing, after importing the shown plan, and after a shorter export
// was stored first (one from 1 Aug, and one ending 30 Jun that holds 10 Jun, which step 3 also leaves out).

let line = 2;
const buy = (coin: string, day: string, amount: string, held: string) => {
  line += 2;
  return trade(`S${line}`, 'purchase', coin, day, { units: held, amount, fee: '0' }, line);
};
const [BTC, ETH] = ['BTC' as CoinId, 'ETH' as CoinId];
const hand = (overrides: Partial<Entry>) => anEntry({ source: 'manual', slot: null, ...overrides });
const lump = (day: string, overrides: Partial<Entry> = {}) =>
  hand({ kind: 'lump', coin: BTC, date: date(day), amount: money('1000'), units: units('0.0125'), ...overrides });
const typed = (slot: string, overrides: Partial<Entry> = {}) =>
  hand({
    kind: 'dca',
    coin: BTC,
    slot: month(slot),
    date: date(`${slot}-02`),
    amount: money('100'),
    units: units('0.00125'),
    ...overrides,
  });
const tapped = (slot: string) => typed(slot, { source: 'one-tap' });

type Case = { readonly plan: Plan; readonly file: readonly Movement[]; readonly entries: readonly Entry[] };

const P6 = aPlan({
  firstBuy: date('2026-07-02'),
  startingAmount: money('1000'),
  split: split({ BTC: '100', ETH: '0' }),
});
const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const START = buy('BTC', '2026-06-10', '1000', '0.0125');
const FILE = [START, ...MONTHS.map((slot) => buy('BTC', `${slot}-02`, '100', '0.00125'))];

const planOf = (c: Case, entries: readonly Entry[], file: ExchangeFile = fileOf(c.file)) =>
  planExchangeImport(file, { plan: c.plan, entries }, { venue: null, addHeld: false }, LISBON);
const imported = (c: Case, entries: readonly Entry[], file?: ExchangeFile) =>
  applyExchangeImport(entries, planOf(c, entries, file), NOW).entries;
const on = (movement: Movement) => LISBON.dateOf(movement.at);

/** The Log before importing, after importing the shown plan, and after each shorter export stored first. */
const orders = (c: Case): [string, readonly Entry[]][] => [
  ['before importing', c.entries],
  ['after importing', imported(c, c.entries)],
  ['after an export from 1 Aug', imported(c, c.entries, fileOf(c.file.filter((m) => on(m) >= '2026-08-01')))],
  ['after an export ending 30 Jun', imported(c, c.entries, fileOf(c.file.filter((m) => on(m) <= '2026-06-30')))],
];
const starting = (c: Case, entries: readonly Entry[]) =>
  importRemedies(fileOf(c.file), { plan: c.plan, entries }, false, LISBON).starting;
/** Invested once the preview of the file is imported on `entries`. */
const invested = (c: Case, entries: readonly Entry[]) => portfolio(c.plan, imported(c, entries)).invested;
const lumpsOf = (entries: readonly Entry[]) => liveEntries(entries).filter((entry) => entry.kind === 'lump');
const shapes = (entries: readonly Entry[]) => entries.map(({ updatedAt: _, ...rest }) => JSON.stringify(rest));

type Figures = Partial<Record<string, { readonly amount: string; readonly units: string }>>;
const save = (c: Case, entries: readonly Entry[], draft: TransactionDraft, editing: readonly Entry[]) => {
  const ids = draft.rows.map((_, index) => testId(`typed|${index}`));
  const saved = saveTransaction(draft, { plan: c.plan, entries, editing, ids, now: NOW, source: 'manual' });
  return saved.ok ? storedOver(entries, saved.value) : null;
};
/** Edit entry on the Log's row of lumps, as its form saves it: kind, fee, venue and note kept. */
function edit(c: Case, entries: readonly Entry[], day: string, figures: Figures) {
  const row = lumpsOf(entries);
  const [first] = row as [Entry];
  const rows = row.map((entry) => {
    const typedIn = figures[entry.coin];
    return typedIn === undefined
      ? { coin: entry.coin, entry: entry.id, amount: entry.amount, units: entry.units }
      : { coin: entry.coin, entry: entry.id, amount: money(typedIn.amount), units: units(typedIn.units) };
  });
  const draft = {
    kind: 'lump',
    date: date(day),
    slot: null,
    fee: first.fee,
    note: first.note,
    venue: first.venue,
    rows,
  };
  return save(c, entries, draft as TransactionDraft, row);
}
/** Record a purchase, as the Log's form saves a new one. */
function record(c: Case, entries: readonly Entry[], kind: Entry['kind'], day: string, figures: Figures, slot = '') {
  const rows = Object.entries(figures).map(([coin, typedIn]) => ({
    coin: coin as CoinId,
    amount: money(typedIn?.amount ?? '0'),
    units: units(typedIn?.units ?? '0'),
  }));
  const draft = {
    kind,
    date: date(day),
    slot: slot === '' ? null : month(slot),
    fee: null,
    note: '',
    venue: null,
    rows,
  };
  return save(c, entries, draft as TransactionDraft, []);
}
const recordedBy = (c: Case, entries: readonly Entry[], entry: Entry) =>
  planOf(c, entries).recorded.find((item) => item.entry.id === entry.id)?.dates ?? [];

const TEN_JUNE = { BTC: { amount: '1000', units: '0.0125' } };

describe('the starting line, its instruction', () => {
  const DEFAULTS: Case = { plan: P6, file: FILE, entries: [lump('2026-07-02'), typed('2026-07'), typed('2026-08')] };

  it.each(orders(DEFAULTS))(
    'P6 defaults, %s: change to 10 Jun, then the lump records it and nothing else moves',
    (_, entries) => {
      expect(starting(DEFAULTS, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(DEFAULTS, entries)).toBe('1500');
      const changed = edit(DEFAULTS, entries, '2026-06-10', TEN_JUNE) as Entry[];
      expect(recordedBy(DEFAULTS, changed, lumpsOf(changed)[0] as Entry)).toEqual(['2026-06-10']);
      expect(shapes(planOf(DEFAULTS, changed).entries)).toEqual(shapes(planOf(DEFAULTS, entries).entries));
      expect(planOf(DEFAULTS, changed).startingAmount).toBeNull();
      expect(starting(DEFAULTS, changed)).toBeNull();
      expect(invested(DEFAULTS, changed)).toBe('1500');
    },
  );

  it("P6 defaults, main's words: an extra buy of 10 Jun gives 2,500, a monthly buy for September 2,400, against 1,500", () => {
    const { entries } = DEFAULTS;
    expect(invested(DEFAULTS, record(DEFAULTS, entries, 'extra', '2026-06-10', TEN_JUNE) as Entry[])).toBe('2500');
    const september = record(DEFAULTS, entries, 'dca', '2026-09-10', TEN_JUNE, '2026-09') as Entry[];
    expect(invested(DEFAULTS, september)).toBe('2400');
  });

  const TAPPED: Case = {
    ...DEFAULTS,
    entries: [
      lump('2026-07-02', { source: 'one-tap', units: units('0.01219512') }),
      typed('2026-07'),
      typed('2026-08'),
    ],
  };

  it.each(orders(TAPPED))(
    "P6 tapped, %s: change to 10 Jun, and the file's units make the lump a hand one",
    (_, entries) => {
      expect(starting(TAPPED, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      const changed = edit(TAPPED, entries, '2026-06-10', TEN_JUNE) as Entry[];
      const [saved] = lumpsOf(changed) as [Entry];
      expect([saved.source, recordedBy(TAPPED, changed, saved)]).toEqual(['manual', ['2026-06-10']]);
      expect(starting(TAPPED, changed)).toBeNull();
      expect(invested(TAPPED, changed)).toBe('1500');
    },
  );

  it.each(orders(TAPPED))(
    'P6 tapped, %s: a date-only save keeps the lump one-tap and the line, until R',
    (_, entries) => {
      const changed = edit(TAPPED, entries, '2026-06-10', {}) as Entry[];
      expect(lumpsOf(changed)[0]?.source).toBe('one-tap');
      expect(starting(TAPPED, changed)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(TAPPED, changed)).toBe('1500');
    },
  );

  const UNLOGGED: Case = { plan: P6, file: FILE, entries: [typed('2026-07'), typed('2026-08')] };

  it.each(orders(UNLOGGED))(
    'not in the Log, July and August typed, %s: record on 10 Jun, as Record opens',
    (_, entries) => {
      expect(starting(UNLOGGED, entries)).toEqual({ kind: 'record', date: '2026-06-10' });
      expect(primaryAction(actionsNow(P6, entries, LISBON.today))?.kind).toBe('lump');
      expect(invested(UNLOGGED, entries)).toBe('500');
      const changed = record(UNLOGGED, entries, 'lump', '2026-06-10', TEN_JUNE) as Entry[];
      expect(recordedBy(UNLOGGED, changed, lumpsOf(changed)[0] as Entry)).toEqual(['2026-06-10']);
      expect(starting(UNLOGGED, changed)).toBeNull();
      expect(invested(UNLOGGED, changed)).toBe('1500');
    },
  );

  const NOTHING: Case = { plan: P6, file: FILE, entries: [] };

  it.each(orders(NOTHING))(
    'not in the Log, nothing typed, %s: record on 10 Jun, then 2 Jul stays named',
    (_, entries) => {
      expect(starting(NOTHING, entries)).toEqual({ kind: 'record', date: '2026-06-10' });
      const changed = record(NOTHING, entries, 'lump', '2026-06-10', TEN_JUNE) as Entry[];
      expect(planOf(NOTHING, changed).startingAmount?.items.map((item) => item.date)).toEqual(['2026-07-02']);
      expect(starting(NOTHING, changed)).toBeNull();
      expect(invested(NOTHING, changed)).toBe('1400');
    },
  );

  const LATE: Case = { plan: P6, file: FILE, entries: [lump('2026-08-04'), typed('2026-07')] };

  it.each(orders(LATE))('a hand lump dated 4 Aug, %s: change to 10 Jun, then 2 Aug is August buy', (_, entries) => {
    expect(starting(LATE, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
    expect(invested(LATE, entries)).toBe('1400');
    const changed = edit(LATE, entries, '2026-06-10', TEN_JUNE) as Entry[];
    const august = planOf(LATE, changed).entries.filter((entry) => entry.date === '2026-08-02');
    expect(august.map((entry) => [entry.kind, entry.slot])).toEqual([['dca', '2026-08']]);
    expect(invested(LATE, changed)).toBe('1500');
  });

  const AS_BOUGHT: Case = { plan: P6, file: FILE, entries: [lump('2026-06-10'), tapped('2026-07')] };

  it.each(orders(AS_BOUGHT))('P6 as bought with July tapped, %s: 2 Jul named, no instruction', (_, entries) => {
    expect(planOf(AS_BOUGHT, entries).startingAmount?.items.map((item) => item.date)).toEqual(['2026-07-02']);
    expect(starting(AS_BOUGHT, entries)).toBeNull();
  });

  const KAI: Case = {
    plan: { ...P6, firstBuy: date('2026-03-01') },
    file: [buy('BTC', '2026-03-01', '600', '0.0075'), buy('BTC', '2026-03-01', '400', '0.005')],
    entries: [lump('2026-03-01', { source: 'one-tap' })],
  };

  it.each(orders(KAI).slice(0, 2))(
    'Kai, units equal, %s: both 1 Mar purchases named, no instruction until R',
    (_, entries) => {
      expect(planOf(KAI, entries).startingAmount?.items.map((item) => item.amount)).toEqual(['600', '400']);
      expect(starting(KAI, entries)).toBeNull();
      expect(invested(KAI, entries)).toBe('1000');
    },
  );

  const TWO_PLAN = { ...P6, split: split({ BTC: '70', ETH: '30' }) };
  const pair = (day: string) => [
    lump(day, { amount: money('700'), units: units('0.00875') }),
    lump(day, { coin: ETH, amount: money('300'), units: units('0.1') }),
  ];
  const TWO = (eth: string): Case => ({
    plan: TWO_PLAN,
    file: [
      buy('BTC', '2026-06-10', '700', '0.00875'),
      buy('ETH', eth, '300', '0.1'),
      buy('BTC', '2026-08-02', '70', '0.000875'),
    ],
    entries: pair('2026-07-02'),
  });
  const SAME_DAY = TWO('2026-06-10');

  it.each(orders(SAME_DAY))(
    'two coins in one row the same day, %s: change to 10 Jun, then both recorded',
    (_, entries) => {
      expect(starting(SAME_DAY, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      const figures = { BTC: { amount: '700', units: '0.00875' }, ETH: { amount: '300', units: '0.1' } };
      const changed = edit(SAME_DAY, entries, '2026-06-10', figures) as Entry[];
      for (const entry of lumpsOf(changed)) expect(recordedBy(SAME_DAY, changed, entry)).toEqual(['2026-06-10']);
      expect(invested(SAME_DAY, changed)).toBe('1070');
    },
  );

  it.each(orders(TWO('2026-06-22')))('two coins in one row 12 days apart, %s: no instruction', (_, entries) => {
    expect(starting(TWO('2026-06-22'), entries)).toBeNull();
  });

  it('a row dated 13 Jun claims BTC on 10 Jun and ETH on 16 Jun', () => {
    const c = { ...TWO('2026-06-16'), entries: pair('2026-06-13') };
    const recorded = planOf(c, c.entries).recorded.map((item) => [item.coin, item.dates]);
    expect(recorded).toEqual([
      ['BTC', ['2026-06-10']],
      ['ETH', ['2026-06-16']],
    ]);
    expect(starting(c, c.entries)).toBeNull();
  });

  const PIECES: Case = {
    plan: P6,
    file: [buy('BTC', '2026-06-10', '600', '0.0075'), buy('BTC', '2026-06-20', '400', '0.005'), ...FILE.slice(1)],
    entries: DEFAULTS.entries,
  };

  it.each(orders(PIECES))(
    'pieces of 600 and 400, %s: change on the 600 date, then 20 Jun stays named',
    (_, entries) => {
      expect(starting(PIECES, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      const changed = edit(PIECES, entries, '2026-06-10', { BTC: { amount: '600', units: '0.0075' } }) as Entry[];
      expect(planOf(PIECES, changed).startingAmount?.items.map((item) => item.date)).toEqual(['2026-06-20']);
      expect(starting(PIECES, changed)).toBeNull();
      expect(invested(PIECES, changed)).toBe('1100');
    },
  );

  it("pieces, the counterexample: the lump's date changed and 20 Jun recorded as an extra buy give 1,900", () => {
    const moved = edit(PIECES, PIECES.entries, '2026-06-10', {}) as Entry[];
    const extra = record(PIECES, moved, 'extra', '2026-06-20', { BTC: { amount: '400', units: '0.005' } }) as Entry[];
    expect(invested(PIECES, extra)).toBe('1900');
  });

  const ESTIMATE: Case = { plan: P6, file: FILE, entries: [lump('2026-07-02'), tapped('2026-07')] };

  it.each(orders(ESTIMATE))(
    "the first month's estimate beside 10 Jun, %s: no instruction names 2 Jul",
    (_, entries) => {
      expect(starting(ESTIMATE, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(ESTIMATE, entries)).toBe('1500');
      const changed = edit(ESTIMATE, entries, '2026-06-10', TEN_JUNE) as Entry[];
      expect(starting(ESTIMATE, changed)).toBeNull();
      expect(invested(ESTIMATE, changed)).toBe('1500');
    },
  );

  it("a lump of a coin with no monthly part: d* is compared with 0, the coin's part", () => {
    const eth = (day: string, amount: string) => buy('ETH', day, amount, '0.1');
    const c: Case = { plan: P6, file: [eth('2026-06-10', '1000'), eth('2026-06-20', '40')], entries: [] };
    const atJune = (amount: string) => [lump('2026-07-02', { coin: ETH, amount: money(amount), units: units('0.1') })];
    expect(starting(c, atJune('1000'))).toEqual({ kind: 'change', date: '2026-06-10' });
    expect(starting(c, atJune('100'))).toBeNull();
  });

  it('only July named, nearer the monthly part than the starting amount: no instruction', () => {
    const c: Case = { plan: P6, file: FILE.slice(1), entries: [] };
    expect(planOf(c, []).startingAmount?.items.map((item) => item.date)).toEqual(['2026-07-02']);
    expect(starting(c, [])).toBeNull();
  });

  it('a hand Coins added entry that guards 10 Jun: no record, unless it is at no cost, of fewer units or earlier', () => {
    const held = (overrides: Partial<Entry>) =>
      hand({ kind: 'held', date: date('2026-07-01'), amount: null, units: units('0.02'), ...overrides });
    const withHeld = (entry: Entry) => [...UNLOGGED.entries, entry];
    expect(starting(UNLOGGED, withHeld(held({})))).toBeNull();
    expect(starting(UNLOGGED, withHeld(held({ amount: money('50') })))).toBeNull();
    for (const free of [{ amount: money('0') }, { units: units('0.01') }, { date: date('2026-06-09') }, { coin: ETH }])
      expect(starting(UNLOGGED, withHeld(held(free)))).toEqual({ kind: 'record', date: '2026-06-10' });
  });

  it('an edit the Log refuses, a sale it would leave uncovered: no instruction', () => {
    const sale = hand({ kind: 'sell', date: date('2026-07-05'), amount: money('900'), units: units('0.015') });
    const c: Case = {
      ...DEFAULTS,
      entries: [lump('2026-07-02', { units: units('0.02') }), sale, ...DEFAULTS.entries.slice(1)],
    };
    expect(edit(c, c.entries, '2026-06-10', TEN_JUNE)).toBeNull();
    expect(starting(c, c.entries)).toBeNull();
  });

  it('seven purchases: record on the oldest, 10 Jun, all seven named', () => {
    const later = ['2026-06-20', '2026-06-25', '2026-07-01', '2026-07-02', '2026-07-05', '2026-07-10'];
    const c: Case = { plan: P6, file: [START, ...later.map((day) => buy('BTC', day, '100', '0.00125'))], entries: [] };
    expect(planOf(c, []).startingAmount?.purchases).toBe(7);
    expect(starting(c, [])).toEqual({ kind: 'record', date: '2026-06-10' });
  });

  it('an import refused for too many entries: the line holds before importing, with no second order', () => {
    const filler = Array.from({ length: MAX_ENTRIES - DEFAULTS.entries.length }, (_, index) =>
      anEntry({
        id: testId(`filler|${index}`),
        kind: 'extra',
        slot: null,
        date: date('2020-01-01'),
        source: 'import-csv',
      }),
    );
    const c: Case = { ...DEFAULTS, entries: [...DEFAULTS.entries, ...filler] };
    expect(applyExchangeImport(c.entries, planOf(c, c.entries), NOW).refused?.code).toBe('too-many-entries');
    expect(starting(c, c.entries)).toEqual({ kind: 'change', date: '2026-06-10' });
    const changed = edit(c, c.entries, '2026-06-10', TEN_JUNE) as Entry[];
    expect(recordedBy(c, changed, lumpsOf(changed)[0] as Entry)).toEqual(['2026-06-10']);
    // worst 1.4 s locally with coverage, three full-suite runs (2026-11-14); CI up to 6× slower
  }, 30_000);

  // A trade in another currency is left out under 'currency' (plan.ts), and a coin outside the plan under 'not-in-plan',
  // so neither joins a date group: d* and the figures are the plan currency's purchases of the coin alone.
  const USD = trade('S-usd', 'purchase', 'BTC', '2026-06-10', { units: '0.02', amount: '2000', fee: '0' }, 900, {
    currency: 'USD',
  });
  const XRP = trade('S-xrp', 'purchase', 'XRP', '2026-06-10', { units: '50', amount: '2000', fee: '0' }, 902);
  const EUR = [START, buy('BTC', '2026-06-20', '700', '0.00875')];
  it.each([
    ['the EUR purchases alone', EUR],
    ['a USD and an XRP purchase on 10 Jun beside them', [EUR[0] as Movement, USD, XRP, EUR[1] as Movement]],
  ])('%s: record on 10 Jun, with the EUR figures of 10 Jun', (_, file) => {
    const c: Case = { plan: P6, file, entries: [] };
    expect(planOf(c, []).startingAmount?.items.map((item) => [item.date, item.amount])).toEqual([
      ['2026-06-10', '1000'],
      ['2026-06-20', '700'],
    ]);
    expect(starting(c, [])).toEqual({ kind: 'record', date: '2026-06-10' });
    const [first] = startingRemedies(fileOf(file), { plan: P6, entries: [] }, planOf(c, []), LISBON);
    const change = first?.change([]);
    expect(change?.kind === 'record' && change.draft.rows).toEqual([{ coin: BTC, amount: '1000', units: '0.0125' }]);
    const lumped: Case = { ...c, entries: [lump('2026-07-02')] };
    expect(starting(lumped, lumped.entries)).toEqual({ kind: 'change', date: '2026-06-10' });
    const [edited] = startingRemedies(fileOf(file), lumped, planOf(lumped, lumped.entries), LISBON);
    const figures = edited?.change(lumped.entries);
    const [only] = lumped.entries as [Entry];
    expect(figures?.kind === 'edit' && figures.figures.get(only.id)).toMatchObject({
      amount: '1000',
      units: '0.0125',
    });
  });

  it('a file past IMPORT_REMEDY_MAX_MOVEMENTS plans no instruction', () => {
    const long = Array.from({ length: 515 }, () => buy('BTC', '2026-09-15', '1', '0.00001'));
    expect(starting({ ...NOTHING, file: [...FILE, ...long.slice(1)] }, [])).toEqual({
      kind: 'record',
      date: '2026-06-10',
    });
    expect(starting({ ...NOTHING, file: [...FILE, ...long] }, [])).toBeNull();
  });
});
