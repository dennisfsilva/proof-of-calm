import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, PLAN as PLAN_70_30, testId, trade } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver, type TransactionDraft } from '../../actions/entries';
import { IMPORT_REMEDY_MAX_MOVEMENTS, MAX_ENTRIES } from '../../constants';
import type { Units } from '../../money/decimal';
import { defaultFee, lastVenue, oneTapEntries } from '../../plan/parts';
import { actionsNow, liveEntries, primaryAction } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { PriceSnapshot } from '../../schema/prices';
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
    'P6 tapped, %s: a date-only save keeps the units estimated, and the one-tap lump records 10 Jun',
    (_, entries) => {
      const changed = edit(TAPPED, entries, '2026-06-10', {}) as Entry[];
      const [saved] = lumpsOf(changed) as [Entry];
      expect([saved.source, saved.units, recordedBy(TAPPED, changed, saved)]).toEqual([
        'one-tap',
        '0.01219512',
        ['2026-06-10'],
      ]);
      expect(planOf(TAPPED, changed).startingAmount).toBeNull();
      expect(starting(TAPPED, changed)).toBeNull();
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

  it.each(orders(LATE))(
    'a hand lump dated 4 Aug, %s: 2 Aug is August buy, 1,500; change to 10 Jun keeps it',
    (_, entries) => {
      expect(starting(LATE, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(LATE, entries)).toBe('1500');
      const changed = edit(LATE, entries, '2026-06-10', TEN_JUNE) as Entry[];
      const august = liveEntries(imported(LATE, changed)).filter((entry) => entry.date === '2026-08-02');
      expect(august.map((entry) => [entry.kind, entry.slot])).toEqual([['dca', '2026-08']]);
      expect(invested(LATE, changed)).toBe('1500');
    },
  );

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

  it.each(orders(KAI))(
    'Kai, units equal, %s: the one-tap lump records both 1 Mar purchases, no starting line',
    (_, entries) => {
      const [tap] = lumpsOf(entries) as [Entry];
      expect(recordedBy(KAI, entries, tap)).toEqual(['2026-03-01']);
      expect(planOf(KAI, entries).startingAmount).toBeNull();
      expect(starting(KAI, entries)).toBeNull();
      expect(invested(KAI, entries)).toBe('1000');
    },
  );

  // Rule R (docs/DOMAIN.md §3.13 step 2): a live one-tap lump claims within 3 days of its date and is never replaced.
  const JULY_20: Case = {
    plan: P6,
    file: [
      buy('BTC', '2026-07-02', '100', '0.00125'),
      buy('BTC', '2026-07-20', '1000', '0.0125'),
      buy('BTC', '2026-08-02', '100', '0.00125'),
    ],
    entries: [lump('2026-07-20', { source: 'one-tap' }), typed('2026-07'), typed('2026-08')],
  };

  it.each(orders(JULY_20))(
    'tapped on the day bought, 20 Jul, %s: the lump records it, nothing added for it, 1,200 not 2,200',
    (_, entries) => {
      const [tap] = lumpsOf(entries) as [Entry];
      expect(recordedBy(JULY_20, entries, tap)).toEqual(['2026-07-20']);
      expect(planOf(JULY_20, entries).entries.filter((entry) => entry.date === '2026-07-20')).toEqual([]);
      expect(starting(JULY_20, entries)).toBeNull();
      expect(invested(JULY_20, entries)).toBe('1200');
    },
  );

  const BOTH_TAPPED: Case = {
    plan: P6,
    file: FILE,
    entries: [lump('2026-07-02', { source: 'one-tap', units: units('0.01219512') }), tapped('2026-07')],
  };

  it.each(orders(BOTH_TAPPED))(
    'lump and July tapped on 2 Jul, %s: the lump records nothing, 2 Jul named beside 10 Jun; after the change, 2 Jul',
    (_, entries) => {
      const [tap] = lumpsOf(entries) as [Entry];
      expect(recordedBy(BOTH_TAPPED, entries, tap)).toEqual([]);
      const named = planOf(BOTH_TAPPED, entries).startingAmount?.items.map((item) => item.date);
      expect(named).toEqual(['2026-06-10', '2026-07-02']);
      expect(starting(BOTH_TAPPED, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(BOTH_TAPPED, entries)).toBe('1500');
      const changed = edit(BOTH_TAPPED, entries, '2026-06-10', TEN_JUNE) as Entry[];
      expect(recordedBy(BOTH_TAPPED, changed, lumpsOf(changed)[0] as Entry)).toEqual(['2026-06-10']);
      expect(planOf(BOTH_TAPPED, changed).startingAmount?.items.map((item) => item.date)).toEqual(['2026-07-02']);
      const july = liveEntries(imported(BOTH_TAPPED, changed)).filter((entry) => entry.slot === '2026-07');
      expect(july.map((entry) => entry.source)).toEqual(['one-tap']);
      expect(starting(BOTH_TAPPED, changed)).toBeNull();
      expect(invested(BOTH_TAPPED, changed)).toBe('1500');
    },
  );

  const TAPPED_LATE: Case = { ...LATE, entries: [lump('2026-08-04', { source: 'one-tap' }), typed('2026-07')] };

  it.each(orders(TAPPED_LATE))(
    'a one-tap lump tapped 4 Aug, %s: 2 Aug is August buy, 1,500; the change to 10 Jun keeps it',
    (_, entries) => {
      expect(starting(TAPPED_LATE, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(TAPPED_LATE, entries)).toBe('1500');
      const changed = edit(TAPPED_LATE, entries, '2026-06-10', TEN_JUNE) as Entry[];
      const august = liveEntries(imported(TAPPED_LATE, changed)).filter((entry) => entry.date === '2026-08-02');
      expect(august.map((entry) => [entry.kind, entry.slot])).toEqual([['dca', '2026-08']]);
      expect(invested(TAPPED_LATE, changed)).toBe('1500');
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
    const long = Array.from({ length: IMPORT_REMEDY_MAX_MOVEMENTS + 1 - FILE.length }, () =>
      buy('BTC', '2026-09-15', '1', '0.00001'),
    );
    expect(starting({ ...NOTHING, file: [...FILE, ...long.slice(1)] }, [])).toEqual({
      kind: 'record',
      date: '2026-06-10',
    });
    expect(starting({ ...NOTHING, file: [...FILE, ...long] }, [])).toBeNull();
  });
});

// A `lump`'s claim in step 2 (docs/DOMAIN.md §3.13): only a date whose amount, stored purchases included, is at least as
// near the lump's amount as the coin's monthly part. Taps are made as Today makes them, typed lumps as the Log saves them.
describe("a lump's claim reads its amount", () => {
  const PRICES = { at: NOW, prices: { BTC: { EUR: '82000' }, ETH: { EUR: '2500' } } } as unknown as PriceSnapshot;
  /** Today's tap on `day`, as today/actions.ts records it: the action Today leads with, which must be `kind`. */
  const tap = (plan: Plan, entries: readonly Entry[], day: string, kind: Entry['kind'] = 'lump') => {
    const action = primaryAction(actionsNow(plan, entries, date(day)));
    if (action?.kind !== kind) throw new Error(`Today leads with ${action?.kind} on ${day}, not ${kind}`);
    const live = liveEntries(entries);
    const ids = plan.coins.map((coin) => testId(`tap|${day}|${entries.length}|${coin.id}`));
    const drafts = oneTapEntries({
      plan,
      action,
      prices: PRICES,
      today: date(day),
      fee: defaultFee(live),
      ids,
      now: NOW,
      venue: lastVenue(live),
    });
    return [...entries, ...drafts.map((draft): Entry => ({ ...draft, units: draft.units as Units }))];
  };
  const LATE_PRICE = { BTC: { amount: '1000', units: '0.01219512' } };
  const M = FILE.slice(1);
  const L = [...M, buy('BTC', '2026-09-03', '1000', '0.0125')];
  const of = (file: readonly Movement[], entries: readonly Entry[], plan = P6): Case => ({ plan, file, entries });
  /** A starting amount typed on `day` with the day's price, as the Log saves it. */
  const typedLump = (file: readonly Movement[], day: string) =>
    record(of(file, []), [], 'lump', day, LATE_PRICE) as Entry[];
  const lateOrders = (c: Case): [string, readonly Entry[]][] => [
    ...orders(c),
    [
      'after the last 3 months, from 13 Aug',
      imported(c, c.entries, fileOf(c.file.filter((m) => on(m) >= '2026-08-13'))),
    ],
  ];
  /** The file's purchases of `day` in the Log once the file is imported on `entries`, as [kind, slot]. */
  const fromFile = (c: Case, entries: readonly Entry[], day: string) =>
    liveEntries(imported(c, entries))
      .filter((entry) => entry.date === day && entry.source === 'import-csv')
      .map((entry) => [entry.kind, entry.slot]);
  const named = (c: Case, entries: readonly Entry[]) =>
    planOf(c, entries).startingAmount?.items.map((item) => item.date) ?? [];

  for (const day of ['2026-09-02', '2026-09-05']) {
    const c = of(M, tap(P6, [], day));
    it.each(lateOrders(c))(`tapped ${day}, file M, %s: 2 Sep is September's buy, 2 Jul named, 1,400`, (_, entries) => {
      expect(recordedBy(c, entries, lumpsOf(entries)[0] as Entry)).toEqual([]);
      expect(fromFile(c, entries, '2026-09-02')).toEqual([['dca', '2026-09']]);
      expect(named(c, entries)).toEqual(['2026-07-02']);
      expect(starting(c, entries)).toBeNull();
      expect(invested(c, entries)).toBe('1400');
    });
  }

  const CATCH_UP = of(M, tap(P6, tap(P6, [typed('2026-07'), typed('2026-08')], '2026-09-02'), '2026-09-02', 'dca'));

  it.each(lateOrders(CATCH_UP))(
    'July and August typed, the lump and September tapped 2 Sep, %s: 2 Sep replaces the estimate, 1,500',
    (_, entries) => {
      const september = liveEntries(imported(CATCH_UP, entries)).filter((entry) => entry.slot === '2026-09');
      expect(september.map((entry) => entry.source)).toEqual(['import-csv']);
      expect(invested(CATCH_UP, entries)).toBe('1500');
    },
  );

  it("July and August typed, the lump and September tapped 2 Sep: `replaced` holds September's estimate", () => {
    const estimate = CATCH_UP.entries.find((entry) => entry.source === 'one-tap' && entry.kind === 'dca');
    expect(planOf(CATCH_UP, CATCH_UP.entries).replaced.flatMap((each) => each.estimates)).toEqual([estimate]);
  });

  const TYPED_2_SEP = of(M, typedLump(M, '2026-09-02'));

  it.each(lateOrders(TYPED_2_SEP))(
    'a hand lump typed 2 Sep, file M, %s: 2 Sep is September buy, 1,400',
    (_, entries) => {
      expect(fromFile(TYPED_2_SEP, entries, '2026-09-02')).toEqual([['dca', '2026-09']]);
      expect(invested(TYPED_2_SEP, entries)).toBe('1400');
    },
  );

  const S_TAPPED = of(FILE, tap(P6, [], '2026-09-02'));

  it.each(lateOrders(S_TAPPED))(
    'tapped 2 Sep, file S, %s: 1,400, and the change to 10 Jun keeps 1,400',
    (_, entries) => {
      expect(starting(S_TAPPED, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
      expect(invested(S_TAPPED, entries)).toBe('1400');
      const changed = edit(S_TAPPED, entries, '2026-06-10', TEN_JUNE) as Entry[];
      expect(starting(S_TAPPED, changed)).toBeNull();
      expect(invested(S_TAPPED, changed)).toBe('1400');
    },
  );

  for (const day of ['2026-09-02', '2026-09-05']) {
    const c = of(L, tap(P6, [], day));
    it.each(lateOrders(c))(
      `tapped ${day}, file L, %s: the lump records 3 Sep, 2 Sep is September's, 1,400`,
      (_, entries) => {
        expect(recordedBy(c, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-09-03']);
        expect(fromFile(c, entries, '2026-09-02')).toEqual([['dca', '2026-09']]);
        expect(invested(c, entries)).toBe('1400');
      },
    );
  }

  const TWO_COINS = (() => {
    const plan = { ...P6, split: split({ BTC: '70', ETH: '30' }) };
    const file = MONTHS.flatMap((slot) => [
      buy('BTC', `${slot}-02`, '70', '0.000875'),
      buy('ETH', `${slot}-02`, '30', '0.012'),
    ]);
    return of(file, tap(plan, [], '2026-09-02'), plan);
  })();

  it.each(lateOrders(TWO_COINS))(
    'two coins in one row tapped 2 Sep, %s: both 2 Sep buys added, 1,400',
    (_, entries) => {
      expect(fromFile(TWO_COINS, entries, '2026-09-02')).toEqual([
        ['dca', '2026-09'],
        ['dca', '2026-09'],
      ]);
      expect(invested(TWO_COINS, entries)).toBe('1400');
    },
  );

  for (const [title, file, total] of [
    ['M', M, '1400'],
    ['L, the 3-day reach', L, '2400'],
  ] as const) {
    const c = of(file, typedLump(file, '2026-11-14'));
    it.each(orders(c))(`a hand lump typed 14 Nov, file ${title}, %s: ${total}`, (_, entries) => {
      expect(invested(c, entries)).toBe(total);
    });
  }

  const S_14_NOV = of(FILE, typedLump(FILE, '2026-11-14'));

  it.each(orders(S_14_NOV))('a hand lump typed 14 Nov, file S, %s: change to 10 Jun, then 1,400', (_, entries) => {
    expect(starting(S_14_NOV, entries)).toEqual({ kind: 'change', date: '2026-06-10' });
    expect(invested(S_14_NOV, edit(S_14_NOV, entries, '2026-06-10', TEN_JUNE) as Entry[])).toBe('1400');
  });

  // The prices of the rule, stated in step 2.
  const W1 = (() => {
    const file = [...M, buy('BTC', '2026-09-03', '500', '0.00625'), buy('BTC', '2026-09-04', '500', '0.00625')];
    return of(file, typedLump(file, '2026-09-03'));
  })();

  it.each(orders(W1))(
    'W1, a late starting purchase in two pieces, %s: both imported beside the lump, 2,400',
    (_, entries) => {
      expect(recordedBy(W1, entries, lumpsOf(entries)[0] as Entry)).toEqual([]);
      expect(invested(W1, entries)).toBe('2400');
    },
  );

  const W2 = (() => {
    const fills = [
      buy('BTC', '2026-09-03T09:00:00Z', '300', '0.00375'),
      buy('BTC', '2026-09-03T15:00:00Z', '700', '0.00875'),
    ];
    return of([...M, ...fills], tap(P6, [], '2026-09-03'));
  })();

  it("W2, an export cut inside the lump's date: one import gives 1,400, the cut first then the file 1,700", () => {
    expect(invested(W2, W2.entries)).toBe('1400');
    const cut = imported(W2, W2.entries, fileOf(W2.file.filter((m) => m.at < '2026-09-03T12:00:00Z')));
    expect(invested(W2, cut)).toBe('1700');
  });

  // DOMAIN §3.13 step 2's one exception covers a cut on either side of the lump's date: an export that begins inside
  // it, or begins and ends inside it, stores the part it holds when that part alone is nearer the monthly part, and
  // the whole file's lump then claims the date, so that part counts twice.
  it("W2, an export that begins inside the lump's date: one import gives 1,400, the cut first then the file 1,700", () => {
    const fills = [
      buy('BTC', '2026-09-03T09:00:00Z', '700', '0.00875'),
      buy('BTC', '2026-09-03T15:00:00Z', '300', '0.00375'),
    ];
    const c = of([...M, ...fills], tap(P6, [], '2026-09-03'));
    expect(invested(c, c.entries)).toBe('1400');
    const cut = imported(c, c.entries, fileOf(c.file.filter((m) => m.at > '2026-09-03T12:00:00Z')));
    expect(invested(c, cut)).toBe('1700');
  });

  it("W2, an export that begins and ends inside the lump's date: one import gives 1,400, the slice first 1,700", () => {
    const fills = [
      buy('BTC', '2026-09-03T08:00:00Z', '600', '0.0075'),
      buy('BTC', '2026-09-03T12:00:00Z', '300', '0.00375'),
      buy('BTC', '2026-09-03T16:00:00Z', '100', '0.00125'),
    ];
    const c = of([...M, ...fills], tap(P6, [], '2026-09-03'));
    expect(invested(c, c.entries)).toBe('1400');
    const inside = (m: Movement) => m.at > '2026-09-03T10:00:00Z' && m.at < '2026-09-03T14:00:00Z';
    const cut = imported(c, c.entries, fileOf(c.file.filter(inside)));
    expect(invested(c, cut)).toBe('1700');
  });

  it("W2, the audit's shrunk world: a prefix stores 1 Apr's €30, then the lump claims the rest and €30 counts twice", () => {
    const eth = (at: string, amount: string) => buy('ETH', at, amount, '0.01');
    const file = [
      eth('2026-04-01T10:00:00Z', '30'),
      eth('2026-04-01T08:00:00Z', '100'),
      eth('2026-04-01T16:00:00Z', '900'),
    ];
    const c = of(file, [lump('2026-04-01', { coin: ETH, source: 'one-tap', units: units('0.4') })], PLAN_70_30);
    expect(invested(c, c.entries)).toBe('1000');
    const prefix = imported(c, c.entries, fileOf(file.slice(0, 1)));
    expect(recordedBy(c, prefix, c.entries[0] as Entry)).toEqual(['2026-04-01']);
    expect(invested(c, prefix)).toBe('1030');
  });

  const BELOW = (() => {
    const plan = { ...P6, startingAmount: money('100'), monthlyAmount: money('500') };
    const file = [
      ...MONTHS.map((slot) => buy('BTC', `${slot}-02`, '500', '0.00625')),
      buy('BTC', '2026-09-02', '100', '0.00125'),
    ];
    const typedIn = record(of(file, [], plan), [], 'lump', '2026-09-02', {
      BTC: { amount: '100', units: '0.00121951' },
    });
    return of(file, typedIn as Entry[], plan);
  })();

  it.each(orders(BELOW))(
    'a starting amount below the monthly part on a buy day, %s: both imported, 2,200',
    (_, entries) => {
      expect(recordedBy(BELOW, entries, lumpsOf(entries)[0] as Entry)).toEqual([]);
      expect(invested(BELOW, entries)).toBe('2200');
    },
  );

  const MIXED = (() => {
    const file = [...M, buy('BTC', '2026-09-02', '600', '0.0075')];
    return of(
      file,
      record(of(file, []), [], 'lump', '2026-09-02', { BTC: { amount: '600', units: '0.0075' } }) as Entry[],
    );
  })();

  it.each(orders(MIXED))(
    "the mixed date, a lump of 600 beside 2 Sep's buy, %s: claimed, 900 as on main",
    (_, entries) => {
      expect(recordedBy(MIXED, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-09-02']);
      expect(invested(MIXED, entries)).toBe('900');
    },
  );

  const CATCH_UP_ALL = (() => {
    let entries = tap(P6, [], '2026-09-02');
    for (const _ of ['2026-07', '2026-08', '2026-09']) entries = tap(P6, entries, '2026-09-02', 'dca');
    return of(M, entries);
  })();

  it.each(lateOrders(CATCH_UP_ALL))(
    'catch-up on 2 Sep, the lump then three months, %s: 2 Sep is July buy, 1,500',
    (_, entries) => {
      expect(fromFile(CATCH_UP_ALL, entries, '2026-09-02')).toEqual([['dca', '2026-07']]);
      const september = liveEntries(imported(CATCH_UP_ALL, entries)).filter((entry) => entry.slot === '2026-09');
      expect(september.map((entry) => entry.source)).toEqual(['one-tap']);
      expect(invested(CATCH_UP_ALL, entries)).toBe('1500');
    },
  );

  const KAI_ALONE = (() => {
    const plan = { ...P6, firstBuy: date('2026-03-01'), startingAmount: money('500'), monthlyAmount: money('70') };
    const later = ['04', '05', '06', '07', '08', '09', '10', '11'].map((m) =>
      buy('BTC', `2026-${m}-01`, '70', '0.000875'),
    );
    const file = [buy('BTC', '2026-03-01', '500', '0.00609756'), buy('BTC', '2026-03-01', '70', '0.000875'), ...later];
    return of(file, tap(plan, [], '2026-03-01'), plan);
  })();

  it.each(orders(KAI_ALONE))(
    'Kai alone, tapped 1 Mar, %s: the lump records both 1 Mar purchases, 1,060',
    (_, entries) => {
      expect(recordedBy(KAI_ALONE, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-03-01']);
      expect(invested(KAI_ALONE, entries)).toBe('1060');
    },
  );

  const L_20_SEP = of(L, tap(P6, [], '2026-09-20'));

  it.each(lateOrders(L_20_SEP))('file L, a lump tapped 20 Sep, %s: 2,400, the 3-day reach', (_, entries) => {
    expect(invested(L_20_SEP, entries)).toBe('2400');
  });
});
