// Lighthouse CI against a Vercel deployment (lighthouse-vercel.yml, ADR-0024): the URLs, runs, seed,
// settings and budgets of apps/web/lighthouserc.json without the local server it starts, every budget at
// error where the local run only warns (docs/ENGINEERING.md §4), no console error
// on `/` (and on the seeded screens at the production origin), and a check that every report measured the
// page it asked for.
// The configuration holds no header: the job hands the bypass headers to Lighthouse through the
// environment, so the secret reaches no file the job writes.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Assertion = string | [string, Record<string, unknown>];

interface MatrixEntry {
  matchingUrlPattern: string;
  assertions: Record<string, Assertion>;
}

export interface LighthouseRc {
  ci: {
    collect: {
      url: string[];
      numberOfRuns: number;
      /** The seed, run before each URL (apps/web/lighthouse/seed.ts); absent at a commit that predates it. */
      puppeteerScript?: string;
      puppeteerLaunchOptions?: Record<string, unknown>;
      settings: Record<string, unknown>;
    };
    assert: { assertMatrix: MatrixEntry[] };
  };
}

/** lighthouserc.json's pattern for `/`. */
const ROOT_PAGE = '://[^/]+/$';
const NO_CONSOLE_ERROR: Assertion = ['error', { maxLength: 0 }];
/** The public origin: no deployment protection, so no bypass and no redirect of any request. */
const PRODUCTION_ORIGIN = 'https://proofofcalm.com';

/** An assertion the local run only warns on fails at a deployment; `off` stays off. */
function atError(assertion: Assertion): Assertion {
  if (Array.isArray(assertion)) return assertion[0] === 'warn' ? ['error', assertion[1]] : assertion;
  return assertion === 'warn' ? 'error' : assertion;
}

/**
 * The configuration for the deployment at `url`: lighthouserc.json's paths at the deployment's origin, so
 * every target measures the same seeded screens, its runs, seed, settings and budgets, and no console
 * error on `/`, with every warn of lighthouserc.json at error. A request of the page that Vercel's protection stops
 * logs a console error, as production's manifest did in every run while x-vercel-set-bypass-cookie
 * redirected it in a loop. lighthouserc.json asserts it on the seeded screens too, which holds locally (tools/serve)
 * and at the production origin, where nothing is protected; at every other deployment it is dropped
 * there, because the bypass header reaches every request of the page but the service worker's script
 * fetch, which deployment protection redirects (ADR-0045 deviations). The origin is compared whole: a
 * look-alike host is a protected deployment at best.
 */
export function vercelConfig(rc: LighthouseRc, url: string): LighthouseRc {
  // The local server's keys stay behind; the seed and its launch options come along when the commit has them.
  const { url: paths, numberOfRuns, settings, puppeteerScript, puppeteerLaunchOptions } = rc.ci.collect;
  const seed = {
    ...(puppeteerScript === undefined ? {} : { puppeteerScript }),
    ...(puppeteerLaunchOptions === undefined ? {} : { puppeteerLaunchOptions }),
  };
  const { assertMatrix } = rc.ci.assert;
  if (!assertMatrix.some(({ matchingUrlPattern }) => matchingUrlPattern === ROOT_PAGE)) {
    throw new Error(
      `lighthouserc.json has no assertMatrix entry for ${ROOT_PAGE}, where the deployment asserts no console error.`,
    );
  }
  const { origin } = new URL(url);
  const production = origin === PRODUCTION_ORIGIN;
  const urls = paths.map((path) => new URL(new URL(path).pathname, origin).href);
  const withConsole = assertMatrix.map(({ assertions: { 'errors-in-console': _local, ...local }, ...entry }) => {
    const assertions = Object.fromEntries(
      Object.entries(local).map(([audit, assertion]) => [audit, atError(assertion)]),
    );
    return production || entry.matchingUrlPattern === ROOT_PAGE
      ? { ...entry, assertions: { ...assertions, 'errors-in-console': NO_CONSOLE_ERROR } }
      : { ...entry, assertions };
  });
  const collect = { url: urls, numberOfRuns, ...seed, settings };
  return { ci: { collect, assert: { assertMatrix: withConsole } } };
}

interface Report {
  requestedUrl: string;
  finalUrl: string;
}

/**
 * The reports that ended at another URL than they requested. LHCI applies the budgets by the final URL,
 * so a page that a redirect took elsewhere, such as Vercel's login, would pass with no budget checked.
 */
export function measuredElsewhere(reports: readonly Report[]): string[] {
  if (reports.length === 0) return ['No Lighthouse report to check.'];
  return reports
    .filter(({ requestedUrl, finalUrl }) => finalUrl !== requestedUrl)
    .map(({ requestedUrl, finalUrl }) => `${requestedUrl} was measured at ${finalUrl}, which no budget matches.`);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [command, path, output, url] = process.argv.slice(2);
  if (command === 'config' && path && output && url) {
    writeFileSync(output, JSON.stringify(vercelConfig(JSON.parse(readFileSync(path, 'utf8')), url)));
  } else if (command === 'check' && path) {
    const reports = readdirSync(path)
      .filter((name) => /^lhr-.*\.json$/.test(name))
      .map((name): Report => JSON.parse(readFileSync(join(path, name), 'utf8')));
    const problems = measuredElsewhere(reports);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`${reports.length} reports, each measured at the URL it requested.`);
  } else {
    console.error(
      'usage: node lighthouse/vercel.ts config <lighthouserc.json> <out.json> <deployment URL> | check <reports directory>',
    );
    process.exit(2);
  }
}
