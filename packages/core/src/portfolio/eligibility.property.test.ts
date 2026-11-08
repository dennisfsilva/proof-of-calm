import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, instant, money, units } from '../../test/builders';
import { saveTransaction, type TransactionDraft } from '../actions/entries';
import { rowEntries } from '../actions/rows';
import { compareDates, compareInstants } from '../dates/calendar';
import { compare, isPositive, min, minus, plus, sum, type Units } from '../money/decimal';
import type { Entry } from '../schema/entry';
import type { EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import {
  DEFAULT_HOLDING_CONTEXT,
  type HoldingContext,
  lotEligibleFrom,
  type SaleWarning,
  saleWarning,
  sellableNow,
} from './eligibility';
import { lots, matchLots, runningHeld } from './lots';
import { portfolio } from './portfolio';

// docs/DOMAIN.md §3.7: a sale takes its venue's group first under per-venue scope, then the other groups' lots held at
// its date, and one queue under global scope; the units sellable now and later are never more than are held.

const portugal = aPlan();
const germany: Plan = { ...portugal, holdingRule: { kind: 'years', years: 1, effect: 'exempt' } };
const perVenue: HoldingContext = { ...DEFAULT_HOLDING_CONTEXT, lotScope: 'per-venue' };

const DAYS = ['2025-01-10', '2025-06-10', '2025-11-10', '2026-03-10', '2026-08-10', '2026-12-10'];
const SALE_DAYS = ['2026-01-01', '2026-06-01', '2027-01-01', '2027-09-01'];
const QUANTITIES = ['0.001', '0.004', '0.01', '0.025'];
const VENUES = ['Kraken', 'Bitvavo', 'Coinbase', null];

type Row = { readonly sale: boolean; readonly day: string; readonly quantity: string; readonly venue: string | null };
const row = (sale: fc.Arbitrary<boolean>): fc.Arbitrary<Row> =>
  fc.record({
    sale,
    day: fc.constantFrom(...DAYS),
    quantity: fc.constantFrom(...QUANTITIES),
    venue: fc.constantFrom(...VENUES),
  });
const toEntry = ({ sale, day, quantity, venue }: Row): Entry =>
  anEntry({
    kind: sale ? 'sell' : 'extra',
    slot: null,
    coin: BTC.id,
    date: date(day),
    units: units(quantity),
    amount: money('100'),
    venue,
  });
const rows = fc.array(row(fc.boolean()), { maxLength: 10 });
const buys = fc.array(row(fc.constant(false)), { maxLength: 6 });
const NOW = '2027-12-01T12:00:00Z';
// Times of day to log at; the first two name one moment, as entries imported together share one.
const MOMENTS = ['T09:00:00Z', 'T10:00:00+01:00', 'T10:00:00Z'];
const draftOf = (quantity: string, venue: string | null) => [
  {
    id: '00000000-0000-4000-8000-999999999999' as EntityId,
    coin: BTC.id,
    units: units(quantity),
    venue,
    createdAt: instant(NOW),
  },
];

/** A plain replay of the lot matching (§3.7): per sale, the units it takes from lots past the rule on its date. */
function pastTheRule(plan: Plan, entries: readonly Entry[], context: HoldingContext): Map<EntityId, Units> {
  const sale = (entry: Entry) => Number(entry.kind === 'sell');
  const order = (a: Entry, b: Entry) =>
    compareDates(a.date, b.date) ||
    sale(a) - sale(b) ||
    compareInstants(a.createdAt, b.createdAt) ||
    (a.id < b.id ? -1 : 1);
  const open: { group: string; date: Entry['date']; left: Units }[] = [];
  const past = new Map<EntityId, Units>();
  for (const entry of entries.filter((each) => each.deletedAt === null && each.coin === BTC.id).toSorted(order)) {
    const group = context.lotScope === 'per-venue' ? (entry.venue ?? '') : '';
    if (entry.kind !== 'sell') {
      open.push({ group, date: entry.date, left: entry.units });
      continue;
    }
    let toMatch = entry.units;
    let eligible = '0' as Units;
    // Its own group's lots first, then the other groups' lots open at its date; the warning counts its own group's.
    for (const ours of [true, false]) {
      while (isPositive(toMatch)) {
        const candidates = open.filter((lot) => (lot.group === group) === ours && isPositive(lot.left));
        const next = context.lotRule === 'lifo' ? candidates.at(-1) : candidates[0];
        if (next === undefined) break;
        const taken = min(next.left, toMatch);
        next.left = minus(next.left, taken);
        toMatch = minus(toMatch, taken);
        if (ours && lotEligibleFrom(plan, next, context) <= entry.date) eligible = plus(eligible, taken);
      }
    }
    past.set(entry.id, eligible);
  }
  return past;
}
const SECOND = '00000000-0000-4000-8000-999999999998' as EntityId;
const plans = fc.constantFrom(portugal, germany);
const saleDay = fc.constantFrom(...SALE_DAYS).map(date);
const quantity = fc.constantFrom(...QUANTITIES);
const venue = fc.constantFrom(...VENUES);

describe('saleWarning and sellableNow (docs/DOMAIN.md §3.7)', () => {
  // A sale its own venue cannot cover takes other venues' lots (§3.7), so lots added there can change what is left at
  // the draft's venue; while every stored sale is covered by its own venue they cannot.
  it('per venue: lots added at another venue never change a warning while each sale is covered by its own venue', () => {
    fc.assert(
      fc.property(plans, rows, buys, quantity, venue, saleDay, (plan, base, added, sold, at, day) => {
        const entries = base.map(toEntry);
        const venueOf = new Map(entries.map((entry) => [entry.id, entry.venue]));
        fc.pre(
          matchLots(entries, BTC.id, 'per-venue').sales.every((sale) =>
            sale.takes.every((take) => venueOf.get(take.lot) === venueOf.get(sale.id)),
          ),
        );
        const elsewhere = added.filter((buy) => buy.venue !== at).map(toEntry);
        const draft = draftOf(sold, at);
        expect(saleWarning(plan, [...entries, ...elsewhere], draft, day, perVenue)).toEqual(
          saleWarning(plan, entries, draft, day, perVenue),
        );
      }),
    );
  });

  it('global: the warning is the same whatever venue the draft names', () => {
    fc.assert(
      fc.property(plans, rows, quantity, venue, saleDay, (plan, base, sold, at, day) => {
        const entries = base.map(toEntry);
        expect(saleWarning(plan, entries, draftOf(sold, at), day)).toEqual(
          saleWarning(plan, entries, draftOf(sold, null), day),
        );
      }),
    );
  });

  it('splitting a draft sale into two sales of its group never lowers the units the warning says are not past the rule', () => {
    const contexts = fc.constantFrom(perVenue, DEFAULT_HOLDING_CONTEXT);
    const short = (warnings: readonly SaleWarning[]) =>
      sum(warnings.map((warning) => minus(warning.sold, warning.eligible)));
    fc.assert(
      fc.property(
        plans,
        contexts,
        rows,
        quantity,
        quantity,
        venue,
        saleDay,
        (plan, context, base, one, two, at, day) => {
          const entries = base.map(toEntry);
          const halves = [...draftOf(one, at), { ...draftOf(two, at)[0]!, id: SECOND }];
          const whole = saleWarning(plan, entries, draftOf(plus(units(one), units(two)), at), day, context);
          const split = saleWarning(plan, entries, halves, day, context);
          expect(compare(short(split), short(whole))).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  // The oracle: a grouped edit of sales is saved, and each stored sale's units past the rule are read off a plain
  // replay of the lot matching over the entries after the save. The warning, read before the save from the draft's
  // sales as the form builds them, names exactly the sales that replay gives fewer units past the rule than they sell.
  it('a grouped edit warns on each sale by the units the lot matching gives it once the save is applied', () => {
    const contexts = fc.constantFrom(
      perVenue,
      DEFAULT_HOLDING_CONTEXT,
      { ...perVenue, lotRule: 'lifo' as const },
      { ...DEFAULT_HOLDING_CONTEXT, lotRule: 'lifo' as const },
    );
    const edits = fc.integer({ min: 2, max: 3 }).chain((count) =>
      fc.record({
        logged: fc.array(fc.constantFrom(...MOMENTS), { minLength: count, maxLength: count }),
        stored: fc.array(quantity, { minLength: count, maxLength: count }),
        typed: fc.array(fc.option(quantity, { nil: null }), { minLength: count, maxLength: count }),
        order: fc.shuffledSubarray([...Array(count).keys()], { minLength: count, maxLength: count }),
        added: fc.option(quantity, { nil: null }),
      }),
    );
    fc.assert(
      fc.property(plans, contexts, rows, edits, venue, saleDay, (plan, context, base, edit, at, day) => {
        const anchor = toEntry({ sale: false, day: '2024-01-10', quantity: '0.05', venue: at });
        const entries = [anchor, ...base.map(toEntry)];
        const editing = edit.stored.map((each, index) => ({
          ...toEntry({ sale: true, day, quantity: each, venue: at }),
          createdAt: instant(`${day}${edit.logged[index]}`),
        }));
        // The rows in the Log's order; a row typed null is cleared, and a row the edit adds names no entry.
        const draftRows = [
          ...edit.order.map((index) => ({ coin: BTC.id, entry: editing[index]!.id, typed: edit.typed[index]! })),
          ...(edit.added === null ? [] : [{ coin: BTC.id, entry: null, typed: edit.added }]),
        ];
        const ids = draftRows.map((_, index) => `00000000-0000-4000-8000-99999999990${index}` as EntityId);
        const draft: TransactionDraft = {
          kind: 'sell',
          date: day,
          slot: null,
          fee: null,
          note: '',
          venue: at,
          rows: draftRows.map(({ coin, entry, typed }) => ({
            coin,
            entry,
            units: typed === null ? null : units(typed),
            amount: typed === null ? null : money('100'),
          })),
        };
        const stored = [...entries, ...editing];
        const now = instant(NOW);
        const saved = saveTransaction(draft, { plan, entries: stored, editing, ids, now, source: 'manual' });
        if (!saved.ok) return;
        // The draft's sales as the form reads them: the entry rowEntries gives each filled row, else a fresh id at now.
        const filled = draft.rows.filter((row) => row.units !== null);
        const { taken } = rowEntries(filled, editing);
        let fresh = 0;
        const sales = filled.map((row, index) => ({
          id: taken[index]?.id ?? ids[fresh++]!,
          createdAt: taken[index]?.createdAt ?? now,
          coin: row.coin,
          units: row.units!,
          venue: at,
        }));
        const warnings = saleWarning(
          plan,
          stored,
          sales,
          day,
          context,
          editing.map((sale) => sale.id),
        );

        const written = new Set(saved.value.map((entry) => entry.id));
        const replay = pastTheRule(
          plan,
          [...stored.filter((entry) => !written.has(entry.id)), ...saved.value],
          context,
        );
        const expected = saved.value
          .filter((entry) => entry.deletedAt === null)
          .flatMap((entry) => {
            const eligible = replay.get(entry.id) ?? ('0' as Units);
            return compare(entry.units, eligible) > 0
              ? [{ sale: entry.id, coin: BTC.id, sold: entry.units, eligible }]
              : [];
          });
        expect(warnings).toEqual(expected);
      }),
    );
  });

  it('lots and runningHeld are the same for any order of the entries, logged at one moment or not', () => {
    const contexts = fc.constantFrom(perVenue, DEFAULT_HOLDING_CONTEXT);
    const stamped = fc.array(fc.tuple(row(fc.boolean()), fc.constantFrom(...MOMENTS)), { maxLength: 10 });
    const shuffled = stamped.chain((each) =>
      fc.tuple(
        fc.constant(each),
        fc.shuffledSubarray([...each.keys()], { minLength: each.length, maxLength: each.length }),
      ),
    );
    const rules = fc.constantFrom('fifo' as const, 'lifo' as const);
    fc.assert(
      fc.property(contexts, rules, shuffled, (context, rule, [each, order]) => {
        const entries = each.map(([fields, moment]) => ({
          ...toEntry(fields),
          createdAt: instant(`${fields.day}${moment}`),
        }));
        const permuted = order.map((index) => entries[index]!);
        expect(lots(permuted, BTC.id, context.lotScope, rule)).toEqual(lots(entries, BTC.id, context.lotScope, rule));
        expect(runningHeld(permuted, BTC.id)).toEqual(runningHeld(entries, BTC.id));
      }),
    );
  });

  it('now + Σ later never exceeds the units held', () => {
    const contexts = fc.constantFrom(perVenue, DEFAULT_HOLDING_CONTEXT);
    fc.assert(
      fc.property(plans, contexts, rows, saleDay, (plan, context, base, today) => {
        const entries = base.map(toEntry);
        const held = portfolio(plan, entries, null).positions[0]?.units ?? ('0' as Units);
        const { now, later } = sellableNow(plan, entries, BTC.id, today, context);
        expect(compare(sum([now, ...later.map((part) => part.units)]), held)).toBeLessThanOrEqual(0);
      }),
    );
  });
});
