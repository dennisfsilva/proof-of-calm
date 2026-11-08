# ADR-0045: The hosts move to a Vite single-page app with wouter (ADR-0005's plan B)

Status: Accepted · Date: 2026-10-17 · Deciders: owner (the router, the service worker registration and the toast, 2026-10-17, chosen for bundle size); build session on the owner's delegation (the rest) · Supersedes: the Next.js hosts of ADR-0005 (its plan B is triggered), its "React Router" wording and its Base UI toast; in part ADR-0021 (the sync endpoints as route handlers), ADR-0023 (next-intl), ADR-0024 (the Next Storybook framework and the brotli proxy in front of `next start`), ADR-0025 (the Next lint and knip plugins), ADR-0027 (the Next SDK), ADR-0028 (counting in route handlers and server actions), ADR-0029 (the proxy as the mechanism), ADR-0032 (the Next hosts and `proxy.ts`), ADR-0033 (`@serwist/turbopack`, `app/manifest.ts` and the `@serwist/window` registration), ADR-0035 (session handling in `proxy.ts`), ADR-0036 (Next's Data Cache)

## Context

The Today page has a script budget of 163,840 bytes: `resource-summary:script:size` in Lighthouse CI,
the encoded bodies and response headers of every script, at the brotli quality Vercel serves, which is
3 (`docs/ENGINEERING.md` §4, ADR-0024 deviations). ADR-0043 brought main's empty Today back under it
(162,699 bytes) and named the trigger: if M1's Today screen does not fit beside the framework, that is
ADR-0005's plan B, decided in its own ADR with the measurements.

The spike on the branch `spike/m1-budget` (local to the build machine, never merged; every number,
the method and the prototypes' findings are copied into `docs/research/host-plan-b.md`) built M1's Today at its real size in
`packages/app/src/features/spike-today`: the domain store hydrated from an `idb` PlanStore with every row
validated by the core's `zod/mini` schemas, a BroadcastChannel re-hydration, the one tap through
`oneTapEntries` and `saveTransaction`, prices through the api-client, the core's derived views in
render, Button, CoinChip, ProgressStrip, Banner, Toast with Edit and Empty, a header, a tab bar and 47
messages. `tools/spike/seed-check.ts` proved it works with a seeded plan in two tabs, on both hosts. The
same product code was then measured in the Next host and in a Vite host (`apps/spike-vite`, which aliases
`next-intl` to a shim over `use-intl` and `next/link` to the router's `Link`, React Router's or
wouter's per variant, so `packages/app` ran unchanged).

**One method for every number.** `tools/spike/measure.ts` opens the page in a fresh Playwright Chromium
(1.64.1), waits for the network to stay quiet for 1.5 s after the load event, and adds
`responseBodySize + responseHeadersSize` of every response whose request is a script: Chromium's
encoded length, which is the `transferSize` Lighthouse sums. The Next builds were served by `next start`
behind `tools/serve/brotli-proxy.ts` at quality 3, as CI's Lighthouse serves them; the Vite builds by
`tools/spike/serve-static.ts` at quality 3 with the Next host's asset headers and an SPA fallback, so the
header bytes per script are comparable (766 to 772; 404 to 406 in variant d4). Three runs per variant, the median recorded; all
three were identical in every case. Calibration on main's build: 162,699 bytes on `/today` and 147,072
on `/`, where CI's Lighthouse reported 162,742 and 147,173. A real Lighthouse 12.6.1 run reported the
same totals as `measure.ts` for both slices (233,903 and 157,405). The results are in
`tools/spike/results/*.json` on that branch and, with their file names, in
`docs/research/host-plan-b.md` §2; each optimisation is a patch in `tools/spike/variants/`.

**Next.js 16.4.2 (Turbopack unless noted), `/today`:**

| Variant | Bytes | Against 163,840 |
|---|---:|---:|
| main, the empty Today of M0 | 162,699 | 1,141 under |
| the M1 Today slice | 233,903 | 70,063 over |
| the slice, other routes as client stubs | 237,242 | 73,402 over |
| the slice with a 500-string M1 catalogue | 245,914 | 82,074 over |
| (a) next-intl `precompile: true` | 223,654 | 59,814 over |
| (b1) `@serwist/window` after the load event | 234,515 | 70,675 over |
| (b2) registration through the platform API | 232,091 | 68,251 over |
| (c) per-route message subsets | 233,964 | 70,124 over |
| (c) with the 500-string catalogue | 233,964 | 70,124 over |
| (d1) Base UI toast parts imported file by file, without the Positioner and floating-ui | 222,007 | 58,167 over |
| (d2) without the React Compiler (it stays on) | 231,068 | 67,228 over |
| (d3) `next build --webpack` | 212,285 | 48,445 over |
| (d4) build assets with `nosniff` only, not the eight document headers | 230,253 | 66,413 over |
| (a) + (b2) + (c) + (d1), Turbopack | 209,696 | 45,856 over |
| (a) + (b2) + (c) + (d1), webpack | 203,398 | 39,558 over |

(d4) is an HTTP/1.1 effect of the local proxy; behind Vercel's HTTP/2 the repeated headers are
HPACK-compressed, so it is not counted as an optimisation. One Lighthouse 12.6.1 run on the plain slice:
performance 0.90, largest contentful paint 3,240 ms, total blocking time 196 ms, so the slice also
breaks the performance and LCP budgets.

Why none fits: the framework floor. An empty `/` costs 145,610 bytes on Next with webpack (the floor that
issue #33 quotes) and 147,072 with Turbopack; the slice's own code,
bundled alone with esbuild and compressed at quality 3 (`tools/spike/results/parts.json`), is 72,422
bytes, of which Base UI's toast and button with floating-ui are 27,224, `zod/mini` 9,884, the core's
functions 8,644 and the app code 6,919. Every legitimate optimisation together removes 30,505 bytes
(203,398 with webpack); the webpack floor leaves 18,230 bytes for a screen that needs 57,788 after
them (203,398 less 145,610), and the Turbopack floor 16,768 for 62,624 (209,696 less 147,072).
Raising the budget is not an option (ADR-0043): it is ADR-0005's decision about what users download.

**Vite 8.3.4 with React 19.3.1, React Router 8.4.0 and wouter 3.13.0, same method.** Rows (a) to
(d1) and the combination were measured with React Router in declarative mode; the wouter rows
change only the router:

| Variant | Bytes | Against 163,840 |
|---|---:|---:|
| floor: React and the holding page, no router | 70,594 | |
| floor with wouter 3.13.0 | 73,106 | |
| floor, React Router declarative mode | 84,528 | |
| floor, React Router data mode | 101,670 | |
| the slice, declarative | 157,405 | 6,435 under |
| the slice, data mode | 174,844 | 11,004 over |
| the slice, wouter | 146,290 | 17,550 under |
| the slice with the 500-string catalogue | 169,635 | 5,795 over |
| (a) messages precompiled (icu-minify in a Vite plugin) | 148,378 | 15,462 under |
| (a) with the 500-string catalogue | 160,667 | 3,173 under |
| (b2) registration through the platform API | 155,652 | 8,188 under |
| (c) per-route message subsets | 157,602 | 6,238 under |
| (d1) Base UI's toast parts file by file (not adopted, §14) | 145,487 | 18,353 under |
| (a) + (b2) + (c) + (d1), declarative | **134,779** | **29,061 under** |
| the same with the 500-string catalogue | 134,780 | 29,060 under |
| (a) + (b2) + (c) + (d1) with wouter | not measured | |

One Lighthouse 12.6.1 run on the plain Vite slice: performance 0.95, LCP 2,255 ms, TBT 152 ms. The earlier
design prototype (committed on the spike branch at `tools/spike/plan-b/`, commit `b8a7c8d`) built M0's
empty Today on Vite with precompiled messages, declarative routing and `@serwist/window`, served
through the local Vercel-like server described below: 89,595 bytes in one script, against Next's
162,699 for the same page; three Lighthouse CI runs gave performance 1.0, LCP 1,505, 1,504 and 1,504 ms
and TBT 0 ms (the reports stayed in that session's scratchpad; their numbers are in
`docs/research/host-plan-b.md` §2). That figure is the empty page, not the slice; the slice's figure
is 134,779.

With every optimisation and React Router, Today on Vite is under the owner's original 150 kB (153,600
bytes) by 18,821 bytes, and the 163,840-byte budget leaves 29,061 for M1's remaining Today states.
**The chosen stack was not measured as one build.** Its measured components: wouter costs 2,512 bytes
over React alone on the floor (73,106 less 70,594) where React Router costs 13,934 (84,528 less
70,594), a difference of 11,422 bytes on the floor and 11,115 on the plain slice (157,405 against
146,290); the combination with React Router is 134,779. The own toast (§14) and the update flow's
listeners (§5) were not measured either. The switch's pull request measures the real Today and records
the figure in `docs/ENGINEERING.md` §4; until then this ADR claims only that the chosen stack carries
the router's measured 11,115 bytes less than the combination's router did.

## Options considered

1. **Stay on Next with every optimisation**: 203,398 bytes at best, 39,558 over, with Lighthouse
   failing performance and LCP on the plain slice. Rejected by the numbers.
2. **Raise the budget**: rejected by ADR-0043 and ADR-0005; nothing argues for more bytes.
3. **Next with `output: 'export'` for the web host too**: removes the proxy, not the client runtime,
   which is the floor (ADR-0005 measured the router runtime alone at 49 kB gzip). Not measured
   separately because the floor ships either way.
4. **Vite + React Router 8.4.0 in data mode**: floor 101,670 bytes, slice 174,844 (11,004 over the
   budget before any optimisation); 17,142 bytes more than declarative mode on the floor and 17,439
   more on the slice, for loaders, actions and pending states the product does not use, since its data
   layer is local (ADR-0019, ADR-0020). Rejected.
5. **Vite + React Router 8.4.0 in declarative mode**: floor 84,528 bytes, slice 157,405, 134,779 with
   the optimisations. It fits, and React Router's own advice for declarative mode suits this product (a
   "data layer that either skips pending states (like local first, background data replication/sync)
   or has its own abstractions for them", https://reactrouter.com/start/modes, accessed 2026-10-17).
   Rejected by the owner on 2026-10-17 for its weight: 13,934 bytes over React alone, which every page
   of the app pays, for an API surface this product does not need.
6. **Vite + wouter 3.13.0**: floor 73,106 bytes, slice 146,290: 11,422 bytes less than declarative
   React Router on the floor and 11,115 less on the slice, about 11 kB on every page. The product's
   routing is small (about eight paths, lazy screens, no data loaders) and wouter covers it: `Switch`,
   `Route` with `nest`, `Link`, `useLocation`, `useSearch`, and a hash location for the wrapper (§9).
   Chosen by the owner on 2026-10-17.

Two smaller choices in the same decision, also the owner's of 2026-10-17:

- **Service worker registration.** `@serwist/window` (as in M0's `SerwistProvider` and the plan-B
  design) costs 1,753 bytes on the Vite slice against a hand-written registration (157,405 against
  155,652, variant b2). `vite-plugin-pwa` (2.0.0, 2026-10-03) builds its worker inside the Vite build,
  before this ADR's prerender, as `@serwist/vite` did in the prototype, and depends on Workbox's window
  client (`workbox-window` ^7.4.1 in its registry entry). Chosen: a hand-written registration with
  ADR-0033's update flow (§5); Serwist stays for the worker itself.
- **The toast.** Base UI's toast is exported as one namespace object, so the anchored-toast Positioner,
  Arrow and floating-ui reach Today although this design never anchors a toast: 11,918 bytes on the
  Vite slice (157,405 against 145,487, variant d1) and 11,896 on Next. The spike's (d1) imported Base
  UI's toast files by relative path into `node_modules`, past the package's exports map, which a
  Base UI update can break silently. Chosen: an own small toast in `packages/ui` (§14), with no Base
  UI toast code on Today.

## Decision

Option 6. `apps/web` and `apps/mobile` become Vite 8 single-page hosts with wouter 3.13.0;
`apps/web` deploys to the same Vercel project with static configuration in
`apps/web/vercel.json`, one Node function for the API, a static UK route, a static strict CSP
(`'strict-dynamic'` anchored by two hashes of fixed-text inline scripts), a Serwist worker built after
the pages and registered by hand, and site pages prerendered in-house with no script. `packages/app`
stays host-agnostic: React, `use-intl` instead of `next-intl`, and wouter behind `lib/navigation`, the
only module that imports it. The toast is `packages/ui`'s own. Precompiled messages (a), the
hand-written registration (b2) and per-route messages (c) ship with it; the own toast replaces (d1).
The budget stays 163,840 bytes for M1. M2's public content pages (the Learn modules, the country pages and
the holding-date page, public and indexable per `docs/ROADMAP.md`) keep this in-house prerender as the
default; whether they need more is decided in M2 with measurements.

### Deviation from ADR-0005

ADR-0005's plan B reads "a Vite + React Router shell". This ADR triggers that plan with wouter instead
of React Router, and with an own toast instead of the "shadcn's Base UI toast" its deviation log
records. Both are bundle decisions with the spike's numbers above (11,115 and 11,918 bytes on the Vite
slice); the plan's substance (a Vite host, `packages/app` unchanged in shape, navigation behind one
adapter) is kept. ADR-0005's status line records the partial supersession.

## Design

### 1. Vercel project configuration

The project keeps its root directory `apps/web`. Vercel documents that `framework` "overrides the
Framework Preset in Project Settings" and that `buildCommand`, `installCommand` and `outputDirectory`
override the dashboard's values (https://vercel.com/docs/project-configuration/vercel-json, accessed
2026-10-17), so the repository changes the preset without the dashboard. `apps/web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist",
  "regions": ["fra1"],
  "cleanUrls": true,
  "trailingSlash": false,
  "routes": [
    {
      "src": "^/(?!(?:terms|privacy|risk|cookies|contact)/?$|api/|assets/|icons/|\\.well-known/|sw\\.js$|serwist/|manifest\\.webmanifest$|favicon\\.|apple-touch-icon\\.png$).*$",
      "has": [{ "type": "header", "key": "x-vercel-ip-country", "value": "GB" }],
      "dest": "/not-available.html",
      "status": 451,
      "headers": { "…": "…" }
    }
  ],
  "headers": [
    { "source": "/(.*)", "headers": ["…"] },
    { "source": "/((?!api/|assets/|icons/|\\.well-known/|sw\\.js$|serwist/|manifest\\.webmanifest$|favicon\\.|apple-touch-icon\\.png$).*)",
      "headers": ["…"] },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/sw.js", "headers": [{ "key": "Service-Worker-Allowed", "value": "/" }] }
  ],
  "rewrites": [
    { "source": "/api/(prices|csp-report)", "destination": "/api" },
    { "source": "/(today|portfolio|log|plan|settings|learn|onboarding)", "destination": "/app" },
    { "source": "/(today|portfolio|log|plan|settings|learn|onboarding)/(.*)", "destination": "/app" }
  ]
}
```

Abridged where it shows an ellipsis: the UK route carries the eight security headers, the CSP,
`Reporting-Endpoints` and `Cache-Control: no-store`; the first header rule the eight headers of
`lib/security/headers.ts`; the second the CSP and `Reporting-Endpoints`. The file spells them out.

The SPA's document is `dist/app.html`, not `index.html`, because `/` is the holding page, a site page
with no script. Only the product's routes are rewritten to it, so an unknown path stays a 404 instead
of the shell; the build writes a prerendered `dist/404.html`, and whether Vercel answers unmatched
paths with it is on the preview checklist (Risks). Vercel gives "precedence … to the filesystem prior to rewrites being
applied" (same page), so `/assets/*`, the icons and `/.well-known/security.txt` are served as files.
`regions` applies to functions; "Selecting a Vercel Function region does not impact static files"
(same page). `routes` may be used "alongside `rewrites`, `redirects`, `headers`, `cleanUrls`, and
`trailingSlash`" (same page, section routes).

`vercel.json` is static JSON that Vercel reads before the build, so it is committed, and
`apps/web/lib/vercel-config.test.ts` fails the gate when it drifts: the header list equals
`securityHeaders`, the CSP equals `buildCsp({ https: true })` with the hashes recomputed from the
theme script, the boot script and the not-available style, the UK route exempts exactly `LEGAL_PAGES` and
`SECURITY_TXT_PATH` (checked against `isExemptPath` on a table of paths, trailing slashes included),
and the rewritten routes equal `APP_ROUTES` from `packages/app/lib/navigation`, which the service
worker's navigation allowlist uses too. `node apps/web/scripts/vercel-config.ts --write` regenerates
the file from those sources.

The build command is `apps/web`'s `build` script, `node scripts/build.ts`, in order: the client build
(`vite build`, input `app.html`); the prerender (a second `vite build --ssr src/site/render.tsx`, then
one HTML file per page); the manifest; the worker; the API bundle. Each step is described below. The
API bundle is also `apps/web`'s `vercel-build` script (§2).

### 2. The API as one Vercel Function, reusing the pure handlers

"You can create a function in other frameworks or with no frameworks by defining your function in a
file under `/api`", with a Web handler or the `fetch` Web Standard export
`export default { fetch(request) { … } }` (https://vercel.com/docs/functions/functions-api-reference,
accessed 2026-10-17). TypeScript in `api/` is compiled by Vercel, but Path Mappings and Project
References are not supported (https://vercel.com/docs/functions/runtimes/node-js, accessed
2026-10-17), and nothing documents the compilation of TypeScript inside workspace packages, which
export source (`@proofofcalm/core`, `@proofofcalm/app/lib/brand`). So the function does not rely on it:
it imports a file the build produced, which is what Vercel's documented custom build step is for: "a
`vercel-build` script within your `package.json` file, in the same directory as your Vercel Function
or any parent directory", whose output the function then imports
(https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration, accessed 2026-10-17).

- **Runtime: Node.js; Edge is not used.** Node.js is the default runtime for a file in `api/`
  (functions API reference, same link) and the function sets no other. Node is what the handlers'
  tests, the local server and the bundle target (`node24`) run on; the region pin to `fra1` beside the
  Upstash store in eu-central-1 (ADR-0006, ADR-0036) and the per-instance state that Fluid compute
  shares across concurrent invocations (below) are both Node function behaviour.
- `apps/web/server/api.ts`: one `fetch` handler over the existing modules in `apps/web/lib`
  (`createPricesHandler`, `preflight`, `handleCspReport`, `storeFromEnv`) that dispatches on the
  pathname: `/api/prices` takes `GET` and `OPTIONS`, `/api/csp-report` takes `POST`, another method gets
  `405` with `Allow` and `Cache-Control: no-store`, another path `404` with `no-store`, as the Next route
  handlers answer today. One function, as Vercel advises: "Avoid creating a separate function for each
  API endpoint. Keep related routes in a shared function so Fluid compute can reuse instances across
  routes" (https://vercel.com/docs/functions/configuring-functions/advanced-configuration, accessed
  2026-10-17). The local server, the dev plugin and the unit tests call the same handler.
- esbuild bundles it (platform `node`, format `esm`, target `node24`, everything inlined, condition
  `react-server` so `server-only` resolves to its empty module) into `apps/web/server-dist/api.mjs`.
  The design prototype bundled the real handlers this way and ran them behind the local server (GET,
  OPTIONS from `capacitor://localhost`, 400, 404, 405).
- **Where the bundle is built.** `apps/web/package.json` gets `"vercel-build": "node
  scripts/bundle-api.ts"`, the documented step, so the bundle exists before the function is built
  whichever order Vercel runs the framework build and the function build in. `scripts/build.ts` runs
  the same step last, so local builds, CI and the e2e suite have it too. On Vercel it may therefore run
  twice; it is deterministic (same inputs, same bytes) and takes about a second, so that is accepted
  rather than guarded. Nothing documents that order for a project with a framework preset, so it stays
  unverified until the switch's preview (Risks).
- `apps/web/api/index.mjs` is a committed one-line re-export:
  `export { default } from '../server-dist/api.mjs';`. It answers at `/api`; the rewrite in §1 sends
  `/api/prices` and `/api/csp-report` to it, and every other `/api/*` path stays a platform 404. The
  handler dispatches on the pathname the runtime observes. Vercel documents a `request.path` transform
  that sets "the URL path your Function reads from `req.url`" (vercel.json page, section transforms)
  but does not say in words which path a plain rewrite leaves there, so the preview checklist confirms
  that the function sees `/api/prices`; if it sees `/api`, the rewrite becomes a `routes` entry with a
  `request.path` transform of `/api/$1`, the same page's documented mechanism.
- **Fallback: Build Output API v3.** If the preview shows the function failing to bundle, trace or
  run, the build writes `.vercel/output` itself with `functions/api.func` and its `.vc-config.json`
  (region `fra1`), as the plan-B design specified from Vercel's builder source
  (`docs/research/host-plan-b.md` §4). This ADR prefers zero-config because the routing, headers and UK
  rule then stay in one committed `vercel.json` that the gate tests against the code, and the design's
  objection to zero-config `api/` (Vercel transpiles file by file and does not bundle) does not apply to
  a file that only re-exports a finished bundle.
- Environment variables are read per call, as now (`apiKey: () => process.env.COINGECKO_API_KEY`).
  Module state (the in-instance copy, the in-flight call) behaves as in the Next route handler:
  per instance, shared by the concurrent invocations Fluid compute sends to it (enabled by default for
  new projects since 23 April 2025, same vercel.json page, section fluid).
- CORS and the preflight are the existing `lib/http/cors.ts`, unchanged.

**ADR-0036's three caches without Next's Data Cache.** The CDN keeps `s-maxage=600,
stale-while-revalidate=1800`; Vercel caches function responses with these directives "in the region
the function was requested from", and its cache is "segmented by region"
(https://vercel.com/docs/caching/cdn-cache, accessed 2026-10-17). The per-instance copy with the
shared in-flight call stays. Next's Data Cache, which made one upstream call per ten minutes across
instances, is replaced by Vercel's Runtime Cache: "a regional, ephemeral cache you can use for storing
and retrieving data across Vercel Functions", "available on all plans" and "framework-agnostic", read
and written through `getCache()` from `@vercel/functions` with a `ttl` in seconds
(https://vercel.com/docs/caching/runtime-cache, accessed 2026-10-17). The function runs only in
`fra1`, so one regional cache serves every instance. The prices handler gains a `shared` dependency
(`get(key)`, `set(key, value, ttlSeconds)`), implemented over `getCache()` in
`apps/web/lib/server/shared-cache.ts` (`server-only`) and by memory in unit tests and the local server.
An instance whose own copy is older than `PRICE_TTL.serverSeconds` reads `prices:fresh` and uses it
when it is younger than that; otherwise it calls CoinGecko and writes `prices:fresh` with a `ttl` of
`PRICE_TTL.serverSeconds`, and the optional Upstash store's last good copy (`prices:last`) as now.
So the bound of ADR-0006 (one upstream call per ten minutes for the whole matrix, about 4,300 a month)
holds across instances from the switch, with no owner action, apart from two cold instances that
refresh in the same moment, which the CDN in front makes rare. The Runtime Cache is ephemeral (entries
"may be evicted sooner if the cache reaches its storage limit"), separate per environment, and on Hobby
"all projects in your team share a single cache"; an evicted entry costs one upstream call, never a
wrong answer, since every read passes the core's schema as now. Its usage is charged (same page); this
function makes at most one write per ten minutes and one read per CDN miss. `lib/prices/coingecko.ts`
drops the `next: { revalidate }` field, which plain `fetch` ignores.

### 3. Security headers and a static strict CSP without a nonce

The headers of `docs/SECURITY.md` §4 become static (§1). The policy stays strict, as SECURITY §2, §4
and §5 and ADR-0032's compensating control require; only its anchor changes from a per-request nonce
to two hashes. Built by `buildCsp` without a nonce:

```
default-src 'self'; script-src 'self' 'sha256-<theme script>' 'sha256-<boot script>' 'strict-dynamic';
style-src 'self' 'sha256-<not-available style>'; img-src 'self' data: blob:; font-src 'self';
connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self';
form-action 'self'; object-src 'none'; upgrade-insecure-requests; report-uri /api/csp-report;
report-to csp-endpoint
```

with `Reporting-Endpoints: csp-endpoint="/api/csp-report"` on the same responses. A hash-based strict
policy is web.dev's advice for static pages ("Use a hash-based CSP for HTML pages served statically,
or pages that need to be cached", https://web.dev/articles/strict-csp, accessed 2026-10-17). Under
`'strict-dynamic'`, CSP3 browsers ignore `'self'` and run only the two hashed inline scripts and what
they load; `'self'` stays for older engines, as in M0's policy.

**The boot script.** Vite writes `<script type="module" src="/assets/index-<hash>.js">` into the
built document. A `transformIndexHtml` plugin (`order: 'post'`, client build only) replaces it with an
inline classic script whose text never changes, kept in `packages/config/vite/boot.ts` as `BOOT_SCRIPT`:

```js
(function(){var c=document.currentScript,s=document.createElement('script');s.type='module';s.src=c.dataset.entry;document.head.append(s)})()
```

and carries the hashed entry URL in its `data-entry` attribute. A hash covers a script's text, not its
attributes, so the boot hash is the same on every build and the committed `vercel.json` can hold it. The
script creates the module script element instead of calling `import()`, because the design prototype
saw a boot that called `import()` from an inline hashed module blocked in Chromium. Verified locally on
2026-10-17 in Chromium and WebKit (`docs/research/host-plan-b.md` §3): with this text, two different
entry names and the same policy, the entry, a script-inserted `modulepreload` and a lazy `import()`
all loaded, and only a deliberately unhashed inline script was refused. Vite put no other inline
script into the prototype's built document (its module-preload polyfill sits in the entry chunk); the
`vercel.json` test and `csp.spec.ts` fail if one appears. The inline script costs no script request,
so it adds nothing to the script budget.

Vite inlines small assets as `data:` URIs by default and says to set `build.assetsInlineLimit` to 0
where `data:` is not allowed (https://vite.dev/guide/features, section Content Security Policy,
accessed 2026-10-17); `font-src 'self'` has no `data:`, so the limit is 0.

**Theme before paint.** The first element of `app.html`'s head is an inline script with fixed text,
kept in `packages/app/lib/theme/before-paint.ts` as `THEME_BEFORE_PAINT` beside
`APPEARANCE_STORAGE_KEY = 'poc.appearance'`. Preferences live in IndexedDB, which a synchronous script
cannot read, so the appearance is mirrored to that one `localStorage` key as JSON
`{"theme":"light"|"dark"|"system","motion":"system"|"reduce"}`, a non-secret UI preference that
SECURITY allows in `localStorage`. The writer is the Settings action that changes the theme or the
motion setting: it writes the store first, then the mirror. The app shell also rewrites the mirror from
the store after hydration, so the store wins and a cleared or blocked `localStorage` heals on the next
visit. The script reads the key in a `try`, sets `data-theme` only for `light` or `dark` and
`data-motion="reduce"` only for `reduce`, and otherwise leaves the system preference in charge. Its
SHA-256 is in `script-src`. A hash costs no request and no render-blocking round trip, where an
external `/theme.js` would add both and about 900 bytes of script transfer to Today. The prototype ran
this kind of script under the hashed policy with a stored `light` theme against a dark system
preference in both engines. The site pages carry no script, so they follow the system theme only.

**The allowlist as the fallback.** If a future Vite or browser change breaks the boot script, the
policy falls back to `script-src 'self' 'sha256-<theme script>'`, which the prototype also ran with
zero violations. That is weaker (web.dev: allowlists "can be bypassed by attackers") and
would remove ADR-0032's compensating control for M3's script-readable tokens, so taking it needs a new
ADR that supersedes that part of ADR-0032 and changes SECURITY §2 and §5.

The 451 page keeps its one inline style, now hashed instead of nonced. `buildCsp` keeps
`development` (Vite's dev server needs `'unsafe-inline'` styles and `'unsafe-eval'`) and `https`
(`upgrade-insecure-requests` only over https).

### 4. The UK block as a static route

Vercel's guidance: "If your routing logic doesn't need custom code, use static configuration instead
of Routing Middleware. Static rules run directly on the CDN without invoking your code on every
request", and routing "based on a header" is listed as static `has` conditions
(https://vercel.com/docs/routing-middleware, accessed 2026-10-17). The block is exactly that: one header,
one country, a fixed list of exempt paths. So the route in §1 answers every document request carrying
`x-vercel-ip-country: GB`, except the five legal pages, `security.txt`, the API and static assets (the
exemptions of today's proxy matcher), with `dist/not-available.html` and status 451. The page is built
at build time by `notAvailableHtml()` from `lib/geo/uk-block.ts`, which loses its nonce parameter; the
style, the copy from `siteTranslator` and the legal links are unchanged. `isBlockedCountry`,
`isExemptPath`, `LEGAL_PAGES` and `SECURITY_TXT_PATH` stay the single source, enforced by the
`vercel.json` test. Vercel documents `x-vercel-ip-country` as "a two-character ISO 3166-1 country code"
(https://vercel.com/docs/headers/request-headers, accessed 2026-10-17) and uses the same `has`
condition on it in its own rewrite example (vercel.json page).

No package is needed. If the preview shows the static route cannot answer 451 with the file, the
fallback is Routing Middleware: `apps/web/middleware.ts` "at the root of your project", a default
export taking a `Request`, a `config.matcher` with "full regex support", the Node.js runtime by
default; returning a `Response` answers, and the documented conditional example returns nothing to
let the request continue (https://vercel.com/docs/routing-middleware/api, accessed 2026-10-17). It
would import `lib/geo/uk-block.ts` unchanged and return the same page; `@vercel/functions` 3.10.1
(published 2026-10-13) is needed only for its `next()` and `geolocation()` helpers, which this does not
use. The cost of the fallback is a function invocation on every document request (Routing Middleware
"is priced using the fluid compute model", same page).

### 5. The service worker and ADR-0033's update flow

`apps/web/src/sw.ts` keeps today's worker (Serwist 9.5.13: precache with `cleanupOutdatedCaches`,
`skipWaiting: false`, `clientsClaim`, `navigationPreload`, prices stale-while-revalidate for 24 hours
in eight entries, the default runtime caches, the offline fallback for documents), replaces
`@serwist/turbopack/worker`'s `defaultCache` with explicit routes (network-first for same-origin
documents, cache-first for `/assets/`), and adds `navigateFallback: '/app'` with
`navigateFallbackAllowlist: [APP_ROUTES]`, so every product route answers from the precached shell
online and offline.

The worker is built last, after the prerender, so the precache can list finished files: esbuild
bundles `src/sw.ts` to `dist/sw.js` (IIFE, minified), then `injectManifest` from `@serwist/build`
9.5.13 writes the manifest into it with `globPatterns` `app.html`, `~offline.html`, `assets/**/*.{js,css,woff2}`,
`icons/*.png`, `manifest.webmanifest`; a `manifestTransforms` entry lists `app.html` as `/app` and
`~offline.html` as `/~offline`; `dontCacheBustURLsMatching: /^assets\//`. Revisions come from the files'
content, which replaces today's `VERCEL_GIT_COMMIT_SHA` revision. The design prototype ran this step
("precache: 7 entries, 325223 bytes; warnings: none"); after one online visit and a reload the worker
controlled the page, and offline `/settings` and `/today` answered from the shell and an unknown
document with the offline page. `@serwist/vite` 9.5.13 also built under Vite 8 in the prototype, but
it runs inside the client build, before the prerendered pages exist.

**Registration is hand-written** with the platform API in `packages/app/lib/pwa/register.ts`, the
owner's choice of 2026-10-17: variant b2 measured 1,753 bytes less than `@serwist/window` on the Vite
slice (157,405 against 155,652). That variant registered only; the update listeners below add a few
lines that were not measured. It runs in production and never in the wrapper (ADR-0033), and keeps
ADR-0033's update flow step for step, with the platform's events in place of Workbox's names:

1. After the load event, `navigator.serviceWorker.register('/sw.js', { scope: '/' })`.
2. **Waiting.** A new worker counts as waiting when `registration.waiting` is set at registration, or
   when a worker reaches the state `installed` while `navigator.serviceWorker.controller` is set (an
   update, not the first install). That worker is watched through `statechange` in two places:
   `registration.installing` when the registration resolves (the browser's own update check after the
   navigation can be installing already, and its `updatefound` has then fired before the listener
   exists, which registering after the load event makes more likely), and any later worker from
   `updatefound`.
3. **The toast.** Then the app shows the "A new version is ready. Reload" toast (§14), with its one
   action. Dismissing it leaves the new worker waiting; the next visit asks again.
4. **SKIP_WAITING.** On accept, the app first adds a one-time `controllerchange` listener, then posts
   `{ type: 'SKIP_WAITING' }` to `registration.waiting`. Serwist's worker class answers that message
   itself when `skipWaiting` is false (https://serwist.pages.dev/docs/window, accessed 2026-10-17).
   When `registration.waiting` is null at accept, another tab has already accepted and the new worker
   controls this page too (`controllerchange` fires in every controlled tab), so the app reloads
   directly. A `controllerchange` that this tab did not request, while the toast is showing, dismisses
   the toast for the same reason and leaves the reload to the next navigation.
5. **Reload on controlling.** The listener reloads once when the new worker takes control
   (`controllerchange` is the platform event that Workbox's window client reports as `controlling`).
   Because the listener exists only after an accept, the `controllerchange` that `clientsClaim` causes
   on a first install never reloads the page.

A unit test drives the module with a fake `ServiceWorkerContainer` through the five steps, the first
install, a dismissed toast, an update already installing when the registration resolves, and two tabs
where the other one accepted first; `pwa.spec.ts` covers the real worker. Neither `@serwist/window` nor
`vite-plugin-pwa` is used: the first for its 1,753 bytes, the second because it builds the worker
inside the Vite build, before the prerendered pages exist, and brings Workbox's window client
(`workbox-window` is a dependency of `vite-plugin-pwa` 2.0.0, 2026-10-03, in the npm registry).

Moving the worker from `/serwist/sw.js` to `/sw.js` would strand an installed M0 worker: its update
check would find a 404 and keep serving Next's cached `/today`. So `public/serwist/sw.js` becomes a
kill-switch worker: on `install` it calls `skipWaiting()`, because the M0 worker it replaces has
`skipWaiting: false` and would otherwise keep it waiting until every tab closes; on `activate` it
deletes every cache, calls `self.registration.unregister()` and navigates each window client to its
own URL, which then loads the new app and registers `/sw.js`. The kill switch stays until launch, not
M1's close, so an install that is not opened during M1 still finds it; `docs/RELEASE.md` lists its
removal. `serwist/` stays exempt from the CSP and UK rules as a non-document path.

### 6. Site pages prerendered with no script

The holding page, the five legal pages, the offline page, the 404 page and the not-available page are
rendered at build time from React components with the existing site messages. Vite's SSR guide
describes pre-rendering "using the same logic as production SSR" with a `--ssr` build of an entry
(https://vite.dev/guide/ssr, accessed 2026-10-17). `apps/web/src/site/render.tsx` exports one render
function per page (`renderToStaticMarkup` from `react-dom/server`, translations from `createTranslator`
of `use-intl/core`); `scripts/build.ts` builds it with `vite build --ssr`, imports the result and writes
`dist/index.html`, `dist/{terms,privacy,risk,cookies,contact}.html`, `dist/~offline.html`,
`dist/404.html` and `dist/not-available.html`. Each page's head is the same function's output: charset,
viewport, `robots` noindex, the title, the icons, the two theme colours, the manifest link, and the
stylesheet and font preload copied from the built `app.html`, so the pages share the hashed CSS and
font files. There is no `<script>` element. The components of `app/(site)` move to `src/site/` with
`<a>` instead of `next/link`. The prototype rendered the terms page this way and served it with zero
scripts and zero violations in both engines.

### 7. Fonts and the size-adjusted fallback

The files stay in `packages/ui/src/fonts`, loaded by `packages/ui/src/styles/fonts.css` (which Storybook
already uses). `next/font` generated the Arial fallback; main's build carries it as
`@font-face{font-family:sans Fallback;src:local(Arial);ascent-override:101.35%;descent-override:27.19%;line-gap-override:0.0%;size-adjust:101.13%}`.
`fonts.css` gains the same face as "Calm Sans Fallback" with those four values (re-read from a fresh
build of main in the migration PR), and `--typeface-text` in `tokens.css` lists it right after "Calm
Sans". The Mono keeps no adjusted fallback and no preload (ADR-0043). A small Vite plugin adds
`<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/calm-sans-latin-<hash>.woff2">`
to `app.html`, the hashed name read from the bundle; the prototype's plugin did this and the site pages
copied it. `font-display: swap` stays.

### 8. i18n with use-intl and per-route messages

`use-intl` is next-intl's core: "`use-intl` contains all APIs that are necessary for handling i18n in
regular React apps", with `IntlProvider` and `useTranslations`, and `createTranslator` from
`use-intl/core` "creates the same function that is returned by `useTranslations`"
(https://next-intl.dev/docs/environments/core-library, accessed 2026-10-17). next-intl 4.14.9 depends on
`use-intl` ^4.14.9; the catalog pins `use-intl` 4.14.9. `packages/app/lib/i18n` renders `IntlProvider`
(locale `en`, `timeZone: 'UTC'`, as now), the `AppConfig` augmentation moves to `declare module 'use-intl'`,
and features import `useTranslations` from `use-intl`.

**Precompiled messages.** next-intl's precompilation "will immediately drop ~9KB of compressed
JavaScript" and does not support `t.raw` (https://next-intl.dev/blog/precompilation, 28 January 2026,
accessed 2026-10-17); it is documented only as a Next plugin option. The spike reproduced it in Vite
with `use-intl`'s own exports: a plugin that compiles every imported message file with
`icu-minify/compile` and an alias of `use-intl/format-message` to `use-intl/format-message/format-only`
(both are published exports of `use-intl` 4.14.9 and `icu-minify` 4.14.9, checked in the registry). It
saved 9,027 bytes on the slice (157,405 to 148,378). The plugin lives in `packages/config/vite` and
runs in both hosts and Storybook. A test renders every key of the catalogue through the precompiled
path and the parsing `createTranslator` and requires equal output; a lint rule forbids `t.raw`.

**Per-route messages.** `pnpm --filter @proofofcalm/tools messages` keeps writing the merged
`messages/en.json` (the types) and also writes one file per namespace. Today's entry imports the
`shell`, `errors` and `today` namespaces statically; every lazy route loads its namespaces with its
module before it renders, through a helper in `lib/i18n` that adds them to the provider's messages.
With the 500-string catalogue, Today costs 12,289 bytes more without per-route subsets (160,667
against 148,378, both precompiled) and 1 byte more with them (134,780 against 134,779).

### 9. wouter: routes, lazy screens, the navigation adapter

`wouter` 3.13.0, published 2026-09-30, the newest on or before 2026-10-14 (npm registry, read
2026-10-17; 3.12.0 came out on 2026-09-29, 3.11.1 on 2026-09-14). Licence Unlicense; its two
dependencies are `regexparam` ^3.0.0 (3.0.0, 2023-12-03) and `use-sync-external-store` ^1.0.0 (1.7.0,
2026-09-09, the newest on or before the cutoff); its peer is `react` >=16.8.0. Its published entry
points include `wouter`, `wouter/use-hash-location`, `wouter/memory-location` and
`wouter/use-browser-location`. The spike's wouter slice used `Switch`, `Route`, `Redirect`, `Link` and
the same lazy screens as the React Router slice.

The APIs this design uses, as wouter's README describes them (https://github.com/molefrog/wouter,
accessed 2026-10-17):

- **`Router`** is optional ("No top-level `<Router />` component, it is fully optional") and is used for
  configuration: `hook` (the location hook), `searchHook`, `base`, `parser` (the pattern parser),
  `ssrPath` and `ssrSearch`, `hrefs`, `aroundNav`.
- **`Switch`** "only renders the first matching route"; **`Route`** renders "conditionally based on a
  pattern `path`"; "Nesting is a core feature of wouter and can be enabled on a route via the `nest`
  prop", and inside a nested route `useLocation()` returns the path relative to it.
- **`Link`** "renders an `<a />` element that, when clicked, performs a navigation"; `to` is an alias of
  `href`, and the location hook's options (`replace`, `state`) are props.
- **`useLocation()`** returns the location and a setter that takes a `replace` flag and `state`;
  **`useSearch()`** returns the query string and re-renders "only when the string itself … updates";
  `useSearchParams` and `useParams` exist as well.
- **`useHashLocation`** from `wouter/use-hash-location` "gets location from the hash part of the
  address" and is passed as `<Router hook={useHashLocation}>`; **`memoryLocation`** from
  `wouter/memory-location` is "an in-memory location hook with history support … for testing".

**Lazy screens.** Today is imported statically; Portfolio, Log, Plan, Settings, Learn and onboarding are
`React.lazy` components rendered by their `Route`, under one `Suspense` around the screen area, inside
the shell, so the header and the tab bar stay mounted (the README does not describe code splitting;
`React.lazy` and `Suspense` are React's). wouter's default location hook "uses
`useSyncExternalStore`, whose updates cannot be marked as React transitions" (README, View Transitions
recipe), unlike React Router's transitions: the first visit to a screen whose chunk is not loaded
shows the `Suspense` fallback, an empty screen area with no text, until the chunk arrives. Installed
clients have every chunk of their version precached, so that is one local read. Links do not prefetch
(`docs/ENGINEERING.md` §4). wouter has no scroll restoration, so the shell scrolls to the top when the
pathname changes. A failed chunk load after a deploy reloads the page once on Vite's
`vite:preloadError` event ("Vite emits `vite:preloadError` event when it fails to load dynamic
imports", https://vite.dev/guide/build, accessed 2026-10-17).

**The navigation adapter.** The route table is product code: `packages/app/features/shell` (its route
table built with the switch, its header and tab bar with the app shell, issue #33) holds the `Switch` of
routes, the header and the tab bar, importing the screens through their
`index.ts`; a last `Route` without a path redirects to `/today`, which only the wrapper reaches (on the
web, unknown paths are not rewritten to the shell, §1). `packages/app/lib/navigation` is the only
module that imports `wouter`, a dependency-cruiser rule ("`wouter` only in `lib/navigation`"; the hosts,
the shell and the features import the adapter). It exports:

- `Link` (`href`, `replace`, and the anchor's props) over wouter's `Link`, as the spike's `next/link`
  shim did;
- `useRouter()`: `push(href)` and `replace(href)` over `useLocation`'s setter, `back()` over
  `history.back()`;
- `usePathname()` over `useLocation` and `useSearch()` over wouter's `useSearch`;
- `Route`, `Switch` and `Redirect` re-exported for the route table, with `nest` where a screen has
  sub-routes;
- `APP_ROUTES`, which `vercel.json`'s rewrites and the worker's navigation allowlist use too;
- `NavigationProvider({ location: 'browser' | 'hash' | 'memory' })`: no `Router` hook for the browser
  location in `apps/web`, `<Router hook={useHashLocation}>` in `apps/mobile` (§10), and
  `memoryLocation` in stories and component tests.

Swapping the router later means rewriting this one module; nothing else names it.

### 10. apps/mobile: the same SPA as a static directory

`apps/mobile` builds the same entry with Vite through the shared factory in `packages/config/vite`
(`createHostConfig({ host: 'mobile' })`): input `index.html` (the shell at the root, no site pages),
`VITE_API_BASE=https://proofofcalm.com` so the api-client calls the absolute origin that the CORS
allow-list already admits, `VITE_SERVICE_WORKER=off` so the registration is removed at build time, no
`vercel.json`, output `apps/mobile/dist`, which Capacitor copies in M3. Its `NavigationProvider` uses
wouter's hash location (`location: 'hash'`, §9), so every screen lives after the `#` of the one
document and the wrapper's file server never has to resolve a deep path; an empty hash reaches the
route table's last `Route` and redirects to `/today`. The required check
`export-build` keeps its name and asserts: `dist/index.html` exists and loads one `/assets/` entry; no
`sw.js` and no `serviceWorker.register` in the output; the absolute API origin is in the bundle and no
relative `/api/` call is; and a Playwright smoke test serves `dist` as plain static files, with no SPA
fallback, and finds Today's heading at `/#/today` and after opening `/`, which catches a runtime
failure that a file check does not.

### 11. Tests and CI against a local production-like server

`tools/serve/vercel-local.ts` (ported from the prototype's `vercel-local.mjs`) serves `apps/web/dist`
from the same `apps/web/vercel.json`: `routes` first (case-insensitive `src`, `has` header conditions,
`status`, `dest`, `headers`), then the `headers` rules collected for whatever answers, `cleanUrls` (308
from `.html`, extensionless lookup), `trailingSlash: false`, the filesystem before `rewrites`, and
the `/api` rewrite dispatched to `server-dist/api.mjs`'s `fetch` export with `apps/web/.env.local` loaded.
Every compressible response is brotli quality 3 (the `compress` and `VERCEL_BROTLI_QUALITY` of today's
`brotli-proxy.ts` move here). Over plain http it drops `upgrade-insecure-requests`, as `buildCsp` does
today, because WebKit upgraded every subresource otherwise (seen in the prototype). Unit tests cover
the pattern translation and the precedence.

- `playwright.config.ts`: `webServer.command` becomes `node ../../tools/serve/vercel-local.ts --port 3000`
  after the build; an optional `BASE_URL` with the bypass header lets the request-level specs run
  against a preview by hand. `csp.spec.ts` asserts the static policy instead of a nonce: `strict-dynamic`, the two
  hashes equal to the SHA-256 of the theme and boot scripts on the page, no `unsafe-*`, those two as the
  only inline scripts on `/today`, no script on site pages, zero violations. `pwa.spec.ts` reads `/sw.js` and expects `/app` and `/~offline`
  in the precache and `/today` answering offline. The other specs keep their assertions.
- `lighthouserc.json`: `startServerCommand` is the same server, ready pattern `Ready on`; URLs and
  assertions unchanged.
- `ci.yml`: the secret scan reads `apps/web/dist`; `NEXT_TELEMETRY_DISABLED` goes; `export-build`
  runs §10's assertions. `lighthouse-vercel.yml` is unchanged (it measures the deployment's
  `/today` and `/`). `snapshots.yml` is unchanged (it builds the web host and runs Playwright).
- `turbo.json`: build outputs `dist/**` and `server-dist/**` instead of `.next/**` and `out/**`; the
  build env `VITE_*` instead of `NEXT_PUBLIC_*`.
- **Server code never reaches the client build.** Next made a client import of `server-only` a build
  error; under Vite the package's default entry is bundled and throws only at run time, so three
  guards replace that. (1) `clientNeverImportsServer()` in `packages/config/vite`, applied to the
  client environment of both hosts and Storybook, fails the build in `resolveId` when `server-only`,
  `@upstash/redis`, `@vercel/functions`, anything under `apps/web/lib/server/`, or `apps/web/server/`
  is resolved, naming the importer chain. (2) A dependency-cruiser rule forbids every module under
  `apps/web/src` and `apps/mobile/src` from reaching (`reachable: true`) `server-only` or those paths,
  beside the existing `packages/app` rule. (3) A test in `packages/config/vite` builds a fixture whose
  entry imports a `server-only` module and expects the build to fail with the plugin's message, and the
  same fixture without that import to pass. The server bundle in §2 is the only build that resolves
  `server-only`, through the `react-server` condition.
- The required check names stay: verify, stories, export-build, e2e-visual, lighthouse,
  lighthouse-vercel.
- `pnpm dev` runs Vite's dev server on port 3000 with a plugin that answers `/api/*` from
  `server/api.ts` through Vite's SSR module loader; `pnpm --filter @proofofcalm/web preview` builds and
  serves through `vercel-local.ts`.

### 12. Storybook and the rest of Next in the tooling

Storybook 10.6 runs on `@storybook/react-vite` 10.6.2 (published 2026-10-12), which needs "React ≥
16.8" and "Vite ≥ 5" (https://storybook.js.org/docs/get-started/frameworks/react-vite, accessed
2026-10-17); the Vitest addon needs "A Storybook framework that uses Vite" and lists `react-vite`
(https://storybook.js.org/docs/writing-tests/integrations/vitest-addon, accessed 2026-10-17).
`.storybook/main.ts` changes the framework and adds the precompile plugin beside Tailwind's;
`preview.tsx` wraps stories in `NavigationProvider` with wouter's memory location. Also leaving with Next:
`@next/eslint-plugin-next` in `eslint.config.mjs` (`eslint-plugin-react-hooks` stays), `next typegen`
in the hosts' `typecheck`, knip's Next plugin (its Vite plugin and explicit entries for `app.html`,
`src/site/render.tsx`, `server/api.ts`, `api/index.mjs`, `src/sw.ts` and the scripts take over), the dependency-cruiser
rule `app-no-server-only-next` (replaced by "no `next` anywhere" and "`wouter` only in
`lib/navigation`"), `postcss.config.mjs` in both hosts (Tailwind runs through
`@tailwindcss/vite`), and the `next` peer of `packages/app`.

### 13. What becomes obsolete, and what replaces it

| Obsolete | Replacement |
|---|---|
| `apps/web/proxy.ts`, `proxy.test.ts` | static headers and the UK route in `vercel.json`; `lib/vercel-config.test.ts` |
| the per-request nonce (`createNonce`, `x-nonce`) | hashes of the fixed-text theme and boot scripts (with `'strict-dynamic'`) and of the 451 style |
| `next.config.ts` (both hosts), `next-env.d.ts`, `postcss.config.mjs` | `vite.config.ts` from `packages/config/vite` |
| `app/layout.tsx`, `app/fonts.ts`, `next/font` | `app.html` and the site head function; `fonts.css` with the fallback face; the preload plugin |
| `app/(app)/*`, `app/(site)/*` route files | the route table in `features/shell`; `src/site/*` prerendered |
| `app/api/*/route.ts` | `server/api.ts`, bundled to `server-dist/api.mjs`, re-exported by `api/index.mjs` |
| Next's `server-only` build error for client imports | `clientNeverImportsServer()`, the dependency-cruiser rule and its fixture test (§11) |
| `app/manifest.ts` | the same function, written to `dist/manifest.webmanifest` by the build; `manifest.test.ts` stays |
| `app/serwist/[path]/route.ts`, `@serwist/turbopack`, `SerwistProvider` and `@serwist/window` | `src/sw.ts` built by esbuild and `@serwist/build`; the hand-written registration in `lib/pwa/register.ts` (§5) |
| `next/link`, `next/navigation` in `lib/navigation` | wouter 3.13.0 behind the same adapter (§9) |
| Base UI's toast (`@base-ui/react/toast`) in `packages/ui` | `packages/ui`'s own toast (§14) |
| `app/sw.ts` | `src/sw.ts` with the navigation fallback |
| `next start`, `tools/serve/brotli-proxy.ts` | `tools/serve/vercel-local.ts` |
| the e2e nonce assertions | the static-policy assertions |
| `next-intl`, `NextIntlClientProvider` | `use-intl`, `IntlProvider`; precompiled messages |
| `@storybook/nextjs-vite` | `@storybook/react-vite` |
| `@next/eslint-plugin-next`, knip's Next plugin, `next typegen` | removed; knip's Vite plugin |
| Next's Data Cache for the upstream call | Vercel's Runtime Cache behind the handler's `shared` dependency |
| `NEXT_PUBLIC_*` | `VITE_*` |
| `@sentry/nextjs` and its `tunnelRoute` (M3, not yet installed) | chosen at M3 for a Vite SPA, with the tunnel as a function |

Documents that change in the migration pull requests, each with the code it describes:
`docs/ARCHITECTURE.md` (the tree, the hosts' rows, `lib/navigation`, the API and hosts section, the
plan-B line), `docs/SECURITY.md` §2 (the XSS row: hash-anchored instead of nonce-anchored, still
`'strict-dynamic'`; the secrets row: `VITE_*` and the new scan path), §3 (the price cache in Vercel's
Runtime Cache), §4 (the static policy with hashes and where it is set) and §8 (`VITE_*`, the scan
path); §5's compensating control is unchanged because the policy stays strict;
`docs/ENGINEERING.md` §4 (the floor on the new host and Today's measured figure), `docs/DESIGN.md` §3
(the theme script, its hash and the `localStorage` mirror), §5 (no `next/font`) and §8 (the toast is
`packages/ui`'s own, not Base UI's), `CLAUDE.md` (the stack line, the commands, the structure lines, the `packages/app` import
rule), `docs/OWNER-SETUP.md` §3 (the preset line), `docs/BUILD-PROMPT.md` (its Next references),
`apps/web/README.md`, `apps/mobile/README.md`, `packages/ui/src/fonts/README.md`, `.env.example`, the
token comments in `tokens.css` and `theme.css`, and `docs/RELEASE.md` (the UK check below).
`docs/research/` keeps its files as they are; this pull request adds `docs/research/host-plan-b.md`
(the evidence) and changes the ADR status lines.

**Does the owner need to do anything on Vercel? No.** `vercel.json` sets the framework, build
command and output directory, which override the dashboard's Next.js preset; the root directory, the
environment variables (`COINGECKO_API_KEY`, `ENABLE_EXPERIMENTAL_COREPACK`), the bypass secret, the
domains and the branch settings stay as they are. ADR-0006's single upstream call across instances
needs nothing from the owner: the Runtime Cache needs no setup or variable, and it is "available on
all plans". The Upstash variables remain what OWNER-SETUP §3 already asks for before launch, for the
last good copy and the CSP report counts, as before. Only if the switch's preview showed the dashboard preset winning over `vercel.json`, which
the documentation says it does not, would the owner set Framework Preset to Vite in Project Settings;
the build session would say so with the preview's evidence.

### 14. The toast: an own component in packages/ui

The owner's choice of 2026-10-17. `packages/ui/src/components/toast.tsx` stops importing
`@base-ui/react/toast` and becomes a small component of its own, with the four properties the design
needs (`docs/DESIGN.md` §8, ADR-0020, ADR-0033, `docs/DOMAIN.md`):

1. **One at a time.** A new toast replaces the one on screen; there is no queue or stack.
2. **One action.** At most one action button (undo, edit, reload) beside the close button; both are
   the existing `Button`, so they are ordinary buttons in the tab order.
3. **A polite live region.** The viewport is an element with `aria-live="polite"` that stays in the
   document, so screen readers announce a toast's title and description when it appears; the toast
   never takes focus.
4. **The 8-second undo window.** A toast with an undo action stays for `UNDO_WINDOW_MS` (8,000 ms,
   `docs/DOMAIN.md`) and then closes; the timer belongs to the app's toast store, not to the
   component, so both are testable with fake timers. The update toast of §5 stays
   until it is answered or closed.

The app keeps owning the manager (no global): a small store in `packages/app/lib` with `show` and
`dismiss`, as ADR-0020's toast queue describes, now holding a single toast. The look (tokens, the
overlay at the bottom above the home indicator, the motion with `prefers-reduced-motion` respected)
and the `data-slot` attributes stay; swiping is not needed, since the close button and the timer
dismiss it. Its stories keep the 360 and 1280 px runs with axe in light and dark, and a component test
covers replacement, the single action, the live region and the timer.

Why: Base UI's toast is exported as one namespace object, which no bundler can tree-shake, so its
Positioner, Arrow and floating-ui reached Today: 11,918 bytes on the Vite slice (variant d1, 157,405
against 145,487) and 11,896 on Next (233,903 against 222,007). (d1) avoided that by importing Base UI's
files by a relative path past its exports map; the own toast avoids both the bytes and that coupling.
The own toast's weight was not measured; the switch's measurement of Today leaves it out, since no
screen mounts it before the app shell, which measures Today with it (issue #33). Base UI stays for the
other components (ADR-0005); only its toast leaves Today.

**2026-10-17, measured in the toast's pull request (Migration step 3):** each `toast.tsx` bundled alone
with esbuild 0.28.2 (minified, production, `react` and `react-dom` external, its `Button` and lucide's
X inside) and compressed at brotli quality 3, as the spike measured the slice's parts: Base UI's toast
as M0 shipped it 30,496 bytes, the own toast 7,312, a net change of −23,184 bytes; with the shared
`Button`, icon and class helpers left out of both, 28,056 against 1,670.

## Dependencies

Every version is the newest on or before 2026-10-14 unless stated, published dates from the npm
registry (read 2026-10-17); brotli weights at quality 3 from the spike.

| Package | Version | Published | Why | Ships to the browser |
|---|---|---|---|---|
| `wouter` | 3.13.0 | 2026-09-30 | the router, only in `lib/navigation` (§9); dependencies `regexparam` 3.0.0 (2023-12-03) and `use-sync-external-store` 1.7.0 (2026-09-09) | 2,512 bytes: the wouter floor (73,106) less React alone (70,594); React Router's declarative mode cost 13,934 the same way |
| `use-intl` | 4.14.9 | 2026-10-02 | next-intl's core without Next | about 3,800 bytes with the format-only formatter (13,200 with the ICU parser); next-intl shipped it already |
| `icu-minify` | 4.14.9 | 2026-10-02 | `compile` at build time; its `format` is part of the 3,800 above | as above |
| `@vitejs/plugin-react` | 6.1.2 | 2026-10-05 | React in Vite 8 | no |
| `@rolldown/plugin-babel` | 0.2.4 | 2026-09-07 | runs the React Compiler (peer of the plugin) | no |
| `@babel/core` | 7.29.7 | 2026-05-25 | for the compiler plugin; 8.0.7 exists, 7.29 is what the spike proved | no |
| `@serwist/build` | 9.5.13 | 2026-10-04 | `injectManifest` after the prerender | no (the worker is not page script) |
| `@storybook/react-vite` | 10.6.2 | 2026-10-12 | Storybook without Next | no |
| `@vercel/functions` | 3.10.1 | 2026-10-13 | `getCache()`, the Runtime Cache in the API function; its one dependency is `@vercel/oidc` 4.0.1 (2026-10-13), its two peers are optional | no (`apps/web` only, behind `server-only`) |

Already in the catalog and kept: `vite` 8.3.4 (2026-10-08), `@tailwindcss/vite` 4.3.3, `serwist` 9.5.13
(in the worker), `esbuild` 0.28.2 (2026-08-08), `babel-plugin-react-compiler` 1.0.0, `react` and
`react-dom` 19.3.1, `@base-ui/react` 1.9.0 (for the other components; its toast leaves, §14). Not added:
`react-router` 8.4.0 (2026-09-15; the owner chose wouter, Options), `vite-plugin-pwa` 2.0.0 (§5),
`@serwist/vite` (runs too early). Removed from the catalog when the last host leaves Next: `next`,
`@next/eslint-plugin-next`, `next-intl`, `@serwist/turbopack`, `@serwist/window`,
`@storybook/nextjs-vite`, `@tailwindcss/postcss`, `@tailwindcss/turbopack`, the `next` entries of
`minimumReleaseAgeExclude`; `@sentry/nextjs` waits for M3's choice. Each addition gets its sentence in
the pull request that installs it, as `CLAUDE.md` asks.

## Risks

| Risk | Mitigation |
|---|---|
| Vercel serves differently from the local server (preset override, `routes` with `status`, function bundling, headers on every response) | The switch's preview is checked before merge: the request-level specs run against it with the bypass header, `lighthouse-vercel` measures it, and a curl list covers headers, 404, 405, the function and the worker. Main stays on Next until it passes; reverting the switch redeploys Next. |
| The function is built before `server-dist/api.mjs` exists, or sees `/api` instead of the requested path | `vercel-build` produces the bundle beside the function whichever order Vercel uses (§2); the preview's curl list calls both endpoints and an unknown `/api/*` path. If either fails, the `request.path` transform, then Build Output API v3 (§2), are the documented fallbacks. |
| The UK route cannot be observed on Vercel from outside the UK | It uses the documented `has` condition Vercel's own example uses; the local server runs the same `vercel.json` in the e2e suite; `docs/RELEASE.md` adds a check from a UK vantage point before launch; Routing Middleware is the documented fallback. |
| Precompiled messages depend on `use-intl` exports documented only through next-intl's plugin | Exact pins; the equivalence test over every key; `t.raw` linted away. Dropping precompilation costs 9,027 bytes and still fits. |
| The committed `vercel.json` drifts from the code (headers, hashes, exemptions, routes) | `lib/vercel-config.test.ts` recomputes all of it in the gate; the write script regenerates it. |
| The boot script stops matching its hash, or Vite emits another inline script | The `vercel.json` test recomputes both hashes from `BOOT_SCRIPT` and `THEME_BEFORE_PAINT`; a build step fails when the built `app.html` has an inline script other than those two; `csp.spec.ts` checks the page in Chromium and WebKit. The allowlist fallback needs its own ADR (§3). |
| A client build bundles server code | `clientNeverImportsServer()`, the dependency-cruiser rule and the fixture test (§11). |
| A lazy chunk is gone after a deploy | Installed clients have their version precached; others reload once on `vite:preloadError`. |
| The stranded M0 worker at `/serwist/sw.js` | The kill-switch worker at that path until launch, with `skipWaiting()` on install (§5). |
| Without Next's Data Cache, more upstream calls | The Runtime Cache keeps the cross-instance bound in `fra1`; an eviction or a cold race costs one extra upstream call, never a wrong answer; the per-instance copy and the CDN still bound the rest. |
| wouter has one maintainer on npm and a smaller ecosystem than React Router (fewer integrations, examples and answers); a need it does not cover could appear | The product's routing is small and wouter covers it today (§9); it is actively released (3.10.0 on 2026-05-21 to 3.13.0 on 2026-09-30, five 3.x releases in 2026) and pinned exactly; the adapter keeps a swap one module (`lib/navigation`, enforced by dependency-cruiser), and React Router's declarative mode is the measured alternative (13,934 bytes against 2,512). |
| A lazy screen shows an empty screen area on its first visit, since wouter's location updates are not transitions (§9) | The header and the tab bar stay mounted; chunks are small and precached for installed clients; if the flash shows in the e2e suite or on a phone, the shell starts loading the other screens' chunks after Today is idle, measured against the budget first. |
| The hand-written registration misses an edge of the update flow | The five steps of §5 are unit-tested against a fake container, the first install included; `pwa.spec.ts` checks the real worker; the code is a few dozen lines with no dependency. |
| The own toast regresses accessibility | The story tests with axe at 360 and 1280 px in both themes, and the component test of the four properties (§14). |
| Today grows past the budget with M1's remaining states | 29,061 bytes of headroom; Lighthouse CI asserts on every pull request and on every preview. |
| The switch is one large pull request | The independent parts land first (below); the switch carries only what cannot be split. |

## Migration

Small pull requests, each with its tests and documents, each leaving main green and deployable to
proofofcalm.com, every required check included.

1. **i18n on `use-intl`** in `packages/app` and `apps/web/lib/site-messages.ts`, the `AppConfig`
   augmentation moved, while the hosts stay on Next (an `IntlProvider` renders in a Next client
   component). Per-namespace message files from the merge tool. After it, nothing in `packages/app`
   imports `next` or `next-intl` (today only `lib/i18n/provider.tsx` and the Today screen do).
2. **Storybook on `@storybook/react-vite`**. No story needs a router yet; the memory-location
   decorator arrives with `lib/navigation` in step 5.
3. **The own toast** in `packages/ui` (§14), replacing Base UI's toast with the same props for its
   callers, its stories and its component test, while the hosts are still Next. Removing only the
   Positioner, Arrow and floating-ui saved 11,896 bytes on Next (variant d1); the own toast also drops
   the rest of Base UI's toast and adds its own code, so its net change is measured in that pull
   request.
4. **`tools/serve/vercel-local.ts`** with its unit tests, not yet used by the hosts.
5. **Both hosts on Vite** (the switch): `packages/config/vite` with the precompile, preload, boot and
   `clientNeverImportsServer()` plugins, `lib/navigation` on wouter with its dependency-cruiser rule,
   the route table, `app.html`, the theme and
   boot scripts, the prerender, the manifest, the worker, the hand-written registration with its
   unit test (§5) and the kill-switch worker, the function and
   its `vercel-build` script, `vercel.json` and its test, the fallback font face, the new `csp.spec.ts`
   and `pwa.spec.ts`, the Playwright and Lighthouse configs, `ci.yml`'s scan path, `turbo.json`; and
   `apps/mobile` on Vite with §10's `export-build` assertions and smoke test. The mobile host moves in
   the same pull request because `lib/navigation` and the route table are wouter, which a Next
   static export cannot host beside its own router; switching both at once keeps `export-build` green
   on this pull request and on main. Documents: ARCHITECTURE, SECURITY §2, §3, §4 and §8, ENGINEERING
   §4 (with Today's measured figure on the chosen stack), DESIGN §3, §5 and §8, CLAUDE.md, OWNER-SETUP §3, `apps/web/README.md` and `apps/mobile/README.md`.
   The preview checklist of the first two risks runs before the merge, and Today is measured locally
   and on the preview. A reviewed baseline that no longer matches is removed in this pull request
   (issue #33's rule for baselines).
6. **Next leaves the repository**: the catalog entries, the ESLint plugin, knip's plugin, the
   dependency-cruiser rules, `brotli-proxy.ts`, the `next` peer, and the ADR-0005 deviation lines that
   name Next.

## Consequences

- Today's script falls from 233,903 bytes (Next, the M1 slice) to 134,779 with the same product code
  and React Router, under the owner's original 150 kB figure; wouter measured 11,115 bytes less than
  React Router on the plain slice, and the chosen stack's own figure comes from the switch (Context).
  The site pages ship no script at all, where `/` cost
  147,072 bytes on Next.
- Every page is a static file behind Vercel's CDN; only `/api/*` runs code. No page renders per
  request, so the nonce and the dynamic rendering it forced are gone.
- `packages/app` loses its last framework coupling (`next-intl`, the `next` peer); `lib/navigation`
  carries the router, wouter, and is the only module that names it.
- The service worker registration and the toast are the repository's own code (a few dozen lines
  each), traded for 1,753 bytes on Today and a toast change that variant d1 bounds at 11,918 bytes for
  the Positioner, Arrow and floating-ui alone (the net figure is measured in the toast's pull request); they need their own tests instead of a library's.
- The hosts gain a build script of their own (prerender, worker, functions) that Next did implicitly;
  it is small, tested through the e2e suite, and runs the same way locally and on Vercel.
- The CSP stays strict: `'strict-dynamic'` anchored by two hashes of fixed-text scripts instead of a
  per-request nonce, so ADR-0032's compensating control and SECURITY §5 stand unchanged.
- ADR-0006's cross-instance bound on upstream calls moves from Next's Data Cache to Vercel's Runtime
  Cache and holds from the switch, with no owner action; it ties that one bound to Vercel, which
  ADR-0005 already chose as the host.
- The theme and motion preferences gain a `localStorage` mirror of the IndexedDB values, written by
  Settings and rewritten by the shell.
- Whether Today's budget returns to the owner's 150 kB (153,600 bytes) is decided at M1's close,
  with the finished screen measured.
- ADR-0028's server-side counting and ADR-0021's sync endpoints (M3 and later) become functions in
  `server/`, not route handlers or server actions; ADR-0027's SDK is chosen at M3 for a Vite SPA.

## The M0 guarantees the migration keeps (the switch's pull request ticks each one)

- [ ] `/today` renders the empty state with tokens in light and dark on all seven Playwright projects,
      with no horizontal scroll and axe passing.
- [ ] The visual baselines of the empty Today match, or are removed in the switch per issue #33.
- [ ] The eight security headers on every response; the CSP and `Reporting-Endpoints` on every
      document; a strict policy (`'strict-dynamic'` with the two script hashes); zero violations on
      `/`, `/today`, `/~offline` and the five legal pages; no `unsafe-inline` or `unsafe-eval` in
      production; no third-party origin anywhere.
- [ ] `POST /api/csp-report` stores only the directive and the blocked origin or keyword, counted per UTC
      day; other methods get 405.
- [ ] `GET /api/prices`: every allow-listed coin, 400 for an unknown currency, 503 with nothing to
      serve, the stale copy with `x-proof-of-calm-stale: true` and `s-maxage=60`, CORS for the three
      origins with `Vary: Origin`, preflight 204 or 403, the key server-side, the function in `fra1`,
      at most one upstream call per ten minutes across instances.
- [ ] GB visitors get the 451 page with no script on every path except the legal pages and
      `security.txt`; the legal pages answer 200 from GB; the page's style raises no violation.
- [ ] `/` is the noindex holding page with no script, Lighthouse performance ≥ 0.95 and accessibility 1.
- [ ] `/manifest.webmanifest` with the same content, every icon loading as a PNG; the theme colour per
      theme, the SVG and ICO favicons and the Home Screen icon linked.
- [ ] The worker takes scope `/`, controls Today after a reload, precaches the shell and the offline
      page, keeps prices for 24 hours, falls back to the offline page, and waits for the app's
      "A new version is ready" toast before taking over: the hand-written registration posts
      `SKIP_WAITING` only on accept and reloads once on `controllerchange`, never on a first install;
      no `@serwist/window` or `workbox-window` in the client build.
- [ ] Today within 163,840 bytes of script, performance ≥ 0.95, accessibility 1, TBT ≤ 200 ms, LCP ≤
      2,500 ms, CLS ≤ 0.1, locally and on the Vercel preview.
- [ ] The bundle secret scan passes over everything a browser downloads; `server-only` modules never
      reach the client build (`clientNeverImportsServer()` fails it, the fixture test proves that, and
      the dependency-cruiser rule covers `apps/web/src` and `apps/mobile/src`).
- [ ] `security.txt` is served and `tools/security-txt/check.ts` passes.
- [ ] The required checks keep their names (verify, stories, export-build, e2e-visual, lighthouse,
      lighthouse-vercel) and documentation-only pull requests still skip the four app jobs.
- [ ] English messages with type-safe keys; the stale merged-message test still fails when stale.
- [ ] The text font preloaded, the Mono not, the size-adjusted fallback in place, no font from another
      origin.
- [ ] Every story at 360 and 1280 px in light and dark with axe; the class-conflict check after every
      story and on every e2e page.
- [ ] The React Compiler on in both hosts and Storybook.
- [ ] Main deploys to proofofcalm.com and every branch to a preview; the bypass secret and the
      commit-author rule unchanged.
- [ ] Secrets only in `apps/web/.env.local` and Vercel; `.env.example` documents the shape.
- [ ] The dependency rule: nothing in `packages/app` imports a host or a server-only module; `wouter`
      is imported only in `packages/app/lib/navigation`.
- [ ] One toast at a time with one action, announced in a polite live region; the delete toast's undo
      lasts 8 s (`UNDO_WINDOW_MS`); no `@base-ui/react/toast` in Today's bundle.

## Sources

All accessed 2026-10-17. Vercel: https://vercel.com/docs/project-configuration/vercel-json,
https://vercel.com/docs/project-configuration, https://vercel.com/docs/functions/functions-api-reference,
https://vercel.com/docs/functions/runtimes/node-js,
https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration,
https://vercel.com/docs/functions/configuring-functions/advanced-configuration,
https://vercel.com/docs/routing-middleware, https://vercel.com/docs/routing-middleware/api,
https://vercel.com/docs/routing, https://vercel.com/docs/caching/cdn-cache,
https://vercel.com/docs/caching/runtime-cache,
https://vercel.com/docs/headers/request-headers, https://vercel.com/docs/frameworks/frontend/vite.
Vite 8.3.4: https://vite.dev/guide/features, https://vite.dev/guide/ssr, https://vite.dev/guide/build.
wouter 3.13.0: https://github.com/molefrog/wouter (README). React Router 8.4.0 (the rejected
options): https://reactrouter.com/start/modes, https://reactrouter.com/explanation/react-transitions.
vite-plugin-pwa: https://vite-pwa-org.netlify.app/guide/register-service-worker.html and its registry
entry. next-intl and use-intl:
https://next-intl.dev/docs/environments/core-library, https://next-intl.dev/blog/precompilation.
Serwist: https://serwist.pages.dev/docs/window, https://serwist.pages.dev/docs/build/inject-manifest.
Storybook 10.6: https://storybook.js.org/docs/get-started/frameworks/react-vite,
https://storybook.js.org/docs/writing-tests/integrations/vitest-addon. CSP:
https://web.dev/articles/strict-csp. Versions and dates: https://registry.npmjs.org.

Proven locally by the spike (`spike/m1-budget`, numbers and method in `docs/research/host-plan-b.md`
§1 and §2): every byte count above; the slice working on both hosts with a seeded plan; precompiled
messages in Vite. Proven locally by the design prototype (`spike/m1-budget:tools/spike/plan-b/`,
commit `b8a7c8d`; findings in `docs/research/host-plan-b.md` §3): the static headers and CSP with
hashes in Chromium and WebKit, the theme script before paint, the 451 route from a static rule, the
zero-script site pages, the font preload plugin, the API bundled with esbuild and served as a handler,
the worker built with esbuild and `@serwist/build` and working offline, and the strict hash variant.
Proven locally for this ADR on 2026-10-17: the fixed-text boot script under the strict policy in both
engines with two entry names (`docs/research/host-plan-b.md` §3). Not yet proven on Vercel: everything
in the first two risks, checked on the switch's preview.

## Departures from the plan-B design

Issue #33 named the plan-B design (`tools/spike/plan-b/DESIGN.md`, commit `b8a7c8d`) as what this ADR
records. It keeps that design's measurements, UK route, worker pipeline, prerendered site pages,
i18n, local Vercel emulation, one function and strict policy, and departs from it in these points:

- **Deployment format.** The design wrote `.vercel/output` with the Build Output API v3 and generated
  every route and header at build time. This ADR uses zero-config with a committed `vercel.json` (§1)
  and a `vercel-build` step for the function (§2), so the routing, headers and UK rule sit in one
  reviewed file that the gate tests against the code. The design's reason against zero-config `api/`
  (file-by-file transpiling) does not apply to a file that only re-exports an esbuild bundle. The Build
  Output API stays the fallback (§2).
- **The boot script's hash.** The design generated the hash per build because its boot script
  contained the entry URL. Here the text is fixed and the URL sits in a `data-entry` attribute (§3), so
  the hash is stable and can be committed.
- **Function signature.** The design used the classic `(req, res)` export; this ADR uses the `fetch`
  Web Standard export that Vercel documents for functions without a framework, which the handlers
  already speak (`Request` in, `Response` out).
- **Router.** The design chose `react-router` 8.4.0 in declarative mode (`BrowserRouter`, a
  `HashRouter` as the wrapper's option). The owner chose wouter 3.13.0 on 2026-10-17 (Options, §9): 11,422
  bytes less on the floor and 11,115 on the slice; the wrapper uses wouter's hash location.
- **Registration.** The design kept `@serwist/window`; this ADR registers by hand with the platform API
  (1,753 bytes less on the Vite slice, variant b2; the owner's decision of 2026-10-17), since Serwist's
  worker answers the skip-waiting message itself (§5).
- **Toast.** The design left M0's Base UI toast as it was; this ADR replaces
  the toast with `packages/ui`'s own (§14; removing Base UI's Positioner, Arrow and floating-ui alone
  saved 11,918 bytes on the Vite slice in variant d1, and the own toast's net change is measured in its
  pull request; the owner's decision of 2026-10-17). Base UI's button stays.
- **Layout.** `app.html` instead of `index.html` for the shell, because `/` is the prerendered holding
  page; the shell layer lives in `packages/app/features/shell` rather than a new `packages/app/shell`.

## Disagreement

None. ADR-0005's planning session recorded its preference for this host; the decision here rests on
the measurements, not on that preference. The build session's first draft of this ADR chose React
Router in declarative mode because ADR-0005 named it and the headroom did not need wouter; the owner
weighed the 11 kB on every page higher, and this ADR follows the owner.

## Deviations recorded by the build session

The decision stands; these are the deviations the build session made while carrying out the migration
on 2026-10-17.

- **2026-10-17, Migration step 2: the React Compiler was not on in Storybook before it.**
  `@storybook/nextjs-vite` 10.6.2 never runs the compiler, whatever the Next configuration: it
  transforms every source file through Next's SWC with options that hold no compiler setting (a
  component built through the framework's Vite plugin, `vite-plugin-storybook-nextjs` 10.6.2, with
  `reactCompiler: true` in the Next configuration came out uncompiled), and the `viteFinal` on main
  added only Tailwind. A Storybook build of main held no compiled function, and step 2's build holds
  112 in 36 chunks, the components among them. That guarantee therefore starts with step 2, not M0;
  `packages/ui/src/lib/react-compiler.stories.tsx` proves it in the `stories` job, failing without
  the compiler. `@storybook/nextjs-vite` left the catalog in step 2 with its last user, not in
  step 6. The precompile plugin (§8) and the memory-location decorator (§12) join Storybook in
  step 5 with their modules.
- **2026-10-17, Migration step 3: the one toast and its timer live in `packages/ui`'s
  `createToastManager`, not in a store in `packages/app/lib`.** §14 gave the timer to the app's toast
  store, with `show` and `dismiss`. The toast's pull request kept M0's call shape instead, as step 3
  asks ("the same props for its callers"): `createToastManager()` returns the manager, with `add` and
  `close` as Base UI's had, and it holds the one toast and its timer; `Toaster` takes the same
  `toastManager` and `closeLabel` props and pauses the timer while the toast is pointed at or focused
  and while the page is out of focus or sight. The app creates and owns the single instance; since
  2026-10-20 `lib/services` creates it and the app shell mounts its viewport (the 2026-10-20 entry
  below), and ADR-0020's UI store (`packages/app/src/lib/store/ui.ts`) holds no toast (ADR-0020 readings).
- **2026-10-17, Migration step 4: the `cleanUrls` and `trailingSlash` redirects answer first, with no
  `vercel.json` header.** §11 lists `routes`, then the `headers` rules, then `cleanUrls` and
  `trailingSlash: false`. Vercel builds them the other way round: `getTransformedRoutes` in its
  `routing-utils` package puts the 308 routes of `cleanUrls` (from `/index`, `/index.html` and `*.html`
  to the clean URL) and of `trailingSlash: false` (from a path that ends in `/`) first, then `routes`,
  the `headers` rules, the filesystem and `rewrites` (https://github.com/vercel/vercel,
  `packages/routing-utils/src/index.ts` and `superstatic.ts`, read 2026-10-17).
  `tools/serve/vercel-local.ts` builds the same list, so those 308s answer before the UK route and
  before any header rule, with `Location` and Vercel's default `Cache-Control` alone; the design
  prototype's 308 carried the header rules. M0 on Vercel answers the same way today:
  `GET https://proofofcalm.com/terms/` returns a 308 whose headers are `Location`, `Refresh`,
  `Cache-Control`, `Content-Type`, Vercel's own `Strict-Transport-Security: max-age=63072000` and
  transport headers, none of the app's eight (curl, 2026-10-17). So "the eight security headers on
  every response" in the M0 guarantees means every response but these redirects, and the preview's
  curl list (Risks) adds `GET /terms/`, expecting a 308 to `/terms` without the app's headers.
- **2026-10-17, Migration step 4: the UK route's `dest` is `/not-available`, not §1's
  `/not-available.html`.** With `cleanUrls`, Vercel serves `dist/not-available.html` (§4) at
  `/not-available`, and its documentation says: "If `cleanUrls` is set to `true` in your project's
  `vercel.json`, do not include the file extension in the source or destination path"
  (https://vercel.com/docs/project-configuration/vercel-json, section rewrites, read 2026-10-17).
  Step 5's `apps/web/scripts/vercel-config.ts` writes `/not-available` and
  `apps/web/lib/vercel-config.test.ts` expects it; `vercel-local.ts` refuses an `.html` destination
  under `cleanUrls` at start, naming the path Vercel serves instead.
- **2026-10-17, M1's session 2 split in two (issue #33).** Session 2 keeps Migration steps 1 to 4; the
  switch and Next's removal (steps 5 and 6), with the route table and the ticking of every M0
  guarantee above, are session 3; the app shell, with the header, the tab bar and a route per screen,
  is session 4. §9's shell, the heading of the M0 guarantees and ADR-0034's drafts paragraph named
  session 2 for that later work; they now name the switch or the app shell instead of a session, so a
  later split cannot leave them stale.
- **2026-10-19, Migration step 6 ran as its own wave.** Next's removal from the catalog, the ESLint
  plugin, the `next` peer, the dependency-cruiser rule named after it, the `.next` excludes and
  `tools/serve/brotli-proxy.ts` are wave 3 of session 3, after the switch PR merges; until then the
  catalog carries entries nothing imports and `pnpm lint:dead` lists them.
- **2026-10-19, the manifest is not exempt from the UK route.** §3 listed `/manifest.webmanifest`
  with the files the route lets through; a UK visitor has no app to install, so the route answers
  451 for it too (`apps/web/e2e/uk-block.spec.ts`).
- **2026-10-19, `Service-Worker-Allowed: /` on both worker paths.** The kill switch at
  `/serwist/sw.js` registers at scope `/` like `/sw.js`; without the header on its path the
  unregistering worker would fail to install from the Next-era registration's scope.
- **2026-10-19, `errors-in-console` on both pages locally, on `/` at a deployment.**
  `apps/web/lighthouserc.json` asserts it on `/today` and `/`; `tools/lighthouse/vercel.ts` strips
  it from `/today` because deployment protection redirects the worker's script fetch
  (`docs/BUILD-PROMPT.md`, known gaps).
- **2026-10-19, Storybook keeps the client-never-imports-server guard now; `packages/app`'s
  Storybook is session 4.** `packages/ui/.storybook/main.ts` appends the guard to its Vite plugins so
  a story cannot pull server code either; the stories of `packages/app`'s features arrived with the
  shell (the 2026-10-20 entry below).
- **2026-10-19, later work named by session.** The update toast of §5 landed in session 4 (the 2026-10-20
  entry below); the per-namespace message loader of §8 and the lazy screens of §9 were planned for
  session 5 and landed in session 4 too (the 2026-10-20 entry below).
- **2026-10-19, `APP_ROUTES` reaches the worker through an esbuild define.** `src/sw.ts` cannot
  import `packages/app` (its tsconfig is the worker's); `apps/web/scripts/bundle-worker.ts` defines
  the list at bundle time from `packages/app/src/lib/navigation/routes.ts`.
- **2026-10-19, the M0 guarantees are ticked in the switch PR's body**, one line per guarantee with
  the test or the run that proves it, instead of edits above this heading.
- **2026-10-19, paths.** This document's `packages/app/lib/...` paths read `packages/app/src/lib/...`
  on disk; the text above is kept as written.
- **2026-10-19, the offline page carries the theme script.** §3 and §6 say the site pages carry no
  script and follow the system theme. The offline page (`/~offline`), which the worker serves in place
  of the app, now holds `THEME_BEFORE_PAINT` inline exactly as `apps/web/app.html` does (its hash is
  already in `script-src`), so a session that chose a theme keeps it offline. The holding page, the
  legal pages, the 404 page and the not-available page stay script-free. `apps/web/src/site/head.test.ts`,
  the prerender check in `apps/web/scripts/build.ts` and `apps/web/e2e/csp.spec.ts` hold both halves;
  `docs/DESIGN.md` §3 states the behaviour.
- **2026-10-19, the Runtime Cache store of §2 is deferred.** `apps/web/lib/server/shared-cache.ts`
  returns the memory store per instance: pnpm's `trustPolicy: no-downgrade` refuses `@vercel/functions`
  3.10.1 until the owner lists it in `trustPolicyExclude` (ADR-0025; the owner's yes or no,
  re-opened on the tracker on 2026-10-20). Until then ADR-0006's bound of one upstream call per TTL
  holds per instance and behind the CDN's `s-maxage=600`,
  not across instances; the handler and its tests do not change when the store lands.
- **2026-10-19, an unrequested `controllerchange` closes the prompt, not the toast** (the
  docs-keeper). §5 step 4 says a `controllerchange` this tab did not request, while the toast is
  showing, dismisses the toast. `packages/app/src/lib/pwa/register.ts` has no dismissal callback: that
  event closes the prompt, so a later update can prompt afresh, and the toast stays on screen; its
  Reload then reloads directly, since the new worker already controls the page. Resolved on
  2026-10-20 by the cleanup `onUpdateReady` returns (the entry below).
- **2026-10-19, the preview's curl list is a spec run from a workflow.** The Risks table's curl list
  (headers, 404, 405, the function, the worker) is `apps/web/e2e/deployment.spec.ts`, which runs only
  with `BASE_URL`, plus the request-level specs; the `preview-checks` job of
  `.github/workflows/lighthouse-vercel.yml` (there, not in a file of its own: a workflow file that is
  not on main cannot be dispatched) runs them against the preview on a dispatch with `checks=true`,
  refused for the production deployment, with the bypass secret, which never leaves Actions and
  Vercel, and posts the commit status `preview-checks`. The 308 of
  `/terms/` is asserted on its status and location alone, the headers it carries recorded. The UK
  route (Risk 3) and the worker's control of Today (the bypass never reaches its script fetch) stay
  asserted locally; the spec records what the preview does to the worker. Since 2026-10-29 (#242) the
  dispatch with `checks=true` runs only at the branch URL of a branch of this repository other than
  main whose head is the SHA; the resolve job refuses any other URL (the workflow's header comment).
- **2026-10-20, Migration step 6 done.** Next left the repository: the catalog entries the
  Dependencies section lists (`@storybook/nextjs-vite` had left with step 2), the ESLint plugin and
  its rules, the `next` peer of `packages/app`, `tools/serve/brotli-proxy.ts`, the `.next` and
  `next-env.d.ts` excludes, the time-boxed `minimumReleaseAgeExclude` block (ADR-0025, dated
  2026-10-20) and the `proxy`/`instrumentation` orphan exception. The dependency-cruiser rule
  `app-no-server-only-next` became `no-next-anywhere`, which refuses any `next` import, resolved or
  bare, from `apps` and `packages`. knip's Next plugin needed no configuration and left with the
  dependency. `@sentry/nextjs` stays in the catalog for M3's choice.
- **2026-10-20, §5 step 4 realised: the cleanup returned by `onUpdateReady` closes the toast on an
  unrequested `controllerchange`; the prompt yields to a toast with an action.** The handler may
  return a function, which `packages/app/src/lib/pwa/register.ts` calls once when the prompt closes
  without this tab's `accept()` or `dismiss()`: the 2026-10-19 bullet above is resolved without a
  dismissal callback on the prompt. `packages/app/src/lib/pwa/update-toast.ts` is that handler: it
  shows the toast with `timeout: 0` and the one Reload action, replaces a toast without an action at
  once, and waits behind a toast with one (an undo in its window, paused or not) until it closes
  (§14's one toast at a time); a toast that replaces the update toast re-queues it, and the prompt
  stays open meanwhile. The close button dismisses the prompt, so the next `updatefound` prompts
  afresh; the cleanup cancels the wait and closes the toast if it is the one on screen, with no
  reload. The shell wires the handler with the locale's labels (the shell entry below).
- **2026-10-20, the lazy screens of §9 and the per-namespace loader of §8 land in session 4**, not
  session 5 as the bullet of 2026-10-19 planned: session 5 builds five screens on five parallel
  branches, and none of them could add the route table's lazy entries and the loader without
  conflicting with the others. `packages/app/src/features/shell/routes.tsx` holds every `APP_ROUTES`
  entry, Today static and the six others through `lazyScreen` (`packages/app/src/lib/i18n/lazy.tsx`),
  which loads a placeholder screen's chunk and its namespace's file together and registers the
  messages (`packages/app/src/lib/i18n/registry.ts`, read by `I18nProvider` through
  `useSyncExternalStore`) before the component resolves; `packages/app/src/lib/i18n/namespaces.ts`
  names the static namespaces and one explicit dynamic import per lazy one (no `import.meta.glob`: it
  would need `vite/client` types in `packages/app`). The routes stay flat; a screen with sub-routes
  adds `nest` to its own `Route` line when it arrives. Measured on the web build of 2026-10-20: each
  lazy screen is two chunks, its module and its namespace's compiled messages (63 bytes for a
  placeholder), fetched together on the first visit; merging them into one is a Rollup
  `manualChunks` choice in the hosts' Vite factory, not taken here.
- **2026-10-20, the shell and the stories of `packages/app`.** `packages/app`'s Storybook and the
  first feature story landed in #74 (`build/app-storybook`); the shell's stories
  (`packages/app/src/features/shell/app-shell.stories.tsx`) land with the shell itself:
  `packages/app/src/features/shell/app-shell.tsx` holds the header, the tab bar, the toast viewport
  (§14), the boot states over `lib/services` (busy screen area, failure screen with retry), the
  appearance effect of §3 (the store wins, the mirror is rewritten), the tick and the price refresh
  while the page is visible, and the update toast of §5 through the host's `registerUpdates`;
  `packages/app/src/lib/services/browser.ts` composes the services over the browser's adapters and
  both hosts' `src/main.tsx` call it once. The static-export host passes no `registerUpdates`, so its
  bundle holds no worker code and `apps/mobile/scripts/check-export.ts` now asserts the API origin
  unconditionally. Today's script transfer with the shell: `docs/ENGINEERING.md` §4.
- **2026-10-20, a third API route: §1's rewrite and §2's dispatch list `/api/history/<coin>`.** The
  rewrite's source is `/api/(prices|csp-report|history/[^/]+)` (`apps/web/lib/vercel-config.ts`,
  `apps/web/vercel.json`), and `apps/web/server/api.ts` sends `GET` on a one-segment
  `/api/history/<coin>` to the history handler and `OPTIONS` to the preflight, as for `/api/prices`;
  another method gets the same `405`. The handler checks the segment against the coin allow-list.
  What the route answers: `docs/ARCHITECTURE.md` (The API, the hosts and the store wrapper).

## Corrections recorded on 2026-10-18

The decision stands; the text above stays as accepted (`docs/ADR/README.md`). These statements in it
were wrong on 2026-10-18, each with the fact and where it can be checked.

- **Context, "the floor that issue #33 quotes".** Issue #33 quoted the 145,610 bytes when this ADR
  was written; its body has not carried the figure since its edit of 2026-10-17, 19:47 UTC. The
  figure and its run are in `docs/research/host-plan-b.md` §2.
- **§2, the Build Output API fallback, "(`docs/research/host-plan-b.md` §4)".** The design's
  `functions/api.func`, its `.vc-config.json` with `fra1` and the builder source they were read from
  are in §5.2, Q1 and Q2; §4 holds only the departure.
- **§12, "`preview.tsx` wraps stories in `NavigationProvider` with wouter's memory location", and
  the same decorator in Migration step 2 and in step 2's deviation above.** The only Storybook is
  `packages/ui`'s, and the rule `ui-imports-no-product-code` (`packages/config/dependency-cruiser.cjs`)
  forbids its `preview.tsx` to import `packages/app`, where `NavigationProvider` lives (§9). Its
  stories need no router: the components take the app's link as a prop, and the stories pass a plain
  anchor (`packages/ui/src/components/navigation.stories.tsx`). Where the stories that need
  `lib/navigation` run, with the memory-location decorator, is recorded with the switch (issue #33).
- **§13's table, "`next/link`, `next/navigation` in `lib/navigation`".** `lib/navigation` was
  planned over Next (ADR-0032) but never built; no commit holds `packages/app/src/lib/navigation`. On
  main the only `next/link` import is `apps/web/app/(site)/layout.tsx`, which becomes `<a>` in
  `src/site/` (§6), and nothing imports `next/navigation`. The switch creates `lib/navigation` over
  wouter (§9).
- **Migration step 5's "Documents".** The list leaves out documents that §13 names and that describe
  code step 5 changes: `docs/BUILD-PROMPT.md` (the export check, Lighthouse behind the brotli proxy),
  `packages/ui/src/fonts/README.md`, `.env.example`, the `next/font` comments in `tokens.css` and
  `theme.css`, and `docs/RELEASE.md`. By §13's rule (each document with the code it describes), they
  change in step 5 as well. `docs/DESIGN.md` §8, which step 5 also lists, changed with the toast in
  step 3 (#45). For `docs/RELEASE.md`, §13 names only the check from a UK vantage point (Risks); the
  kill switch's removal (§5) goes there too. The file on main holds neither.
- **§13's documents.** Neither §13 nor step 5 names these, which also describe the Next host on
  main: `docs/SECURITY.md` §1 and `docs/ENGINEERING.md` §6 (a CSP "with nonces"); the route handlers
  of `docs/ENGINEERING.md` §6, which become functions in `server/` (§2, Consequences);
  `packages/ui/README.md` and the header of `packages/ui/src/styles/fonts.css` (`fonts.css` for
  Storybook, `next/font` in the hosts); and, beyond the parts of `CLAUDE.md` that §13 names, its
  secrets line ("Next.js reads env files from the app's folder"). `tools/README.md` describes
  `serve/brotli-proxy.ts` until the hosts switch, so it changes with step 6, which removes that file.
- **The M0 guarantees, the worker.** M0's worker waits (`skipWaiting: false` in `apps/web/app/sw.ts`),
  but M0 has no update toast and nothing posts `SKIP_WAITING`: `SerwistProvider` in
  `apps/web/app/(app)/layout.tsx` registers the worker but has no update flow, so a new one takes over
  once every tab of the app has closed. The M0 guarantee is that a new worker never takes over an open
  page by itself. The takeover from the "A new version is ready" toast is new: `register.ts` and its
  unit test come with the switch, and the toast drives it once the app shell renders it (issue #33).
  The item's last clause is new as well: `SerwistProvider` is built on `@serwist/window`, so M0's
  client build carries it until the hand-written registration (§5) replaces the provider.
- **The M0 guarantees, `/`.** M0's holding page is noindex and held to performance ≥ 0.95 and
  accessibility 1 (`apps/web/lighthouserc.json`), but it ships Next's script (147,072 bytes,
  Context). "No script" comes with the prerendered site pages (§6).
- **Departures from the plan-B design, "It keeps that design's … UK route".** The list leaves out
  departures, among them these three. The design's UK route had `caseSensitive: true`, so its
  exemptions were exact and `/TERMS` was blocked (`docs/research/host-plan-b.md` §5.2, Q4); §1's
  route has none, so its `src` matches in any case (§11; `tools/serve/vercel-local.ts` honours
  `caseSensitive`). The design's probe route on an `x-proof-of-calm-probe` header made the 451
  testable outside the UK (Q4); this ADR relies on `docs/RELEASE.md`'s check from a UK vantage point
  instead (Risks). The design's `tools/deploy-check/check.ts` asserted the route and header contract
  on every deployment (Q11); this ADR tests the committed `vercel.json` against the code in the gate
  and checks the switch's preview with the request-level specs and a curl list (§1, Risks). M0's
  `isExemptPath` (`apps/web/lib/geo/uk-block.ts`) is exact, so M0 answers `/TERMS` from GB with 451,
  while §1's route as written exempts it, against the M0 guarantee of 451 on every path except the
  legal pages and `security.txt`. `caseSensitive: true` on the route keeps the guarantee.

## Readings recorded on 2026-10-20

The decision stands; these are measurements of the web build with Today's screen (`feat/today-screen`).

- **Today's script and the shared chunk.** Today loads three files: the entry `app` (294,039 bytes,
  82,659 brotli at quality 11), `react` (15,724; 5,131) and one shared chunk (63,903; 19,357), plus the
  two inline scripts (393; 182): 107,329 bytes brotli in all against the 163,840 budget, measured from
  `apps/web/dist` without a server; Lighthouse's transfer on a deployment is the gate's figure. Rollup
  names the shared chunk after one of its modules (`coin-chip`, the chip Today's primary action uses);
  it holds what Today and the lazy screens import alike, zod's mini core among it, so Log, Plan,
  Portfolio and their table import it instead of a copy. The lazy screen and its namespace stay two
  chunks; the `manualChunks` choice of §9's deviation is still not taken.
- **The cold boot of `/today` and `/log`, read from the shell.** The header and the tab bar (fixed to
  the bottom) paint first; the screen area stays empty while the snapshot and the plan's rules load
  and while a lazy screen's chunk loads, then the screen is inserted whole, which moves nothing that
  was painted. On Today the prices are the one late value: the prices line keeps one line of height
  before the first fetch. No shift comes from the shell, so `ScreenFrame` is unchanged. The e2e spec
  `apps/web/e2e/layout-shift.spec.ts` now measures it: on every Chromium project it cold-boots `/log`
  and `/today` over the seeded fixture plan, sums the layout shifts without recent input from a
  buffered `PerformanceObserver`, and fails at CLS 0.1 or more (WebKit has no Layout Instability API).
- **2026-10-20, a lazy namespace for a lazy part of a static screen (§8), #110.** `loadNamespace` in
  `packages/app/src/lib/i18n/lazy.tsx` (exported from `packages/app/src/lib/i18n/index.ts`) loads one
  lazy namespace and registers it with the provider; `lazyScreen` now calls it beside the screen's
  module. Today, a static screen, uses it to load `log` with the Log's entry sheet and skip sheet and
  before the one tap's toast, so those parts never render bare keys and Today's entry stays without
  the Log's messages. The static and lazy namespaces stay listed once, in
  `packages/app/src/lib/i18n/namespaces.ts`.

## Deviations recorded on 2026-10-22

The decision stands; this changes when the reload of §3 runs.

- **2026-10-22, the reload on a failed chunk runs only for a build that is gone (§3, Risks).** The
  reload of §3 ("A failed chunk load after a deploy reloads the page once") and the Risks row "A lazy
  chunk is gone after a deploy" now run only when a HEAD of the running entry answers 404 or 410
  (`apps/web/src/chunk-reload.ts`, called from `apps/web/src/main.tsx`). A chunk cancelled because the
  page is leaving (WebKit cancels a leaving document's loads, run 39806386454) or failed with the build
  still deployed never reloads. The entry's hash changes whenever any chunk it can import changes, so a
  missing entry means a new deployment; the session-storage key still allows one reload per tab.
  `apps/web/e2e/chunk-reload.spec.ts` covers the three cases on the seven projects.

## Deviations recorded on 2026-10-26

The decision stands; this changes where two versions come from, what a screen that fails shows, how
Reload asks for its modules again, what Lighthouse measures, when the worker registers and when the
toast's window waits.

- **2026-10-26, `@sentry/nextjs` and `@vercel/functions` left the catalog** (ADR-0005, deviation of
  2026-10-26): no package used them. The Dependencies section's `@vercel/functions` 3.10.1 and the
  2026-10-20 bullet's "`@sentry/nextjs` stays in the catalog" no longer hold. M3 pins the Sentry SDK it
  chooses for the Vite hosts. The shared cache's Runtime Cache store
  (`apps/web/lib/server/shared-cache.ts`) pins the `@vercel/functions` release current when the owner
  answers the `trustPolicyExclude` item of the 2026-10-19 bullet; that item stays open, and the
  release it names is reviewed then, not 3.10.1. `trustPolicyExclude` in `pnpm-workspace.yaml` names
  no `@vercel/functions` version, so nothing there changes.
- **2026-10-26, a screen that fails shows an error state inside the shell** (§9, #167). §9's one
  `Suspense` around the screen area had no error boundary, so a lazy chunk that failed while the build
  was still deployed (offline, or a failed request: the 2026-10-22 entry keeps the page then) unmounted
  the whole app and left a blank page. `ScreenBoundary` in `packages/app/src/features/shell/screen-error.tsx`
  now sits around that `Suspense`, keyed by the location: the header and the tab bar stay mounted, the
  screen area shows a heading, one line and Reload (`Platform.reload`, the page loaded again, since React
  keeps a failed lazy component's error), and another destination still opens. `apps/web/src/chunk-reload.ts`'s
  rule is unchanged; `apps/web/e2e/chunk-reload.spec.ts` covers the state on the seven projects.
- **2026-10-26, Reload asks for every module preload again first** (§3, #167). WebKit keeps a
  `modulepreload` that failed in its memory cache, and the reloaded page takes it from there without a
  request: run 40374619506 and a local iphone run, offline with no interception too, showed the screen's
  chunk and its preloaded imports never requested after Reload. `Platform.reload` in
  `packages/app/src/lib/adapters/web-platform.ts` fetches each `link[rel="modulepreload"]` with
  `cache: 'no-cache'`, which drops that copy, then reloads once they settle or after 3 seconds.
- **2026-10-26, Lighthouse measures four seeded screens and `/`, locally and at every deployment**
  (#170). §11's `lighthouserc.json` with "URLs and assertions unchanged" and `lighthouse-vercel.yml`
  measuring `/today` and `/` no longer hold. `apps/web/lighthouse/seed.ts` puts the fixture plan into
  the store before each URL; both runs measure Today, Portfolio, Log and Plan with it, and `/`. The
  local run warns on the four screens' performance score, TBT and LCP; `tools/lighthouse/vercel.ts`
  takes the URLs and the seed from `lighthouserc.json` and raises every warn to error at a deployment.
  The budgets, the medians and when each run happens: `docs/ENGINEERING.md` §4.
- **2026-10-26, the worker registers once the first screen settled** (§5 step 1, "After the load
  event", no longer holds alone). Production measured Today's TBT at a median of 231 ms over 15 runs
  (runs 40374135788, 40382203170 and 40384282754) while the previews of the same commit, whose worker
  deployment protection keeps inactive, gave 149 and 167 ms with the same prices line: the task that
  renders Today after the load event took a median of 43 ms observed (runs 2 to 5 of each) with the
  worker installing beside it and 27 ms without, and Plan, with no such task, showed no gap.
  The shell now hands over the update handler after the first boot and the first prices refresh
  (`packages/app/src/features/shell/app-shell.tsx`), and the host registers after the load event in
  the first idle period, 3 s at most (`whenIdle` in `packages/app/src/lib/pwa/idle.ts`, where Safari,
  with no idle callback, waits the 3 s). Steps 2 to 5 are unchanged.
- **2026-10-26, the undo window waits under a modal (§14).** §14's fourth property ("stays for
  `UNDO_WINDOW_MS` and then closes") now also pauses while a modal Sheet or Dialog is open: the toast
  stays under the scrim, out of reach, so its window would otherwise run out where no one can press
  Undo (WCAG 2.2.1). Each popup counts itself while mounted (`packages/ui/src/lib/modal-layer.ts`), the
  toast pauses while the count is above zero, beside the pointer, focus and away holds, and runs its
  whole window again once the last modal has closed. The timer stays the manager's; the look and the
  stacking order do not change (`docs/DESIGN.md` §7 and §8).

## Deviations recorded on 2026-10-29

The decision stands; this narrows what the UK route exempts.

- **2026-10-29, the UK route exempts `/.well-known/security.txt` only** (§1). §1's route exempts all
  of `\.well-known/`; since 80735afa (2026-10-19) the route in `apps/web/vercel.json` exempts only
  `/.well-known/security.txt`, as it is written from `isExemptPath` in
  `apps/web/lib/geo/uk-block.ts`. ADR-0032 rule 7's app-link files of M3 would therefore answer 451
  from GB unless that rule changes. The headers route still skips all of `\.well-known/`.

## Corrections recorded on 2026-11-01

- **2026-11-01, the factory's signature** (§10). `createHostConfig` takes `{ host, root, parseModule }`:
  `root` is the host's directory and `parseModule` the host's import from `@proofofcalm/content/modules`
  (ADR-0048, Deviations). The current signature and the plugins' order: `packages/config/README.md`.

## Deviations recorded on 2026-11-05

The decision stands; this records how M2's country pages shipped and what `docs/RELEASE.md`'s UK
check became.

- **2026-11-05, the country pages are lazy app screens, not site pages** (Decision, the paragraph on
  M2's public content pages). #329 shipped them behind the `/learn` route (`/learn/countries`,
  `/learn/countries/:code`, lazy screens of §9), not as prerendered site pages, so they are neither
  public nor indexable today. The public, indexable version of the country pages, and whether the
  in-house prerender of §6 suffices for them, is decided in session 23 (public pages,
  `docs/ROADMAP.md`), where the measurement that paragraph asks for is taken; until then the Learn
  modules and the country pages are app screens (`docs/EDUCATION.md` says so for the Learn index).
- **2026-11-05, `docs/RELEASE.md`'s UK check is two checks** (§13, Risks). §13 names "the UK check"
  and Risks "a check from a UK vantage point", one check. Since #345 `docs/RELEASE.md` holds two,
  both from a UK vantage point before launch; it owns what each looks at, and the second measures
  the installed-shell leakage that ADR-0029's Reading of 2026-11-05 accepts.
