# ADR-0033: PWA and offline

Status: Accepted; `@serwist/turbopack`, `app/manifest.ts` and the `@serwist/window` registration superseded by ADR-0045 (a hand-written registration with the same update flow) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §3)

## Context

"Works offline once installed, with the last prices cached and a visible prices-from state" and installability on Android and iOS. Facts from the vendors' pages: Serwist 9.5.13 is the maintained Workbox-derived toolkit with a Turbopack integration (a route handler) and a webpack plugin fallback; Chrome's install criteria need HTTPS, a manifest with name, icons (192 and 512 px), `start_url` and `display`; iOS has no install prompt and adds sites from the Share sheet, and since iOS 26 every site added to the Home Screen opens as a web app by default; WebKit deletes script-writable storage after seven days without interaction for sites in Safari but exempts the first-party domain of a Home Screen web app; iOS web push works for Home Screen web apps with `display: standalone` since 16.4; Capacitor documents a service-worker bridge only on Android.

## Decision

- **Serwist 9.5.13 through `@serwist/turbopack`** (the route handler `app/serwist/[path]/route.ts` and `<SerwistProvider>`), keeping the default Turbopack build; `@serwist/next` with `next build --webpack` is the fallback.
- **Precache** the app shell (the route HTML for Today, Portfolio, Log, Plan, Learn, Settings and an offline fallback, icons, the font) from the Serwist manifest; `cleanupOutdatedCaches`, `navigationPreload`; runtime caching with the default cache plus stale-while-revalidate for `/api/prices` with an expiration plugin; cache-first for `/_next/static` and the history files in `packages/data`.
- **"Prices from <time>" comes from IndexedDB, not from the service-worker cache**: the price adapter stores `{ prices, asOf, fetchedAt, source, stale }` (ADR-0019), so the state is identical online, offline, installed and in the wrapper. The service-worker route is a bonus for cold starts.
- **Update flow**: `skipWaiting: false`, `clientsClaim: true`; on `waiting`, a calm toast "A new version is ready. Reload"; on accept, `messageSkipWaiting()` and reload when `controlling` fires.
- **Manifest** through `app/manifest.ts` (name, short name, `start_url: /today`, `display: standalone`, theme and background colours from the tokens, 192 and 512 px icons plus a maskable icon, screenshots and a description for the richer install UI); the manifest changes rarely because Android regenerates the WebAPK on change.
- **Install guidance**: Android shows the install prompt after engagement (a tap and thirty seconds); iOS shows a one-line hint with the Share-sheet steps once entries exist, because installation is also what exempts the data from the seven-day eviction. `navigator.storage.persist()` after the first entry (ADR-0019).
- **Push**: web push for installed apps arrives with M3 (reminders); the Capacitor wrapper uses native push; the service worker is never registered inside the wrapper.
- Lighthouse's PWA category no longer exists; installability is checked by a Playwright test that reads the manifest and asserts the service worker controls the page after reload, plus a manual install on one Android and one iOS device per release.

## Consequences

- The offline test in the Playwright suite: install state simulated by controlling the service worker, go offline, open Today, log an entry, come back online, and assert the prices line shows the cached time.
- The export build of `apps/mobile` excludes the service worker.
- A changed manifest is a reviewed change (release checklist).

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while implementing it on
2026-10-17.

- **Precache.** The build's static files and public files (Serwist's defaults), plus `/today` and
  `/~offline` under a revision that changes with every deployment (Vercel's commit, else the
  checkout's). The other shell routes join the list as they are built.
- **Registration.** `<SerwistProvider>` in the `(app)` layout, disabled outside production builds;
  the site pages do not register the worker. The esbuild that bundles it is the native package
  of the catalog (`useNativeEsbuild: true`).
- **Types.** `app/sw.ts` is typechecked on its own with the webworker library
  (`tsconfig.sw.json`), because the webworker and DOM libraries cannot share one program.
- **The stored prices.** The ports' `PricesState` is `{ snapshot, currency, fetchedAt, stale, source }`:
  the text's `prices` and `asOf` are the core's `PriceSnapshot` and its `at`, the time the prices
  describe; `currency` was added because the route gives the 24-hour change in the asked currency,
  so a change of pay currency fetches again. `source` is `live`, or `manual` for prices typed by hand
  (docs/ROADMAP.md M1).
- **When to fetch** (`shouldFetchPrices`): never fetched, another pay currency, `fetchedAt` older
  than the client's 60 seconds (docs/DOMAIN.md §9), or `fetchedAt` after now, when the device clock
  went back and the copy's age is unknown.
- **What the line says** (`pricesLine`, a code with values that the copy words): `offline` when the
  platform reports no network or the latest refresh got no answer; `delayed` when the server marked
  its copy stale or the prices are older than a healthy answer can get, whichever cache answered:
  the worker's stale-while-revalidate answers the page from its copy first, so the age is read from
  the prices themselves. A healthy answer stacks three caches of ten minutes, each starting its period
  when it copies the one below (Next's Data Cache, the instance's copy, the CDN's `s-maxage`; ADR-0036),
  the CDN's 30 minutes of stale-while-revalidate, CoinGecko's own lag (5 minutes allowed) and the
  client's minute, so the line turns delayed after 66 minutes (`DELAYED_AFTER_MS`); `live` otherwise; `manual`; `none` before any price. Each carries
  the prices' time and whether it falls on today in the device's zone. The words are
  docs/CONTENT-STYLE.md §3's ("Stale prices", "Offline"), and since 2026-10-26 they always show the date.
- **2026-10-20, the Precache, Registration and Types bullets describe the Next host, which ADR-0045
  replaced.** The worker is `apps/web/src/sw.ts`, bundled after the prerendered pages and given its
  precache list then (the shell `/app`, `/~offline`, the hashed assets, the icons, the manifest; the
  revisions from the files' content), and it answers every product route from the shell
  (ADR-0045 §5). The registration is hand-written on the platform events in
  `packages/app/src/lib/pwa/register.ts`, with this ADR's update flow step for step, and the
  static-export host passes none (ADR-0045 §5 and its Deviations). The worker is typechecked on its
  own against `apps/web/tsconfig.sw.json`. The manifest is the built `manifest.webmanifest`
  (`apps/web/scripts/build.ts`), not `app/manifest.ts`; the nonces are gone with the proxy
  (ADR-0045 §3).
- **2026-10-26, the offline test as built** (#178). The Consequences' first bullet expects the prices line
  to show the cached time once the device is back online; `apps/web/e2e/offline.spec.ts` asserts instead
  that the line turns live, since the shell refreshes the prices when the network comes back. It runs on
  the desktop project only, as `pwa.spec.ts` does: the service worker does not depend on the viewport.
- **2026-10-27, a replayed copy keeps its fetch time.** Until then `fetchedAt` was the moment the page
  received an answer, so a copy the worker replayed read as fetched this minute: a live line could show
  a time up to 66 minutes later than the fetch, and the client waited another minute before asking
  again. The worker now stamps the copy it keeps with `x-proof-of-calm-fetched-at` (`apps/web/src/prices-copy.ts`),
  and `apiPriceSource` takes that time as `fetchedAt` unless it is after now or unreadable. The e2e specs
  pin `navigator.onLine` on Chromium (`apps/web/e2e/network.ts`), which otherwise follows the host's network:
  a laptop whose Wi-Fi dropped during a local gate saw the cold boot's line say offline.
- **2026-10-29, the first of the three caches is the API function's shared cache.** "What the line
  says" above names Next's Data Cache, which left with ADR-0045. The first cache is the shared cache
  of ADR-0045 §2, memory per instance until the Runtime Cache store lands
  (`apps/web/lib/server/shared-cache.ts`). The bound and `DELAYED_AFTER_MS` are unchanged:
  3 × 600 s + 1,800 s + 300 s + 60 s = 66 minutes.

## Disagreement

None.
