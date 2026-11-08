import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, id, instant, money, month, units } from '../../test/builders';
import type { CalendarDate, MonthKey } from '../dates/calendar';
import { compare, max, minus, plus, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { matchLots } from '../portfolio/lots';
import type { Entry } from '../schema/entry';
import type { EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import {
  deleteEntries,
  restoreEntries,
  type SaveContext,
  type SlotsAtDelete,
  saveTransaction,
  slotsAtDelete,
  type TransactionDraft,
  uncoveredSale,
} from './entries';
import { skipMonth } from './plan';

// docs/DOMAIN.md §6 "Save an entry", "Skip a month" and "Delete entry": whatever order the saves, skips, deletes
// and undos come in, a month is never both skipped and recorded, and never recorded by two transactions, unless
// the start already held it so (a prototype import can); an undo right after its delete restores what it deleted.

const MONTHS = [month('2026-01'), month('2026-02'), month('2026-03')];
const now = instant('2026-03-20T10:00:00Z');

type Step =
  | { readonly type: 'save'; readonly slot: MonthKey; readonly coins: 1 | 2 }
  | { readonly type: 'skip'; readonly slot: MonthKey }
  | { readonly type: 'delete'; readonly at: number }
  | { readonly type: 'restore'; readonly at: number };

const slot = fc.constantFrom(...MONTHS);
const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ type: fc.constant('save' as const), slot, coins: fc.constantFrom(1 as const, 2 as const) }),
  fc.record({ type: fc.constant('skip' as const), slot }),
  fc.record({ type: fc.constant('delete' as const), at: fc.nat(5) }),
  fc.record({ type: fc.constant('restore' as const), at: fc.nat(5) }),
);

type World = { plan: Plan; entries: Entry[]; transactions: EntityId[][]; deletes: Map<number, SlotsAtDelete> };

/** How the run starts: empty, or with a month recorded twice, or skipped and recorded, as an import can leave it. */
type Start = { readonly shape: 'clean' | 'two rows' | 'skip and row'; readonly slot: MonthKey };
const start: fc.Arbitrary<Start> = fc.record({
  shape: fc.constantFrom('clean' as const, 'two rows' as const, 'skip and row' as const),
  slot,
});

function startWorld({ shape, slot }: Start): World {
  const world: World = {
    plan: aPlan({ firstBuy: date('2026-01-01') }),
    entries: [],
    transactions: [],
    deletes: new Map(),
  };
  if (shape === 'clean') return world;
  const row = (coin: Entry['coin']) => anEntry({ slot, coin, date: date(`${slot}-05`) });
  world.entries = shape === 'two rows' ? [row(BTC.id), row(ETH.id)] : [row(BTC.id)];
  world.transactions = world.entries.map((entry) => [entry.id]);
  if (shape === 'skip and row') world.plan = { ...world.plan, skips: [{ id: id(), slot, note: '', createdAt: now }] };
  return world;
}

/** The store's merge: an entry written replaces the one with its id. */
function merge(entries: readonly Entry[], written: readonly Entry[]): Entry[] {
  const ids = new Set(written.map((entry) => entry.id));
  return [...entries.filter((entry) => !ids.has(entry.id)), ...written];
}

function run(world: World, next: Step): void {
  switch (next.type) {
    case 'save': {
      const rows = [
        { coin: BTC.id, amount: money('70'), units: units('0.001') },
        { coin: ETH.id, amount: money('30'), units: units('0.01') },
      ].slice(0, next.coins);
      const draft: TransactionDraft = {
        kind: 'dca',
        date: date('2026-03-20'),
        slot: next.slot,
        fee: null,
        note: '',
        venue: null,
        rows,
      };
      const context: SaveContext = {
        plan: world.plan,
        entries: world.entries,
        editing: [],
        ids: [id(), id()],
        now,
        source: 'manual',
      };
      const saved = saveTransaction(draft, context);
      if (!saved.ok) return;
      world.entries = merge(world.entries, saved.value);
      world.transactions.push(saved.value.map((entry) => entry.id));
      return;
    }
    case 'skip': {
      const skipped = skipMonth(world.plan, world.entries, { slot: next.slot, note: '', id: id(), now });
      if (skipped.ok) world.plan = skipped.value;
      return;
    }
    case 'delete':
    case 'restore': {
      const at = next.at % Math.max(world.transactions.length, 1);
      const ids = world.transactions[at] ?? [];
      if (next.type === 'delete') {
        const before = slotsAtDelete(world.plan, world.entries, ids, now);
        const deleted = deleteEntries(world.entries, before.ids, before.at);
        world.entries = merge(world.entries, deleted);
        if (deleted.length === 0) return;
        world.deletes.set(at, before);
        // The toast's Undo, right away, brings back exactly what the delete took.
        const undone = restoreEntries(world.plan, world.entries, ids, before, now);
        expect(undone.ok && undone.value.map((entry) => entry.id)).toEqual(deleted.map((entry) => entry.id));
        return;
      }
      const restored = restoreEntries(
        world.plan,
        world.entries,
        ids,
        world.deletes.get(at) ?? { at: now, ids, slots: [] },
        now,
      );
      if (restored.ok) world.entries = merge(world.entries, restored.value);
      return;
    }
  }
}

describe('slot refusals (docs/DOMAIN.md §6)', () => {
  it('never leaves a month both skipped and recorded, or recorded by two transactions, the start had not', () => {
    fc.assert(
      fc.property(start, fc.array(step, { maxLength: 30 }), (first, steps) => {
        const world = startWorld(first);
        const owners = (key: MonthKey) => {
          const live = liveEntries(world.entries).filter((entry) => entry.kind === 'dca' && entry.slot === key);
          return new Set(live.map((entry) => world.transactions.findIndex((ids) => ids.includes(entry.id))));
        };
        const skipped = (key: MonthKey) => world.plan.skips.some((skip) => skip.slot === key);
        const initial = new Map(MONTHS.map((key) => [key, { owners: owners(key), skipped: skipped(key) }]));
        for (const next of steps) {
          run(world, next);
          for (const key of MONTHS) {
            const held = owners(key);
            const was = initial.get(key);
            if (held.size > 1 || (skipped(key) && held.size > 0)) {
              // Only a conflict the start held, between transactions it held.
              expect([...held].every((owner) => was?.owners.has(owner))).toBe(true);
              if (skipped(key)) expect(was?.skipped).toBe(true);
            }
          }
        }
      }),
    );
  });
});

// docs/DOMAIN.md §3.7 and §6: whatever order the purchases, sales, edits, deletes and undos come in, every write
// that is accepted leaves each sale covered by purchases dated on or before it, so matchLots finds no unmatched units.

const DAYS = [date('2026-01-05'), date('2026-02-05'), date('2026-03-05')];
const QUANTITIES = [units('0.001'), units('0.002'), units('0.003')];

type CoverStep =
  | { readonly type: 'buy'; readonly day: CalendarDate; readonly quantity: Units }
  | { readonly type: 'sell'; readonly day: CalendarDate; readonly quantity: Units }
  | { readonly type: 'edit'; readonly at: number; readonly day: CalendarDate; readonly quantity: Units }
  | { readonly type: 'delete'; readonly at: number }
  | { readonly type: 'restore'; readonly at: number };

const day = fc.constantFrom(...DAYS);
const quantity = fc.constantFrom(...QUANTITIES);
const coverStep: fc.Arbitrary<CoverStep> = fc.oneof(
  fc.record({ type: fc.constantFrom('buy' as const, 'sell' as const), day, quantity }),
  fc.record({ type: fc.constant('edit' as const), at: fc.nat(7), day, quantity }),
  fc.record({ type: fc.constantFrom('delete' as const, 'restore' as const), at: fc.nat(7) }),
);

function cover(world: World, next: CoverStep): void {
  const context = (editing: readonly Entry[]): SaveContext => ({
    plan: world.plan,
    entries: world.entries,
    editing,
    ids: [id()],
    now,
    source: 'manual',
  });
  const draftOf = (kind: 'extra' | 'sell', on: CalendarDate, sold: Units): TransactionDraft => ({
    kind,
    date: on,
    slot: null,
    fee: null,
    note: '',
    venue: null,
    rows: [{ coin: BTC.id, amount: money('100'), units: sold }],
  });
  if (next.type === 'buy' || next.type === 'sell') {
    const saved = saveTransaction(
      draftOf(next.type === 'buy' ? 'extra' : 'sell', next.day, next.quantity),
      context([]),
    );
    if (!saved.ok) return;
    world.entries = merge(world.entries, saved.value);
    world.transactions.push(saved.value.map((entry) => entry.id));
    return;
  }
  const at = next.at % Math.max(world.transactions.length, 1);
  const ids = world.transactions[at] ?? [];
  if (next.type === 'edit') {
    const [entry] = liveEntries(world.entries).filter((each) => ids.includes(each.id));
    if (entry === undefined) return;
    const kind = entry.kind === 'sell' ? 'sell' : 'extra';
    const saved = saveTransaction(draftOf(kind, next.day, next.quantity), context([entry]));
    if (saved.ok) world.entries = merge(world.entries, saved.value);
    return;
  }
  if (next.type === 'delete') {
    const before = slotsAtDelete(world.plan, world.entries, ids, now);
    const deleted = deleteEntries(world.entries, before.ids, before.at);
    // The shell writes nothing when the delete would leave a sale uncovered.
    if (uncoveredSale(world.entries, deleted) !== null) return;
    world.entries = merge(world.entries, deleted);
    world.deletes.set(at, before);
    return;
  }
  const before = world.deletes.get(at) ?? { at: now, ids, slots: [] };
  const restored = restoreEntries(world.plan, world.entries, ids, before, now);
  if (restored.ok) world.entries = merge(world.entries, restored.value);
}

describe('sales stay covered (docs/DOMAIN.md §3.7, §6)', () => {
  it('leaves no units sold that no earlier purchase covers, after any sequence of accepted writes', () => {
    fc.assert(
      fc.property(fc.array(coverStep, { maxLength: 30 }), (steps) => {
        const world = startWorld({ shape: 'clean', slot: month('2026-01') });
        for (const next of steps) {
          cover(world, next);
          expect(matchLots(world.entries, BTC.id, 'global').unmatchedUnits).toBe('0');
        }
      }),
    );
  });
});

// docs/DOMAIN.md §3.7: data imported short (a sale dated before its purchases, or more sold than bought) stays as
// written, and no accepted save, delete or undo leaves a coin with more units sold than bought, or more unmatched.

/** An imported entry, written as the file had it: no check that its sales are covered. */
const imported = fc.record({
  kind: fc.constantFrom('extra' as const, 'sell' as const),
  coin: fc.constantFrom(BTC.id, ETH.id),
  day: fc.constantFrom(date('2026-01-01'), ...DAYS),
  quantity,
});

/** Units of `coin` sold beyond all its purchases, whatever their dates. */
function oversold(entries: readonly Entry[], coin: Entry['coin']): Units {
  let net = '0' as Units;
  for (const entry of liveEntries(entries)) {
    if (entry.coin === coin) net = entry.kind === 'sell' ? plus(net, entry.units) : minus(net, entry.units);
  }
  return max(net, '0' as Units);
}

describe('data imported short stays no worse (docs/DOMAIN.md §3.7, §6)', () => {
  it('never sells more than was bought, or leaves more unmatched, than the import did, per coin', () => {
    fc.assert(
      fc.property(
        fc.array(imported, { minLength: 1, maxLength: 6 }),
        fc.array(coverStep, { maxLength: 30 }),
        (rows, steps) => {
          const world = startWorld({ shape: 'clean', slot: month('2026-01') });
          // An orphan sale dated before every purchase, so the start is always short.
          const file = [
            { kind: 'sell' as const, coin: BTC.id, day: date('2026-01-01'), quantity: units('0.001') },
            ...rows,
          ];
          world.entries = file.map(({ kind, coin, day, quantity }) =>
            anEntry({ kind, slot: null, coin, date: day, units: quantity, source: 'import-prototype' }),
          );
          world.transactions = world.entries.map((entry) => [entry.id]);
          for (const next of steps) {
            const before = world.entries;
            cover(world, next);
            for (const coin of [BTC.id, ETH.id]) {
              expect(compare(oversold(world.entries, coin), oversold(before, coin))).toBeLessThanOrEqual(0);
              const unmatched = (entries: readonly Entry[]) => matchLots(entries, coin, 'global').unmatchedUnits;
              expect(compare(unmatched(world.entries), unmatched(before))).toBeLessThanOrEqual(0);
            }
          }
        },
      ),
    );
  });
});

describe('a grouped edit keeps each row its own entry (docs/DOMAIN.md §6, Edit a transaction)', () => {
  const coin = fc.constantFrom(BTC.id, ETH.id);
  // Each edited entry has a row, its coin kept or changed, filled or cleared; rows added in the edit name no entry.
  const shape = fc.record({ coin, rowCoin: coin, filled: fc.boolean() });
  it('keeps the id and createdAt of every filled row whose own entry has its coin, and deletes only the rest', () => {
    fc.assert(
      fc.property(
        fc.array(shape, { minLength: 1, maxLength: 4 }),
        fc.array(coin, { maxLength: 2 }),
        fc.boolean(),
        (shapes, added, reversed) => {
          const loaded = shapes.map((each, at) =>
            anEntry({
              kind: 'extra',
              slot: null,
              coin: each.coin,
              createdAt: instant(`2026-03-01T0${at}:00:00Z`),
              updatedAt: instant(`2026-03-01T0${at}:00:00Z`),
            }),
          );
          const own = shapes.map((each, at) => ({
            coin: each.rowCoin,
            entry: loaded[at]?.id ?? null,
            amount: each.filled ? money('10') : null,
            units: each.filled ? units('0.001') : null,
          }));
          const extra = added.map((rowCoin) => ({
            coin: rowCoin,
            entry: null,
            amount: money('5'),
            units: units('0.002'),
          }));
          const rows = reversed ? [...extra, ...own].toReversed() : [...own, ...extra];
          fc.pre(rows.some((row) => row.amount !== null));
          const editing = reversed ? loaded.toReversed() : loaded;
          const result = saveTransaction(
            { kind: 'extra', date: date('2026-03-01'), slot: null, fee: null, note: '', venue: null, rows },
            { plan: aPlan(), entries: loaded, editing, ids: rows.map(() => id()), now, source: 'manual' },
          );
          if (!result.ok) throw new Error(result.error.code);
          const filled = rows.filter((row) => row.amount !== null);
          const saved = result.value.slice(0, filled.length);
          filled.forEach((row, at) => {
            const mine = loaded.find((entry) => entry.id === row.entry);
            if (mine?.coin === row.coin) {
              expect(saved[at]).toMatchObject({ id: mine.id, createdAt: mine.createdAt, deletedAt: null });
            }
          });
          const taken = new Set(saved.map((entry) => entry.id));
          const deleted = result.value.slice(filled.length);
          expect(deleted.every((entry) => entry.deletedAt !== null)).toBe(true);
          expect(new Set(deleted.map((entry) => entry.id))).toEqual(
            new Set(loaded.filter((entry) => !taken.has(entry.id)).map((entry) => entry.id)),
          );
        },
      ),
    );
  });
});
