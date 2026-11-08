import { describe, expect, it } from 'vitest';
import { clamp, nearestIndex, percent } from './chart-geometry';

describe('clamp', () => {
  it('keeps a value inside the plot and leaves one inside alone', () => {
    expect(clamp(-30, 0, 100)).toBe(0);
    expect(clamp(130, 0, 100)).toBe(100);
    expect(clamp(42.5, 0, 100)).toBe(42.5);
  });
});

describe('nearestIndex', () => {
  const xs = [0, 10, 20, 30];

  it('finds the point nearest to the pointer, whichever side it is on', () => {
    expect(nearestIndex(xs, 14)).toBe(1);
    expect(nearestIndex(xs, 16)).toBe(2);
    expect(nearestIndex(xs, 20)).toBe(2);
  });

  it('gives a tie to the earlier point', () => {
    expect(nearestIndex(xs, 15)).toBe(1);
  });

  it('snaps to the ends beyond them', () => {
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 45)).toBe(3);
  });

  it('handles one point and none', () => {
    expect(nearestIndex([7], 100)).toBe(0);
    expect(nearestIndex([], 3)).toBe(-1);
  });

  it('agrees with a linear search on any ascending series', () => {
    const series = Array.from({ length: 41 }, (_, index) => index * 2.5 + (index % 3) * 0.4);
    for (let target = -3; target <= 105; target += 0.7) {
      const distances = series.map((x) => Math.abs(x - target));
      expect(nearestIndex(series, target)).toBe(distances.indexOf(Math.min(...distances)));
    }
  });
});

describe('percent', () => {
  it('writes a fraction as an SVG percentage at two decimals', () => {
    expect(percent(0.425)).toBe('42.5%');
    expect(percent(0.1)).toBe('10%');
    expect(percent(1 / 3)).toBe('33.33%');
    expect(percent(0)).toBe('0%');
  });
});
