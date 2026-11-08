import { describe, expect, it } from 'vitest';
import { coinColour, SERIES_COLOURS, SERIES_FILL, SERIES_STROKE } from './series';

describe('coinColour (docs/DESIGN.md §4)', () => {
  it('gives the four coins their fixed colours, whatever the case', () => {
    expect(['BTC', 'eth', 'Sol', 'LINK'].map((coin) => coinColour(coin, 0))).toEqual(['btc', 'eth', 'sol', 'link']);
  });

  it('gives other coins the extended slots in plan order and folds the rest into other, never cycling', () => {
    const others = ['ADA', 'DOT', 'XRP', 'AVAX', 'ATOM', 'NEAR', 'XTZ', 'ALGO'];
    expect(others.map((coin, index) => coinColour(coin, index))).toEqual([
      'magenta',
      'purple',
      'olive',
      'rose',
      'brown',
      'steel',
      'other',
      'other',
    ]);
  });

  it('has fill and stroke classes for every colour, named after its token', () => {
    for (const colour of SERIES_COLOURS) {
      expect(SERIES_FILL[colour]).toContain(`fill-coin-${colour}`);
      expect(SERIES_FILL[colour]).toContain(`bg-coin-${colour}`);
      expect(SERIES_STROKE[colour]).toBe(`stroke-coin-${colour}`);
    }
  });
});
