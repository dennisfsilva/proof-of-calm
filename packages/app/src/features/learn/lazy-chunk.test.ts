import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type ScannedImport, scanImports } from './import-scan';

// The lazy Learn chunk imports no value of `@proofofcalm/content` or `@proofofcalm/core`; type imports are erased
// and allowed. Rolldown groups modules by the set of entries that reach them: a value import, from this chunk, of
// a module the app entry reaches too (the profile loaders, the core's `underReview`) moves that module out of the
// entry's shared chunk into one more chunk that the entry, Today's screen and the shared chunk then import, and
// Today pays the glue (docs/ENGINEERING.md §4: 46,156 bytes in 13 chunks against main's 45,729 in 12 on
// 2026-11-05, over the budget). A lazy screen takes such data through Services (`countries`, `rules`). The
// chunk's modules are those `components/learn-screen.tsx` reaches through relative imports inside this folder
// and `index.ts`, which the entry imports, does not: the date line, the conditions and the "Why?" link are the
// entry's, so their value imports split nothing. The scanner is `import-scan.ts`, tested beside it.

const FOLDER = dirname(fileURLToPath(import.meta.url));
const SHARED = /^@proofofcalm\/(?:content|core)$/;

const importsOf = (file: string): ScannedImport[] => scanImports(readFileSync(file, 'utf8'));

/** The module a relative specifier names, inside this folder; null for one outside it or a non-relative one. */
function resolveLocal(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  if (relative(FOLDER, base).startsWith('..')) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate)) ?? null;
}

/** Every module of this folder the root reaches through static relative imports, the root included. */
function reached(root: string): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { specifier } of importsOf(file)) {
      const next = resolveLocal(file, specifier);
      if (next !== null) walk(next);
    }
  };
  walk(root);
  return seen;
}

const at = (path: string) => resolve(FOLDER, path);
const short = (file: string) => relative(FOLDER, file).replaceAll('\\', '/');

describe('the lazy Learn chunk', () => {
  const lazy = [...reached(at('components/learn-screen.tsx'))].filter((file) => !reached(at('index.ts')).has(file));

  it('holds the screen, the library and the card, and not what the entry imports', () => {
    const names = lazy.map(short);
    expect(names).toEqual(
      expect.arrayContaining([
        'components/learn-screen.tsx',
        'components/country-library.tsx',
        'components/country-card.tsx',
      ]),
    );
    expect(names).not.toContain('components/country-date-line.tsx');
    expect(names).not.toContain('components/holding-conditions.tsx');
    expect(names).not.toContain('components/why-link.tsx');
  });

  it('imports no value of @proofofcalm/content or @proofofcalm/core', () => {
    const values = lazy.flatMap((file) =>
      importsOf(file)
        .filter(({ specifier, typeOnly }) => SHARED.test(specifier) && !typeOnly)
        .map(({ specifier, clause }) => `${short(file)}: import ${clause.replaceAll(/\s+/g, ' ')} from '${specifier}'`),
    );
    expect(values).toEqual([]);
  });
});
