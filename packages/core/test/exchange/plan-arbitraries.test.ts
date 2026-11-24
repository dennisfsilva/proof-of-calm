import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { id } from '../builders';
import { world } from './plan-arbitraries';

describe('the exchange import worlds', () => {
  it('a drawn world depends on its draw alone', () => {
    const first = fc.sample(world, { seed: 46, numRuns: 3 });
    for (let n = 0; n < 1000; n += 1) id();
    expect(fc.sample(world, { seed: 46, numRuns: 3 })).toEqual(first);
  });
});
