import { expect } from '@playwright/test';
import { test } from './support';

// The lines of ADR-0045's preview checklist (Risks 1 and 2, the deviations) that only a deployment can
// answer: Vercel's 404 and the clean-URL 308, the function seeing the requested path, the CDN bound on
// the prices, and what deployment protection does to the worker. Everything else on the checklist is
// asserted by csp.spec.ts, pwa.spec.ts, site.spec.ts, prices.spec.ts and csp-report.spec.ts, which
// run against the deployment in the same dispatch (the preview-checks job of
// .github/workflows/lighthouse-vercel.yml). The local
// suite skips this file: without BASE_URL there is no deployment to ask.

const deployment = process.env.BASE_URL ?? '';
// biome-ignore lint/suspicious/noSkippedTests: a runtime skip while the run has no deployment to ask, not a disabled test
test.skip(deployment === '', 'runs against a deployment only');

const record = (type: string, description: string) => {
  test.info().annotations.push({ type, description });
  console.log(`${type}: ${description}`);
};

test('an unknown path answers 404 with the prerendered not-found page', async ({ request }) => {
  const response = await request.get('/unknown-path');
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain('Page not found');
});

test('the shell answers 200 and a trailing slash answers 308 to the clean URL', async ({ request }) => {
  expect((await request.get('/app')).status()).toBe(200);
  // The 308 answers before the header rules (ADR-0045, the deviation of 2026-10-17): the headers it
  // does carry are recorded, only the status and the location are asserted.
  const redirect = await request.get('/terms/', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toMatch(/\/terms$/);
  record('308 headers', Object.keys(redirect.headers()).sort().join(', '));
});

test('the function sees the requested path on every /api route', async ({ request }) => {
  const prices = await request.get('/api/prices?currency=EUR');
  expect(prices.status()).toBe(200);
  expect(prices.headers()['content-type']).toContain('application/json');
  // The handler sends `public, s-maxage=600, stale-while-revalidate=1800` (pinned by
  // apps/web/lib/prices/handler.test.ts; tools/serve/vercel-local.ts passes it through unchanged). Vercel's
  // CDN-cache documentation (vercel.com/docs/caching/cdn-cache, CDN-Cache-Control): "If you set
  // `Cache-Control` without a `CDN-Cache-Control`, the Vercel CDN strips `s-maxage` and
  // `stale-while-revalidate` from the response before sending it to the browser." Observed in run
  // 39336802125 on bb670a1: `public`, and the second request ten seconds later was a HIT. The stripped
  // form is the proof that the CDN consumed the directives.
  const cacheControl = prices.headers()['cache-control'] ?? '';
  record('prices cache-control', cacheControl);
  expect(cacheControl).toMatch(/^public\b/);
  expect(cacheControl).not.toMatch(/s-maxage|stale-while-revalidate/);
  // Vercel's response-headers documentation: x-vercel-id "contains a list of Vercel regions your
  // request hit, as well as the region the function was executed in". Observed: the edge PoP first
  // (cdg1 from Europe, iad1 from a GitHub-hosted runner), the function's region last, then the request
  // id (`cdg1::fra1::d5wsc-…`). On a CDN hit the function did not run and the header can carry the
  // edge region alone, so the region is asserted only when x-vercel-cache is not HIT.
  const vercelId = prices.headers()['x-vercel-id'] ?? '';
  const cache = prices.headers()['x-vercel-cache'] ?? '';
  record('x-vercel-id', vercelId);
  record('x-vercel-cache', cache);
  if (cache !== 'HIT') {
    const regions = vercelId.split('::').slice(0, -1);
    expect(regions.at(-1), 'the function runs in fra1').toBe('fra1');
  }

  const refused = await request.delete('/api/prices');
  expect(refused.status()).toBe(405);
  expect(refused.headers().allow).toBe('GET, OPTIONS');

  // vercel.json's rewrite names only /api/(prices|csp-report), so Vercel answers an unknown /api/* path
  // itself with its platform 404 (observed in run 39338645132 on 613ff70: "The page could not be
  // found"), before the site's prerendered 404 and never the function, whose own 404 branch
  // apps/web/server/api.test.ts covers. The body is recorded; asserted is only that it is not the shell.
  const unknown = await request.get('/api/other');
  expect(unknown.status()).toBe(404);
  record('/api/other cache-control', unknown.headers()['cache-control'] ?? '');
  const unknownBody = await unknown.text();
  record('/api/other body', unknownBody.slice(0, 80));
  expect(unknownBody).not.toMatch(/data-entry=/);
});

test('the CDN serves the prices from its cache within s-maxage', async ({ request }) => {
  test.setTimeout(60_000);
  expect((await request.get('/api/prices?currency=EUR')).status()).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const second = await request.get('/api/prices?currency=EUR');
  expect(second.status()).toBe(200);
  expect(second.headers()['x-vercel-cache']).toBe('HIT');
});

// Recorded, not asserted (docs/BUILD-PROMPT.md, known gaps): the bypass header never reaches the
// worker's own script fetch, so the run log shows what the preview does and pwa.spec.ts keeps the
// assertion local.
// The worker gets 15 s, not 5: a cold preview fetches the precache list before `ready` settles, and the
// elapsed time is recorded so a slow install reads as slow, not as blocked.
test('what deployment protection does to the worker is recorded', async ({ page, playwright }) => {
  test.setTimeout(60_000);
  await page.goto('/today');
  const scope = await page.evaluate(() => {
    const started = performance.now();
    const elapsed = () => `${Math.round(performance.now() - started)} ms`;
    return Promise.race([
      navigator.serviceWorker.ready.then((registration) => `${registration.scope} after ${elapsed()}`),
      new Promise<string>((resolve) => setTimeout(() => resolve(`not ready within ${elapsed()}`), 15_000)),
    ]);
  });
  record('worker on /today', scope);

  const anonymous = await playwright.request.newContext({ baseURL: deployment, extraHTTPHeaders: {} });
  try {
    const script = await anonymous.get('/sw.js', { maxRedirects: 0 });
    const location = script.headers().location;
    const host = location === undefined ? 'none' : new URL(location, deployment).host;
    record('/sw.js without the bypass', `${script.status()}, location host ${host}`);
  } finally {
    await anonymous.dispose();
  }
});
