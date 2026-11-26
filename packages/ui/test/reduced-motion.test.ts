import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/DESIGN.md §6 Motion: reduced motion sets every duration to 1 ms. The durations are tokens, so a
// declared transition is already 1 ms there; a rule that gives every element a transition-duration
// also gives the ones that declare none a 1 ms transition of `all`, and a change of an inherited
// property (visibility, colour) then starts one on every element below it (#560).

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const globals = read('../src/styles/globals.css');
const theme = read('../src/styles/theme.css');
const tokens = read('../src/styles/tokens.css');

describe('reduced motion', () => {
  it('sets no transition-duration on every element', () => {
    expect(globals).not.toMatch(/transition-duration\s*:/);
    expect(globals).not.toMatch(/(^|[;{\s])transition\s*:/);
    // The animation half stays: third-party animations stop too.
    expect(globals.match(/animation-duration:\s*1ms !important/g)).toHaveLength(2);
    expect(globals.match(/animation-iteration-count:\s*1 !important/g)).toHaveLength(2);
  });

  it('gives an undeclared transition duration a token', () => {
    expect(theme).toMatch(/--default-transition-duration:\s*var\(--duration-[a-z]+\);/);
  });

  it('makes every duration token 1 ms under both selectors', () => {
    const names = [...tokens.matchAll(/^\s*(--duration-[a-z]+):/gm)].map((match) => match[1]);
    const unique = [...new Set(names)];
    expect(unique.length).toBeGreaterThan(0);
    for (const selector of [
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/,
      /:root\[data-motion="reduce"\]\s*\{([^}]*)\}/,
    ]) {
      const block = tokens.match(selector)?.[1] ?? '';
      for (const name of unique) expect(block).toMatch(new RegExp(`${name}:\\s*1ms;`));
    }
  });
});
