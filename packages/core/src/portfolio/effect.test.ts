import { describe, expect, it } from 'vitest';
import { units } from '../../test/builders';
import { ENTRY_KINDS } from '../schema/entry';
import { entryRole, sameDayRank, unitsIn, unitsOut } from './effect';

describe('the role of each kind (docs/DOMAIN.md §3.7)', () => {
  it('a buy of any kind and coins added bring units in; a sale takes them out', () => {
    expect(Object.fromEntries(ENTRY_KINDS.map((kind) => [kind, entryRole(kind)]))).toEqual({
      dca: 'purchase',
      lump: 'purchase',
      extra: 'purchase',
      held: 'purchase',
      sell: 'sale',
    });
  });

  it('gives a purchase its units in and none out, a sale the reverse, the units as stored', () => {
    const quantity = units('0.10');
    for (const kind of ENTRY_KINDS) {
      const sale = kind === 'sell';
      expect([unitsIn({ kind, units: quantity }), unitsOut({ kind, units: quantity })]).toEqual(
        sale ? ['0', '0.10'] : ['0.10', '0'],
      );
    }
  });

  it('orders purchases before sales on one day', () => {
    expect(ENTRY_KINDS.map((kind) => sameDayRank({ kind }))).toEqual([0, 0, 0, 2, 0]);
  });

  it('fails on a kind it does not know', () => {
    expect(() => entryRole('gift' as never)).toThrow('Unhandled case: "gift"');
  });
});
