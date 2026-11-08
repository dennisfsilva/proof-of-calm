import { describe, expect, it } from 'vitest';
import { aPlan, date, id } from '../../test/builders';
import { phase } from './phase';
import { sellTranches } from './tranches';

const window = { opens: date('2029-06-01'), closes: date('2029-10-31'), exitBy: date('2029-12-31') };
const cycle = aPlan({ firstBuy: date('2026-10-16'), lastBuy: date('2028-06-01'), sellWindow: window });

describe('phase (docs/DOMAIN.md §3.5)', () => {
  it.each([
    ['2026-10-15', 'before'],
    ['2026-10-16', 'buy'],
    ['2028-06-01', 'buy'],
    ['2028-06-02', 'hold'],
    ['2029-05-31', 'hold'],
    ['2029-06-01', 'sell'],
    ['2029-10-31', 'sell'],
    ['2029-11-01', 'exit'],
    ['2029-12-31', 'exit'],
    ['2030-01-01', 'done'],
  ] as const)('on %s the plan is in %s', (today, kind) => {
    expect(phase(cycle, date(today))).toEqual({ kind, openEnded: false, pause: null });
  });

  it('holds forever without a sell window', () => {
    const accumulate = aPlan({ lastBuy: date('2026-12-01'), sellWindow: null });
    expect(phase(accumulate, date('2040-01-01'))).toEqual({ kind: 'hold', openEnded: true, pause: null });
    expect(phase(accumulate, date('2026-06-01')).openEnded).toBe(false);
  });

  it('stays in the buy phase during a pause and names the pause', () => {
    const pause = { id: id(), from: date('2026-03-01'), until: null, note: 'car repair' };
    const paused = aPlan({ pauses: [pause] });
    expect(phase(paused, date('2026-04-10'))).toEqual({ kind: 'buy', openEnded: false, pause });
    expect(phase(paused, date('2026-02-10')).pause).toBeNull();
    expect(phase(paused, date('2027-01-10')).pause).toBeNull();
  });

  it('names no pause once buying ended: on the end day the phase is still buy, and the pause is over', () => {
    const pause = { id: id(), from: date('2026-03-01'), until: null, note: '' };
    const ended = aPlan({ pauses: [pause], lastBuy: date('2026-04-10'), endedBuyingOn: date('2026-04-10') });
    expect(phase(ended, date('2026-04-10'))).toEqual({ kind: 'buy', openEnded: false, pause: null });
  });
});

describe('sellTranches (docs/DOMAIN.md §3.8)', () => {
  it('sells a third in the first month, a third in the third, the rest in the closing month', () => {
    expect(sellTranches({ ...cycle, sellChecks: { part1: true, part2: false, part3: false } })).toEqual([
      { part: 1, month: '2029-06', portion: 'third', done: true },
      { part: 2, month: '2029-08', portion: 'third', done: false },
      { part: 3, month: '2029-10', portion: 'rest', done: false },
    ]);
  });

  it('moves part 2 onto the closing month in a window shorter than three months', () => {
    const short = {
      ...cycle,
      sellWindow: { opens: date('2029-06-15'), closes: date('2029-07-10'), exitBy: date('2029-07-31') },
    };
    expect(sellTranches(short).map((tranche) => tranche.month)).toEqual(['2029-06', '2029-07', '2029-07']);
    const oneMonth = {
      ...cycle,
      sellWindow: { opens: date('2029-06-01'), closes: date('2029-06-30'), exitBy: date('2029-06-30') },
    };
    expect(sellTranches(oneMonth).map((tranche) => tranche.month)).toEqual(['2029-06', '2029-06', '2029-06']);
  });

  it('a window under 3 months that touches 4 calendar months keeps part 2 in its third month', () => {
    const fourMonths = {
      ...cycle,
      sellWindow: { opens: date('2029-01-15'), closes: date('2029-04-05'), exitBy: date('2029-04-30') },
    };
    expect(sellTranches(fourMonths).map((tranche) => tranche.month)).toEqual(['2029-01', '2029-03', '2029-04']);
  });

  it('has none without a sell window', () => {
    expect(sellTranches(aPlan({ sellWindow: null }))).toEqual([]);
  });
});
