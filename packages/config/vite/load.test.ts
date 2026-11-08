// The Node scripts (tools/, the hosts' Vite configs) import `@proofofcalm/config/vite` under plain node,
// without a bundler: Node strips types but compiles no JSX and loads no JSON module without an import
// attribute, so one `.tsx` or bare `.json` import anywhere below the index breaks every one of them while
// vitest, which bundles, stays green. One spawn from the package root, where the self-reference resolves
// through package.json's exports, proves the index loads.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('@proofofcalm/config/vite loads under plain node', () => {
  const script = "const m = await import('@proofofcalm/config/vite'); console.log(Object.keys(m).length);";
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  });
  expect(Number(output.trim())).toBeGreaterThan(0);
});
