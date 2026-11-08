import { describe, expect, it } from 'vitest';
import { contrast, type Deficiency, deltaE, linearToOklch, type Rgb, simulate } from './colour';
import { merge, readScopes, resolve } from './tokens';

// The dataviz validator's checks on the coin palette, re-implemented (docs/DESIGN.md §4 and §10, ADR-0022):
// all pairs, light against the background and dark against the surface. Run on every change to
// tokens.css, as part of the unit tests.
const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] } as const;
const MIN_CHROMA = 0.1;
const CVD_TARGET = 8;
const CVD_FLOOR = 6;
const NORMAL_FLOOR = 15;
const MIN_CONTRAST = 3;

const COINS = ['BTC', 'ETH', 'SOL', 'LINK'] as const;
type Coin = (typeof COINS)[number];
const EXTENDED = ['magenta', 'purple', 'olive', 'rose', 'brown', 'steel', 'other'] as const;
const SURFACES = ['--background', '--surface', '--surface-2', '--surface-3'] as const;

const scopes = readScopes();
const themes = {
  light: {
    rendered: merge(scopes.lightHex, scopes.lightOklch),
    fallback: scopes.lightHex,
    reference: '--background',
  },
  dark: {
    rendered: merge(scopes.lightHex, scopes.lightOklch, scopes.darkAttributeHex, scopes.darkAttributeOklch),
    fallback: merge(scopes.lightHex, scopes.darkAttributeHex),
    reference: '--surface',
  },
} as const;

const coin = (theme: Map<string, string>, name: Coin) => resolve(theme, `--coin-${name.toLowerCase()}`);

type Pair = { pair: string; normal: number; protan: number; deutan: number; tritan: number };

function pairs(theme: Map<string, string>): Pair[] {
  const result: Pair[] = [];
  COINS.forEach((first, index) => {
    for (const second of COINS.slice(index + 1)) {
      const a = coin(theme, first);
      const b = coin(theme, second);
      const under = (deficiency: Deficiency) => deltaE(simulate(a, deficiency), simulate(b, deficiency));
      result.push({
        pair: `${first}–${second}`,
        normal: deltaE(a, b),
        protan: under('protan'),
        deutan: under('deutan'),
        tritan: under('tritan'),
      });
    }
  });
  return result;
}

const worst = (list: Pair[], key: 'normal' | 'protan' | 'deutan' | 'tritan') =>
  list.reduce((low, next) => (next[key] < low[key] ? next : low));
const worstCvd = (list: Pair[]) => {
  const protan = worst(list, 'protan');
  const deutan = worst(list, 'deutan');
  return protan.protan <= deutan.deutan
    ? { pair: protan.pair, deficiency: 'protan', value: protan.protan }
    : { pair: deutan.pair, deficiency: 'deutan', value: deutan.deutan };
};
const lightness = (rgb: Rgb) => linearToOklch(rgb).lightness;

describe.each(['light', 'dark'] as const)('the coin palette in %s, as rendered and as the hex fallbacks', (mode) => {
  const { reference } = themes[mode];

  it.each(['rendered', 'fallback'] as const)(
    '%s: separates every pair for normal vision and protan/deutan CVD',
    (form) => {
      const list = pairs(themes[mode][form]);
      expect(worst(list, 'normal').normal).toBeGreaterThanOrEqual(NORMAL_FLOOR);
      expect(worstCvd(list).value).toBeGreaterThanOrEqual(CVD_FLOOR);
      expect(worstCvd(list).value).toBeGreaterThanOrEqual(CVD_TARGET);
    },
  );

  it.each(['rendered', 'fallback'] as const)('%s: keeps chroma and 3:1 against the reference surface', (form) => {
    const theme = themes[mode][form];
    for (const name of COINS) {
      expect(linearToOklch(coin(theme, name)).chroma, name).toBeGreaterThanOrEqual(MIN_CHROMA);
      expect(contrast(coin(theme, name), resolve(theme, reference)), name).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('reaches 3:1 on every surface, so a line stays visible on insets and selected rows (docs/DESIGN.md §4)', () => {
    const theme = themes[mode].fallback;
    for (const name of COINS) {
      for (const surface of SURFACES) {
        expect(contrast(coin(theme, name), resolve(theme, surface)), `${name} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives the extended palette and "other" 3:1 on the background (identity dots only)', () => {
    for (const theme of [themes[mode].rendered, themes[mode].fallback]) {
      for (const name of EXTENDED) {
        const ratio = contrast(resolve(theme, `--coin-${name}`), resolve(theme, '--background'));
        expect(ratio, name).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('the recorded results and the recorded exception (docs/DESIGN.md §4)', () => {
  const light = pairs(themes.light.rendered);
  const dark = pairs(themes.dark.rendered);
  const close = (value: number, recorded: number) => expect(Math.abs(value - recorded)).toBeLessThanOrEqual(0.1);

  it('light: worst CVD pair BTC–SOL under protanopia, 8.3; worst normal pair ETH–LINK, 17.1', () => {
    expect(worstCvd(light)).toMatchObject({ pair: 'BTC–SOL', deficiency: 'protan' });
    close(worstCvd(light).value, 8.3);
    expect(worst(light, 'normal').pair).toBe('ETH–LINK');
    close(worst(light, 'normal').normal, 17.1);
  });

  it('dark: worst CVD pair ETH–LINK under deuteranopia, 13.0; normal-vision floor SOL–LINK, 15.1', () => {
    expect(worstCvd(dark)).toMatchObject({ pair: 'ETH–LINK', deficiency: 'deutan' });
    close(worstCvd(dark).value, 13);
    expect(worst(dark, 'normal').pair).toBe('SOL–LINK');
    close(worst(dark, 'normal').normal, 15.1);
  });

  it('records SOL–LINK as weak under tritanopia (7.5 light, 5.5 dark), mitigated by labels and the table', () => {
    const tritan = (list: Pair[]) => list.find((entry) => entry.pair === 'SOL–LINK')?.tritan ?? 0;
    close(tritan(light), 7.5);
    close(tritan(dark), 5.5);
  });

  it('light: every coin inside the lightness band, in the order BTC > LINK > SOL > ETH', () => {
    const values = COINS.map((name) => lightness(coin(themes.light.rendered, name)));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(BAND.light[0]);
      expect(value).toBeLessThanOrEqual(BAND.light[1]);
    }
    const [btc = 0, eth = 0, sol = 0, link = 0] = values;
    expect(btc).toBeGreaterThan(link);
    expect(link).toBeGreaterThan(sol);
    expect(sol).toBeGreaterThan(eth);
  });

  it('dark: BTC, SOL and LINK sit above the validator band on purpose, ETH inside it', () => {
    const outside = COINS.filter((name) => {
      const value = lightness(coin(themes.dark.rendered, name));
      return value < BAND.dark[0] || value > BAND.dark[1];
    });
    expect(outside).toEqual(['BTC', 'SOL', 'LINK']);
    for (const name of outside) expect(lightness(coin(themes.dark.rendered, name))).toBeGreaterThan(BAND.dark[1]);
  });
});
