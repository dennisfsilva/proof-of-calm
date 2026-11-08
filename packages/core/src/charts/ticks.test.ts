import { describe, expect, it } from 'vitest';
import { money } from '../../test/builders';
import type { Percent, Price } from '../money/decimal';
import { tickStep, ticks } from './ticks';

const price = (value: string) => value as Price;

describe('tickStep', () => {
  it('chooses 1, 2, 5 or 10 times the power of ten below span / count, as d3 does', () => {
    expect(tickStep(money('0'), money('100'), 5)).toBe('20');
    expect(tickStep(money('0'), money('1'), 10)).toBe('0.1');
    expect(tickStep(money('0'), money('7'), 5)).toBe('1');
    expect(tickStep(money('0'), money('10'), 3)).toBe('5');
    expect(tickStep(money('0'), money('8'), 1)).toBe('10');
    expect(tickStep(price('58123.45'), price('61987.6'), 5)).toBe('1000');
    expect(tickStep(price('0.00012'), price('0.00031'), 4)).toBe('0.00005');
  });

  it('refuses a count below one or a domain that does not ascend', () => {
    expect(() => tickStep(money('0'), money('1'), 0)).toThrow(RangeError);
    expect(() => tickStep(money('0'), money('1'), 1.5)).toThrow(RangeError);
    expect(() => tickStep(money('1'), money('1'), 5)).toThrow(RangeError);
    expect(() => tickStep(money('2'), money('1'), 5)).toThrow(RangeError);
  });
});

describe('ticks (ADR-0022)', () => {
  it('lists the multiples of the step inside the domain, exactly', () => {
    expect(ticks(money('0'), money('100'))).toEqual(['0', '20', '40', '60', '80', '100']);
    expect(ticks(money('0'), money('1'), 10)).toEqual([
      '0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '1',
    ]);
    expect(ticks(price('58123.45'), price('61987.6'))).toEqual(['59000', '60000', '61000']);
    expect(ticks(price('0.00012'), price('0.00031'), 4)).toEqual(['0.00015', '0.0002', '0.00025', '0.0003']);
  });

  it('starts at the first multiple at or above the low end, below zero too', () => {
    expect(ticks('-30' as Percent, '0' as Percent)).toEqual(['-30', '-25', '-20', '-15', '-10', '-5', '0']);
    expect(ticks('-32' as Percent, '-3' as Percent)).toEqual(['-30', '-25', '-20', '-15', '-10', '-5']);
    expect(ticks(money('3'), money('31'))).toEqual(['5', '10', '15', '20', '25', '30']);
  });

  it('has the one tick of a flat domain, and may have none for a narrow domain and one tick asked', () => {
    expect(ticks(money('5'), money('5'))).toEqual(['5']);
    expect(ticks(money('0.51'), money('0.59'), 1)).toEqual([]);
  });
});
