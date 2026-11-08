import { BRAND } from '@proofofcalm/app/lib/brand';

// CORS for the API (docs/ARCHITECTURE.md): the product's origin and the Capacitor wrapper's (M3); the
// web app itself is same-origin. `Vary: Origin` on every answer, because the CDN caches them.
const ALLOWED_ORIGINS: readonly string[] = [BRAND.origin, 'capacitor://localhost', 'https://localhost'];

// A cross-origin script sees only the safelisted response headers, so the stale marker the prices answer
// carries (ADR-0036; read by packages/app/src/lib/adapters/price-source.ts) is exposed by name; and
// `authorization` is not a safelisted request header, so the preflight allows the bearer token (ADR-0035).
const EXPOSED_HEADERS = 'x-proof-of-calm-stale';
const ALLOWED_HEADERS = 'authorization';

export function corsHeaders(origin: string | null): Record<string, string> {
  return origin !== null && ALLOWED_ORIGINS.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': EXPOSED_HEADERS, Vary: 'Origin' }
    : { Vary: 'Origin' };
}

/** The answer to a preflight: 204 for an allowed origin, 403 otherwise. */
export function preflight(request: Request, methods: string): Response {
  const origin = request.headers.get('origin');
  const allowed = origin !== null && ALLOWED_ORIGINS.includes(origin);
  return new Response(null, {
    status: allowed ? 204 : 403,
    headers: {
      ...corsHeaders(origin),
      ...(allowed
        ? {
            'Access-Control-Allow-Methods': methods,
            'Access-Control-Allow-Headers': ALLOWED_HEADERS,
            'Access-Control-Max-Age': '86400',
          }
        : {}),
    },
  });
}
