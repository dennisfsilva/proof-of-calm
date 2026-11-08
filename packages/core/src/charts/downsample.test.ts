import { describe, expect, it } from 'vitest';
import { downsample } from './downsample';

const series = (length: number) => Array.from({ length }, (_, index) => index + 1);

describe('downsample (the prototype)', () => {
  it('takes n evenly spaced points and adds the last one', () => {
    // Positions ⌊i × 10 / 4⌋ = 0, 2, 5, 7, as the prototype's step of 2.5 gave, then the last.
    expect(downsample(series(10), 4)).toEqual([1, 3, 6, 8, 10]);
    expect(downsample(series(1000), 1)).toEqual([1, 1000]);
  });

  it('returns a short series whole, as a copy', () => {
    const short = series(5);
    const kept = downsample(short, 5);
    expect(kept).toEqual(short);
    expect(kept).not.toBe(short);
    expect(downsample([], 420)).toEqual([]);
  });

  it('refuses to keep fewer than one point', () => {
    expect(() => downsample(series(3), 0)).toThrow(RangeError);
    expect(() => downsample(series(3), 2.5)).toThrow(RangeError);
  });
});
