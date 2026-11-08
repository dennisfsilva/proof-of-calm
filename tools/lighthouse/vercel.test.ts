import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LighthouseRc, measuredElsewhere, vercelConfig } from './vercel.ts';

const rc: LighthouseRc = JSON.parse(readFileSync(new URL('../../apps/web/lighthouserc.json', import.meta.url), 'utf8'));
const production = 'https://proofofcalm.com';
const preview = 'https://proof-of-calm-git-ci-lighthouse-origin-incubating.vercel.app';

const errorsInConsole = (url: string) =>
  vercelConfig(rc, url).ci.assert.assertMatrix.map(({ matchingUrlPattern, assertions }) => [
    matchingUrlPattern,
    assertions['errors-in-console'],
  ]);

describe('vercelConfig', () => {
  it('keeps the runs, the seed and the settings of lighthouserc.json, without its local server', () => {
    const {
      startServerCommand: _server,
      startServerReadyPattern: _pattern,
      startServerReadyTimeout: _timeout,
      url: _url,
      ...kept
    } = rc.ci.collect as LighthouseRc['ci']['collect'] & Record<string, unknown>;
    expect(vercelConfig(rc, preview).ci.collect).toEqual({ ...kept, url: expect.any(Array) });
    expect(kept).toMatchObject({ numberOfRuns: 5, puppeteerScript: 'node_modules/.cache/lighthouse/seed.cjs' });
  });

  it('measures the four seeded screens and / at every target, at the deployment it is given', () => {
    const paths = ['/today', '/portfolio', '/log', '/plan', '/'];
    for (const origin of [preview, production, 'https://proof-of-calm-git-main-incubating.vercel.app']) {
      expect(vercelConfig(rc, origin).ci.collect.url).toEqual(paths.map((path) => `${origin}${path}`));
    }
    expect(vercelConfig(rc, `${production}/`).ci.collect.url).toEqual(paths.map((path) => `${production}${path}`));
  });

  // The seed runs once before each URL's five runs (LHCI's puppeteerScript); Lighthouse's own reset before
  // every run then clears the worker, Cache Storage and the HTTP cache but not IndexedDB, so each run
  // loads cold with the plan in the store. disableStorageReset would leave runs 2 to 5 warm.
  it('resets the worker and the caches before every run, and keeps the seeded store', () => {
    const { settings } = vercelConfig(rc, preview).ci.collect;
    expect(settings).not.toHaveProperty('disableStorageReset');
    expect(settings.clearStorageTypes).toEqual(['file_systems', 'shader_cache', 'service_workers', 'cache_storage']);
  });

  // The seeded screens hold the budgets of docs/ENGINEERING.md §4; Today keeps the script budget, now
  // measured with a plan in the store (apps/web/lighthouse/seed.ts).
  it('asserts each seeded screen with its budgets, and the script budget on Today', () => {
    const screen = {
      'categories:performance': ['error', { minScore: 0.95 }],
      'categories:accessibility': ['error', { minScore: 1 }],
      'total-blocking-time': ['error', { maxNumericValue: 200 }],
      'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
      'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
    };
    const matrix = vercelConfig(rc, preview).ci.assert.assertMatrix;
    const assertionsOf = (pattern: string) =>
      matrix.find(({ matchingUrlPattern }) => matchingUrlPattern === pattern)?.assertions;
    expect(assertionsOf('/today$')).toEqual({
      ...screen,
      'resource-summary:script:size': ['error', { maxNumericValue: 163840 }],
    });
    for (const pattern of ['/portfolio$', '/log$', '/plan$']) expect(assertionsOf(pattern)).toEqual(screen);
    expect(matrix.map((entry) => (entry as { aggregationMethod?: string }).aggregationMethod)).toEqual(
      matrix.map(() => 'median'),
    );
  });

  it('asserts the budgets of lighthouserc.json, errors-in-console and the local warn level aside', () => {
    const budgets = rc.ci.assert.assertMatrix.map(
      ({ assertions: { 'errors-in-console': _local, ...rest }, ...entry }) => ({
        ...entry,
        assertions: Object.fromEntries(
          Object.entries(rest).map(([audit, assertion]) => [
            audit,
            Array.isArray(assertion) ? ['error', assertion[1]] : assertion,
          ]),
        ),
      }),
    );
    expect(vercelConfig(rc, preview).ci.assert).toMatchObject({ assertMatrix: budgets });
    expect(vercelConfig(rc, production).ci.assert).toMatchObject({ assertMatrix: budgets });
  });

  // The local run (ci.yml's lighthouse job on push to main, lighthouse-branch.yml's on a branch) holds the
  // performance score, TBT and LCP of the seeded screens at warn until a push run on main measures them within budget
  // (docs/ENGINEERING.md §4, the warn-first rule of .claude/rules/tools-ci.md); every other local
  // assertion fails the job.
  it('warns locally on the performance score, TBT and LCP of the seeded screens only', () => {
    const warned = rc.ci.assert.assertMatrix.flatMap(({ matchingUrlPattern, assertions }) =>
      Object.entries(assertions)
        .filter(([, assertion]) => (Array.isArray(assertion) ? assertion[0] : assertion) !== 'error')
        .map(([audit]) => `${matchingUrlPattern} ${audit}`),
    );
    expect(warned).toEqual(
      ['/today$', '/portfolio$', '/log$', '/plan$'].flatMap((pattern) => [
        `${pattern} categories:performance`,
        `${pattern} total-blocking-time`,
        `${pattern} largest-contentful-paint`,
      ]),
    );
  });

  // A deployment is measured at the budgets themselves: the preview, a requested URL and production fail
  // on every seeded assertion that lighthouserc.json only warns on locally.
  it.each([
    ['the preview', preview],
    ['a requested deployment', 'https://proof-of-calm-git-main-incubating.vercel.app'],
    ['production', production],
  ])('asserts every budget at error at %s', (_target, url) => {
    const levels = vercelConfig(rc, url).ci.assert.assertMatrix.flatMap(({ matchingUrlPattern, assertions }) =>
      Object.entries(assertions).map(([audit, assertion]) => [
        `${matchingUrlPattern} ${audit}`,
        Array.isArray(assertion) ? assertion[0] : assertion,
      ]),
    );
    expect(levels.length).toBeGreaterThan(0);
    expect(levels).toEqual(levels.map(([assertion]) => [assertion, 'error']));
    for (const pattern of ['/today$', '/portfolio$', '/log$', '/plan$']) {
      expect(levels).toContainEqual([`${pattern} largest-contentful-paint`, 'error']);
      expect(levels).toContainEqual([`${pattern} categories:performance`, 'error']);
      expect(levels).toContainEqual([`${pattern} total-blocking-time`, 'error']);
    }
  });

  // A request of the page that Vercel's protection stops logs a console error: production's manifest did
  // in every run while x-vercel-set-bypass-cookie redirected it in a loop (runs 39072367099 and
  // 39073337602). lighthouserc.json asserts it on the seeded screens for the local run; a preview drops it
  // there, because deployment protection redirects the service worker's script fetch.
  it('asserts no console error on / only at a preview', () => {
    expect(errorsInConsole(preview)).toEqual([
      ['/today$', undefined],
      ['/portfolio$', undefined],
      ['/log$', undefined],
      ['/plan$', undefined],
      ['://[^/]+/$', ['error', { maxLength: 0 }]],
    ]);
  });

  it('asserts no console error on every page at the production origin, which no protection covers', () => {
    expect(errorsInConsole(production)).toEqual([
      ['/today$', ['error', { maxLength: 0 }]],
      ['/portfolio$', ['error', { maxLength: 0 }]],
      ['/log$', ['error', { maxLength: 0 }]],
      ['/plan$', ['error', { maxLength: 0 }]],
      ['://[^/]+/$', ['error', { maxLength: 0 }]],
    ]);
    expect(errorsInConsole(`${production}/`)).toEqual(errorsInConsole(production));
  });

  it('treats every other host as a protected deployment, a look-alike of the origin among them', () => {
    for (const url of ['https://www.proofofcalm.com', 'https://proofofcalm.com.example', 'http://proofofcalm.com']) {
      expect(errorsInConsole(url)).toEqual(errorsInConsole(preview));
    }
  });

  it('refuses a configuration without the entry of /, so that assertion cannot fall away unnoticed', () => {
    const assertMatrix = rc.ci.assert.assertMatrix.filter(
      ({ matchingUrlPattern }) => matchingUrlPattern !== '://[^/]+/$',
    );
    expect(() => vercelConfig({ ci: { ...rc.ci, assert: { assertMatrix } } }, preview)).toThrow(
      'lighthouserc.json has no assertMatrix entry for ://[^/]+/$',
    );
  });

  it('holds no header: the bypass reaches Lighthouse through the environment only', () => {
    expect(JSON.stringify(vercelConfig(rc, preview))).not.toMatch(/extraHeaders|x-vercel/i);
  });
});

// The resolve step of lighthouse-vercel.yml admits a URL before the bypass secret or a Lighthouse run goes
// anywhere near it: this project's previews and the production origin, nothing else. The same pattern,
// read from the workflow, on a table of URLs (bash's extended regular expressions and JavaScript's agree
// on it).
describe('the workflow’s allow-list', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lighthouse-vercel.yml', import.meta.url), 'utf8');
  const pattern = /\[\[ "\$url" =~ (\S+) \]\]/.exec(workflow)?.[1];
  if (pattern === undefined) throw new Error('lighthouse-vercel.yml has no [[ "$url" =~ … ]] line');
  const allowed = new RegExp(pattern);

  it.each([
    production,
    preview,
    'https://proof-of-calm-git-main-incubating.vercel.app',
    'https://proof-of-calm-abc12-incubating.vercel.app',
  ])('admits %s', (url) => {
    expect(allowed.test(url)).toBe(true);
  });

  it.each([
    'http://proofofcalm.com',
    'https://www.proofofcalm.com',
    'https://proofofcalm.com/',
    'https://proofofcalm.com.example',
    'https://proofofcalm.com@example.com',
    'https://proof-of-calm-git-main-incubating.vercel.app.example',
    'https://proof-of-calm-git-main-incubating.vercel.app/today',
    'https://proof-of-calm-incubating.vercel.app',
    'https://PROOF-OF-CALM-git-main-incubating.vercel.app',
    'https://other-project-git-main-incubating.vercel.app',
    'https://example.com?https://proofofcalm.com',
  ])('refuses %s', (url) => {
    expect(allowed.test(url)).toBe(false);
  });
});

describe('measuredElsewhere', () => {
  const today = 'https://proof-of-calm-git-ci-s2-hygiene-incubating.vercel.app/today';

  it('passes reports that ended at the URL they requested', () => {
    expect(measuredElsewhere([{ requestedUrl: today, finalUrl: today }])).toEqual([]);
  });

  it('names a report that a redirect took elsewhere, such as Vercel’s login', () => {
    const login = 'https://vercel.com/login?next=%2Fsso-api';
    expect(measuredElsewhere([{ requestedUrl: today, finalUrl: login }])).toEqual([
      `${today} was measured at ${login}, which no budget matches.`,
    ]);
  });

  it('fails when there is no report to check', () => {
    expect(measuredElsewhere([])).toEqual(['No Lighthouse report to check.']);
  });
});
