import { describe, expect, it } from 'vitest';
import { aMove, anEntry, aPlan, date, id, instant, money, month, units } from '../../test/builders';
import { DEFAULT_HOLDING_CONTEXT } from '../portfolio/eligibility';
import type { Entry } from '../schema/entry';
import { transactions } from './transactions';

const plan = aPlan({ firstBuy: date('2026-01-01'), buyDay: 5, lastBuy: date('2026-12-05') });

describe('transactions (docs/DOMAIN.md §3.9)', () => {
  const january = [
    anEntry({
      slot: month('2026-01'),
      date: date('2026-01-01'),
      coin: 'ETH' as never,
      amount: money('30'),
      fee: money('0.3'),
    }),
    anEntry({ slot: month('2026-01'), date: date('2026-01-01'), amount: money('70'), fee: money('0.7') }),
  ];
  const sale = anEntry({ kind: 'sell', slot: null, date: date('2026-02-20'), amount: money('500'), fee: null });
  const extra = anEntry({ kind: 'extra', slot: null, date: date('2026-02-20'), amount: money('50') });

  it('groups by kind, date and slot, largest item first, with totals, fees and the holding date', () => {
    const { rows } = transactions(plan, january);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toEqual(
      expect.objectContaining({
        type: 'transaction',
        key: 'dca|2026-01-01|2026-01',
        kind: 'dca',
        date: '2026-01-01',
        slot: '2026-01',
        total: '100',
        fees: '1',
        holding: { kind: 'dated', from: '2027-01-01', effect: 'exempt' },
      }),
    );
    expect(row?.type === 'transaction' && row.items.map((item) => item.amount)).toEqual(['70', '30']);
  });

  it('sorts newest first, then by key, and gives sales no holding date', () => {
    const { rows } = transactions(plan, [...january, sale, extra]);
    expect(rows.map((row) => row.key)).toEqual(['sell|2026-02-20|', 'extra|2026-02-20|', 'dca|2026-01-01|2026-01']);
    expect(rows[0]?.type === 'transaction' && rows[0].holding).toBeNull();
  });

  it('orders transactions of one day by key, descending', () => {
    const day = date('2026-02-20');
    const sameDay = [
      anEntry({ kind: 'extra', slot: null, date: day }),
      anEntry({ kind: 'dca', slot: month('2026-02'), date: day }),
      anEntry({ kind: 'sell', slot: null, date: day }),
      anEntry({ kind: 'lump', slot: null, date: day }),
    ];
    expect(transactions(plan, sameDay).rows.map((row) => row.key.split('|')[0])).toEqual([
      'sell',
      'lump',
      'extra',
      'dca',
    ]);
  });

  it('shows a skipped month where its buy would have been', () => {
    const skips = [
      { id: id(), slot: month('2026-03'), note: 'travelling', createdAt: instant('2026-03-04T10:00:00Z') },
    ];
    const { rows } = transactions({ ...plan, skips }, january);
    expect(rows[0]).toEqual(expect.objectContaining({ type: 'skip', date: '2026-03-05', slot: '2026-03' }));
  });

  it('places a skip whose slot left the plan on that month’s buy day', () => {
    const skips = [{ id: id(), slot: month('2027-02'), note: '', createdAt: instant('2026-03-04T10:00:00Z') }];
    expect(transactions({ ...plan, skips }, []).rows[0]?.date).toBe('2027-02-05');
  });

  it('adds month headers with what was bought and sold, skipped months included', () => {
    const skips = [{ id: id(), slot: month('2026-03'), note: '', createdAt: instant('2026-03-04T10:00:00Z') }];
    const { months } = transactions({ ...plan, skips }, [...january, sale, extra]);
    expect(months).toEqual([
      { month: '2026-03', bought: '0', sold: '0' },
      { month: '2026-02', bought: '50', sold: '500' },
      { month: '2026-01', bought: '100', sold: '0' },
    ]);
  });

  describe('coins held (`held`), with or without a recorded cost', () => {
    const held = (coin: string, amount: string | null) =>
      anEntry({
        kind: 'held',
        slot: null,
        fee: null,
        date: date('2025-06-01'),
        coin: coin as never,
        amount: amount === null ? null : money(amount),
      });

    it('sorts the items with no cost last and totals the recorded costs', () => {
      const unknown = held('SOL', null);
      const [row] = transactions(plan, [unknown, held('ETH', '0'), held('BTC', '120')]).rows;
      expect(row).toMatchObject({ kind: 'held', total: '120', fees: '0' });
      expect(row?.type === 'transaction' && row.items.map((item) => item.coin)).toEqual(['BTC', 'ETH', 'SOL']);
      expect(row?.type === 'transaction' && row.items.at(-1)).toBe(unknown);
    });

    it('gives a total of null when no item has a cost', () => {
      const [row] = transactions(plan, [held('BTC', null), held('ETH', null)]).rows;
      expect(row).toMatchObject({ kind: 'held', total: null });
    });

    it('leaves held entries out of the month header, as the plan totals do', () => {
      const bought = anEntry({ kind: 'extra', slot: null, date: date('2025-06-03'), amount: money('50') });
      const { months } = transactions(plan, [held('BTC', '120'), held('ETH', null), bought]);
      expect(months).toEqual([{ month: '2025-06', bought: '50', sold: '0' }]);
    });
  });

  it('leaves deleted entries out and says nothing about holding where no rule exists', () => {
    const deleted = { ...extra, deletedAt: instant('2026-02-21T10:00:00Z') };
    expect(transactions(plan, [deleted]).rows).toEqual([]);
    const spain = { ...plan, holdingRule: { kind: 'none' } as const };
    const [row] = transactions(spain, january, DEFAULT_HOLDING_CONTEXT).rows;
    expect(row?.type === 'transaction' && row.holding).toEqual({ kind: 'none' });
  });

  it('a move row carries its shortfall under per-venue lots, and under global lots only when its fee was taken at the destination', () => {
    const kraken = anEntry({
      kind: 'extra',
      slot: null,
      date: date('2026-01-10'),
      units: units('0.02'),
      venue: 'Kraken',
    });
    const ledger = anEntry({
      kind: 'extra',
      slot: null,
      date: date('2026-01-10'),
      units: units('0.10'),
      venue: 'Ledger',
    });
    // 0.01 of the 0.05 sent found outside Ledger: the fee is covered there, the units received only in part.
    const partly = aMove({ date: date('2026-03-01'), units: units('0.05'), received: units('0.0498') });
    const outsideOf = (entries: Entry[], lotScope: 'per-venue' | 'global') =>
      transactions(plan, entries, { overrides: [], lotScope, lotRule: 'fifo' }).rows.map((row) =>
        row.type === 'transaction' ? [row.kind, row.outside?.short ?? null] : [row.type, null],
      );
    const sold = anEntry({ kind: 'sell', slot: null, date: date('2026-02-01'), units: units('0.01'), venue: 'Kraken' });
    expect(outsideOf([kraken, sold, partly], 'per-venue')).toEqual([
      ['move', '0.04'],
      ['sell', null],
      ['extra', null],
    ]);
    expect(outsideOf([kraken, sold, partly], 'global')).toEqual([
      ['move', null],
      ['sell', null],
      ['extra', null],
    ]);
    // Nothing outside Ledger: the fee is taken at Ledger, so the row carries it in every country.
    for (const lotScope of ['per-venue', 'global'] as const) {
      expect(outsideOf([ledger, partly], lotScope)).toEqual([
        ['move', '0.05'],
        ['extra', null],
      ]);
    }
    // Global FIFO sells the Kraken lot, but the sale at Ledger leaves 0.02 BTC at Kraken, which covers the move: no line.
    const ledgerSale = { ...sold, id: id(), units: units('0.10'), venue: 'Ledger' };
    const small = { ...partly, id: id(), units: units('0.02'), received: units('0.0199') };
    const later = { ...ledger, id: id(), date: date('2026-01-20') };
    expect(outsideOf([kraken, later, ledgerSale, small], 'global')).toEqual([
      ['move', null],
      ['sell', null],
      ['extra', null],
      ['extra', null],
    ]);
  });
});
