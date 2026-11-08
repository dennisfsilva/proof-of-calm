import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import colors from './brand-colors.json';

// The manifest, the theme-color tags and the app icons need plain colours, so they read these. They are
// the hex fallbacks of the tokens (packages/ui/src/styles/tokens.css, docs/DESIGN.md §3): the light ones
// in the first `:root` block, the dark ones in the `[data-theme="dark"]` block. This test fails the
// moment the two disagree.
const tokens = readFileSync(new URL('../../../../packages/ui/src/styles/tokens.css', import.meta.url), 'utf8');

function tokenHex(scope: string, token: string): string | undefined {
  const block = tokens.split(`${scope} {`)[1]?.split('}')[0] ?? '';
  return new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`).exec(block)?.[1];
}

describe('the brand colours used outside CSS', () => {
  it('are the design tokens’ hex fallbacks', () => {
    for (const [scope, key] of [
      [':root', 'light'],
      [':root[data-theme="dark"]', 'dark'],
    ] as const) {
      for (const token of ['background', 'ink', 'accent'] as const) {
        expect(colors[key][token], `${key} ${token}`).toBe(tokenHex(scope, token));
      }
    }
  });
});
