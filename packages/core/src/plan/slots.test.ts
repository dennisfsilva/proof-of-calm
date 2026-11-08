import { describe, expect, it } from 'vitest';
import { aPlan, date, money } from '../../test/builders';
import { slots } from './slots';

describe('slots (docs/DOMAIN.md §3.1)', () => {
  it('starts on the first buy, then falls on the buy day of every month up to the last buy', () => {
    const plan = aPlan({ firstBuy: date('2026-10-16'), buyDay: 1, lastBuy: date('2027-01-01') });
    expect(slots(plan)).toEqual([
      { key: '2026-10', due: '2026-10-16' },
      { key: '2026-11', due: '2026-11-01' },
      { key: '2026-12', due: '2026-12-01' },
      { key: '2027-01', due: '2027-01-01' },
    ]);
  });

  it('stops when the buy day of the last month is after the last buy', () => {
    const plan = aPlan({ firstBuy: date('2026-10-16'), buyDay: 20, lastBuy: date('2026-12-15') });
    expect(slots(plan).map((slot) => slot.key)).toEqual(['2026-10', '2026-11']);
  });

  it('has none without a monthly amount, or when the last buy precedes the first', () => {
    expect(slots(aPlan({ monthlyAmount: money('0'), startingAmount: money('500') }))).toEqual([]);
    expect(slots(aPlan({ firstBuy: date('2026-10-16'), lastBuy: date('2026-10-10') }))).toEqual([]);
  });

  it('is a single slot when the plan starts and ends on the same day', () => {
    expect(slots(aPlan({ firstBuy: date('2026-10-16'), lastBuy: date('2026-10-16') }))).toEqual([
      { key: '2026-10', due: '2026-10-16' },
    ]);
  });

  it('clamps buy days 29 to 31 from imported data to the month length', () => {
    const plan = aPlan({ firstBuy: date('2027-12-31'), buyDay: 31, lastBuy: date('2028-03-31') });
    expect(slots(plan)).toEqual([
      { key: '2027-12', due: '2027-12-31' },
      { key: '2028-01', due: '2028-01-31' },
      { key: '2028-02', due: '2028-02-29' },
      { key: '2028-03', due: '2028-03-31' },
    ]);
    expect(slots(aPlan({ firstBuy: date('2026-01-31'), buyDay: 30, lastBuy: date('2026-02-28') }))).toEqual([
      { key: '2026-01', due: '2026-01-31' },
      { key: '2026-02', due: '2026-02-28' },
    ]);
  });
});
