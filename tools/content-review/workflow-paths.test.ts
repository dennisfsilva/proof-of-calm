// content-review.yml runs only on a pull request that changes a path its `paths:` names, so every file its
// watched scripts import must be named there: `body.ts` imports `spellNamed` from
// packages/content/src/percent-gap.ts (#498), and a change to that file alone would skip `render` and `finish-dry`.
// The walk follows relative `import`/`export … from` specifiers from each watched tools/content-review script.
// A bare specifier (node:, jsdom) is not followed; a workspace package (`@proofofcalm/…`) fails the test instead,
// since finish-dry installs nothing and render installs only the tools package, so a script reaches repository
// code by a relative path, as body.ts does.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(resolve(ROOT, '.github/workflows/content-review.yml'), 'utf8');
const block = /^ {4}paths:\r?\n((?: {6}- .+\r?\n)+)/m.exec(workflow)?.[1] ?? '';
const watched = [...block.matchAll(/- (.+)/g)].map((match) => (match[1] ?? '').trim());
const covered = (path: string) =>
  watched.some((entry) => (entry.endsWith('/**') ? path.startsWith(entry.slice(0, -2)) : path === entry));
const fromRoot = (file: string) => relative(ROOT, file).split('\\').join('/');

const specifiers = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*'([^']+)'/gms)].map((m) => m[1] ?? '');

it('reads the workflow’s paths block', () => {
  expect(watched).toContain('tools/content-review/body.ts');
  expect(watched.filter((entry) => !entry.endsWith('/**') && !existsSync(resolve(ROOT, entry)))).toEqual([]);
});

it('names every repository file the watched scripts import', () => {
  const queue = watched
    .filter((entry) => /^tools\/content-review\/[^/]+\.ts$/.test(entry))
    .map((entry) => resolve(ROOT, entry));
  const reached = new Set<string>();
  const workspace: string[] = [];
  for (let file = queue.shift(); file; file = queue.shift()) {
    if (reached.has(file)) continue;
    reached.add(file);
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith('@proofofcalm/')) workspace.push(`${fromRoot(file)}: ${specifier}`);
      if (specifier.startsWith('.')) queue.push(resolve(dirname(file), specifier));
    }
  }
  const files = [...reached].map(fromRoot);
  expect(files).toContain('packages/content/src/percent-gap.ts');
  expect(files.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
  expect(workspace).toEqual([]);
  expect(files.filter((path) => path.startsWith('node_modules/') || !covered(path))).toEqual([]);
});
