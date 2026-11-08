import 'server-only';
import { memoryStore, type SharedCache } from './store';

// The cache the prices handler shares across the function's instances (ADR-0045 §2): Vercel's regional
// Runtime Cache, read and written through `getCache()` from `@vercel/functions` (`get(key)`,
// `set(key, value, { ttl })`, https://vercel.com/docs/caching/runtime-cache, read 2026-10-19).
// `@vercel/functions` is not in the catalog: pnpm's `trustPolicy: no-downgrade` refused 3.10.1 ("high-risk
// trust downgrade", the release carries no provenance), so the release current when the owner reviews
// an entry in `trustPolicyExclude` is pinned then (ADR-0025; ADR-0045, deviations of 2026-10-19 and
// 2026-10-26). Until then the seam is memory per instance, as
// the Next route handler's copy was: ADR-0006's one call per TTL holds per instance and behind the CDN,
// not across instances. The handler and its tests do not change when it lands.
export function runtimeCacheStore(): SharedCache {
  return memoryStore();
}
