import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, month, split, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { added, LISBON, NOW, testId, trade } from '../../../test/exchange/plan-fixture';
import { saveTransaction, storedOver } from '../../actions/entries';
import { IMPORT_RECORDED_CHECKS } from '../../constants';
import { addDays } from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { liveEntries } from '../../plan/statuses';
import { portfolio } from '../../portfolio/portfolio';
import type { Entry } from '../../schema/entry';
import type { Plan } from '../../schema/plan';
import { applyExchangeImport } from './apply';
import type { ExchangeFile, Movement } from './kraken';
import { planExchangeImport } from './plan';
import { changedLog, importRemedies, keepsPromise, type Stored } from './plan-remedy';

// The Matching entries' sentence (docs/DOMAIN.md §3.13, "Lines that ask for a change"): each test deletes the row as the
// Log does and plans the file again before importing, after importing the shown plan and after a shorter export was
// stored first, and checks Invested against the file's purchases plus the Log's own entries the file does not hold.

let line = 2;
const next = () => {
  line += 2;
  return line;
};
const bought = (coin: string, day: string, amount: string, held = '0.0005') =>
  trade(`R${line}`, 'purchase', coin, day, { units: held, amount, fee: '0' }, next());
const sold = (coin: string, day: string, amount: string, held: string) =>
  trade(`R${line}`, 'sale', coin, day, { units: held, amount, fee: '0' }, next());
const hand = (overrides: Partial<Entry>) => anEntry({ units: units('0.0005'), source: 'manual', ...overrides });
const extra = (day: string, amount: string, overrides: Partial<Entry> = {}) =>
  hand({ kind: 'extra', slot: null, date: date(day), amount: money(amount), ...overrides });
const monthly = (day: string, slot: string, amount: string, overrides: Partial<Entry> = {}) =>
  hand({ kind: 'dca', slot: month(slot), date: date(day), amount: money(amount), ...overrides });

type Case = {
  readonly plan: Plan;
  readonly file: readonly Movement[];
  readonly shorter: readonly Movement[];
  readonly entries: readonly Entry[];
};

const PLAN = aPlan();
const P6 = aPlan({ firstBuy: date('2026-07-02'), startingAmount: money('1000') });
const planOf = (c: Case, entries: readonly Entry[], file: ExchangeFile = fileOf(c.file)) =>
  planExchangeImport(file, { plan: c.plan, entries }, { venue: null, addHeld: false }, LISBON);
const imported = (c: Case, entries: readonly Entry[], file?: ExchangeFile) =>
  applyExchangeImport(entries, planOf(c, entries, file), NOW).entries;

/** The Log before importing, after importing the shown plan, and after a shorter export was stored first. */
const orders = (c: Case): [string, Stored][] => [
  ['before importing', { plan: c.plan, entries: c.entries }],
  ['after importing', { plan: c.plan, entries: imported(c, c.entries) }],
  ['after a shorter export', { plan: c.plan, entries: imported(c, c.entries, fileOf(c.shorter)) }],
];
const remedies = (c: Case, stored: Stored) => importRemedies(fileOf(c.file), stored, false, LISBON).recorded;

/** Deletes `entry`'s row as the Log does, plans the file again and imports it: the plan and the Log after. */
function follow(c: Case, stored: Stored, entry: Entry) {
  const ids = liveEntries(stored.entries)
    .filter((each) => transactionKey(each) === transactionKey(entry))
    .map((each) => each.id);
  const changed = changedLog(stored, { kind: 'delete', ids }, LISBON) as Entry[];
  const again = planOf(c, changed);
  return { again, log: applyExchangeImport(changed, again, NOW).entries };
}
const invested = (c: Case, entries: readonly Entry[]) => portfolio(c.plan, entries).invested;
const addedAs = (entries: readonly Entry[], movement: Movement) =>
  entries.filter((entry) => entry.id === testId(movement.key)).map((entry) => [entry.kind, entry.slot]);

describe('importRemedies', () => {
  const months = Array.from({ length: 11 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`);
  const P1: Case = (() => {
    const file = months.map((slot) => bought('BTC', `${slot}-02`, '50'));
    const entries = months.map((slot) => monthly(`${slot}-02`, slot, '50'));
    return { plan: PLAN, file, shorter: file.slice(0, 6), entries };
  })();

  it.each(orders(P1))('P1 typed, %s: every typed month has the sentence, and deleting July adds 2 Jul', (_, stored) => {
    const typed = liveEntries(stored.entries).filter((entry) => entry.source === 'manual');
    expect([...remedies(P1, stored)].sort()).toEqual(typed.map((entry) => entry.id).sort());
    const july = typed.find((entry) => entry.slot === '2026-07') as Entry;
    const { again, log } = follow(P1, stored, july);
    expect(addedAs(again.entries, P1.file[6] as Movement)).toEqual([['dca', '2026-07']]);
    expect(invested(P1, log)).toBe('550');
  });

  const TWO: Case = (() => {
    const file = [bought('BTC', '2026-06-02', '70'), bought('ETH', '2026-06-02', '30')];
    const july = [bought('BTC', '2026-07-02', '70'), bought('ETH', '2026-07-02', '30')];
    const entries = [
      monthly('2026-07-02', '2026-07', '70'),
      monthly('2026-07-02', '2026-07', '30', { coin: 'ETH' as Entry['coin'] }),
    ];
    return { plan: PLAN, file: [...file, ...july], shorter: file, entries };
  })();

  it.each(orders(TWO))(
    'two coins typed in one row, %s: both items have it, and deleting the row adds both',
    (_, stored) => {
      const row = liveEntries(stored.entries).filter((entry) => entry.source === 'manual');
      expect([...remedies(TWO, stored)].sort()).toEqual(row.map((entry) => entry.id).sort());
      const { again, log } = follow(TWO, stored, row[0] as Entry);
      for (const movement of TWO.file.slice(2)) expect(addedAs(again.entries, movement)).toEqual([['dca', '2026-07']]);
      expect(invested(TWO, log)).toBe('200');
    },
  );

  const lump = (day: string) => hand({ kind: 'lump', slot: null, date: date(day), amount: money('1000') });
  const AS_BOUGHT: Case = (() => {
    const file = [bought('BTC', '2026-06-10', '1000'), bought('BTC', '2026-08-02', '70')];
    return { plan: P6, file, shorter: file.slice(0, 1), entries: [lump('2026-06-10')] };
  })();
  const LATE_LUMP: Case = { ...AS_BOUGHT, entries: [lump('2026-08-04')] };

  it.each(orders(AS_BOUGHT))('P6 as bought, %s: a lump has no sentence', (_, stored) => {
    expect(remedies(AS_BOUGHT, stored).size).toBe(0);
  });

  it('P6 as bought: deleting the lump leaves the starting purchase out, 70 against 1,070', () => {
    const { log } = follow(AS_BOUGHT, orders(AS_BOUGHT)[0]?.[1] as Stored, AS_BOUGHT.entries[0] as Entry);
    expect(invested(AS_BOUGHT, log)).toBe('70');
  });

  it.each(orders(LATE_LUMP))('a lump dated 4 Aug that records 2 Aug, %s: no sentence', (_, stored) => {
    expect(remedies(LATE_LUMP, stored).size).toBe(0);
  });

  it('a lump dated 4 Aug: deleting it adds 2 Aug but loses the starting amount, 70 against 1,070', () => {
    const { again, log } = follow(LATE_LUMP, orders(LATE_LUMP)[0]?.[1] as Stored, LATE_LUMP.entries[0] as Entry);
    expect(addedAs(again.entries, LATE_LUMP.file[1] as Movement)).toEqual([['dca', '2026-08']]);
    expect(invested(LATE_LUMP, log)).toBe('70');
  });

  const X = extra('2026-10-10', '50');
  const Y = extra('2026-10-11', '60');
  const XY: Case = (() => {
    const file = [bought('BTC', '2026-10-10', '50'), bought('BTC', '2026-10-13', '60')];
    return { plan: PLAN, file, shorter: file.slice(0, 1), entries: [X, Y] };
  })();

  it.each(orders(XY))('X and Y, %s: no sentence on X, whose date Y would take; Y has it', (_, stored) => {
    expect([...remedies(XY, stored)]).toEqual([Y.id]);
    expect(invested(XY, follow(XY, stored, Y).log)).toBe('110');
  });

  it('X and Y: deleting X gives 120 against 110', () => {
    expect(invested(XY, follow(XY, orders(XY)[0]?.[1] as Stored, X).log)).toBe('120');
  });

  const MIXED: Case = (() => {
    const eth = bought('ETH', '2026-10-10', '40');
    const file = [bought('BTC', '2026-10-10', '50'), eth];
    return { plan: PLAN, file, shorter: [eth], entries: [extra('2026-10-10', '50'), added(eth, 'extra', null)] };
  })();

  it.each(orders(MIXED))('a hand extra and an imported one in one row, %s: no sentence', (_, stored) => {
    expect(remedies(MIXED, stored).size).toBe(0);
  });

  it('a hand extra and an imported one in one row: deleting the row gives 50 against 90', () => {
    expect(invested(MIXED, follow(MIXED, orders(MIXED)[0]?.[1] as Stored, MIXED.entries[0] as Entry).log)).toBe('50');
  });

  const KAI: Case = (() => {
    const file = [bought('BTC', '2026-03-14', '100'), bought('BTC', '2026-04-02', '70')];
    const plan = aPlan({ firstBuy: date('2026-03-01'), startingAmount: money('500') });
    return { plan, file, shorter: file.slice(0, 1), entries: [extra('2026-03-15', '100')] };
  })();

  it.each(orders(KAI))("Kai's extra of 15 Mar, inside the starting amount's window, %s: no sentence", (_, stored) => {
    expect(remedies(KAI, stored).size).toBe(0);
  });

  const HELD: Case = (() => {
    const file = [bought('BTC', '2026-09-02', '70'), bought('BTC', '2026-10-10', '50')];
    const coins = hand({ kind: 'held', slot: null, date: date('2026-10-20'), amount: null, units: units('0.01') });
    return { plan: PLAN, file, shorter: file.slice(0, 1), entries: [extra('2026-10-10', '50'), coins] };
  })();

  it.each(orders(HELD))('a date a hand Coins added entry guards, %s: no sentence', (_, stored) => {
    expect(remedies(HELD, stored).size).toBe(0);
  });

  const UNDATED: Case = (() => {
    const file = [bought('BTC', '2026-08-02', '70'), bought('BTC', '2026-10-01', '70')];
    return { plan: PLAN, file, shorter: file.slice(0, 1), entries: [monthly('2026-10-02', '2026-09', '70')] };
  })();

  it.each(orders(UNDATED))('a monthly buy whose month has no date and that records another, %s: none', (_, stored) => {
    expect(remedies(UNDATED, stored).size).toBe(0);
  });

  it('a monthly buy for September that records 1 Oct: deleting it adds 1 Oct to October and opens September', () => {
    const { again } = follow(UNDATED, orders(UNDATED)[0]?.[1] as Stored, UNDATED.entries[0] as Entry);
    expect(addedAs(again.entries, UNDATED.file[1] as Movement)).toEqual([['dca', '2026-10']]);
  });

  const SALE: Case = (() => {
    const file = [bought('BTC', '2026-10-02', '70', '0.001'), sold('BTC', '2026-10-15', '40', '0.0005')];
    const entries = [
      monthly('2026-09-02', '2026-09', '70', { units: units('0.001') }),
      hand({ kind: 'sell', slot: null, date: date('2026-10-15'), amount: money('40') }),
    ];
    return { plan: PLAN, file, shorter: file.slice(0, 1), entries };
  })();

  it.each(orders(SALE))('a hand sale, %s: the sentence, and deleting it adds the sale', (_, stored) => {
    const sale = SALE.entries[1] as Entry;
    expect([...remedies(SALE, stored)]).toEqual([sale.id]);
    const { again, log } = follow(SALE, stored, sale);
    expect(addedAs(again.entries, SALE.file[1] as Movement)).toEqual([['sell', null]]);
    expect(invested(SALE, log)).toBe('140');
  });

  const REFUSED: Case = (() => {
    const file = [bought('BTC', '2026-09-02', '70'), bought('BTC', '2026-10-10', '50', '0.002')];
    const entries = [
      extra('2026-10-10', '50', { units: units('0.002') }),
      hand({ kind: 'sell', slot: null, date: date('2026-10-20'), amount: money('60'), units: units('0.002') }),
    ];
    return { plan: PLAN, file, shorter: file.slice(0, 1), entries };
  })();

  it.each(orders(REFUSED))('a delete the Log refuses, %s: no sentence', (_, stored) => {
    expect(remedies(REFUSED, stored).size).toBe(0);
    expect(changedLog(stored, { kind: 'delete', ids: [(REFUSED.entries[0] as Entry).id] }, LISBON)).toBeNull();
  });

  // Importing first, then following the sentence shown before the import: the import's ETH entry joins the hand BTC
  // entry's Log row (`transactionKey` names no coin), so Delete entry takes it too and the file counts it as deleted.
  const JOINED: Case = (() => {
    const eth = bought('ETH', '2026-07-02', '30');
    return { plan: PLAN, file: [bought('BTC', '2026-07-02', '70'), eth], shorter: [eth], entries: [] };
  })();
  const JOINED_LOG = [monthly('2026-07-02', '2026-07', '70')];
  const joined = { ...JOINED, entries: JOINED_LOG };

  it.each(orders(joined))('an import that joins the row another coin, %s: no sentence', (_, stored) => {
    expect(remedies(joined, stored).size).toBe(0);
  });

  it('an import that joins the row another coin: importing first, then deleting the row, gives 70 against 100', () => {
    const stored = orders(joined)[1]?.[1] as Stored;
    expect(invested(joined, follow(joined, stored, JOINED_LOG[0] as Entry).log)).toBe('70');
  });

  // Importing first stores the file's sale, which only the hand purchase then covers: the Log refuses the delete.
  const COVERING: Case = (() => {
    const file = [bought('BTC', '2026-07-02', '70', '0.001'), sold('BTC', '2026-07-20', '80', '0.001')];
    const entries = [monthly('2026-07-02', '2026-07', '70', { units: units('0.001') })];
    return { plan: PLAN, file, shorter: file.slice(1), entries };
  })();

  it.each(orders(COVERING))('a hand purchase that would cover the file sale, %s: no sentence', (_, stored) => {
    expect(remedies(COVERING, stored).size).toBe(0);
  });

  it('a hand purchase that would cover the file sale: after importing, the Log refuses its delete', () => {
    const stored = orders(COVERING)[1]?.[1] as Stored;
    const ids = [(COVERING.entries[0] as Entry).id];
    expect(changedLog(orders(COVERING)[0]?.[1] as Stored, { kind: 'delete', ids }, LISBON)).not.toBeNull();
    expect(changedLog(stored, { kind: 'delete', ids }, LISBON)).toBeNull();
  });

  // Choosing the file again opens a new preview, its box unticked: a date a Coins added entry would guard once the row
  // is deleted is then left out, ticked or not now.
  const GUARDED: Case = (() => {
    const file = [bought('BTC', '2026-09-02', '70')];
    const coins = hand({ kind: 'held', slot: null, date: date('2026-10-20'), amount: null, units: units('0.01') });
    return { plan: PLAN, file, shorter: [], entries: [monthly('2026-09-02', '2026-09', '70'), coins] };
  })();

  it.each(orders(GUARDED))('a monthly buy whose date a Coins added entry would guard, %s: none', (_, stored) => {
    for (const ticked of [false, true])
      expect(importRemedies(fileOf(GUARDED.file), stored, ticked, LISBON).recorded.size).toBe(0);
  });

  const MANY: Case = (() => {
    const days = Array.from({ length: IMPORT_RECORDED_CHECKS + 1 }, (_, index) =>
      addDays(date('2026-01-01'), index * 5),
    );
    const file = days.map((day) => bought('BTC', day, '20'));
    return { plan: PLAN, file, shorter: file.slice(0, 3), entries: days.map((day) => extra(day, '20')) };
  })();

  it.each(orders(MANY))('25 rows, %s: the first 24 have the sentence, the 25th none', (_, stored) => {
    expect([...remedies(MANY, stored)].sort()).toEqual(
      MANY.entries
        .slice(0, IMPORT_RECORDED_CHECKS)
        .map((entry) => entry.id)
        .sort(),
    );
  });
});

describe('keepsPromise', () => {
  const file = fileOf([bought('BTC', '2026-10-10', '50'), bought('BTC', '2026-11-02', '70')]);
  const typed = extra('2026-10-10', '50');
  const shown = planExchangeImport(file, { plan: PLAN, entries: [typed] }, { venue: null, addHeld: false }, LISBON);
  const touched = { coin: typed.coin, date: date('2026-10-10'), ids: [testId(file.movements[0]?.key as string)] };

  it('a touched date can end recorded by an entry, or any way', () => {
    expect(keepsPromise(shown, shown, [{ ...touched, end: { recordedBy: typed.id } }])).toBe(true);
    expect(keepsPromise(shown, shown, [{ ...touched, end: { recordedBy: testId('other') } }])).toBe(false);
    expect(keepsPromise(shown, shown, [{ ...touched, end: 'any' }])).toBe(true);
    expect(keepsPromise(shown, shown, [{ ...touched, end: { added: null } }])).toBe(false);
  });

  it('an untouched date group added otherwise, or another tombstone, breaks the promise', () => {
    const [entry] = shown.entries as [Entry];
    const moved = { ...shown, entries: [{ ...entry, slot: month('2026-10') }] };
    expect(keepsPromise(shown, moved, [{ ...touched, end: 'any' }])).toBe(false);
    const estimate = anEntry({ source: 'one-tap', slot: month('2026-11'), date: date('2026-11-01') });
    const replaced = { ...shown, replaced: [{ estimates: [estimate], by: [entry.id] }] };
    expect(keepsPromise(shown, replaced, [{ ...touched, end: 'any' }])).toBe(false);
  });
});

// "To keep an estimate instead, type its units from your exchange's confirmation in the Log" (cut, docs/DOMAIN.md §3.13):
// each case types the estimate's units as the Log's form does, then imports the file again.
describe("typing an estimate's units, the cut replacesHint", () => {
  const plan = aPlan({ split: split({ BTC: '100', ETH: '0' }) });
  const tap = (day: string, slot: string) =>
    anEntry({ source: 'one-tap', kind: 'dca', date: date(day), slot: month(slot), amount: money('100') });
  const run = (movements: readonly Movement[], entries: readonly Entry[]) => {
    const file = fileOf(movements);
    const shown = planExchangeImport(file, { plan, entries }, { venue: null, addHeld: false }, LISBON);
    return portfolio(plan, applyExchangeImport(entries, shown, NOW).entries).invested;
  };
  const typeUnits = (entries: readonly Entry[], estimate: Entry, typed: string) => {
    const draft = { kind: 'dca' as const, date: estimate.date, slot: estimate.slot, fee: null, note: '', venue: null };
    const rows = [{ coin: estimate.coin, entry: estimate.id, amount: estimate.amount, units: units(typed) }];
    const context = { plan, entries, editing: [estimate], ids: [], now: NOW, source: 'manual' as const };
    const saved = saveTransaction({ ...draft, rows }, context);
    return storedOver(entries, saved.ok ? saved.value : []);
  };

  it("B2's case: an estimate tapped 3 Nov, typed, leaves 2 Nov to November: 200 against 150", () => {
    const file = [bought('BTC', '2026-10-10', '50'), bought('BTC', '2026-11-02', '100')];
    const estimate = tap('2026-11-03', '2026-10');
    expect(run(file, [estimate])).toBe('150');
    expect(run(file, typeUnits([estimate], estimate, '0.0011'))).toBe('200');
  });

  it("B3's case: an estimate tapped 24 Oct, typed, leaves 22 Oct to November: 200 against 140", () => {
    const file = [bought('BTC', '2026-10-03', '40'), bought('BTC', '2026-10-22', '100')];
    const estimate = tap('2026-10-24', '2026-10');
    expect(run(file, [estimate])).toBe('140');
    expect(run(file, typeUnits([estimate], estimate, '0.0011'))).toBe('200');
  });

  it('two estimates for one month, one typed, keep both: 200 against 100', () => {
    const file = [bought('BTC', '2026-10-01', '100')];
    const [one, two] = [tap('2026-10-01', '2026-10'), tap('2026-10-01', '2026-10')];
    expect(run(file, [one, two])).toBe('100');
    expect(run(file, typeUnits([one, two], one, '0.0011'))).toBe('200');
  });

  it('equal units keep the estimate a one-tap entry', () => {
    const estimate = tap('2026-10-01', '2026-10');
    const [kept] = typeUnits([estimate], estimate, estimate.units);
    expect(kept?.source).toBe('one-tap');
  });
});
