import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The wiring of the fixture API (apps/web/lighthouse/api.ts): the server Lighthouse CI starts loads the
// bundle that `lighthouse:api` writes, and `lighthouse` writes it before LHCI runs.
const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
type Assertion = string | [string, Record<string, unknown>];
const rc = read('../lighthouserc.json') as {
  ci: {
    collect: { startServerCommand: string; url: string[]; puppeteerLaunchOptions: { args: string[] } };
    assert: { assertMatrix: { matchingUrlPattern: string; assertions: Record<string, Assertion> }[] };
  };
};
const { scripts } = read('../package.json') as { scripts: Record<string, string> };

const option = (command: string, name: string) => command.match(new RegExp(`--${name}[= ](\\S+)`))?.[1];

describe('the Lighthouse wiring (apps/web/lighthouserc.json, apps/web/package.json)', () => {
  it('starts the local server on the bundle lighthouse:api writes', () => {
    const outfile = option(scripts['lighthouse:api'] ?? '', 'outfile');
    expect(outfile).toBeDefined();
    expect(option(rc.ci.collect.startServerCommand, 'api')).toBe(outfile);
  });

  // Vercel serves HTTP/2, and Lighthouse's simulation gives an h2 origin one multiplexed connection where
  // an http/1.1 one gets six and a round trip per wave of lazy chunks, so the local server speaks h2,
  // which browsers speak over https only (tools/serve/vercel-local.ts --tls).
  it('measures over https on the server started with --tls, its self-signed certificate accepted', () => {
    expect(rc.ci.collect.startServerCommand).toMatch(/^node \.\.\/\.\.\/tools\/serve\/vercel-local\.ts .*--tls\b/);
    expect(rc.ci.collect.url.length).toBeGreaterThan(0);
    for (const url of rc.ci.collect.url) expect(new URL(url).origin).toBe('https://localhost:3000');
    expect(rc.ci.collect.puppeteerLaunchOptions.args).toContain('--allow-insecure-localhost');
  });

  // lighthouse-vercel.yml reads lighthouserc.json from the deployed commit and tools/lighthouse/vercel.ts
  // from its own, main's on the documented dispatch, which copies the launch options through unchanged; so
  // no certificate-ignoring option may sit in this file, where any commit's vercel.ts would hand it to a
  // run against a deployment, with the bypass header on a preview.
  it('carries no option that ignores a certificate, which a deployment run would copy', () => {
    const text = JSON.stringify(rc);
    for (const option of [
      'ignore-certificate-errors',
      'acceptInsecureCerts',
      'ignoreHTTPSErrors',
      'ignoreHttpsErrors',
    ]) {
      expect(text, option).not.toContain(option);
    }
  });

  // The local run names its own layer, which vercel.ts never reads: lighthouserc.json plus the one flag the
  // self-signed certificate needs, or the service worker does not register ("An SSL certificate error
  // occurred when fetching the script"). Loaded by LHCI's own loader, the one autorun reads the rc with.
  it('adds --ignore-certificate-errors in the local layer alone, which lhci autorun loads', () => {
    expect(scripts.lighthouse).toMatch(/&& lhci autorun --config=lighthouse\/local\.cjs$/);
    const lhci = createRequire(createRequire(import.meta.url).resolve('@lhci/cli/package.json'));
    const { loadRcFile } = lhci('@lhci/utils/src/lighthouserc.js') as { loadRcFile: (path: string) => unknown };
    const local = loadRcFile(fileURLToPath(new URL('local.cjs', import.meta.url))) as typeof rc;
    const { puppeteerLaunchOptions, ...collect } = local.ci.collect;
    const { puppeteerLaunchOptions: shared, ...sharedCollect } = rc.ci.collect;
    expect(puppeteerLaunchOptions).toEqual({ ...shared, args: [...shared.args, '--ignore-certificate-errors'] });
    expect({ ...local, ci: { ...local.ci, collect } }).toEqual({ ...rc, ci: { ...rc.ci, collect: sharedCollect } });
  });

  // The seeded screens' performance score, TBT and LCP waited at warn until a push run on main measured
  // them within budget over HTTP/2 (ci.yml run 45606457093 on 9d3f57b9, docs/ENGINEERING.md §4); since
  // then every assertion of the local run fails the job, as at a deployment.
  it('asserts every budget at error, the seeded screens performance, TBT and LCP among them', () => {
    const levels = rc.ci.assert.assertMatrix.flatMap(({ matchingUrlPattern, assertions }) =>
      Object.entries(assertions).map(([audit, assertion]) => [
        `${matchingUrlPattern} ${audit}`,
        Array.isArray(assertion) ? assertion[0] : assertion,
      ]),
    );
    expect(levels.filter(([, level]) => level !== 'error')).toEqual([]);
    for (const pattern of ['/today$', '/portfolio$', '/log$', '/plan$']) {
      for (const audit of ['categories:performance', 'total-blocking-time', 'largest-contentful-paint']) {
        expect(levels).toContainEqual([`${pattern} ${audit}`, 'error']);
      }
    }
  });

  it('bundles lighthouse/api.ts in lighthouse:api', () => {
    expect(scripts['lighthouse:api']).toMatch(/^esbuild lighthouse\/api\.ts /);
  });

  it('runs lighthouse:api before lhci autorun', () => {
    const steps = (scripts.lighthouse ?? '').split('&&').map((step) => step.trim());
    const api = steps.indexOf('pnpm run lighthouse:api');
    const lhci = steps.findIndex((step) => step.startsWith('lhci autorun'));
    expect(api).toBeGreaterThanOrEqual(0);
    expect(lhci).toBeGreaterThan(api);
  });
});
