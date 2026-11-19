import { compare, decimal, minus, type Percent, plus, round } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { SHARE_PRECISION, sharePrecision } from './share-precision';

const percent = (value: string) => decimal<Percent>(value);

describe('sharePrecision', () => {
  it('keeps 2 decimals where the two shares already differ there', () => {
    expect(sharePrecision(percent('49.9'), percent('50.1'))).toBe(2);
    expect(sharePrecision(percent('39.99'), percent('40'))).toBe(2);
  });

  it('takes 3 decimals for 49.995 against 50, which both round to 50.00', () => {
    expect(sharePrecision(percent('49.995'), percent('50'))).toBe(3);
  });

  it('takes 4 decimals for a change of one ten-thousandth', () => {
    expect(sharePrecision(percent('39.9999'), percent('40'))).toBe(4);
  });

  it('drops to the short form when the two would still be equal at the most decimals', () => {
    expect(sharePrecision(percent('50'), percent('50'))).toBe(SHARE_PRECISION.min);
  });

  // The normaliser (packages/core/src/import/prototype.ts, readSplit) writes shares at 4 decimals and closes a residue
  // above 0 and at most 0.01 on the largest one: every such pair prints differently at the precision returned.
  it('tells apart every share and residue the normaliser can write', () => {
    const step = percent('0.0001');
    for (const from of ['49.995', '33.3333', '25.0049', '99.9851'].map(percent)) {
      let residue = step;
      // 100 steps of 0.0001: every residue from 0.0001 to the tolerance, 0.01.
      for (let count = 1; count <= 100; count += 1, residue = plus(residue, step)) {
        for (const to of [plus(from, residue), minus(from, residue)]) {
          const decimals = sharePrecision(from, to);
          expect(decimals).toBeLessThanOrEqual(SHARE_PRECISION.max);
          expect(compare(round(from, decimals, 'half-even'), round(to, decimals, 'half-even'))).not.toBe(0);
        }
      }
    }
  });
});
