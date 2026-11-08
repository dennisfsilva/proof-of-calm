// The one Vercel Function (ADR-0045 §2): a fetch handler over the pure modules of apps/web/lib that
// dispatches on the pathname, as the Next route handlers answered. scripts/bundle-api.ts bundles it
// into server-dist/api.mjs, which api/index.mjs re-exports; the local server and the unit tests call
// the same handler. Environment variables are read per call; the handler's copy and its in-flight
// upstream call are per instance, shared by the concurrent invocations the instance serves.
import { type CspReportDeps, handleCspReport } from '../lib/csp-report/report';
import { createHistoryHandler } from '../lib/history/handler';
import { preflight } from '../lib/http/cors';
import { createPricesHandler, type PricesDeps } from '../lib/prices/handler';
import { runtimeCacheStore } from '../lib/server/shared-cache';
import { storeFromEnv } from '../lib/server/store';

export type ApiDeps = PricesDeps & Pick<CspReportDeps, 'today'>;
/** Vercel's Web Standard export: `export default { fetch(request) { … } }`. */
export type Api = { fetch(request: Request): Promise<Response> };

const PRICES_PATH = '/api/prices';
const CSP_REPORT_PATH = '/api/csp-report';
/** `/api/history/<coin>`: one path segment, checked against the allow-list by the handler. */
const HISTORY_PATH = /^\/api\/history\/([^/]+)$/;

const empty = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export function createApi(deps: ApiDeps): Api {
  const prices = createPricesHandler(deps);
  const history = createHistoryHandler(deps);
  return {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const coin = HISTORY_PATH.exec(pathname)?.[1];
      if (pathname === PRICES_PATH || coin !== undefined) {
        if (request.method === 'GET') return coin === undefined ? prices(request) : history(request, coin);
        if (request.method === 'OPTIONS') return preflight(request, 'GET');
        return empty(405, { Allow: 'GET, OPTIONS' });
      }
      if (pathname === CSP_REPORT_PATH) {
        if (request.method === 'POST') return handleCspReport(request, deps);
        return empty(405, { Allow: 'POST' });
      }
      return empty(404);
    },
  };
}

export default createApi({
  fetch: (input, init) => fetch(input, init),
  apiKey: () => process.env.COINGECKO_API_KEY,
  store: storeFromEnv(),
  shared: runtimeCacheStore(),
  now: () => Date.now(),
  today: () => new Date().toISOString().slice(0, 10),
});
