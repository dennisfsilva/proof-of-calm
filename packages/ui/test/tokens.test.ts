import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast, deltaE, hexToLinear, oklchToLinear } from './colour';
import { merge, parseColour, readScopes, resolve } from './tokens';

// docs/DESIGN.md §10: a test over tokens.css recomputes the contrast table of §3 and fails on a
// regression. The table was computed from the OKLCH values, which is what browsers render; the hex
// fallbacks must say the same colour and must pass WCAG on their own.

const scopes = readScopes();
const light = merge(scopes.lightHex, scopes.lightOklch);
const dark = merge(scopes.lightHex, scopes.lightOklch, scopes.darkAttributeHex, scopes.darkAttributeOklch);
const lightHex = scopes.lightHex;
const darkHex = merge(scopes.lightHex, scopes.darkAttributeHex);

const SURFACES = ['--background', '--surface', '--surface-2', '--surface-3'] as const;
const THEME_COLOURS = [
  '--background',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--ink',
  '--ink-2',
  '--ink-3',
  '--line',
  '--line-2',
  '--accent',
  '--positive',
  '--negative',
  '--coin-btc',
  '--coin-eth',
  '--coin-sol',
  '--coin-link',
  '--coin-magenta',
  '--coin-purple',
  '--coin-olive',
  '--coin-rose',
  '--coin-brown',
  '--coin-steel',
  '--coin-other',
] as const;

const ratio = (theme: Map<string, string>, text: string, surface: string) =>
  contrast(resolve(theme, text), resolve(theme, surface));
const onEverySurface = (theme: Map<string, string>, text: string) =>
  SURFACES.map((surface) => ratio(theme, text, surface));
/** Rounds as the document does, so 5.388 meets a documented 5.39 and 5.384 does not. */
const at = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

describe('tokens.css structure (docs/DESIGN.md §3)', () => {
  it('declares every theme colour in hex and in OKLCH, in light and in both dark scopes', () => {
    for (const name of THEME_COLOURS) {
      expect(parseColour(scopes.lightHex.get(name) ?? '')?.kind, `light hex ${name}`).toBe('hex');
      expect(parseColour(scopes.lightOklch.get(name) ?? '')?.kind, `light oklch ${name}`).toBe('oklch');
      expect(parseColour(scopes.darkAttributeHex.get(name) ?? '')?.kind, `dark hex ${name}`).toBe('hex');
      expect(parseColour(scopes.darkAttributeOklch.get(name) ?? '')?.kind, `dark oklch ${name}`).toBe('oklch');
    }
  });

  it('declares the dark tokens identically under the media query and under data-theme="dark"', () => {
    expect(scopes.darkMediaHex).toEqual(scopes.darkAttributeHex);
    expect(scopes.darkMediaOklch).toEqual(scopes.darkAttributeOklch);
  });

  // 8-bit hex is coarse near black: the nearest hex to the dark scrim's L 0.1 is 0.31 away. A difference
  // under about 2 is invisible.
  it('gives every OKLCH value the hex fallback of the same colour (ΔEok × 100 at most 0.5)', () => {
    const pairs = [
      [scopes.lightHex, scopes.lightOklch],
      [scopes.darkAttributeHex, scopes.darkAttributeOklch],
    ] as const;
    for (const [hexes, oklchs] of pairs) {
      for (const [name, value] of oklchs) {
        const parsed = parseColour(value);
        const fallback = parseColour(hexes.get(name) ?? '');
        if (parsed?.kind !== 'oklch' || fallback?.kind !== 'hex') continue;
        const difference = deltaE(oklchToLinear(parsed.l, parsed.c, parsed.h).rgb, hexToLinear(fallback.hex));
        expect(difference, name).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('keeps the focus ring in ink and, in dark, the text on the accent in the background colour', () => {
    expect(light.get('--focus')).toBe('var(--ink)');
    expect(dark.get('--focus')).toBe('var(--ink)');
    expect(dark.get('--on-accent')).toBe('var(--background)');
  });
});

describe('the contrast table of docs/DESIGN.md §3, light', () => {
  it('ink is 15.7:1 on the background', () => {
    expect(at(ratio(light, '--ink', '--background'), 1)).toBeGreaterThanOrEqual(15.7);
  });

  it.each([
    ['--ink-2', 5.39],
    ['--ink-3', 3.12],
    ['--positive', 5.55],
    ['--negative', 4.75],
    ['--line-2', 3],
  ])('%s reaches %s:1 on every surface', (token, minimum) => {
    expect(at(Math.min(...onEverySurface(light, token)), 2)).toBeGreaterThanOrEqual(minimum);
  });

  it('the accent is 3.18 to 3.86:1: marks and fills, never text', () => {
    const ratios = onEverySurface(light, '--accent');
    expect(at(Math.min(...ratios), 2)).toBeGreaterThanOrEqual(3.18);
    expect(at(Math.max(...ratios), 2)).toBeLessThanOrEqual(3.86);
  });

  it('on-accent is 4.74:1 on the accent', () => {
    expect(at(ratio(light, '--on-accent', '--accent'), 2)).toBeGreaterThanOrEqual(4.74);
  });

  it('the focus ring is at least 11.5:1 on every surface (docs/DESIGN.md §6)', () => {
    expect(at(Math.min(...onEverySurface(light, '--focus')), 1)).toBeGreaterThanOrEqual(11.5);
  });
});

describe('the contrast table of docs/DESIGN.md §3, dark', () => {
  it('ink is 16.2:1 on the background', () => {
    expect(at(ratio(dark, '--ink', '--background'), 1)).toBeGreaterThanOrEqual(16.2);
  });

  it.each([
    ['--ink-2', 6.81],
    ['--ink-3', 3.91],
    ['--positive', 6.45],
    ['--negative', 4.58],
    ['--line-2', 3],
  ])('%s reaches %s:1 on every surface', (token, minimum) => {
    expect(at(Math.min(...onEverySurface(dark, token)), 2)).toBeGreaterThanOrEqual(minimum);
  });

  it('the accent is 7.0 to 9.8:1, so it may be text', () => {
    const ratios = onEverySurface(dark, '--accent');
    expect(at(Math.min(...ratios), 1)).toBeGreaterThanOrEqual(7);
    expect(at(Math.max(...ratios), 1)).toBeLessThanOrEqual(9.8);
  });

  it('on-accent is 9.8:1 on the accent', () => {
    expect(at(ratio(dark, '--on-accent', '--accent'), 1)).toBeGreaterThanOrEqual(9.8);
  });

  it('the focus ring is at least 11.5:1 on every surface (docs/DESIGN.md §6)', () => {
    expect(at(Math.min(...onEverySurface(dark, '--focus')), 1)).toBeGreaterThanOrEqual(11.5);
  });
});

describe('the hex fallbacks pass WCAG on their own', () => {
  it.each([
    ['light', lightHex],
    ['dark', darkHex],
  ])('%s: text tokens 4.5:1, ink-3 and line-2 3:1, on every surface', (_, theme) => {
    for (const token of ['--ink', '--ink-2', '--positive', '--negative']) {
      expect(Math.min(...onEverySurface(theme, token)), token).toBeGreaterThanOrEqual(4.5);
    }
    for (const token of ['--ink-3', '--line-2', '--accent']) {
      expect(Math.min(...onEverySurface(theme, token)), token).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(theme, '--on-accent', '--accent')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the size-adjusted fallback face (ADR-0045 §7, docs/DESIGN.md §5)', () => {
  const fonts = readFileSync(fileURLToPath(new URL('../src/styles/fonts.css', import.meta.url)), 'utf8');
  const face = /@font-face\s*\{[^}]*font-family:\s*"Calm Sans Fallback"[^}]*\}/.exec(fonts)?.[0] ?? '';

  it('declares "Calm Sans Fallback" over local Arial with the four metric overrides next/font generated', () => {
    expect(face).not.toBe('');
    expect(face).toMatch(/src:\s*local\("Arial"\)/);
    expect(face).toMatch(/ascent-override:\s*101\.35%/);
    expect(face).toMatch(/descent-override:\s*27\.19%/);
    expect(face).toMatch(/line-gap-override:\s*0%/);
    expect(face).toMatch(/size-adjust:\s*101\.13%/);
  });

  it('lists the fallback right after "Calm Sans" in --typeface-text, before any system family', () => {
    const families = (scopes.lightHex.get('--typeface-text') ?? '').split(',').map((family) => family.trim());
    expect(families.slice(0, 2)).toEqual(['"Calm Sans"', '"Calm Sans Fallback"']);
  });
});
