import { describe, expect, it } from 'vitest';
import { money } from '../../test/builders';
import type { Money } from '../money/decimal';
import type { Point } from './path';
import { runningMax, underwaterPath, underwaterSegments } from './underwater';

const values = (...numbers: number[]) => numbers.map((number) => money(String(number)));
// Two falls: from 12 down to 8 and back at 12, then from 13 down to 7 and not back by the end.
const path = values(10, 12, 9, 8, 11, 12, 13, 7, 9);

describe('runningMax', () => {
  it('is the highest value so far', () => {
    expect(runningMax(values(1, 3, 2, 4, 4))).toEqual(['1', '3', '3', '4', '4']);
    expect(runningMax([])).toEqual([]);
  });
});

describe('underwaterSegments', () => {
  it('finds each fall from a high, its lowest point and its recovery', () => {
    expect(underwaterSegments(path)).toEqual([
      { peak: 1, trough: 3, recovery: 5 },
      { peak: 6, trough: 7, recovery: null },
    ]);
  });

  it('starts a fall from the last time the high was touched and counts a return to it as the recovery', () => {
    expect(underwaterSegments(values(5, 5, 4, 5))).toEqual([{ peak: 1, trough: 2, recovery: 3 }]);
    expect(underwaterSegments(values(10, 6, 6, 10))).toEqual([{ peak: 0, trough: 1, recovery: 3 }]);
  });

  it('is empty for a series that never falls, and for no values', () => {
    expect(underwaterSegments(values(1, 2, 2, 3))).toEqual([]);
    expect(underwaterSegments([])).toEqual([]);
  });
});

describe('underwaterPath (the simulator shading)', () => {
  const points = path.map((value, index): Point => [index * 10, 100 - Number(value) * 5]);

  it('runs along the high and back along the line, one closed subpath per fall', () => {
    expect(underwaterPath(points, path)).toBe(
      // Recovered: flat at the high to the last point below it, up to the recovery, back along the line.
      'M10 40L40 40L50 40L40 45L30 60L20 55Z' +
        // Not recovered: flat at the high to the last point, down to the line, back along it.
        'M60 35L80 35L80 55L70 65Z',
    );
  });

  it('meets the line where it climbs through the high between two points', () => {
    const climb = values(10, 5, 15);
    const climbPoints: Point[] = [
      [0, 50],
      [10, 75],
      [20, 25],
    ];
    expect(underwaterPath(climbPoints, climb)).toBe('M0 50L10 50L20 25L10 75Z');
  });

  it('draws nothing without a fall and refuses points that do not match the values', () => {
    expect(underwaterPath([[0, 0]], values(1))).toBe('');
    expect(() => underwaterPath([[0, 0]], [] as Money[])).toThrow(RangeError);
  });
});
