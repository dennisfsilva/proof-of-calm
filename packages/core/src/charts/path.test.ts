import { describe, expect, it } from 'vitest';
import { areaPath, linePath } from './path';

describe('linePath (ADR-0022)', () => {
  it('moves to the first point and draws a line to each next one, at one decimal place', () => {
    expect(
      linePath([
        [0, 10],
        [5.25, 3.04],
        [12, -0.04],
      ]),
    ).toBe('M0 10L5.3 3L12 0');
  });

  it('is empty without points and refuses a coordinate that is not a number', () => {
    expect(linePath([])).toBe('');
    expect(() => linePath([[0, Number.NaN]])).toThrow(RangeError);
  });
});

describe('areaPath', () => {
  it('closes the line down to the baseline and back to its start', () => {
    expect(
      areaPath(
        [
          [0, 50],
          [10, 40],
          [20, 45],
        ],
        100,
      ),
    ).toBe('M0 50L10 40L20 45L20 100L0 100Z');
  });

  it('is empty without points', () => {
    expect(areaPath([], 100)).toBe('');
  });
});
