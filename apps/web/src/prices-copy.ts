// The copy of /api/prices the service worker keeps (src/sw.ts). Its stale-while-revalidate answers from
// that copy first, so the page may receive prices the worker fetched minutes ago; the stamp says when, and
// the page dates the prices by it (packages/app/src/lib/adapters/price-source.ts; ADR-0033 Readings).

/** When the worker fetched the copy it keeps, as an ISO instant from the device clock. */
export const FETCHED_AT_HEADER = 'x-proof-of-calm-fetched-at';

/**
 * The copy to keep of a network answer, as a `cacheWillUpdate` plugin returns it: none of an error status
 * (the plugin replaces Serwist's default, which keeps only ok answers), otherwise the answer stamped with
 * `now`. The `Date` header stays, since the expiration plugin reads it.
 */
export async function stampCopy(response: Response, now: Date): Promise<Response | null> {
  if (!response.ok) return null;
  const headers = new Headers(response.headers);
  headers.set(FETCHED_AT_HEADER, now.toISOString());
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers });
}
