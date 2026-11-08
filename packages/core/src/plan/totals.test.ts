import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, id, instant, money, month } from '../../test/builders';
import { planTotals, strip } from './totals';

describe('planTotals (docs/DOMAIN.md §3.10)', () => {
  const plan = aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2026-12-01'), monthlyAmount: money('100') });

  it('plans the monthly amount for every active slot plus the starting amount', () => {
    const totals = planTotals({ ...plan, startingAmount: money('500') }, [], date('2026-01-10'));
    expect(totals).toEqual({
      slotCount: 12,
      activeSlots: 12,
      plannedDca: '1200',
      plannedStarting: '500',
      plannedTotal: '1700',
      investedSoFar: '0',
      percentIn: '0',
      buysLeft: 12,
    });
  });

  it('leaves skipped and paused months out of the planned total', () => {
    const skips = [{ id: id(), slot: month('2026-03'), note: '', createdAt: instant('2026-03-02T09:00:00Z') }];
    const pauses = [{ id: id(), from: date('2026-10-01'), until: null, note: '' }];
    const totals = planTotals({ ...plan, skips, pauses }, [], date('2026-02-10'));
    expect([totals.activeSlots, totals.plannedDca, totals.buysLeft]).toEqual([8, '800', 8]);
  });

  it('counts monthly buys, starting amounts and extras from the first buy day; uses the larger starting amount', () => {
    const entries = [
      anEntry({ kind: 'lump', slot: null, amount: money('600') }),
      anEntry({ slot: month('2026-01'), amount: money('100') }),
      anEntry({ kind: 'extra', slot: null, amount: money('50') }),
      anEntry({ kind: 'sell', slot: null, amount: money('999') }),
      anEntry({ slot: month('2026-02'), amount: money('100'), deletedAt: instant('2026-02-03T10:00:00Z') }),
    ];
    const totals = planTotals({ ...plan, startingAmount: money('500') }, entries, date('2026-02-10'));
    expect([totals.plannedStarting, totals.plannedTotal, totals.investedSoFar, totals.percentIn]).toEqual([
      '600',
      '1800',
      '750',
      '41.7',
    ]);
    expect(totals.buysLeft).toBe(11);
  });

  it('leaves an extra buy dated before the first buy day out', () => {
    const today = date('2026-01-01');
    const held = anEntry({ kind: 'extra', slot: null, date: date('2025-06-30'), amount: money('5000') });
    const totals = planTotals(plan, [held], today);
    expect(totals).toEqual(planTotals(plan, [], today));
    expect([totals.investedSoFar, totals.percentIn]).toEqual(['0', '0']);
  });

  it('counts monthly buys and starting amounts whatever their date, and extra buys from the first buy day on', () => {
    const entries = [
      anEntry({ kind: 'extra', slot: null, date: date('2025-12-31'), amount: money('5000') }),
      anEntry({ kind: 'extra', slot: null, date: date('2026-01-01'), amount: money('50') }),
      anEntry({ kind: 'lump', slot: null, date: date('2025-12-30'), amount: money('600') }),
      anEntry({ slot: month('2026-01'), date: date('2025-12-29'), amount: money('100') }),
      anEntry({ kind: 'sell', slot: null, amount: money('999') }),
    ];
    const totals = planTotals({ ...plan, startingAmount: money('500') }, entries, date('2026-01-02'));
    expect([totals.plannedTotal, totals.investedSoFar, totals.percentIn]).toEqual(['1800', '750', '41.7']);
  });

  it('caps the share at 100 % and has no share when nothing is planned', () => {
    const over = planTotals(plan, [anEntry({ kind: 'extra', slot: null, amount: money('5000') })], date('2026-02-10'));
    expect(over.percentIn).toBe('100');
    const skips = plan.skips;
    const allSkipped = aPlan({
      firstBuy: date('2026-01-01'),
      lastBuy: date('2026-01-01'),
      skips: [...skips, { id: id(), slot: month('2026-01'), note: '', createdAt: instant('2026-01-02T09:00:00Z') }],
    });
    expect(planTotals(allSkipped, [], date('2026-02-10')).percentIn).toBeNull();
  });
});

describe('strip (docs/DOMAIN.md §3.10)', () => {
  const cycle = aPlan({
    firstBuy: date('2026-01-01'),
    lastBuy: date('2026-12-31'),
    sellWindow: { opens: date('2028-01-01'), closes: date('2028-06-30'), exitBy: date('2028-12-31') },
    references: { peakFrom: date('2028-03-01'), peakTo: date('2028-04-30') },
  });

  it('places Buy, Hold, Sell and exit on the days from the first buy to the exit date', () => {
    const result = strip(cycle, date('2026-07-02'));
    expect(result.start).toBe('2026-01-01');
    expect(result.end).toBe('2028-12-31');
    // 1095 days from 2026-01-01 to 2028-12-31; the last buy is day 364, the window opens on day 730.
    expect(result.segments).toEqual([
      { kind: 'buy', from: '0', to: '0.33242', openEnded: false },
      { kind: 'hold', from: '0.33242', to: '0.666667', openEnded: false },
      { kind: 'sell', from: '0.666667', to: '0.831963', openEnded: false },
      { kind: 'exit', from: '0.831963', to: '1', openEnded: false },
    ]);
    expect(result.peak).toEqual({ from: '0.721461', to: '0.776256' });
    expect(result.today).toBe('0.16621');
    expect(result.elapsed).toBe('0.16621');
  });

  it('has no today marker outside the strip, and is fully elapsed after it', () => {
    expect(strip(cycle, date('2025-12-01'))).toEqual(expect.objectContaining({ today: null, elapsed: '0' }));
    expect(strip(cycle, date('2029-06-01'))).toEqual(expect.objectContaining({ today: null, elapsed: '1' }));
    expect(strip({ ...cycle, references: { peakFrom: date('2028-03-01') } }, date('2026-07-02')).peak).toBeNull();
  });

  it('draws an open-ended hold as long as the buy phase without a sell window, stretched to today', () => {
    const accumulate = aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2026-12-31'), sellWindow: null });
    const early = strip(accumulate, date('2026-07-02'));
    expect(early.end).toBe('2027-12-30');
    expect(early.segments).toEqual([
      { kind: 'buy', from: '0', to: '0.5', openEnded: false },
      { kind: 'hold', from: '0.5', to: '1', openEnded: true },
    ]);
    const later = strip(accumulate, date('2030-01-01'));
    expect(later.end).toBe('2030-01-01');
    expect(later.today).toBe('1');
  });

  it('survives a one-day plan', () => {
    const oneDay = aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2026-01-01'), sellWindow: null });
    expect(strip(oneDay, date('2026-01-01')).segments[0]).toEqual({
      kind: 'buy',
      from: '0',
      to: '0',
      openEnded: false,
    });
  });
});
