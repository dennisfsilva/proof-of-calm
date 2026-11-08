import {
  fillRow,
  isPositive,
  type Money,
  PRICE_FIGURES,
  type Price,
  type PriceSnapshot,
  quotientSignificant,
  round,
  saveTransaction,
  transactions,
  type Units,
  unitsFor,
  valueAt,
} from '@proofofcalm/core';
import { anEntry, aPlan, BTC, date, ETH, id, instant, money, month } from '@proofofcalm/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createNumberInput, type NumberInput } from '../../../lib/format';
import { isFilledPrice, withDate } from './dated';
import { changedFields, editRow, type FormState, initialState, keepUnchanged, toDraft } from './form';

// The derivation of the entry form (ADR-0034): a keystroke path on a source, through "", "0", "0," or text the
// parser refuses, pauses the derived field; the readable non-zero source it ends on fills it from the two fields
// the person typed. Only typing into the derived field ends it.

const locales = [
  { name: 'en-GB', input: createNumberInput('en-GB'), point: '.' },
  { name: 'pt-PT', input: createNumberInput('pt-PT'), point: ',' },
] as const;

const plan = aPlan();
const start = initialState('extra', [], undefined, {
  plan,
  entries: [],
  today: date('2026-10-20'),
  prices: null,
  numberInput: createNumberInput('en-GB'),
});
const rowOf = (state: FormState) => state.rows[0] as FormState['rows'][number];
/** Live prices finer than the minor unit, so the form shows them rounded. */
const live: PriceSnapshot = {
  at: instant('2026-10-20T09:59:30.000Z'),
  prices: { BTC: { EUR: '60000.123456' }, ETH: { EUR: '2345.678912' } } as PriceSnapshot['prices'],
};

/** A positive decimal as the person would type it, with the locale's decimal symbol. */
const typedNumber = (point: string, places: number) =>
  fc
    .tuple(
      fc.integer({ min: 0, max: 99_999 }),
      fc.integer({ min: 0, max: 10 ** places - 1 }),
      fc.integer({ min: 0, max: places }),
    )
    .filter(([whole, fraction, shown]) => whole > 0 || (shown > 0 && fraction > 0))
    .map(([whole, fraction, shown]) =>
      shown === 0 ? `${whole}` : `${whole}${point}${`${fraction}`.padStart(places, '0').slice(0, shown)}`,
    )
    .filter((text) => /[1-9]/.test(text));

/** Keystrokes towards `target`: its prefixes in any order (typing and backspacing), and empty, zero or refused text. */
const pathTo = (target: string, point: string) =>
  fc
    .array(
      fc.oneof(
        fc.integer({ min: 0, max: target.length }).map((length) => target.slice(0, length)),
        fc.constantFrom('', '0', `0${point}`, `0${point}0`, '00', point, '1,2,3'),
      ),
      { maxLength: 12 },
    )
    .map((path) => [...path, target]);

const keystrokes = (point: string) =>
  typedNumber(point, 2).chain((target) => pathTo(target, point).map((path) => ({ target, path })));

const along = (state: FormState, field: 'amount' | 'units' | 'price', path: readonly string[], input: NumberInput) =>
  path.reduce((at, typed) => editRow(at, 0, field, typed, input, 'EUR'), state);

const parsed = <T extends Money | Units | Price>(input: NumberInput, text: string): T => {
  const result = input.parse<T>(text);
  if (!result.ok) throw new Error(`unreadable test input ${text}`);
  return result.value;
};

describe.each(locales)('editRow derivation properties in $name (ADR-0034)', ({ input, point }) => {
  it('keeps the typed units and fills the price from the amount a keystroke path ends on', () => {
    fc.assert(
      fc.property(typedNumber(point, 8), typedNumber(point, 2), keystrokes(point), (units, first, { target, path }) => {
        const priced = along(editRow(start, 0, 'units', units, input, 'EUR'), 'amount', [first], input);
        expect(rowOf(priced).derived).toBe('price');
        const row = rowOf(along(priced, 'amount', path, input));
        const price = quotientSignificant<Price>(
          parsed<Money>(input, target),
          parsed<Units>(input, units),
          PRICE_FIGURES,
          2,
          'half-even',
        );
        expect(row).toMatchObject({ amount: target, units, price: input.format(price, 2), derived: 'price' });
      }),
    );
  });

  it('keeps the typed price and fills the units from the amount a keystroke path ends on', () => {
    fc.assert(
      fc.property(typedNumber(point, 2), typedNumber(point, 2), keystrokes(point), (price, first, { target, path }) => {
        const filled = along(editRow(start, 0, 'price', price, input, 'EUR'), 'amount', [first], input);
        expect(rowOf(filled).derived).toBe('units');
        const row = rowOf(along(filled, 'amount', path, input));
        const units = unitsFor(parsed<Money>(input, target), parsed<Price>(input, price), row.decimals);
        expect(row).toMatchObject({ amount: target, price, units: input.format(units), derived: 'units' });
      }),
    );
  });

  // Review round 2, session 6: a row that shows a value is saved or refused, never skipped; derived units are
  // saved only as the fill of the amount and the price the row shows.
  // Review round 1, session 7: from the live-price forms too, with sub-cent amounts and coins of few decimals, where
  // derived units round to 0 and a paused row read as empty.
  it('saves one entry per row that shows a value, derived units as their fill, or refuses, on any path', () => {
    const readPositive = <T extends Money | Units | Price>(text: string): T | null => {
      const result = text.trim() === '' ? null : input.parse<T>(text);
      return result?.ok && isPositive(result.value) ? result.value : null;
    };
    const anyText = fc.oneof(
      typedNumber(point, 2),
      typedNumber(point, 4),
      fc.constantFrom('', '0', `0${point}`, '1,2,3'),
    );
    const field = fc.constantFrom('amount' as const, 'units' as const, 'price' as const);
    const edit = fc.tuple(fc.integer({ min: 0, max: 1 }), field, anyText);
    const decimals = fc.constantFrom(8, 6, 4, 2, 0);
    const opening = fc.tuple(fc.constantFrom('dca' as const, 'extra' as const, null), decimals, decimals);
    fc.assert(
      fc.property(opening, fc.array(edit, { maxLength: 16 }), ([kind, btc, eth], edits) => {
        const decimalPlan = aPlan({
          coins: [
            { ...BTC, decimals: btc },
            { ...ETH, decimals: eth },
          ],
        });
        const opened = initialState(kind ?? 'extra', [], undefined, {
          plan: decimalPlan,
          entries: [],
          today: date('2026-10-20'),
          prices: kind === null ? null : live,
          numberInput: input,
        });
        const state = edits.reduce((at, [row, edited, typed]) => editRow(at, row, edited, typed, input, 'EUR'), opened);
        const draft = toDraft(state, input);
        if (!draft.ok) return;
        const saved = saveTransaction(draft.value, {
          plan: decimalPlan,
          entries: [],
          editing: [],
          ids: [id(), id()],
          now: instant('2026-10-20T10:00:00.000Z'),
          source: 'manual',
        });
        if (!saved.ok) return;
        const shown = state.rows.filter((row) => readPositive(row.amount) !== null || readPositive(row.units) !== null);
        expect(saved.value.map((entry) => entry.coin)).toEqual(shown.map((row) => row.coin));
        for (const row of shown.filter((each) => each.derived === 'units')) {
          const values = {
            amount: readPositive<Money>(row.amount),
            units: null,
            price: readPositive<Price>(row.price),
          };
          const filled = fillRow('price', values, row.decimals, 'EUR').units;
          const entry = saved.value.find((each) => each.coin === row.coin);
          expect(filled).not.toBeNull();
          expect(entry && input.format(entry.units)).toBe(filled && input.format(filled));
        }
        for (const row of shown.filter((each) => each.derived === 'amount')) {
          const values = {
            amount: null,
            units: readPositive<Units>(row.units),
            price: readPositive<Price>(row.price),
          };
          const filled = fillRow('price', values, row.decimals, 'EUR').amount;
          const entry = saved.value.find((each) => each.coin === row.coin);
          expect(filled).not.toBeNull();
          expect(entry?.amount && input.format(entry.amount, 2)).toBe(filled && input.format(filled, 2));
        }
      }),
      { numRuns: 400 },
    );
  });

  it('fills the amount from the units a keystroke path beside the live price ends on', () => {
    const opened = initialState('extra', [], undefined, {
      plan,
      entries: [],
      today: date('2026-10-20'),
      prices: live,
      numberInput: input,
    });
    const units = typedNumber(point, 8).chain((target) => pathTo(target, point).map((path) => ({ target, path })));
    fc.assert(
      fc.property(units, ({ target, path }) => {
        const row = rowOf(along(opened, 'units', path, input));
        const paid = round(valueAt(parsed<Units>(input, target), parsed<Price>(input, row.price)), 2, 'half-even');
        const filled = isPositive(paid) ? { amount: input.format(paid, 2), derived: 'amount' } : { amount: '' };
        expect(row).toMatchObject({ ...filled, units: target });
      }),
    );
  });

  it('ends the derivation when the derived field itself is typed', () => {
    const anyText = fc.oneof(typedNumber(point, 2), fc.constantFrom('', '0', `0${point}`, '1,2,3'));
    fc.assert(
      fc.property(typedNumber(point, 8), typedNumber(point, 2), anyText, (units, amount, typed) => {
        const priced = along(editRow(start, 0, 'units', units, input, 'EUR'), 'amount', [amount], input);
        const row = rowOf(editRow(priced, 0, 'price', typed, input, 'EUR'));
        expect(row.price).toBe(typed);
        expect(row.derived).not.toBe('price');
      }),
    );
  });
});

// Finding B, session 8 (#96): opening any row of the Log for an edit and saving it unchanged rewrites nothing but
// updatedAt, whatever amount, units, fee, venue and note its entries hold, and however many saves the row groups.
describe.each(locales)('an unchanged edit in $name', ({ input }) => {
  const digits = (maxLength: number) =>
    fc.array(fc.constantFrom(...'0123456789'), { maxLength }).map((each) => each.join(''));
  /** A plain decimal string as the Entry schema accepts it, with a fraction the number input reads back. */
  const decimal = (fraction: number) =>
    fc
      .tuple(fc.oneof(fc.constant('0'), fc.bigInt({ min: 1n, max: 10n ** 24n }).map(String)), digits(fraction))
      .map(([whole, part]) => (part === '' ? whole : `${whole}.${part}`));
  const positive = (fraction: number) => decimal(fraction).filter((text) => /[1-9]/.test(text));
  const now = instant('2026-10-20T10:00:00.000Z');
  const group = fc.constantFrom(
    { kind: 'dca' as const, date: date('2026-09-01'), slot: month('2026-09') },
    { kind: 'dca' as const, date: date('2026-09-01'), slot: month('2026-08') },
    { kind: 'lump' as const, date: date('2026-09-01'), slot: null },
    { kind: 'extra' as const, date: date('2026-09-02'), slot: null },
    { kind: 'sell' as const, date: date('2026-09-03'), slot: null },
  );
  const logged = fc
    .record({
      shared: group,
      coin: fc.constantFrom(BTC.id, ETH.id),
      amount: positive(100).map((text) => text as Money),
      units: positive(10).map((text) => text as Units),
      fee: fc.option(decimal(100).map((text) => text as Money)),
      venue: fc.option(fc.string({ minLength: 1, maxLength: 40 })),
      note: fc.string({ maxLength: 500 }),
    })
    .map(({ shared, ...fields }) => anEntry({ ...shared, ...fields }));
  // Enough held for any sale, so the save checks nothing but the edit.
  const held = [BTC.id, ETH.id].map((coin) =>
    anEntry({ kind: 'extra', slot: null, date: date('2020-01-01'), coin, units: `1${'0'.repeat(30)}` as Units }),
  );

  it('gives back every entry of any transactions row apart from updatedAt', () => {
    fc.assert(
      fc.property(fc.array(logged, { minLength: 1, maxLength: 6 }), (drawn) => {
        const entries = [...held, ...drawn];
        const ctx = { plan, entries, today: date('2026-10-20'), prices: null, numberInput: input };
        for (const row of transactions(plan, entries).rows) {
          if (row.type === 'skip') continue;
          const state = initialState(row.kind, row.items, undefined, ctx);
          const draft = toDraft(state, input);
          if (!draft.ok) throw new Error(JSON.stringify(draft.error));
          const editing = row.items;
          const saved = saveTransaction(draft.value, { plan, entries, editing, ids: [], now, source: 'manual' });
          if (!saved.ok) throw new Error(saved.error.code);
          const changed = changedFields(state, state);
          const kept = keepUnchanged(saved.value, { current: state, draft: draft.value, editing, changed });
          expect(kept).toEqual(editing.map((item) => ({ ...item, updatedAt: now })));
        }
      }),
      { numRuns: 300 },
    );
  });

  // Review round 1, session 8 (#96): the save gives a row's amounts to the first unused entry of its coin, or a fresh
  // one when the coin changed; the fields left alone follow the entry the row was loaded from.
  it('keeps the source venue, note and fee of each purchase that survives a cleared row or a changed coin', () => {
    const change = fc.constantFrom('keep' as const, 'clear' as const, 'recoin' as const);
    fc.assert(
      fc.property(
        fc.array(logged, { minLength: 1, maxLength: 6 }),
        fc.array(change, { maxLength: 6 }),
        (drawn, how) => {
          const entries = [...held, ...drawn];
          const ctx = { plan, entries, today: date('2026-10-20'), prices: null, numberInput: input };
          for (const row of transactions(plan, entries).rows) {
            // The purchases that cover every sale stay as they are: clearing or recoining one leaves a sale
            // uncovered, which the save refuses (#136, docs/DOMAIN.md §3.7).
            if (row.type === 'skip' || row.items.some((item) => held.includes(item))) continue;
            const initial = initialState(row.kind, row.items, undefined, ctx);
            const rows = initial.rows.map((each, at) => {
              const step = how[at] ?? 'keep';
              if (step === 'clear') return { ...each, amount: '', units: '' };
              if (step === 'keep') return each;
              const other = each.coin === BTC.id ? ETH : BTC;
              return { ...each, coin: other.id, decimals: other.decimals };
            });
            const current = { ...initial, rows };
            const surviving = rows.filter((each) => each.amount !== '');
            if (surviving.length === 0) continue;
            const draft = toDraft(current, input);
            if (!draft.ok) throw new Error(JSON.stringify(draft.error));
            const editing = row.items;
            const ids = rows.map(() => id());
            const saved = saveTransaction(draft.value, { plan, entries, editing, ids, now, source: 'manual' });
            if (!saved.ok) throw new Error(saved.error.code);
            const changed = changedFields(initial, current);
            const kept = keepUnchanged(saved.value, { current, draft: draft.value, editing, changed });
            const live = kept.filter((entry) => entry.deletedAt === null);
            expect(live).toEqual(
              surviving.map((each) => {
                const source = editing.find((entry) => entry.id === each.source);
                if (source === undefined) throw new Error('a row without its source');
                const { amount, units, fee, venue, note } = source;
                return expect.objectContaining({ coin: each.coin, amount, units, fee, venue, note });
              }),
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

/** A day of October or early November 2026, `offset` days from the opening day, 20 Oct. */
const dayFrom = (offset: number) => {
  const day = 20 + offset;
  return day > 31 ? `2026-11-0${day - 31}` : `2026-10-${String(day).padStart(2, '0')}`;
};
const opened = (kind: 'dca' | 'extra', input: NumberInput, monthlyAmount = money('100')) =>
  initialState(kind, [], undefined, {
    plan: aPlan({ monthlyAmount }),
    entries: [],
    today: date('2026-10-20'),
    prices: live,
    numberInput: input,
  });

describe.each(locales)('the filled price and the date in $name (ADR-0034 Readings)', ({ input, point }) => {
  const field = fc.constantFrom('amount' as const, 'units' as const, 'price' as const);
  const text = fc.oneof(typedNumber(point, 4), fc.constantFrom('', '0', point, '1,2,3'));
  const step = fc.oneof(
    fc.record({ row: fc.integer({ min: 0, max: 1 }), field, text }),
    fc.record({ day: fc.oneof(fc.integer({ min: -19, max: 5 }).map(dayFrom), fc.constantFrom('', '2026-02-30')) }),
  );

  it('never changes a typed field as the date changes, whatever was typed before', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dca' as const, 'extra' as const),
        fc.array(step, { maxLength: 14 }),
        (kind, steps) => {
          const initial = opened(kind, input);
          steps.reduce((state, each) => {
            if ('field' in each) return editRow(state, each.row, each.field, each.text, input, 'EUR');
            const next = withDate(state, each.day, initial, input, 'EUR');
            state.rows.forEach((row, at) => {
              for (const name of ['amount', 'units', 'price'] as const) {
                const filled = name === 'price' && isFilledPrice(row, initial.rows[at]);
                if (name !== row.derived && !filled && row[name] !== '') expect(next.rows[at]?.[name]).toBe(row[name]);
              }
            });
            return next;
          }, initial);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('gives the opened form back after an earlier date and then the opening day', () => {
    const cents = fc.integer({ min: 1, max: 10_000_000 });
    fc.assert(
      fc.property(
        fc.constantFrom('dca' as const, 'extra' as const),
        fc.integer({ min: -19, max: -1 }),
        cents,
        (kind, offset, each) => {
          const amount = money(`${Math.trunc(each / 100)}.${String(each % 100).padStart(2, '0')}`);
          const initial = opened(kind, input, amount);
          const earlier = withDate(initial, dayFrom(offset), initial, input, 'EUR');
          expect(earlier.rows.every((row) => row.price === '')).toBe(true);
          expect(withDate(earlier, '2026-10-20', initial, input, 'EUR')).toEqual(initial);
        },
      ),
    );
  });
});
