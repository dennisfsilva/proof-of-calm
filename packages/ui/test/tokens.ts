// Reads src/styles/tokens.css into the colour values each theme ends up with, for the token tests. The
// file's shape is fixed (src/styles/tokens.css): hex blocks first, the same scopes again with OKLCH
// inside @supports, so the parser only needs nested blocks and declarations.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hexToLinear, oklchToLinear, type Rgb } from './colour';

const TOKENS_CSS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));

type Block = { prelude: string; declarations: Map<string, string>; children: Block[] };

function parseBlocks(css: string): Block[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const root: Block = { prelude: '', declarations: new Map(), children: [] };
  const stack: Block[] = [root];
  let buffer = '';
  const flush = (block: Block) => {
    for (const statement of buffer.split(';')) {
      const colon = statement.indexOf(':');
      const name = statement.slice(0, colon).trim();
      if (colon > 0 && name.startsWith('--')) block.declarations.set(name, statement.slice(colon + 1).trim());
    }
    buffer = '';
  };
  for (const char of source) {
    const current = stack.at(-1) ?? root;
    if (char === '{') {
      const lastSemicolon = buffer.lastIndexOf(';');
      const prelude = buffer.slice(lastSemicolon + 1).trim();
      buffer = buffer.slice(0, lastSemicolon + 1);
      flush(current);
      const child: Block = { prelude: prelude.replace(/\s+/g, ' '), declarations: new Map(), children: [] };
      current.children.push(child);
      stack.push(child);
    } else if (char === '}') {
      flush(current);
      stack.pop();
    } else buffer += char;
  }
  return root.children;
}

/** The block reached by following preludes from the top level, or undefined. */
function findBlock(blocks: readonly Block[], path: readonly string[]): Block | undefined {
  const [head, ...rest] = path;
  const block = blocks.find((candidate) => candidate.prelude === head);
  return block === undefined || rest.length === 0 ? block : findBlock(block.children, rest);
}

const LIGHT = ':root';
const DARK_MEDIA = ['@media (prefers-color-scheme: dark)', ':root:not([data-theme="light"])'] as const;
const DARK_ATTRIBUTE = ':root[data-theme="dark"]';
const SUPPORTS = '@supports (color: oklch(0 0 0))';

export type Scopes = {
  lightHex: Map<string, string>;
  lightOklch: Map<string, string>;
  darkMediaHex: Map<string, string>;
  darkMediaOklch: Map<string, string>;
  darkAttributeHex: Map<string, string>;
  darkAttributeOklch: Map<string, string>;
};

export function readScopes(css = readFileSync(TOKENS_CSS, 'utf8')): Scopes {
  const blocks = parseBlocks(css);
  const declarations = (path: readonly string[]) => {
    const block = findBlock(blocks, path);
    if (block === undefined) throw new Error(`tokens.css has no block ${path.join(' > ')}`);
    return block.declarations;
  };
  return {
    lightHex: declarations([LIGHT]),
    lightOklch: declarations([SUPPORTS, LIGHT]),
    darkMediaHex: declarations(DARK_MEDIA),
    darkMediaOklch: declarations([SUPPORTS, ...DARK_MEDIA]),
    darkAttributeHex: declarations([DARK_ATTRIBUTE]),
    darkAttributeOklch: declarations([SUPPORTS, DARK_ATTRIBUTE]),
  };
}

/** What a theme computes to: later maps win, as later rules do in the cascade. */
export const merge = (...maps: Map<string, string>[]) => new Map(maps.flatMap((map) => [...map]));

export type Parsed = { kind: 'hex'; hex: string } | { kind: 'oklch'; l: number; c: number; h: number };

export function parseColour(value: string): Parsed | null {
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return { kind: 'hex', hex: value };
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+\s*)?\)$/.exec(value);
  if (match === null) return null;
  return { kind: 'oklch', l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

/** A token's colour in a theme, following var() references. */
export function resolve(theme: Map<string, string>, name: string, seen: readonly string[] = []): Rgb {
  const value = theme.get(name);
  if (value === undefined) throw new Error(`${name} is not declared`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  if (reference?.[1] !== undefined) {
    if (seen.includes(reference[1])) throw new Error(`${name} refers to itself`);
    return resolve(theme, reference[1], [...seen, name]);
  }
  const parsed = parseColour(value);
  if (parsed === null) throw new Error(`${name} is not a colour: ${value}`);
  return parsed.kind === 'hex' ? hexToLinear(parsed.hex) : oklchToLinear(parsed.l, parsed.c, parsed.h).rgb;
}
