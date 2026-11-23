import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { added, LISBON, NOW, PLAN as PLAN_70_30, testId, trade } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver, type TransactionDraft } from '../../actions/entries';
import { IMPORT_REMEDY_MAX_MOVEMENTS, MAX_ENTRIES } from '../../constants';
import { addDays, type CalendarDate } from '../../dates/calendar';
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

const TEN_JUNE = { BTC: { amount: '1000', units: '0.0125' } };
type Total = readonly [coin: string, amount: string, units: string, count: number];
/** The starting line's instruction with each coin's purchases on its date, summed (`totals`). */
const instruction = (kind: 'change' | 'record', day: string, ...totals: Total[]) => ({
  kind,
  date: day,
  totals: totals.map(([coin, amount, units, count]) => ({ coin, amount, units, count })),
});
const JUNE_10: Total = ['BTC', '1000', '0.0125', 1];

describe('the starting line, its instruction', () => {
  const DEFAULTS: Case = { plan: P6, file: FILE, entries: [lump('2026-07-02'), typed('2026-07'), typed('2026-08')] };

  it.each(orders(DEFAULTS))(
    'P6 defaults, %s: change to 10 Jun, then the lump records it and nothing else moves',
    (_, entries) => {
      expect(starting(DEFAULTS, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
      expect(starting(TAPPED, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
      expect(starting(UNLOGGED, entries)).toEqual(instruction('record', '2026-06-10', JUNE_10));
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
      expect(starting(NOTHING, entries)).toEqual(instruction('record', '2026-06-10', JUNE_10));
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
      expect(starting(LATE, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
      expect(starting(BOTH_TAPPED, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
      expect(starting(TAPPED_LATE, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
      expect(starting(SAME_DAY, entries)).toEqual(
        instruction('change', '2026-06-10', ['BTC', '700', '0.00875', 1], ['ETH', '300', '0.1', 1]),
      );
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
      expect(starting(PIECES, entries)).toEqual(instruction('change', '2026-06-10', ['BTC', '600', '0.0075', 1]));
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
      expect(starting(ESTIMATE, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
    expect(starting(c, atJune('1000'))).toEqual(instruction('change', '2026-06-10', ['ETH', '1000', '0.1', 1]));
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
      expect(starting(UNLOGGED, withHeld(held(free)))).toEqual(instruction('record', '2026-06-10', JUNE_10));
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
    expect(starting(c, [])).toEqual(instruction('record', '2026-06-10', JUNE_10));
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
    expect(starting(c, c.entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
    expect(starting(c, [])).toEqual(instruction('record', '2026-06-10', JUNE_10));
    const [first] = startingRemedies(fileOf(file), { plan: P6, entries: [] }, planOf(c, []), LISBON);
    const change = first?.change([]);
    expect(change?.kind === 'record' && change.draft.rows).toEqual([{ coin: BTC, amount: '1000', units: '0.0125' }]);
    const lumped: Case = { ...c, entries: [lump('2026-07-02')] };
    expect(starting(lumped, lumped.entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
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
    const longest = { ...NOTHING, file: [...FILE, ...long.slice(1)] };
    expect(starting(longest, [])).toEqual(instruction('record', '2026-06-10', JUNE_10));
    expect(starting({ ...NOTHING, file: [...FILE, ...long] }, [])).toBeNull();
  });
});

// A `lump`'s claim in step 2 (docs/DOMAIN.md §3.13): only a date whose amount, stored purchases included, is at least as
// near the lump's amount as the coin's monthly part. Taps are made as Today makes them, typed lumps as the Log saves them.
describe("a lump's claim reads its amount", () => {
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
      expect(starting(S_TAPPED, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
      expect(invested(S_TAPPED, entries)).toBe('1400');
      const changed = edit(S_TAPPED, entries, '2026-06-10', TEN_JUNE) as Entry[];
      expect(starting(S_TAPPED, changed)).toBeNull();
      expect(invested(S_TAPPED, changed)).toBe('1400');
    },
  );

  for (const day of ['2026-09-02', '2026-09-03', '2026-09-05']) {
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
    expect(starting(S_14_NOV, entries)).toEqual(instruction('change', '2026-06-10', JUNE_10));
    expect(invested(S_14_NOV, edit(S_14_NOV, entries, '2026-06-10', TEN_JUNE) as Entry[])).toBe('1400');
  });

  // Every tap day Today offers the starting amount, 2 Jul to 13 Nov: file M's buy days hold 100, under the square root
  // of 1,000 x 100, so the lump records none; file L's 3 Sep is recorded from 31 Aug to 6 Sep and imported beside the
  // lump on the other 128 days (the 3-day reach, step 2's price).
  it('P6 on each of the 135 tap days, one import: file M 1,400 on all, file L 1,400 on 31 Aug to 6 Sep, else 2,400', () => {
    const days = Array.from({ length: 135 }, (_, index) => addDays(date('2026-07-02'), index));
    const tappedOn = (file: readonly Movement[]) => (day: CalendarDate) => invested(of(file, []), tap(P6, [], day));
    expect(days.filter((day) => tappedOn(M)(day) !== '1400')).toEqual([]);
    const late = days.filter((day) => tappedOn(L)(day) !== '1400');
    expect(late.map(tappedOn(L))).toEqual(late.map(() => '2400'));
    expect(late).toHaveLength(128);
    expect(days.filter((day) => !late.includes(day))).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });

  // The prices of the rule, stated in step 2. W1: both pieces are as near the lump's 1,000 as the monthly part, as a
  // ratio (500 x 500 is at least 1,000 x 100), so the walk records 3 Sep, then 4 Sep, which brings the sum to 1,000.
  const W1_FILE = [...M, buy('BTC', '2026-09-03', '500', '0.00625'), buy('BTC', '2026-09-04', '500', '0.00625')];
  const W1 = of(W1_FILE, typedLump(W1_FILE, '2026-09-03'));

  it.each(orders(W1))(
    'W1, a late starting purchase in two pieces, %s: the lump records both dates, 1,400',
    (_, entries) => {
      expect(recordedBy(W1, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-09-03', '2026-09-04']);
      expect(invested(W1, entries)).toBe('1400');
    },
  );

  for (const day of ['2026-09-03', '2026-09-04', '2026-09-06']) {
    const c = of(W1_FILE, tap(P6, [], day));
    it.each(orders(c))(`W1 tapped ${day}, %s: the lump records 3 and 4 Sep, 1,400`, (_, entries) => {
      expect(recordedBy(c, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-09-03', '2026-09-04']);
      expect(invested(c, entries)).toBe('1400');
    });
  }

  // W1's edge days: the walk reaches one piece from 31 Aug and 7 Sep, none from 30 Aug and 8 Sep.
  for (const [day, total] of [
    ['2026-08-30', '2400'],
    ['2026-08-31', '1900'],
    ['2026-09-07', '1900'],
    ['2026-09-08', '2400'],
  ] as const) {
    const c = of(W1_FILE, typedLump(W1_FILE, day));
    it.each(orders(c))(`W1 with the lump typed ${day}, %s: ${total}`, (_, entries) => {
      expect(invested(c, entries)).toBe(total);
    });
  }

  // Step 2's price (a): a purchase of at least the square root of A x p (316.23 EUR for P6) and below (A + p) / 2
  // within 3 days counts as starting money, and a date's purchases are claimed together: 2 Sep's 400 catch-up and its
  // 100 buy are recorded with the lump, 1,300 against 1,800.
  for (const [catchUp, total] of [
    ['400', '1300'],
    ['600', '1300'],
  ] as const) {
    const c = of([...M, buy('BTC', '2026-09-02', catchUp, '0.005')], tap(P6, [], '2026-09-02'));
    it.each(lateOrders(c))(`a ${catchUp} EUR catch-up bought 2 Sep, tapped 2 Sep, %s: ${total}`, (_, entries) => {
      expect(recordedBy(c, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-09-02']);
      expect(fromFile(c, entries, '2026-09-02')).toEqual([]);
      expect(invested(c, entries)).toBe(total);
    });
  }

  // Step 2's price (b): a starting amount below the part, bought on a buy day, is imported with that day's buy.
  const FIFTY = (() => {
    const plan = { ...P6, startingAmount: money('50') };
    return of([...M, buy('BTC', '2026-09-02', '50', '0.000625')], tap(plan, [], '2026-09-02'), plan);
  })();

  it.each(lateOrders(FIFTY))(
    'a starting 50 beside 2 Sep buy of 100, tapped 2 Sep, %s: both imported, 500',
    (_, entries) => {
      expect(recordedBy(FIFTY, entries, lumpsOf(entries)[0] as Entry)).toEqual([]);
      expect(invested(FIFTY, entries)).toBe('500');
    },
  );

  // Step 2's price (d): claims are per date, so a starting purchase on a buy day's date takes that day's buy with it.
  const ON_BUY_DAY = of([...M, buy('BTC', '2026-09-02', '1000', '0.0125')], tap(P6, [], '2026-09-02'));

  it.each(lateOrders(ON_BUY_DAY))(
    "the starting 1,000 bought 2 Sep beside 2 Sep's buy, tapped 2 Sep, %s: both recorded, 1,300",
    (_, entries) => {
      expect(recordedBy(ON_BUY_DAY, entries, lumpsOf(entries)[0] as Entry)).toEqual(['2026-09-02']);
      expect(fromFile(ON_BUY_DAY, entries, '2026-09-02')).toEqual([]);
      expect(invested(ON_BUY_DAY, entries)).toBe('1300');
    },
  );

  // Step 2's order: every hand monthly buy claims before a lump, one whose month has no date too. August's typed 400
  // of 2 Sep falls back to 2 Sep, so the lump of 1 Sep walks to 4 Sep alone and 5 Sep is September's buy.
  const AUGUST_FIRST = of(
    [
      buy('BTC', '2026-07-02', '100', '0.00125'),
      buy('BTC', '2026-09-02', '400', '0.005'),
      buy('BTC', '2026-09-04', '1000', '0.0125'),
      ...['2026-09-05', '2026-10-02', '2026-11-02'].map((day) => buy('BTC', day, '100', '0.00125')),
    ],
    [lump('2026-09-01'), typed('2026-08', { date: date('2026-09-02'), amount: money('400'), units: units('0.005') })],
  );

  it('a typed August buy of 2 Sep with no August date claims before the lump of 1 Sep, in one import', () => {
    const [theLump, august] = AUGUST_FIRST.entries as [Entry, Entry];
    expect(recordedBy(AUGUST_FIRST, AUGUST_FIRST.entries, august)).toEqual(['2026-09-02']);
    expect(recordedBy(AUGUST_FIRST, AUGUST_FIRST.entries, theLump)).toEqual(['2026-09-04']);
    expect(fromFile(AUGUST_FIRST, AUGUST_FIRST.entries, '2026-09-05')).toEqual([['dca', '2026-09']]);
  });

  it.each(lateOrders(AUGUST_FIRST))(
    'a typed August buy of 2 Sep and a lump of 1 Sep, %s: August claims first, 1,700',
    (_, entries) => {
      expect(invested(AUGUST_FIRST, entries)).toBe('1700');
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

  // Above the part, DOMAIN §3.13 step 2's exception (W2) covers either side of the lump's date: an export that begins
  // inside it, or begins and ends inside it, stores the part it holds when that part alone is nearer the monthly part,
  // and the whole file's lump then claims the date, so that part counts twice.
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

  // Above the monthly part, a cut changes the claim only when the whole file's lump claims the cut date (W2).
  it("above the part, a cut inside a date the whole file's lump passes over: 2,400 either way", () => {
    const fills = [
      buy('BTC', '2026-09-03', '1000', '0.0125'),
      buy('BTC', '2026-09-04T09:00:00Z', '300', '0.00375'),
      buy('BTC', '2026-09-04T15:00:00Z', '700', '0.00875'),
    ];
    const c = of([...M, ...fills], tap(P6, [], '2026-09-03'));
    expect(invested(c, c.entries)).toBe('2400');
    const cut = imported(c, c.entries, fileOf(c.file.filter((m) => m.at < '2026-09-04T12:00:00Z')));
    expect(invested(c, cut)).toBe('2400');
  });

  // Below the monthly part (a lump of 100, a part of 500), a date passes when its amount is at most 300, so a part of
  // a date can pass while the whole date fails: a shorter export's lump claims that part, and the whole file's lump
  // claims another date, which counts twice when the shorter export stored it.
  const below = (fills: readonly Movement[]) => {
    const plan = { ...P6, startingAmount: money('100'), monthlyAmount: money('500') };
    const file = [...MONTHS.map((slot) => buy('BTC', `${slot}-02`, '500', '0.00625')), ...fills];
    const typedIn = record(of(file, [], plan), [], 'lump', '2026-09-03', { BTC: { amount: '100', units: '0.00125' } });
    return of(file, typedIn as Entry[], plan);
  };
  const ROUND_2 = below([
    buy('BTC', '2026-09-01T10:00:00Z', '100', '0.00125'),
    buy('BTC', '2026-09-04T09:00:00Z', '50', '0.000625'),
    buy('BTC', '2026-09-04T15:00:00Z', '300', '0.00375'),
  ]);

  it('below the part, an export ending inside 4 Sep: one import 2,450, the cut first then the file 2,550', () => {
    expect(recordedBy(ROUND_2, ROUND_2.entries, ROUND_2.entries[0] as Entry)).toEqual(['2026-09-01']);
    expect(invested(ROUND_2, ROUND_2.entries)).toBe('2450');
    const cut = imported(ROUND_2, ROUND_2.entries, fileOf(ROUND_2.file.filter((m) => m.at < '2026-09-04T12:00:00Z')));
    expect(invested(ROUND_2, cut)).toBe('2550');
  });

  it('below the part, an export beginning inside 4 Sep, the claimed 1 Sep before it: 2,450 either way', () => {
    const cut = imported(ROUND_2, ROUND_2.entries, fileOf(ROUND_2.file.filter((m) => m.at > '2026-09-04T12:00:00Z')));
    expect(invested(ROUND_2, cut)).toBe('2450');
  });

  it('below the part, an export beginning inside 4 Sep, the claimed 6 Sep after it: 2,450, the cut first 2,550', () => {
    const c = below([
      buy('BTC', '2026-09-04T09:00:00Z', '300', '0.00375'),
      buy('BTC', '2026-09-04T15:00:00Z', '50', '0.000625'),
      buy('BTC', '2026-09-06T10:00:00Z', '100', '0.00125'),
    ]);
    expect(recordedBy(c, c.entries, c.entries[0] as Entry)).toEqual(['2026-09-06']);
    expect(invested(c, c.entries)).toBe('2450');
    const cut = imported(c, c.entries, fileOf(c.file.filter((m) => m.at > '2026-09-04T12:00:00Z')));
    expect(invested(c, cut)).toBe('2550');
  });

  // The shorter export ends before 6 Sep, the date the whole file's lump claims, so it stored none of its purchases.
  it('below the part, an export ending inside 4 Sep, the claimed 6 Sep after it: 2,450 either way', () => {
    const c = below([
      buy('BTC', '2026-09-04T09:00:00Z', '50', '0.000625'),
      buy('BTC', '2026-09-04T15:00:00Z', '300', '0.00375'),
      buy('BTC', '2026-09-06T10:00:00Z', '100', '0.00125'),
    ]);
    expect(recordedBy(c, c.entries, c.entries[0] as Entry)).toEqual(['2026-09-06']);
    expect(invested(c, c.entries)).toBe('2450');
    const shorter = fileOf(c.file.filter((m) => m.at < '2026-09-04T12:00:00Z'));
    expect(planOf(c, c.entries, shorter).recorded.map((item) => item.dates)).toEqual([['2026-09-04']]);
    const cut = imported(c, c.entries, shorter);
    expect(recordedBy(c, cut, c.entries[0] as Entry)).toEqual(['2026-09-06']);
    expect(invested(c, cut)).toBe('2450');
  });

  // The shorter export stored 1 Sep, the date the whole file's lump walks, so 1 Sep's 100 counts twice; the second
  // import's walk takes the stored 1 Sep in its place and sum, as in one import, and claims nothing else: 5 Sep's 120
  // still counts once (plan-lump-cut.property.test.ts).
  it('below the part, an export ending inside 4 Sep: one import 2,570, the cut first stores 1 Sep and gives 2,670', () => {
    const c = below([...ROUND_2.file.slice(MONTHS.length), buy('BTC', '2026-09-05T10:00:00Z', '120', '0.0015')]);
    expect(recordedBy(c, c.entries, c.entries[0] as Entry)).toEqual(['2026-09-01']);
    expect(invested(c, c.entries)).toBe('2570');
    const cut = imported(c, c.entries, fileOf(c.file.filter((m) => m.at < '2026-09-04T12:00:00Z')));
    expect(recordedBy(c, cut, c.entries[0] as Entry)).toEqual([]);
    expect(invested(c, cut)).toBe('2670');
  });

  // Another hand entry's claim moves the same way: a shorter export beginning inside 4 Sep holds a part the lump of
  // 1,000 passes over, so the extra buy of 4 Sep claims it and 5 Sep, the extra's date in one import, is stored; the
  // whole file's extra then claims 2 Sep, whose 500 goes out while 5 Sep's 100 counts.
  it('above the part, an extra buy beside the lump: the cut first stores 5 Sep and leaves out 2 Sep, 400 less', () => {
    const plan = { ...P6, startingAmount: money('100'), monthlyAmount: money('500') };
    const file = [
      ...MONTHS.map((slot) => buy('BTC', `${slot}-02`, '500', '0.00625')),
      buy('BTC', '2026-09-04T09:00:00Z', '700', '0.00875'),
      buy('BTC', '2026-09-04T15:00:00Z', '100', '0.00125'),
      buy('BTC', '2026-09-05T10:00:00Z', '100', '0.00125'),
    ];
    const lumpIn = record(of(file, [], plan), [], 'lump', '2026-09-03', { BTC: { amount: '1000', units: '0.0125' } });
    const extraIn = record(of(file, [], plan), [], 'extra', '2026-09-04', { BTC: { amount: '100', units: '0.00125' } });
    const ownId = (extraIn as Entry[]).map((entry) => ({ ...entry, id: testId('typed|extra') }));
    const c = of(file, [...(lumpIn as Entry[]), ...ownId], plan);
    const extra = c.entries.find((entry) => entry.kind === 'extra') as Entry;
    expect(recordedBy(c, c.entries, extra)).toEqual(['2026-09-05']);
    const shorter = fileOf(c.file.filter((m) => m.at > '2026-09-04T12:00:00Z'));
    expect(planOf(c, c.entries, shorter).recorded.map((item) => [item.entry.kind, item.dates])).toEqual([
      ['extra', ['2026-09-04']],
    ]);
    const cut = imported(c, c.entries, shorter);
    expect(recordedBy(c, cut, extra)).toEqual(['2026-09-02']);
    expect(Number(invested(c, c.entries)) - Number(invested(c, cut))).toBe(400);
  });

  it('below the part, an export inside 4 Sep alone: 2,450 either way', () => {
    const c = below([
      buy('BTC', '2026-09-01T10:00:00Z', '100', '0.00125'),
      buy('BTC', '2026-09-04T08:00:00Z', '50', '0.000625'),
      buy('BTC', '2026-09-04T12:00:00Z', '50', '0.000625'),
      buy('BTC', '2026-09-04T16:00:00Z', '250', '0.003125'),
    ]);
    expect(invested(c, c.entries)).toBe('2450');
    const inside = (m: Movement) => m.at > '2026-09-04T10:00:00Z' && m.at < '2026-09-04T14:00:00Z';
    expect(invested(c, imported(c, c.entries, fileOf(c.file.filter(inside))))).toBe('2450');
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

  // CI's counterexample of 2026-11-15 (seed -1110155515), shrunk: a lump of 70, BTC's monthly part, on 7 Sep; a typed
  // September buy; 7 Sep's 240 stored by an earlier import. The whole file's September buy claims 7 Sep and the lump
  // 9 Sep. An export that ends inside 7 Sep leaves the September buy only the stored 240, so it claims nothing, and a
  // walk from 7 Sep stopped there before 9 Sep and stored 9 Sep's 950, a purchase the lump records.
  it('at the part, an export ending inside 7 Sep: the lump claims 9 Sep either way, and it is never stored', () => {
    const [stored, ninth, rest] = [
      buy('BTC', '2026-09-07T10:00:00Z', '240', '0.003'),
      buy('BTC', '2026-09-09T10:00:00Z', '950', '0.012'),
      buy('BTC', '2026-09-07T10:01:00Z', '890', '0.011'),
    ];
    const atPart = { amount: money('70'), units: units('0.001') };
    const entries = [lump('2026-09-07', atPart), typed('2026-09', atPart), added(stored, 'extra', null)];
    const c = of([stored, ninth, rest], entries, PLAN_70_30);
    expect(planOf(c, entries).recorded.map((item) => [item.entry.kind, item.dates])).toEqual([
      ['dca', ['2026-09-07']],
      ['lump', ['2026-09-09']],
    ]);
    const shorter = planOf(c, entries, fileOf([stored, ninth]));
    expect(shorter.recorded.map((item) => [item.entry.kind, item.dates])).toEqual([['lump', ['2026-09-09']]]);
    expect(shorter.entries).toEqual([]);
    const after = applyExchangeImport(entries, shorter, NOW).entries;
    expect(planOf(c, after).recorded.map((item) => [item.entry.kind, item.dates])).toEqual([
      ['dca', ['2026-09-07']],
      ['lump', ['2026-09-09']],
    ]);
    expect(planOf(c, after).entries).toEqual([]);
  });

  // A lump at the part claims one date, so W1 does not hold for it: its pieces on other days are imported beside it.
  it.each(['before importing', 'after importing'])(
    'at the part, a starting amount in two pieces, %s: the lump records 3 Sep alone, 105 against 70',
    (when) => {
      const atPart = lump('2026-09-03', { amount: money('70'), units: units('0.001') });
      const file = [
        buy('BTC', '2026-09-03T10:00:00Z', '35', '0.0005'),
        buy('BTC', '2026-09-04T10:00:00Z', '35', '0.0005'),
      ];
      const c = of(file, [atPart], PLAN_70_30);
      const entries = when === 'before importing' ? c.entries : imported(c, c.entries);
      expect(recordedBy(c, entries, atPart)).toEqual(['2026-09-03']);
      expect(invested(c, entries)).toBe('105');
    },
  );

  // "400 less" with a hand lump of 500, the part, in place of the extra buy: the lump at the part falls back to its
  // nearest date as the extra buy does, so the cut first stores 5 Sep and the whole file's lump then claims 2 Sep (W2).
  it('at the part, a second lump beside the lump of 1,000: the cut first stores 5 Sep and leaves out 2 Sep, 3,100', () => {
    const plan = { ...P6, startingAmount: money('100'), monthlyAmount: money('500') };
    const file = [
      ...MONTHS.map((slot) => buy('BTC', `${slot}-02`, '500', '0.00625')),
      buy('BTC', '2026-09-04T09:00:00Z', '700', '0.00875'),
      buy('BTC', '2026-09-04T15:00:00Z', '100', '0.00125'),
      buy('BTC', '2026-09-05T10:00:00Z', '100', '0.00125'),
    ];
    const atPart = lump('2026-09-04', { amount: money('500'), units: units('0.00625') });
    const c = of(file, [lump('2026-09-03'), atPart], plan);
    expect(planOf(c, c.entries).recorded.map((item) => [item.entry.amount, item.dates])).toEqual([
      ['1000', ['2026-09-04']],
      ['500', ['2026-09-05']],
    ]);
    expect(invested(c, c.entries)).toBe('3500');
    const shorter = fileOf(c.file.filter((m) => m.at > '2026-09-04T12:00:00Z'));
    expect(planOf(c, c.entries, shorter).recorded.map((item) => [item.entry.amount, item.dates])).toEqual([
      ['500', ['2026-09-04']],
    ]);
    const cut = imported(c, c.entries, shorter);
    expect(recordedBy(c, cut, atPart)).toEqual(['2026-09-02']);
    expect(invested(c, cut)).toBe('3100');
  });

  // The same world with the lump at the part tapped: a live one-tap lump at the part falls back to its nearest date as
  // a hand one does, so the cut moves its claim the same way (W2).
  it('at the part, a one-tap lump beside the lump of 1,000: the cut first stores 5 Sep and leaves out 2 Sep, 3,100', () => {
    const plan = { ...P6, startingAmount: money('100'), monthlyAmount: money('500') };
    const file = [
      ...MONTHS.map((slot) => buy('BTC', `${slot}-02`, '500', '0.00625')),
      buy('BTC', '2026-09-04T09:00:00Z', '700', '0.00875'),
      buy('BTC', '2026-09-04T15:00:00Z', '100', '0.00125'),
      buy('BTC', '2026-09-05T10:00:00Z', '100', '0.00125'),
    ];
    const atPart = lump('2026-09-04', { source: 'one-tap', amount: money('500'), units: units('0.00625') });
    const c = of(file, [lump('2026-09-03'), atPart], plan);
    expect(planOf(c, c.entries).recorded.map((item) => [item.entry.amount, item.dates])).toEqual([
      ['1000', ['2026-09-04']],
      ['500', ['2026-09-05']],
    ]);
    expect(invested(c, c.entries)).toBe('3500');
    const shorter = fileOf(c.file.filter((m) => m.at > '2026-09-04T12:00:00Z'));
    expect(planOf(c, c.entries, shorter).recorded.map((item) => [item.entry.amount, item.dates])).toEqual([
      ['500', ['2026-09-04']],
    ]);
    const cut = imported(c, c.entries, shorter);
    expect(recordedBy(c, cut, atPart)).toEqual(['2026-09-02']);
    expect(invested(c, cut)).toBe('3100');
  });

  // CI's world of 2026-11-15 (seed -1110155515, plan-lump-cut.property.test.ts), shrunk: a one-tap lump of 35, half
  // BTC's monthly part of 70, on 2 Apr. 1 Apr's 52.50 is farther from 35 than 70 is, as a ratio, so the whole file's
  // lump walks 2 Apr and 3 Apr. An export beginning inside 1 Apr holds its 49 alone, which is nearer: the shorter
  // export's lump takes 2 Apr, then stops at 1 Apr (59.50 is no nearer 35 than 10.50), never claiming the cut date,
  // and stores 3 Apr's 3.50, which then counts twice.
  it("below the part, an export beginning inside 1 Apr: the lump stops at the cut date, and 3 Apr's 3.50 counts twice", () => {
    const file = [
      buy('BTC', '2026-04-01T08:00:00Z', '3.50', '0.00005'),
      buy('BTC', '2026-04-01T12:00:00Z', '49', '0.0007'),
      buy('BTC', '2026-04-03T10:00:00Z', '3.50', '0.00005'),
      buy('BTC', '2026-04-02T10:00:00Z', '10.50', '0.00015'),
    ];
    const tapped = lump('2026-04-02', { source: 'one-tap', amount: money('35'), units: units('0.0005') });
    const c = of(file, [tapped], PLAN_70_30);
    expect(recordedBy(c, c.entries, tapped)).toEqual(['2026-04-02', '2026-04-03']);
    expect(invested(c, c.entries)).toBe('87.5');
    const shorter = fileOf(file.filter((m) => m.at >= '2026-04-01T12:00:00Z'));
    expect(planOf(c, c.entries, shorter).recorded.map((item) => item.dates)).toEqual([['2026-04-02']]);
    const cut = imported(c, c.entries, shorter);
    expect(recordedBy(c, cut, tapped)).toEqual(['2026-04-02']);
    expect(invested(c, cut)).toBe('91');
  });

  // CI's world of 2026-11-15 (seed -605869711, plan-lump-cut.property.test.ts), shrunk: a one-tap lump of 140, twice
  // BTC's monthly part, on 1 Apr, whose three fills of 14 it passes over, and a hand sale of 8 Sep beside a purchase of
  // 17.50 that day. The hand sale claims 8 Sep's sales alone, so an export beginning inside 1 Apr stores 8 Sep's
  // purchase, and the whole file after it leaves that purchase stored once: the Log one import leaves.
  it("above the part, a hand sale's date beside a purchase that day, an export beginning inside 1 Apr: 199.5 either way", () => {
    const file = [
      buy('BTC', '2026-04-01T08:00:00Z', '14', '0.001'),
      buy('BTC', '2026-04-01T10:00:00Z', '14', '0.005'),
      buy('BTC', '2026-04-01T12:00:00Z', '14', '0.002'),
      trade('S8a', 'sale', 'BTC', '2026-09-08T09:00:00Z', { units: '0.001', amount: '70', fee: '0' }, 900),
      buy('BTC', '2026-09-08T10:00:00Z', '17.50', '0.0003'),
    ];
    const tapped = lump('2026-04-01', { source: 'one-tap', amount: money('140'), units: units('0.0122') });
    const sold = hand({
      kind: 'sell',
      coin: BTC,
      date: date('2026-09-08'),
      amount: money('70'),
      units: units('0.001'),
    });
    const c = of(file, [tapped, sold], PLAN_70_30);
    const once = planOf(c, c.entries);
    expect(once.recorded.map((item) => [item.entry.kind, item.dates])).toEqual([['sell', ['2026-09-08']]]);
    expect(once.entries.filter((entry) => entry.date === '2026-09-08').map((entry) => entry.kind)).toEqual(['dca']);
    expect(invested(c, c.entries)).toBe('199.5');
    const shorter = fileOf(file.filter((m) => m.at >= '2026-04-01T10:00:00Z'));
    const first = planOf(c, c.entries, shorter);
    expect(first.recorded.map((item) => [item.entry.kind, item.dates])).toEqual([['sell', ['2026-09-08']]]);
    const cut = imported(c, c.entries, shorter);
    expect(cut.filter((entry) => entry.date === '2026-09-08' && entry.kind === 'dca')).toHaveLength(1);
    const twice = imported(c, cut);
    expect(twice.filter((entry) => entry.date === '2026-09-08' && entry.kind === 'dca')).toHaveLength(1);
    expect(invested(c, cut)).toBe('199.5');
  });
});

// The starting line's totals (docs/DOMAIN.md §3.13 step 3): when the instruction's date holds two or more purchases of
// a coin, the line gives each coin's totals, since typing one purchase's figures left the others out; and d* counts a
// date of several purchases only when leaving out any one of them takes the rest farther from the target.
describe('the starting line, its totals', () => {
  const MONTHLY = MONTHS.map((slot) => buy('BTC', `${slot}-02`, '100', '0.00125'));
  const FILLS = [
    buy('BTC', '2026-06-10T09:00:00Z', '600', '0.0075'),
    buy('BTC', '2026-06-10T15:00:00Z', '400', '0.005'),
    ...MONTHLY,
  ];
  const BOTH: Total = ['BTC', '1000', '0.0125', 2];
  const ONE = { BTC: { amount: '600', units: '0.0075' } };
  const held = (c: Case, entries: readonly Entry[]) =>
    portfolio(c.plan, imported(c, entries)).positions.find((each) => each.coin === BTC)?.units;
  const TWO_FILLS: Case = { plan: P6, file: FILLS, entries: [lump('2026-07-02'), typed('2026-07'), typed('2026-08')] };

  it.each(orders(TWO_FILLS))('10 Jun in two fills, %s: change to that date and those totals, 1,500', (_, entries) => {
    expect(starting(TWO_FILLS, entries)).toEqual(instruction('change', '2026-06-10', BOTH));
    const changed = edit(TWO_FILLS, entries, '2026-06-10', TEN_JUNE) as Entry[];
    expect(recordedBy(TWO_FILLS, changed, lumpsOf(changed)[0] as Entry)).toEqual(['2026-06-10']);
    expect(starting(TWO_FILLS, changed)).toBeNull();
    expect(invested(TWO_FILLS, changed)).toBe('1500');
  });

  it.each(orders(TWO_FILLS))(
    "10 Jun in two fills, %s: one purchase's figures leave the other out, 1,100",
    (_, entries) => {
      const changed = edit(TWO_FILLS, entries, '2026-06-10', ONE) as Entry[];
      expect(starting(TWO_FILLS, changed)).toBeNull();
      expect(invested(TWO_FILLS, changed)).toBe('1100');
    },
  );

  it.each(orders(TWO_FILLS))(
    "10 Jun in two fills, %s: the summed cost with one purchase's units gives 1,500, 0.005 BTC short",
    (_, entries) => {
      const changed = edit(TWO_FILLS, entries, '2026-06-10', { BTC: { amount: '1000', units: '0.0075' } }) as Entry[];
      expect(invested(TWO_FILLS, changed)).toBe('1500');
      expect(held(TWO_FILLS, changed)).toBe('0.01375');
    },
  );

  const UNLOGGED_FILLS: Case = { ...TWO_FILLS, entries: [typed('2026-07'), typed('2026-08')] };

  it.each(orders(UNLOGGED_FILLS))(
    '10 Jun in two fills, not in the Log, %s: record those totals, 1,500',
    (_, entries) => {
      expect(starting(UNLOGGED_FILLS, entries)).toEqual(instruction('record', '2026-06-10', BOTH));
      const changed = record(UNLOGGED_FILLS, entries, 'lump', '2026-06-10', TEN_JUNE) as Entry[];
      expect(starting(UNLOGGED_FILLS, changed)).toBeNull();
      expect(invested(UNLOGGED_FILLS, changed)).toBe('1500');
      expect(invested(UNLOGGED_FILLS, record(UNLOGGED_FILLS, entries, 'lump', '2026-06-10', ONE) as Entry[])).toBe(
        '1100',
      );
    },
  );

  const TWO_COINS: Case = {
    plan: { ...P6, split: split({ BTC: '70', ETH: '30' }) },
    file: [
      buy('BTC', '2026-06-10T09:00:00Z', '420', '0.00525'),
      buy('BTC', '2026-06-10T15:00:00Z', '280', '0.0035'),
      buy('ETH', '2026-06-10', '300', '0.1'),
      buy('BTC', '2026-08-02', '70', '0.000875'),
    ],
    entries: [
      lump('2026-07-02', { amount: money('700'), units: units('0.00875') }),
      lump('2026-07-02', { coin: ETH, amount: money('300'), units: units('0.1') }),
    ],
  };

  it.each(orders(TWO_COINS))('two coins, BTC in two fills, %s: both coins totals, then 1,070', (_, entries) => {
    expect(starting(TWO_COINS, entries)).toEqual(
      instruction('change', '2026-06-10', ['BTC', '700', '0.00875', 2], ['ETH', '300', '0.1', 1]),
    );
    const figures = { BTC: { amount: '700', units: '0.00875' }, ETH: { amount: '300', units: '0.1' } };
    const changed = edit(TWO_COINS, entries, '2026-06-10', figures) as Entry[];
    expect(starting(TWO_COINS, changed)).toBeNull();
    expect(invested(TWO_COINS, changed)).toBe('1070');
  });

  // Kai starts late: the lump tapped 5 Mar, four days after 1 Mar's €500 and the month's €70, out of the lump's reach.
  const KAI_PLAN = { ...P6, firstBuy: date('2026-03-01'), startingAmount: money('500'), monthlyAmount: money('70') };
  const KAI_FILE = [
    buy('BTC', '2026-03-01T09:00:00Z', '500', '0.008'),
    buy('BTC', '2026-03-01T15:00:00Z', '70', '0.00112'),
    ...['04', '05', '06', '07', '08', '09', '10', '11'].map((m) => buy('BTC', `2026-${m}-01`, '70', '0.000875')),
  ];
  const kaiOrders = (c: Case): [string, readonly Entry[]][] => [
    ...orders(c),
    ['after an export from 1 Apr', imported(c, c.entries, fileOf(c.file.filter((m) => on(m) >= '2026-04-01')))],
  ];
  const KAI_CATCH_UP: Case = {
    plan: KAI_PLAN,
    file: KAI_FILE,
    entries: tap(KAI_PLAN, tap(KAI_PLAN, [], '2026-03-05'), '2026-03-05', 'dca'),
  };

  it.each(kaiOrders(KAI_CATCH_UP))(
    "Kai late with March tapped, %s: 1 Mar holds the month's buy, no line, 1,130",
    (_, entries) => {
      expect(starting(KAI_CATCH_UP, entries)).toBeNull();
      expect(invested(KAI_CATCH_UP, entries)).toBe('1130');
    },
  );

  it("Kai late with March tapped: changing the lump to 1 Mar's €570 would count March's buy twice, 1,200", () => {
    const { entries } = KAI_CATCH_UP;
    const changed = edit(KAI_CATCH_UP, entries, '2026-03-01', { BTC: { amount: '570', units: '0.00912' } }) as Entry[];
    expect(invested(KAI_CATCH_UP, changed)).toBe('1200');
  });

  const KAI_LATE: Case = { plan: KAI_PLAN, file: KAI_FILE, entries: tap(KAI_PLAN, [], '2026-03-05') };

  it.each(kaiOrders(KAI_LATE))('Kai late alone, %s: both 1 Mar purchases named, no line, 1,060', (_, entries) => {
    expect(starting(KAI_LATE, entries)).toBeNull();
    expect(planOf(KAI_LATE, entries).startingAmount?.items.map((item) => item.date)).toEqual([
      '2026-03-01',
      '2026-03-01',
    ]);
    expect(invested(KAI_LATE, entries)).toBe('1060');
  });

  // Guard 1's cost: a lump typed far from 10 Jun with one fill's figures gets no line, as the finer guard is out of scope.
  const FAR: Case = {
    plan: P6,
    file: [
      buy('BTC', '2026-06-10T09:00:00Z', '700', '0.00875'),
      buy('BTC', '2026-06-10T15:00:00Z', '300', '0.00375'),
      ...MONTHLY,
    ],
    entries: [lump('2026-11-14', { amount: money('700'), units: units('0.00875') })],
  };

  it.each(orders(FAR))(
    'a hand lump of €700 typed 14 Nov beside 10 Jun €700 + €300, %s: no line, 1,100',
    (_, entries) => {
      expect(starting(FAR, entries)).toBeNull();
      expect(invested(FAR, entries)).toBe('1100');
    },
  );

  const HALVES: Case = {
    plan: P6,
    file: FILE,
    entries: [
      lump('2026-07-20', { amount: money('500'), units: units('0.00625') }),
      lump('2026-07-20', { amount: money('500'), units: units('0.00625') }),
    ],
  };

  it.each(orders(HALVES))('two BTC lumps of €500 on 20 Jul, %s: guard 2, no line', (_, entries) => {
    expect(starting(HALVES, entries)).toBeNull();
  });

  const IN_USD: Case = {
    ...TWO_FILLS,
    file: [
      ...FILLS,
      trade('S-usd-total', 'purchase', 'BTC', '2026-06-10', { units: '0.02', amount: '2000', fee: '0' }, 990, {
        currency: 'USD',
      }),
    ],
  };

  it.each(orders(IN_USD))(
    'a USD purchase on 10 Jun, %s: not in the totals, and following them ends the line',
    (_, entries) => {
      expect(starting(IN_USD, entries)).toEqual(instruction('change', '2026-06-10', BOTH));
      const changed = edit(IN_USD, entries, '2026-06-10', TEN_JUNE) as Entry[];
      expect(starting(IN_USD, changed)).toBeNull();
    },
  );
});
