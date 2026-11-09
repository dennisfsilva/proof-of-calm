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
      move: 'move',
    });
  });

  it('gives a purchase its units in and none out, a sale the reverse, the units as stored', () => {
    const quantity = units('0.10');
    for (const kind of ENTRY_KINDS.filter((each) => each !== 'move')) {
      const sale = kind === 'sell';
      expect([unitsIn({ kind, units: quantity }), unitsOut({ kind, units: quantity })]).toEqual(
        sale ? ['0', '0.10'] : ['0.10', '0'],
      );
    }
  });

  it('a move takes out only its fee in the coin, the units sent less those received, and brings none in', () => {
    const move = { kind: 'move' as const, units: units('0.10'), received: units('0.0998') };
    expect([unitsIn(move), unitsOut(move)]).toEqual(['0', '0.0002']);
    expect(unitsOut({ ...move, received: units('0.10') })).toBe('0');
    // The schema requires `received` on a move; a value built without it takes nothing out.
    expect(unitsOut({ kind: 'move', units: units('0.10') })).toBe('0');
  });

  it('orders purchases, then moves, then sales on one day', () => {
    expect(ENTRY_KINDS.map((kind) => sameDayRank({ kind }))).toEqual([0, 0, 0, 2, 0, 1]);
  });

  it('fails on a kind it does not know', () => {
    expect(() => entryRole('gift' as never)).toThrow('Unhandled case: "gift"');
  });
});
