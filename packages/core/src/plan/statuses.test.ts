import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, id, instant, money, month } from '../../test/builders';
import type { Plan } from '../schema/plan';
import { actionsNow, focusSlot, isOpen, liveEntries, pauseOn, primaryAction, slotStatuses } from './statuses';

const plan = (overrides: Partial<Plan> = {}) =>
  aPlan({ firstBuy: date('2026-01-15'), buyDay: 1, lastBuy: date('2026-06-01'), ...overrides });
const skip = (slot: string) => ({
  id: id(),
  slot: month(slot),
  note: 'travelling',
  createdAt: instant('2026-03-01T10:00:00Z'),
});
const pause = (from: string, until: string | null) => ({
  id: id(),
  from: date(from),
  until: until === null ? null : date(until),
  note: '',
});

describe('slotStatuses (docs/DOMAIN.md §3.2)', () => {
  const january = [
    anEntry({ slot: month('2026-01'), date: date('2026-01-17'), amount: money('70') }),
    anEntry({ slot: month('2026-01'), date: date('2026-01-16'), coin: 'ETH' as never, amount: money('30') }),
  ];

  it('marks done, skipped, paused, late, due and upcoming slots, first match winning', () => {
    const statuses = slotStatuses(
      plan({ skips: [skip('2026-03')], pauses: [pause('2026-04-01', '2026-04-30')] }),
      january,
      date('2026-05-01'),
    );
    expect(statuses.map((slot) => [slot.key, slot.status])).toEqual([
      ['2026-01', 'done'],
      ['2026-02', 'late'],
      ['2026-03', 'skipped'],
      ['2026-04', 'paused'],
      ['2026-05', 'due'],
      ['2026-06', 'upcoming'],
    ]);
  });

  it('a held entry dated in a month never marks it done', () => {
    const p = plan();
    const held = (day: string) => anEntry({ kind: 'held', slot: null, fee: null, date: date(day), amount: null });
    const entries = ['2026-02-01', '2026-02-15', '2026-03-01'].map(held);
    expect(slotStatuses(p, entries, date('2026-03-10'))).toEqual(slotStatuses(p, [], date('2026-03-10')));
  });

  it('gives a done slot its total, its first date and its entries', () => {
    const [first] = slotStatuses(plan(), january, date('2026-02-10'));
    expect(first).toEqual(
      expect.objectContaining({ status: 'done', loggedAmount: '100', loggedOn: '2026-01-16', entries: january }),
    );
  });

  it('keeps a logged slot done even inside a pause or after a skip, and ignores deleted entries', () => {
    const statuses = slotStatuses(
      plan({ skips: [skip('2026-01')], pauses: [pause('2026-01-01', null)] }),
      january,
      date('2026-02-10'),
    );
    expect(statuses[0]?.status).toBe('done');
    const deleted = january.map((entry) => ({ ...entry, deletedAt: instant('2026-01-20T10:00:00Z') }));
    expect(slotStatuses(plan(), deleted, date('2026-02-10'))[0]?.status).toBe('late');
  });

  it('puts an open-ended pause over every later slot', () => {
    const statuses = slotStatuses(plan({ pauses: [pause('2026-03-01', null)] }), [], date('2026-02-01'));
    expect(statuses.map((slot) => slot.status)).toEqual(['late', 'due', 'paused', 'paused', 'paused', 'paused']);
  });
});

describe('pauseOn and helpers', () => {
  it('finds the pause containing a date, ends included', () => {
    const p = plan({ pauses: [pause('2026-04-01', '2026-04-30')] });
    expect(pauseOn(p, date('2026-04-30'))?.from).toBe('2026-04-01');
    expect(pauseOn(p, date('2026-05-01'))).toBeNull();
    expect(pauseOn(p, date('2026-03-31'))).toBeNull();
  });

  it('separates open statuses from handled ones and live entries from deleted ones', () => {
    expect(['done', 'skipped', 'paused', 'late', 'due', 'upcoming'].map((status) => isOpen(status as never))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    const kept = anEntry();
    expect(liveEntries([kept, anEntry({ deletedAt: instant('2026-01-02T00:00:00Z') })])).toEqual([kept]);
  });
});

describe('focusSlot (docs/DOMAIN.md §3.3)', () => {
  it('is the current month, whatever its status', () => {
    const statuses = slotStatuses(plan(), [anEntry({ slot: month('2026-03') })], date('2026-03-20'));
    expect(focusSlot(statuses, date('2026-03-20'))?.key).toBe('2026-03');
  });

  it('is otherwise the first open slot due today or later, or none after the last slot', () => {
    const before = slotStatuses(plan(), [], date('2025-12-20'));
    expect(focusSlot(before, date('2025-12-20'))?.key).toBe('2026-01');
    const after = slotStatuses(plan(), [], date('2026-07-10'));
    expect(focusSlot(after, date('2026-07-10'))).toBeNull();
  });
});

describe('actionsNow and primaryAction (docs/DOMAIN.md §3.3)', () => {
  it('lists the unlogged starting amount, the late months and the focus month, by due date', () => {
    const actions = actionsNow(plan({ startingAmount: money('500') }), [], date('2026-03-10'));
    expect(actions.map((action) => [action.kind, action.slot, action.status, action.plannedAmount])).toEqual([
      ['lump', null, 'late', '500'],
      ['dca', '2026-01', 'late', '100'],
      ['dca', '2026-02', 'late', '100'],
      ['dca', '2026-03', 'late', '100'],
    ]);
    expect(primaryAction(actions)?.kind).toBe('lump');
  });

  it('keeps the logged focus month so Today can show "Logged" with "Add to it"', () => {
    const logged = [anEntry({ slot: month('2026-03'), date: date('2026-03-02'), amount: money('100') })];
    const actions = actionsNow(plan(), logged, date('2026-03-10'));
    expect(actions.at(-1)).toEqual(expect.objectContaining({ slot: '2026-03', status: 'done', loggedAmount: '100' }));
    expect(primaryAction(actions)?.slot).toBe('2026-01');
  });

  it('stops asking once the starting amount is logged, and has nothing when every month is handled', () => {
    const entries = [
      anEntry({ kind: 'lump', slot: null, date: date('2026-01-15') }),
      ...['2026-01', '2026-02', '2026-03'].map((slot) => anEntry({ slot: month(slot) })),
    ];
    const actions = actionsNow(plan({ startingAmount: money('500') }), entries, date('2026-03-10'));
    expect(actions.map((action) => action.kind)).toEqual(['dca']);
    expect(primaryAction(actions)).toBeNull();
  });

  it('never asks about a skipped or paused month: the next open one becomes primary', () => {
    const p = plan({ skips: [skip('2026-03')], firstBuy: date('2026-03-01'), lastBuy: date('2026-06-01') });
    const actions = actionsNow(p, [], date('2026-03-10'));
    expect(actions.map((action) => [action.slot, action.status])).toEqual([['2026-03', 'skipped']]);
    expect(primaryAction(actions)).toBeNull();
    const nextMonth = actionsNow(p, [], date('2026-04-01'));
    expect(primaryAction(nextMonth)).toEqual(expect.objectContaining({ slot: '2026-04', status: 'due' }));
  });

  it('lists every late month after the last slot, when no month is in focus', () => {
    const actions = actionsNow(plan(), [], date('2026-07-10'));
    expect(actions.map((action) => action.slot)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(primaryAction(actions)?.slot).toBe('2026-01');
  });

  it('dates the starting amount on the first buy: upcoming, due, then late', () => {
    const p = plan({ startingAmount: money('500.00') });
    expect(actionsNow(p, [], date('2026-01-10'))[0]?.status).toBe('upcoming');
    expect(actionsNow(p, [], date('2026-01-15'))[0]?.status).toBe('due');
    expect(actionsNow(plan({ startingAmount: money('0.00') }), [], date('2026-01-10')).map((a) => a.kind)).toEqual([
      'dca',
    ]);
  });
});
