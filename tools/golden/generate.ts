// Writes the golden fixtures of packages/core/test/golden (docs/DOMAIN.md §7): each synthetic state of
// states.ts, the prices and the day, and what the prototype's own functions return for them. Run it by
// hand when the states or the prototype change, then review the diff:
//   node tools/golden/generate.ts [path/to/DCA-Plan.html]
// The prototype lives outside this repository (P:\dev\repos\dca-plan), so CI never runs this script;
// it runs the core's comparison against the committed fixtures.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPrototype } from './harness.ts';
import { STATES } from './states.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const prototype = process.argv[2] ?? resolve(root, '..', 'dca-plan', 'DCA-Plan.html');
const html = readFileSync(prototype, 'utf8');

for (const golden of STATES) {
  const fixture = {
    name: golden.name,
    today: golden.today,
    prices: Object.fromEntries(Object.entries(golden.prices).map(([coin, price]) => [coin, String(price)])),
    state: golden.state,
    prototype: runPrototype(html, golden),
  };
  const file = resolve(root, 'packages', 'core', 'test', 'golden', `${golden.name}.json`);
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote ${file}`);
}
