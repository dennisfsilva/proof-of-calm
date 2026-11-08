# The host decision of M1: measurements and the plan-B design

> **Note, 2026-10-17 (owner's decision).** Before ADR-0045 merged, the owner chose, for bundle size,
> wouter 3.13.0 instead of React Router 8.4.0, a hand-written service worker registration instead of
> `@serwist/window`, and an own toast in `packages/ui` instead of Base UI's. The measurements and the
> design below are kept as they were recorded; where they say React Router, `@serwist/window` or Base
> UI's toast, the decision is now `docs/ADR/0045-host-vite-spa.md`. §4 lists the departures.

Research date: **2026-10-17**. The evidence behind ADR-0045: what Today's script costs on Next.js and on
Vite with the same product code, and which parts of a Vite host were proven in local prototypes before
the ADR was written. Like the rest of `docs/research/`, this file is history once merged: later
changes go into ADRs, not here.

## 0. Where the evidence lives

- **The measurements** are on the branch `spike/m1-budget` (local to the build machine, never merged,
  not pushed), commits `0ec490a` to `139c998`: the scripts in `tools/spike/` (`measure.ts`, `parts.ts`,
  `lighthouse.ts`, `attribute.ts`), each optimisation as a patch in `tools/spike/variants/`, and one
  JSON file per variant in `tools/spike/results/`. The tables below copy every median from those
  files, so the decision does not depend on the branch surviving.
- **The plan-B design and its prototypes** are on the same branch, commit `b8a7c8d`:
  `tools/spike/plan-b/DESIGN.md` (the design as the design agent returned it), `tools/spike/plan-b/spa/`
  (the bundle variants, the prerender, the worker pipelines) and `tools/spike/plan-b/proto/` (the local
  Vercel emulation, the Build Output config, the function bundle of the real handlers, the browser
  checks). §3 lists what those prototypes verified, §4 where ADR-0045 departs from that design, §5
  condenses the design itself and §6 lists its sources.
- **Lighthouse reports of the design prototype** (three runs on M0's empty Today on Vite) stayed in that
  session's scratchpad; §2 copies their numbers.

## 1. Method

One method for every byte count. `tools/spike/measure.ts` opens the page in a fresh Playwright Chromium
1.64.1, waits until the network has been quiet for 1.5 s after the load event, and adds
`responseBodySize + responseHeadersSize` for every response whose request is a script. That is
Chromium's encoded length, the `transferSize` Lighthouse sums for `resource-summary:script:size`.

- Next builds were served by `next start` behind `tools/serve/brotli-proxy.ts` at brotli quality 3,
  which is how CI's Lighthouse serves them and the quality Vercel serves (ADR-0024 deviations).
- Vite builds were served by `tools/spike/serve-static.ts` at quality 3, with the Next host's asset
  headers and an SPA fallback. Header bytes per script are therefore comparable: 766 to 772 in every
  run, except variant (d4), which trims them to 404 to 406.
- Three runs per variant, median recorded. The three runs gave the same total in every case.
- Calibration on main's build: 162,699 bytes on `/today` and 147,072 on `/`. CI's Lighthouse reported
  162,742 and 147,173 for the same commit. A Lighthouse 12.6.1 run reported the same totals as
  `measure.ts` for both slices (233,903 and 157,405).

**The slice.** `packages/app/src/features/spike-today` built M1's Today at its real size: the domain
store hydrated from an `idb` PlanStore with every row validated by the core's `zod/mini` schemas, a
BroadcastChannel re-hydration, the one tap through `oneTapEntries` and `saveTransaction`, prices
through the api-client, the core's derived views in render, Button, CoinChip, ProgressStrip, Banner,
Toast with Edit and Empty, a header, a tab bar and 47 messages. `tools/spike/seed-check.ts` confirmed it
works with a seeded plan in two tabs on both hosts. The Vite host (`apps/spike-vite`) aliased
`next-intl` to a shim over `use-intl` and `next/link` to React Router's `Link`, so `packages/app` ran
unchanged.

**The optimisations.** (a) messages precompiled with `icu-minify`; (b1) `@serwist/window` registered
after the load event; (b2) registration through the platform API instead; (c) per-route message
subsets; (d1) Base UI's toast parts imported file by file, without the Positioner and floating-ui; (d2)
without the React Compiler (measured, not adopted); (d3) webpack instead of Turbopack; (d4) build
assets with `nosniff` only instead of the eight document headers (an HTTP/1.1 effect of the local
proxy; HPACK removes it behind HTTP/2, so not counted).

## 2. Results

### Next.js 16.4.2 (Turbopack unless noted)

| Result file | Variant | `/today` | `/` |
|---|---|---:|---:|
| `next-0-main-baseline` | main, M0's empty Today | 162,699 | 147,072 |
| `next-1-slice` | the M1 Today slice | 233,903 | 147,072 |
| `next-1b-slice-client-stubs` | the slice, other routes as client stubs | 237,242 | 147,166 |
| `next-2-slice-full-catalogue` | the slice with a 500-string catalogue | 245,914 | |
| `next-3a-precompile` | (a) | 223,654 | |
| `next-3b1-sw-after-load` | (b1) | 234,515 | |
| `next-3b2-sw-platform-api` | (b2) | 232,091 | |
| `next-3c-route-messages` | (c) | 233,964 | |
| `next-3c-route-messages-full-catalogue` | (c), 500 strings | 233,964 | |
| `next-3d1-lean-toast` | (d1) | 222,007 | |
| `next-3d2-no-react-compiler` | (d2) | 231,068 | 147,072 |
| `next-3d3-webpack` | (d3) | 212,285 | 155,905 |
| `next-3d4-asset-headers` | (d4) | 230,253 | |
| `next-4-all-together` | (a) + (b2) + (c) + (d1) | 209,696 | 147,072 |
| `next-4b-all-together-webpack` | the same with webpack | 203,398 | 145,610 |

The framework floor is the empty `/`: 145,610 bytes with webpack (the figure issue #33 quotes) and
147,072 with Turbopack. Against the 163,840-byte budget, the webpack floor leaves 18,230 bytes for a
screen that needs 57,788 after every optimisation (203,398 less 145,610); with Turbopack, 16,768 for
62,624.

### Vite 8.3.4, React 19.3.1, React Router 8.4.0 (and wouter 3.13.0 where named)

Rows (a) to (d1) and the combinations use React Router in declarative mode. Wouter was measured on the
floor and on the plain slice only; the combination with wouter was not measured.

| Result file | Variant | Bytes |
|---|---|---:|
| `vite-0d-floor-react-only` | React and the holding page, no router | 70,594 |
| `vite-0c-floor-wouter` | floor with wouter 3.13.0 | 73,106 |
| `vite-0-floor-declarative` | floor, React Router declarative mode | 84,528 |
| `vite-0b-floor-data` | floor, React Router data mode | 101,670 |
| `vite-1-slice-declarative` | the slice, declarative | 157,405 |
| `vite-1b-slice-data` | the slice, data mode | 174,844 |
| `vite-1c-slice-wouter` | the slice, wouter | 146,290 |
| `vite-1d-slice-full-catalogue` | the slice, 500 strings | 169,635 |
| `vite-2a-precompile` | (a) | 148,378 |
| `vite-2a2-precompile-full-catalogue` | (a), 500 strings | 160,667 |
| `vite-2b2-sw-platform` | (b2) | 155,652 |
| `vite-2c-route-messages` | (c) | 157,602 |
| `vite-2d1-lean-toast` | (d1) | 145,487 |
| `vite-3-all-together` | (a) + (b2) + (c) + (d1) | **134,779** |
| `vite-3b-all-together-full-catalogue` | the same, 500 strings | 134,780 |

### Where the slice's bytes go

`tools/spike/results/parts.json`: the slice's own code bundled alone with esbuild 0.28.2 (React and Next
external), brotli quality 3. Whole slice 72,422 bytes; Base UI's toast and button with floating-ui
27,224; `zod/mini` 9,884; the core's functions 8,644; app code 6,919; UI components 3,482; big.js
3,114; lucide icons 2,404; idb 1,420; Zustand 350. Outside the slice chunk: next-intl's client runtime
13,220 (3,817 with precompiled messages), `SerwistProvider` 2,454, the merged message catalogue 1,572.

### Lighthouse 12.6.1

| Run | Script bytes | Performance | LCP | TBT |
|---|---:|---:|---:|---:|
| Next, the plain slice (`lighthouse-next-slice.json`) | 233,903 | 0.90 | 3,240 ms | 196 ms |
| Vite, the plain slice (`lighthouse-vite-slice.json`) | 157,405 | 0.95 | 2,255 ms | 152 ms |
| Vite, M0's empty Today, design prototype, run 1 | 89,595 | 1.00 | 1,505 ms | 0 ms |
| the same, run 2 | 89,595 | 1.00 | 1,504 ms | 0 ms |
| the same, run 3 | 89,595 | 1.00 | 1,504 ms | 0 ms |

The last three rows are the empty M0 page (declarative router, precompiled messages,
`@serwist/window`), served through the prototype's local Vercel server; they are not the M1 slice.

## 3. What the plan-B prototypes verified

Locally, in Chromium and WebKit, on 2026-10-17 (`tools/spike/plan-b/`):

- **CSP.** A static header with no nonce. Both `script-src 'self' 'sha256-<theme>'` and the strict form
  `script-src 'self' 'sha256-<theme>' 'sha256-<boot>' 'strict-dynamic'` loaded the shell, a lazy route,
  the worker, a legal page and the GB page with zero violations. The strict form needs a boot script
  that creates the module script element; a boot that calls `import()` from an inline hashed module was
  blocked in Chromium and allowed in WebKit. The prototype's boot script contained the hashed entry URL,
  so its hash changed with every build.
- **Fixed-text boot (added for ADR-0045, same day).** A boot script whose text never changes and which
  reads the entry URL from its own `data-entry` attribute (`document.currentScript.dataset.entry`) ran
  under the strict form in both engines with two different entry file names and the same policy; the
  entry, a script-inserted `modulepreload` and a lazy `import()` all loaded, and only a deliberately
  unhashed inline control script was refused. A hash covers the script's text, not its attributes.
- **Theme before paint.** The inline hashed theme script set `data-theme` from a stored `light` value
  against a dark system preference before any app code ran.
- **The 451 page from a static route** with `status` and `dest`, its hashed style raising no violation.
- **Site pages** rendered with `renderToStaticMarkup` from a `vite build --ssr` entry: zero scripts,
  zero violations, the stylesheet and font preload copied from the SPA's document.
- **The API.** esbuild bundled the real handlers (158 modules into one 261 KB `index.mjs`, platform
  node, condition `react-server` so `server-only` resolved to its empty module); behind the local server
  they answered 400, 204 (preflight from `capacitor://localhost`), 404 and 405 as the e2e suite expects.
- **The worker.** esbuild bundled the worker, then `@serwist/build` `injectManifest` ran after the
  prerender ("precache: 7 entries, 325223 bytes; warnings: none"). After one online visit and a reload
  the worker controlled the page; offline, `/today` and `/settings` answered from the shell and an
  unknown document with the offline page. `@serwist/vite` 9.5.13 also built under Vite 8 but injects
  its manifest inside the client build, before the prerendered pages exist.
- **Fonts.** A `transformIndexHtml` plugin found the hashed text font in the bundle and added its
  preload. next/font's Arial fallback values, recomputed with Next 16.4.2's own function on
  `calm-sans-latin.woff2`: ascent-override 101.35 %, descent-override 27.19 %, line-gap-override 0 %,
  size-adjust 101.13 %.
- **The React Compiler** ran in the Vite builds through `@rolldown/plugin-babel` (the compiler's memo
  sentinel is in the output).
- **Local Vercel emulation.** `proto/vercel-local.mjs` served the routes, headers, the GB 451, the API
  dispatch and quality-3 compression; WebKit needed `upgrade-insecure-requests` removed over plain
  http.

Not verifiable locally, and therefore on the switch's preview checklist in ADR-0045: how Vercel itself
orders the build and the function tracing, serves `routes` with `status`, answers unknown paths with
`404.html`, and applies `vercel.json` headers to every response.

## 4. Where ADR-0045 departs from the plan-B design

| Plan-B design (`DESIGN.md`) | ADR-0045 | Why |
|---|---|---|
| Build Output API v3: the build writes `.vercel/output/config.json` with every route and header | Zero-config `vercel.json` with framework `vite`, committed and tested against the code; Build Output API v3 is the fallback | The routing, headers and UK rule stay in one reviewable committed file that Vercel's documented `vercel.json` features read; the design's objection to zero-config `api/` (file-by-file transpiling) does not apply when the `api/` file only re-exports an esbuild bundle |
| One function, `api`, dispatching on the path, with the classic `(req, res)` export | One function, `api/index.mjs`, dispatching on the path, with the `fetch` export | The handlers already take a `Request` and return a `Response`; Vercel documents the `fetch` export for functions without a framework |
| Strict CSP with a boot hash generated per build | Strict CSP with a fixed-text boot script, so its hash is stable and `vercel.json` can be committed | Keeps `'strict-dynamic'` and ADR-0032's compensating control without generating the configuration |
| Vercel Runtime Cache for the cross-instance price copy | Kept, behind a small port, with the Upstash store as the last good copy | Keeps ADR-0006's bound with no owner action |
| `@serwist/window` for registration | A hand-written registration with ADR-0033's update flow (owner, 2026-10-17) | 1,753 bytes less on the Vite slice; Serwist's worker answers the skip-waiting message itself |
| `react-router` 8.4.0, declarative (`BrowserRouter`; `HashRouter` as the wrapper's option) | wouter 3.13.0 behind `lib/navigation`, hash location in `apps/mobile` (owner, 2026-10-17) | 11,422 bytes less on the floor (73,106 against 84,528), 11,115 on the slice (146,290 against 157,405) |
| M0's Base UI toast, unchanged | An own toast in `packages/ui`: one at a time, one action, a polite live region, the 8-second undo window (owner, 2026-10-17) | Base UI's toast namespace brings its Positioner, Arrow and floating-ui to Today; removing those alone saved 11,918 bytes on the Vite slice (variant d1) and 11,896 on Next. The own toast's net change, with the rest of Base UI's toast gone and its own code added, is measured in its pull request |
| (not covered) | M2's public content pages keep the in-house prerender as the default, decided in M2 with measurements | Owner, 2026-10-17 |

## 5. The plan-B design in substance

`tools/spike/plan-b/DESIGN.md` (565 lines, commit `b8a7c8d`, every source accessed 2026-10-17) as the
design agent wrote it, condensed here so the evidence does not depend on the spike branch. Its claims
were tagged **verified** (reproduced in a scratch build), **docs**, **source** (read in the vendor's
code) or **first preview** (only observable on a real Vercel deployment). The design is history: where
ADR-0045 decides otherwise, §4 and the ADR win.

### 5.1 Its own bundle measurements

Measured before the spike's slice existed, as brotli quality 3 of the built chunk (no response
headers) unless noted; the spike's §2 numbers, measured with headers, supersede them.

| Build | Script bytes | Requests | Method |
|---|---:|---:|---|
| Next 16.4.2 holding page `/` | 147,173 | 7 | local Lighthouse CI on main (brotli proxy) |
| Next 16.4.2 empty Today | 162,742 | 9 | same |
| Vite 8.3.4, `react` 19.3.1 and `react-dom` only | 69,391 | 1 | brotli q3 of the chunk (verified) |
| + `react-router` 8.4.0, declarative | 83,104 | 1 | same |
| + `react-router` 8.4.0, data mode | 100,303 | 1 | same |
| M0 Today: declarative router, `use-intl` with runtime ICU, `Empty`, `@serwist/window` | 98,042 | 1 | same |
| the same with precompiled messages | 88,929 | 1 | same |
| the same through the local server, headers included | 89,595 | 1 | Lighthouse CI, three runs: performance 1.00, TBT 0 ms |
| the same with a hand-written registration instead of `@serwist/window` | 87,737 | 1 | brotli q3 |
| M1-like Today: core plan, status, totals, strip, portfolio, one tap with their `zod/mini` schemas, big.js, Zustand, idb, one Base UI button | 110,319 | 1 | same |

Unit costs it derived at quality 3: declarative router 13.7 KB (data mode 30.9 KB), runtime ICU 9.1 KB
over precompiled (a 9,113-byte saving), `@serwist/window` 1.2 KB (1,192 bytes over a hand-written
registration), the module-preload polyfill 0.34 KB. Its conclusion: an M1-like Today would weigh about
184 KB on Next and about 111 KB on plan B, leaving about 52 KB for M1's screen code.

### 5.2 Mechanisms, by question

- **Vercel configuration (Q1).** `vercel.json` overrides the dashboard's `framework`, `buildCommand`,
  `outputDirectory`, `installCommand`, `devCommand` and `ignoreCommand` (docs), so no dashboard change.
  The design wrote `.vercel/output` itself with the Build Output API v3: if `config.json` exists after
  the build, Vercel's static builder stops processing and deploys it unchanged (source:
  `static-build/src/index.ts`, `utils/build-output-v3.ts`). It rejected zero-config `api/` because
  Vercel's Node builder transpiles each `.ts` file alone with `module: NodeNext` and renames it to
  `.js` (source: `packages/node/src/build.ts`, `typescript.ts`), which breaks extensionless ESM
  imports, workspace packages that export `./src/index.ts`, and `server-only` (whose default entry
  throws). Routing in `config.json`: `{ "handle": "filesystem" }` first, then `^/api(?:/.*)?$` to the
  function, then only the app-route allowlist to the shell, then the error phase with `/404.html`.
  Region per function in `.vc-config.json` (`"regions": ["fra1"]`); clean URLs through `overrides`
  (`"terms.html": { "path": "terms" }`); a trailing-slash 308.
- **The API (Q2).** One function from `apps/web/server/api.ts` (a `handle(request)` that routes
  `/api/prices` GET and OPTIONS and `/api/csp-report` POST to the existing pure handlers; 404 and 405
  with `Allow` and `no-store` otherwise) and a classic `(req, res)` adapter. esbuild with `bundle`,
  `platform: 'node'`, `format: 'esm'`, `target: 'node24'`, `conditions: ['react-server']` into
  `functions/api.func/index.mjs`, with `.vc-config.json` `{"runtime":"nodejs24.x","handler":"index.mjs",
  "launcherType":"Nodejs","shouldAddHelpers":false,"supportsResponseStreaming":false,"maxDuration":10,
  "regions":["fra1"]}`. Verified: 158 modules into one 261 KB file, `server-only` resolved to its empty
  module, the handlers answered 400, 204, 405 and 204. One shared function, as Vercel advises; module
  state per instance, shared by concurrent invocations under Fluid compute (on by default for projects
  created after 2025-04-23); environment read per call. The Edge runtime is deprecated for middleware
  (source: the builder's "uses the deprecated 'edge' runtime" warning).
- **ADR-0036's three caches.** CDN unchanged (`s-maxage=600, stale-while-revalidate=1800`, cached per
  region; function `Cache-Control` overrides route headers). Next's Data Cache replaced by Vercel's
  Runtime Cache (`getCache()` from `@vercel/functions` 3.10.1): regional, persists across
  deployments, a TTL, all plans, charged per use, shared by all projects of a Hobby team; outside
  Vercel it falls back to memory with "Runtime Cache unavailable in this environment. Falling back to
  in-memory cache." (package source, verified). The per-instance copy, the in-flight sharing and the
  optional Upstash last good copy unchanged.
- **Headers and CSP (Q3).** Generated from `lib/security/headers.ts` and a static
  `buildCsp({ https, scriptHashes, styleHashes })`; `createNonce()` deleted. Route headers collect in
  order with set semantics (source: the dev router's `combinedHeaders[lowerKey] = value`). Every
  response carries the security headers, only documents the CSP and `Reporting-Endpoints`. Two
  policies verified in Chromium and WebKit: A, `script-src 'self' 'sha256-<theme>'` (zero violations;
  an allowlist, which web.dev says "can be bypassed in most configurations"), and B, recommended,
  `script-src 'self' 'sha256-<theme>' 'sha256-<boot>' 'strict-dynamic'` with an about-140-byte boot
  script that creates the module script element (an `import()` boot was blocked in Chromium as a
  `script-src-elem` violation and allowed in WebKit). Its boot hash changed per build, so the build
  hashed the inline scripts it found and failed on a mismatch with `THEME_BEFORE_PAINT`.
  `style-src 'self' 'sha256-<not-available style>'`; React style props go through the CSSOM, which
  CSP does not govern; `build.assetsInlineLimit: 0`; `upgrade-insecure-requests` removed only by the
  local server over plain http (WebKit otherwise failed every subresource with "SSL connect error").
  If a JS `modulepreload` ever trips the policy, `build.modulePreload.resolveDependencies` can drop
  it. Theme before paint: an inline hashed script reading one `localStorage` key mirrored by Settings;
  an external `/theme.js` was rejected for its request and about 0.7 KB of headers against the budget.
- **The UK block (Q4).** A static route with `has: x-vercel-ip-country = GB`, `status: 451`,
  `dest: /not-available.html`, its own headers and `Cache-Control: no-store`, and `caseSensitive: true`
  so the exemptions are exact (`/TERMS` is blocked). `status` plus `dest` to a static file is
  Vercel's own pattern in its framework presets (source: `frameworks.ts`); routing runs "before
  checking any cache" (docs). The shell rewrite is an allowlist, so no exempt path leads a GB visitor
  to the shell; `isBlockedCountry` and `isExemptPath` become the oracle of a decision table and a
  fast-check property. A probe route with the same behaviour on an `x-proof-of-calm-probe` header makes
  the 451 path testable from outside the UK. The middleware alternative: `middleware.ts` at the project
  root or `vercel.json` `proxy`, `runtime: 'nodejs'` set explicitly because the builder still defaults
  some projects to Edge, `next()` from `@vercel/functions` to continue (it sets `x-middleware-next: 1`),
  run before the cache on every matched request. An installed PWA keeps serving its cached shell in the
  UK, as M0's precached `/today` already did.
- **The service worker (Q5).** `@serwist/vite` 9.5.13 works under Vite 8.3.4 but injects its manifest
  in `closeBundle` through a nested `vite.build()`, before the prerender, and its `defaultCache`
  depends on `import.meta.env.DEV`. Chosen: esbuild (`iife`, minified), then `@serwist/build`
  `injectManifest` after the prerender, which "will not compile or bundle your `swSrc` file" (docs);
  verified with 7 entries, control after a reload, offline `/today` and `/settings` from the shell and
  `/terms` (never visited) and `/nowhere` on the offline page. Worker options: `cleanupOutdatedCaches`,
  `navigateFallback` with an allowlist of app routes, `skipWaiting: false`, `clientsClaim: true`,
  `navigationPreload: true`; prices stale-while-revalidate, documents network-first, `/~offline` as
  the fallback. Serwist 9.5.13 names the method `createHandlerBoundToUrl`; the misspelt `…URL` made the
  worker fail to evaluate (verified). Registration through `@serwist/window` (`waiting`, then
  `messageSkipWaiting()` and a reload on `controlling`); replaced by a hand-written registration (§4).
  A kill-switch worker at `/serwist/sw.js` retires M0's worker until launch.
- **Site pages (Q6).** A `vite build --ssr` entry rendered with `renderToStaticMarkup` and
  `createTranslator` from `use-intl/core`; the pages copy the stylesheet and the sans preload from the
  built shell (Vite's manifest lists both, verified); `<script>` count 0 and zero violations in both
  engines; `use-intl` is external in the SSR build and costs the client nothing.
- **Fonts (Q7).** next/font's Arial fallback recomputed with Next 16.4.2's own
  `getFallbackMetricsFromFontFile` on `calm-sans-latin.woff2` (ascent 1025, descent −275, lineGap 0,
  unitsPerEm 1000): ascent-override 101.35 %, descent-override 27.19 %, line-gap-override 0 %,
  size-adjust 101.13 %. A `transformIndexHtml` plugin finds the hashed font by `originalFileNames` and
  adds the preload (verified under Vite 8 and Rolldown). A unit test pins the font file's SHA-256 next
  to the four values.
- **i18n (Q8).** `use-intl` 4.14.9 with `IntlProvider`, `useTranslations`, `createTranslator`; the
  `AppConfig` augmentation moves to `use-intl`. next-intl's plugin aliases `use-intl/format-message` to
  `…/format-only` and its catalog loader emits `icu-minify/compile` output (source:
  `plugin/getNextConfig.js`, `extractor/catalogLoader.js`); the design's Vite plugin does the same for
  the client environment and returns `moduleType: 'js'` (needed under Vite 8, verified). A test formats
  every key through both paths.
- **The router (Q9).** `react-router` 8.4.0 (2026-09-15): React 19.2.7 or newer, Node 22.22 or newer,
  ESM only, no `react-router-dom`, dependencies `cookie-es` ^3.1.1 and `@remix-run/route-pattern`
  ^0.22.1. Declarative mode per the "local first" advice of the modes page; screens other than Today
  through `React.lazy`, with React Router's transitions keeping the previous screen up (verified: the
  lazy chunk loads under the strict CSP and from the precache); no `ScrollRestoration` in declarative
  mode, so the shell scrolls to the top. Adapter in `lib/navigation`: `RouterRoot`, `MemoryRouterRoot`,
  `Link`, `NavLink` with `aria-current`, `useRouter`, `usePathname`, and a dependency-cruiser rule. Its
  risk table named `HashRouter` as the wrapper's one-file switch. Replaced by wouter (§4).
- **apps/mobile (Q10).** A second Vite static build without the service worker, with an absolute API
  base; `export-build` checks a module script and stylesheet that exist, no `sw.js` and no
  `serviceWorker.register`, `https://proofofcalm.com/api` in the bundle, and the secret scan.
- **Local server, tests and CI (Q11).** `tools/serve/vercel-local.ts` interprets the generated routes
  (PCRE `src`, `has`, set-semantics headers, `continue`, `status`, `dest`, the filesystem and error
  phases), imports the same function bundle Vercel runs, compresses at quality 3 and prints
  `Ready on`; Lighthouse measured 89,595 bytes through it. `tools/deploy-check/check.ts` asserts one
  route and header contract against the local server and each deployment (headers once on `/today`,
  every inline script hashed with `strict-dynamic` and no `unsafe-*`, immutable assets without CSP,
  `/terms` 200 without script and `/terms/` 308, the API's 400, 204 and 405, the probe's 451, `/nowhere`
  404, both worker URLs 200, `x-vercel-id` naming `fra1`), sending the bypass header only to
  `*.vercel.app`. Job names unchanged.
- **Storybook and the rest of Next (Q12).** `@storybook/react-vite` 10.6.2 (already in the lockfile);
  leaving: `@next/eslint-plugin-next`, `next typegen`, knip's Next plugin (explicit entries instead),
  `@serwist/turbopack`, `@tailwindcss/postcss` and `@tailwindcss/turbopack`, `next-env.d.ts`, the
  release-age exemptions for `next`, the osv entry for `braces`, and `@sentry/nextjs` (M3 chooses).
- **Owner (Q13).** No action: `vercel.json` overrides the preset; variables, region, protection and the
  bypass secret unchanged; rollback by revert or Instant Rollback.
- **Risks and sequence (Q14).** Its risks: Vercel's routing differing from the emulation (checked on
  the cut-over preview), the launcher rejecting the bundle, Runtime Cache eviction, hash drift, the old
  worker, GB path variations, baseline changes, router or precompile changes (adapter isolation), the
  dev server without headers, and removing `framework: null` (fails loudly). Its sequence of ten pull
  requests: the ADR; `use-intl`; Storybook; the local server and checks; the Vite host built beside
  Next in a temporary `apps/web-vite`; the cut-over; the mobile host; removing Next; precompiled
  messages; optionally lowering the gate to 153,600 bytes.
- **Dependencies (Q15).** `react-router` 8.4.0, `use-intl` and `icu-minify` 4.14.9, `@vitejs/plugin-react`
  6.1.2, `@rolldown/plugin-babel` 0.2.4, `@babel/core` 7.29.7, `@serwist/build` 9.5.13,
  `@vercel/functions` 3.10.1 with `@vercel/oidc` 4.0.1, `@storybook/react-vite` 10.6.2; transitive
  packages checked against the cutoff: `zod` 4.6.5, `glob` 13.0.6, `type-fest` 5.10.0, `source-map`
  0.8.0, `@serwist/utils` 9.5.13, `@remix-run/route-pattern` 0.22.1, `cookie-es` 3.1.1, `picomatch`
  4.0.7.

### 5.3 Where the prototypes are

On `spike/m1-budget` at commit `b8a7c8d`, under `tools/spike/plan-b/`: bundle variants
`spa/src/variants/` with `spa/measure.mjs`; prerender and font preload `spa/prerender.mjs` and
`spa/vite.site.config.ts`; worker pipelines `spa/build-sw.mjs` with `spa/src/sw-plain.ts`, and the
`@serwist/vite` check `spa/vite.sw.config.ts`; the local Vercel server `proto/vercel-local.mjs`,
`proto/make-config.mjs`, `proto/api.mjs`; browser checks `proto/browser-check.mjs` and
`proto/offline-check.mjs`; the strict variants `proto/make-strict.mjs` (the `import()` boot that fails
in Chromium) and `proto/make-strict2.mjs` (the created-element boot that passes); the function bundle
`proto/api-entry.ts` and `spa/bundle-api.mjs`. The design's Lighthouse reports stayed in its session's
scratchpad; their numbers are in §2 and §5.1.

## 6. Sources

The design's and the spike's, all accessed 2026-10-17.

- **Vercel docs:** https://vercel.com/docs/project-configuration,
  https://vercel.com/docs/project-configuration/vercel-json, https://vercel.com/docs/builds/configure-a-build,
  https://vercel.com/docs/frameworks/frontend/vite, https://vercel.com/docs/functions/runtimes/node-js,
  https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration,
  https://vercel.com/docs/functions/functions-api-reference,
  https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package,
  https://vercel.com/docs/functions/configuring-functions/advanced-configuration,
  https://vercel.com/docs/caching/runtime-cache, https://vercel.com/docs/caching/cdn-cache,
  https://vercel.com/docs/fluid-compute, https://vercel.com/docs/routing,
  https://vercel.com/docs/routing-middleware, https://vercel.com/docs/routing-middleware/api,
  https://vercel.com/docs/headers/request-headers, https://vercel.com/docs/how-vercel-cdn-works/compression,
  https://vercel.com/docs/build-output-api, https://vercel.com/docs/build-output-api/configuration,
  https://vercel.com/docs/build-output-api/primitives.
- **Vercel source** (github.com/vercel/vercel, `main`): `packages/static-build/src/index.ts`,
  `packages/static-build/src/utils/build-output-v3.ts`, `packages/node/src/build.ts`,
  `packages/node/src/typescript.ts`, `packages/node/src/utils.ts`,
  `packages/routing-utils/src/index.ts`, `merge.ts`, `superstatic.ts`,
  `packages/cli/src/util/dev/router.ts`, `packages/frameworks/src/frameworks.ts`.
- **Vercel community:** https://community.vercel.com/t/express-hosting-on-vercel/26305,
  https://community.vercel.com/t/i-cant-seem-to-import-local-modules/1270.
- **Vite:** https://vite.dev/guide/features, https://vite.dev/guide/ssr, https://vite.dev/guide/build,
  https://vite.dev/config/build-options, https://www.npmjs.com/package/@vitejs/plugin-react.
- **React Router:** https://reactrouter.com/start/modes, https://reactrouter.com/upgrading/v7,
  https://reactrouter.com/start/data/route-object, https://reactrouter.com/start/declarative/navigating,
  https://reactrouter.com/explanation/react-transitions,
  https://github.com/remix-run/react-router/blob/main/CHANGELOG.md.
- **wouter** (for the owner's decision): https://github.com/molefrog/wouter (README),
  https://registry.npmjs.org/wouter.
- **next-intl and use-intl:** https://next-intl.dev/docs/environments/core-library,
  https://next-intl.dev/blog/precompilation, https://www.npmjs.com/package/icu-minify,
  https://www.npmjs.com/package/use-intl, https://github.com/amannn/next-intl (4.14.9's
  `plugin/getNextConfig.js` and `extractor/catalogLoader.js`).
- **Serwist:** https://serwist.pages.dev/docs/vite, https://serwist.pages.dev/docs/vite/getting-started,
  https://serwist.pages.dev/docs/build/inject-manifest, https://serwist.pages.dev/docs/window.
- **Other:** https://storybook.js.org/docs/get-started/frameworks/react-vite,
  https://storybook.js.org/docs/writing-tests/integrations/vitest-addon,
  https://knip.dev/reference/plugins/vite, https://web.dev/articles/strict-csp,
  https://capacitorjs.com/docs/config, https://vite-pwa-org.netlify.app/guide/register-service-worker.html.
- **Registry:** https://registry.npmjs.org/ for every version and date named here and in ADR-0045.
