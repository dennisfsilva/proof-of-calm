import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The two rules of packages/config/dependency-cruiser.cjs that keep test data out of product code,
// and no-unresolvable and learn-modules-only-in-learn for the virtual names, run through the real CLI
// and the real config over a small tree of probes.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = join(ROOT, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
const CONFIG = join(ROOT, 'packages/config/dependency-cruiser.cjs');
const RULES = new Set([
  'product-reaches-only-product',
  'no-test-data-in-product',
  'no-unresolvable',
  'learn-modules-only-in-learn',
]);
const LEARN_MODULES = "import { modules } from 'virtual:learn-modules';\nexport const probe = modules;\n";

const TREE: Record<string, string> = {
  // Round 3's repro: product code reaches the fixture plan through the Lighthouse seed.
  'apps/web/src/zz-probe.ts': "import { seed } from '../lighthouse/seed';\nexport const probe = seed;\n",
  'apps/web/lighthouse/seed.ts':
    "import { fixturePlan } from '../../../packages/app/src/lib/services/fixtures';\nexport const seed = fixturePlan;\n",
  'packages/app/src/lib/services/fixtures.ts': "import { plan } from '../plan';\nexport const fixturePlan = plan;\n",
  // A probe into the e2e seed and one into a package's test folder.
  'apps/web/src/e2e-probe.ts': "import { e2eSeed } from '../e2e/seed';\nexport const probe = e2eSeed;\n",
  'apps/web/e2e/seed.ts': "export const e2eSeed = 'seed';\n",
  'packages/app/src/core-probe.ts': "import { build } from '../../core/test/builders';\nexport const probe = build;\n",
  'packages/core/test/builders.ts': "export const build = () => 'built';\n",
  // A probe into the services over fakes inside src.
  'packages/app/src/lib/testing-probe.ts': "import { fakes } from './services/testing';\nexport const probe = fakes;\n",
  'packages/app/src/lib/services/testing.ts': "export const fakes = 'fakes';\n",
  // The one virtual module, named exactly (ADR-0048, Deviations): the learn feature's own import, a test
  // beside another feature, the importers it refuses, and any other virtual name.
  'packages/app/src/features/learn/learn-probe.ts': LEARN_MODULES,
  'packages/app/src/features/shell/routes-probe.test.tsx': LEARN_MODULES,
  'packages/app/src/lib/learn-probe.ts': LEARN_MODULES,
  'packages/ui/src/learn-probe.ts': LEARN_MODULES,
  'apps/web/server/learn-probe.ts': LEARN_MODULES,
  'packages/app/src/lib/virtual-probe.ts': "import { other } from 'virtual:nope';\nexport const probe = other;\n",
  // Clean: product to product, and a test to the fixtures.
  'packages/app/src/lib/plan.ts': "import { money } from '../../../core/src/money';\nexport const plan = money;\n",
  'packages/core/src/money.ts': "export const money = '1.00';\n",
  'packages/app/src/lib/services/services.test.ts':
    "import { fixturePlan } from './fixtures';\nexport const used = fixturePlan;\n",
};

type Violation = { from: string; to: string; rule: { name: string } };
let tree = '';
let violations: Violation[] = [];

const found = (rule: string, from: string, to: string) =>
  violations.some((v) => v.rule.name === rule && v.from === from && v.to === to);

beforeAll(() => {
  tree = mkdtempSync(join(tmpdir(), 'test-data-rule-'));
  for (const [file, text] of Object.entries(TREE)) {
    mkdirSync(dirname(join(tree, file)), { recursive: true });
    writeFileSync(join(tree, file), text);
  }
  const result = spawnSync(process.execPath, [CLI, '--config', CONFIG, '--output-type', 'json', 'apps', 'packages'], {
    cwd: tree,
    encoding: 'utf8',
  });
  const report = JSON.parse(result.stdout) as { summary: { violations: Violation[] } };
  violations = report.summary.violations.filter((v) => RULES.has(v.rule.name));
}, 30_000);

afterAll(() => {
  rmSync(tree, { recursive: true, force: true });
});

describe('the test-data rules of the dependency rule', () => {
  it('fire on product code that reaches the fixtures through the Lighthouse seed', () => {
    expect(found('product-reaches-only-product', 'apps/web/src/zz-probe.ts', 'apps/web/lighthouse/seed.ts')).toBe(true);
    expect(
      found('no-test-data-in-product', 'apps/web/src/zz-probe.ts', 'packages/app/src/lib/services/fixtures.ts'),
    ).toBe(true);
  });

  it('fire on product code that imports the e2e seed', () => {
    expect(found('product-reaches-only-product', 'apps/web/src/e2e-probe.ts', 'apps/web/e2e/seed.ts')).toBe(true);
  });

  it("fire on product code that imports a package's test folder", () => {
    expect(
      found('product-reaches-only-product', 'packages/app/src/core-probe.ts', 'packages/core/test/builders.ts'),
    ).toBe(true);
  });

  it('fire on product code that imports the services over fakes', () => {
    expect(
      found(
        'no-test-data-in-product',
        'packages/app/src/lib/testing-probe.ts',
        'packages/app/src/lib/services/testing.ts',
      ),
    ).toBe(true);
  });

  it('leave the learn feature and a test beside another feature that import the Learn virtual module', () => {
    expect(violations.filter((v) => v.from === 'packages/app/src/features/learn/learn-probe.ts')).toEqual([]);
    expect(violations.filter((v) => v.from === 'packages/app/src/features/shell/routes-probe.test.tsx')).toEqual([]);
    expect(violations.filter((v) => v.rule.name === 'no-unresolvable' && v.to === 'virtual:learn-modules')).toEqual([]);
  });

  it.each(['packages/ui/src/learn-probe.ts', 'apps/web/server/learn-probe.ts', 'packages/app/src/lib/learn-probe.ts'])(
    'fire on %s, which imports the Learn virtual module',
    (from) => {
      expect(violations.filter((v) => v.from === from).map((v) => v.rule.name)).toEqual([
        'learn-modules-only-in-learn',
      ]);
    },
  );

  it('fire on product code that imports any other virtual name', () => {
    expect(found('product-reaches-only-product', 'packages/app/src/lib/virtual-probe.ts', 'virtual:nope')).toBe(true);
    expect(violations.filter((v) => v.rule.name === 'no-unresolvable').map((v) => v.to)).toEqual(['virtual:nope']);
  });

  it('leave product code that reaches only product code, and tests that import the fixtures', () => {
    const clean = ['packages/app/src/lib/plan.ts', 'packages/app/src/lib/services/services.test.ts'];
    expect(violations.filter((v) => clean.includes(v.from))).toEqual([]);
  });
});

// The rules know test data by its name, and dependency-cruiser may record no edge to a test runner, so
// a test-support module inside src whose name says nothing would pass both. This scans the source text:
// every module in the product folders that imports test tooling must carry a name in TEST_DATA. The
// tooling is the test runners and libraries among the manifests' devDependencies.
const TEST_TOOLING =
  /^(vitest|@vitest\/.+|@testing-library\/.+|@playwright\/test|playwright|@axe-core\/.+|fake-indexeddb|fast-check|jsdom|storybook|@storybook\/.+)$/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bvi\.mock\s*\(\s*)['"]([^'"./][^'"]*)['"]/g;
const SOURCE = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/;
const SKIP = /(^|\/)(node_modules|dist|server-dist|out|coverage|storybook-static)(\/|$)/;

type Rule = { name: string; from: { path: string; pathNot: string[] } };
const testDataRule = (createRequire(import.meta.url)(CONFIG) as { forbidden: Rule[] }).forbidden.find(
  (r) => r.name === 'no-test-data-in-product',
);

const packageName = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

// The folders PRODUCT can match, walked one by one so that no node_modules is listed.
const children = (dir: string) =>
  readdirSync(join(ROOT, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${dir}/${d.name}`);

const productModules = (product: RegExp) =>
  [...children('apps').flatMap(children), ...children('packages').flatMap(children)]
    .filter((dir) => product.test(`${dir}/`))
    .flatMap((dir) =>
      readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).map(
        (file) => `${dir}/${file.replaceAll('\\', '/')}`,
      ),
    )
    .filter((file) => SOURCE.test(file) && !SKIP.test(file) && product.test(file));

describe('test support inside the product folders', () => {
  it('carries a name the test-data rules know whenever it imports test tooling', () => {
    expect(testDataRule).toBeDefined();
    const product = new RegExp(testDataRule?.from.path ?? '$^');
    const testData = (testDataRule?.from.pathNot ?? []).map((p) => new RegExp(p));
    const modules = productModules(product);
    expect(modules.length).toBeGreaterThan(100);
    const unnamed = modules.filter((file) => {
      if (testData.some((p) => p.test(file))) return false;
      const text = readFileSync(join(ROOT, file), 'utf8');
      return [...text.matchAll(SPECIFIER)].some((m) => TEST_TOOLING.test(packageName(m[1] ?? '')));
    });
    expect(unnamed).toEqual([]);
  });
});
