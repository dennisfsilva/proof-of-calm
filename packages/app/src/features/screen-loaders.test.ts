import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A feature's `index.ts` exports its screens only as loaders (`load<Name>Screen`, ADR-0045 §9, the entry of
// 2026-11-24): another feature that imports the barrel statically would otherwise take the screen's chunk with it.
// The barrels are read as source, since importing all eight took 1.5 s alone on 2026-11-24; `export *` is
// resolved one level. Today is the one exception: its screen is in the entry chunk, imported statically (§9).

const FEATURES = dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS = new Set(['today: TodayScreen']);

/** The value names a module's source exports; `from` resolves the specifier of an `export *` to its source. */
function exportedNames(source: string, from: (specifier: string) => string | null = () => null): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const names: string[] = [];
  for (const [, list = ''] of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const item of list.split(',').map((part) => part.trim())) {
      if (item !== '' && !item.startsWith('type ')) names.push(item.split(/\s+as\s+/).at(-1) ?? item);
    }
  }
  for (const [, name = ''] of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g))
    names.push(name);
  for (const [, alias, specifier = ''] of code.matchAll(
    /export\s*\*\s*(?:as\s+([\w$]+)\s*)?from\s*['"]([^'"]+)['"]/g,
  )) {
    const star = alias === undefined ? from(specifier) : null;
    names.push(...(alias === undefined ? (star === null ? [] : exportedNames(star)) : [alias]));
  }
  return names;
}

function sourceOf(dir: string, specifier: string): string | null {
  const base = resolve(dir, specifier);
  const file = [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')].find((candidate) => existsSync(candidate));
  return file === undefined ? null : readFileSync(file, 'utf8');
}

const barrels = readdirSync(FEATURES).filter((name) => existsSync(resolve(FEATURES, name, 'index.ts')));

describe('the feature barrels', () => {
  it('finds the export names, `export *` one level deep', () => {
    const source =
      "export { A, type B, C as DScreen } from './a';\nexport const loadEScreen = () => 1;\nexport * from './f';";
    expect(exportedNames(source, () => 'export function GScreen() {}')).toEqual([
      'A',
      'DScreen',
      'loadEScreen',
      'GScreen',
    ]);
  });

  it('export no screen component, only its loader', () => {
    expect(barrels.length).toBeGreaterThan(1);
    const screens = barrels.flatMap((name) => {
      const dir = resolve(FEATURES, name);
      const names = exportedNames(readFileSync(resolve(dir, 'index.ts'), 'utf8'), (s) => sourceOf(dir, s));
      return names.filter((key) => /^[A-Z][\w$]*Screen$/.test(key)).map((key) => `${name}: ${key}`);
    });
    expect(screens.filter((screen) => !EXCEPTIONS.has(screen))).toEqual([]);
  });
});
