import { describe, expect, it } from 'vitest';
import { contrast, deltaE, hexToLinear, linearToHex, linearToOklch, oklchToLinear, simulate } from './colour';

// Known values that anchor the colour maths the token tests rely on.
describe('colour maths', () => {
  it('computes the WCAG extremes and a published pair', () => {
    expect(contrast(hexToLinear('#000000'), hexToLinear('#ffffff'))).toBeCloseTo(21, 10);
    expect(contrast(hexToLinear('#777777'), hexToLinear('#ffffff'))).toBeCloseTo(4.48, 2);
  });

  it('maps white and black to OKLab lightness 1 and 0 with no chroma', () => {
    expect(linearToOklch(hexToLinear('#ffffff'))).toMatchObject({ lightness: expect.closeTo(1, 4) });
    expect(linearToOklch(hexToLinear('#ffffff')).chroma).toBeLessThan(1e-4);
    expect(linearToOklch(hexToLinear('#000000')).lightness).toBeCloseTo(0, 6);
  });

  it('round-trips OKLCH and hex and clips an out-of-gamut chroma', () => {
    const { rgb, clippedChroma } = oklchToLinear(0.6, 0.127, 75);
    expect(linearToHex(rgb)).toBe('#ac7300');
    expect(clippedChroma).not.toBeNull();
    expect(oklchToLinear(0.967, 0.007, 80).clippedChroma).toBeNull();
    expect(linearToHex(oklchToLinear(0.967, 0.007, 80).rgb)).toBe('#f7f4ef');
  });

  it('leaves greys unchanged under every deficiency and separates nothing that is the same', () => {
    const grey = hexToLinear('#808080');
    for (const deficiency of ['protan', 'deutan', 'tritan'] as const) {
      expect(deltaE(simulate(grey, deficiency), grey)).toBeLessThan(0.5);
    }
    expect(deltaE(grey, grey)).toBe(0);
  });

  it('refuses what is not a hex colour', () => {
    expect(() => hexToLinear('red')).toThrow('not a hex colour');
  });
});
