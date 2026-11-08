# Proof of Calm front-end stack: validation and pins

Research date: **2026-10-16**. Scope: validate and pin the front-end stack for Proof of Calm (calm, offline-first crypto DCA planner; Next.js App Router + TypeScript strict + Tailwind + shadcn/ui on our own OKLCH tokens; Supabase EU; Vercel; pnpm + Turborepo; pure-TS `packages/core`; installable PWA first, Capacitor wrapper at milestone 3; i18n en / pt-PT / de; 150 kB first-load JS budget on Today; Lighthouse 95+ mobile).

## 0. Method and provenance

- **Context7**: `mcp__context7__resolve-library-id` returned *"Monthly quota exceeded"* for every library except Dexie (`/websites/dexie`) and Zustand (`/pmndrs/zustand`); for those two `mcp__context7__query-docs` returned *"Rate limit exceeded. Please try again in 3174 seconds."* **Context7 therefore contributed no documentation content today.** Every library below was read from its official documentation (or official GitHub/npm pages) via WebFetch, as the brief prescribes for a Context7 failure. The per-library status is repeated in each topic.
- **Versions and release dates** come from the npm registry (`npm view <pkg> dist-tags time --json`, run locally on 2026-10-16), not from memory. Release-post dates come from the vendors' blogs.
- **WebSearch** was used twice (Next.js/React version sanity checks) and then the session's shared search budget was exhausted; no third-party search was used after that. Items that could not be confirmed from a primary source today are marked **[unverified today]**.
- **Measurements** (all reproducible; scripts live in the scratchpad of this session):
  - Minimal Next.js App Router page: `pnpm dlx create-next-app@latest` (resolved to next **16.4.1**, react 19.3.0, Tailwind 4 via `@tailwindcss/turbopack`), `next build` with Turbopack, sizes computed from the `<script>` tags of the prerendered `index.html`, gzip level 9 and brotli via Node 24 `zlib`. The `noModule` polyfill chunk (110 kB raw / 38.6 kB gz) is excluded because modern browsers never download it.
  - Library sizes: esbuild 0.28.2, `bundle + minify + treeShaking`, `platform: browser`, `target: es2022`, `NODE_ENV=production`, React/Next externalised where noted (`[react external]`), gzip level 9 + brotli. These are *realistic-import* sizes, not "whole package" sizes.
  - Fonts: Latin-subset variable woff2 files served by Google Fonts (Chrome UA) and upstream builds from npm/GitHub, inspected with fontTools 4.x (GSUB feature tags, `fvar` axes, digit advance widths, `name` ID 13 licence string).
- All URLs listed under "Sources" were accessed on 2026-10-16.

### Executive summary (one line per topic)

| # | Topic | Recommendation |
|---|---|---|
| 1 | Next.js | **16.4.2**. Two thin Next apps over shared packages (`apps/web` full, `apps/mobile` static export at M3); API route handlers only in `apps/web`; `cacheComponents` **off** in both (export mode rejects it). Hello-world floor measured at **132 kB gzip / 113 kB brotli**. |
| 2 | React | **19.3.1**; use Actions/`useOptimistic`/`use`, `browser()` for IndexedDB-only components; React Compiler 1.0 on from day one (`reactCompiler: true`). |
| 3 | PWA | **Serwist 9.5.13** via `@serwist/turbopack` route handler; `skipWaiting:false` + "update available" prompt; prices live in Dexie with `fetchedAt`, SW cache is secondary; no SW inside Capacitor. |
| 4 | Capacitor | **8.5.3**, deferred to M3 but five "packaging-step" rules enforced now (static-export-safe screens, one API client with base URL, bearer tokens not cookies, OTP-code login, no `window.location`/SW assumptions). |
| 5 | UI toolkit | **Tailwind 4.3.3 + shadcn CLI 4.22.0 on Base UI 1.9.0**; tokens in `packages/ui/src/styles/tokens.css`, `@custom-variant dark` on `data-theme`; `tw-animate-css`. |
| 6 | State/persistence | **Dexie 4.4.6 + dexie-react-hooks 4.4.0** (+ lazy `dexie-export-import 4.4.1`), **Zustand 5.0.15** for ephemeral UI state only; in-house outbox/LWW sync with opaque payloads. |
| 7 | Charts | **Custom SVG** in `packages/ui/charts` (no chart library on the critical path); `lightweight-charts 5.2.1` lazy-loaded only if an interactive chart is ever needed. |
| 8 | i18n | **next-intl 4.14.9** in client-provider mode; `createFormatter({ locale: countryLocale })` from `use-intl/core` for numbers/dates by country. |
| 9 | Forms | **zod 4.6.7 via `zod/mini`** (5 kB gz) in `packages/core`; no form library at first (React 19 Actions + controlled inputs); TanStack Form 1.33.5 as the escape hatch; `type="text" inputmode="decimal"` + locale-aware parsing. |
| 10 | Decimal | **big.js 7.0.1** (2.9 kB gz) behind a `packages/core/money` wrapper with an exact-division helper; strings in storage; `Intl.NumberFormat.format(string)` at the edge. |
| 11 | Dates | **In-house `CalendarDate` over `YYYY-MM-DD`** in `packages/core` + `Intl.DateTimeFormat` for output; Temporal not shippable (Safari has none); date-fns 4.4.0 only as a test oracle. |
| 12 | Testing | **Vitest 5.0.5** (projects, v8 coverage 100% on core, browser mode via Playwright for stories), **fast-check 4.10.2**, **Playwright 1.64.1** (projects per viewport, snapshots in the pinned Docker image), **Storybook 10.6.2** (`nextjs-vite`, addon-vitest, addon-a11y), **@lhci/cli 0.15.1** with assertions (budgets.json is dead). |
| 13 | Lint/format | **Biome 2.5.15** (format + lint + `noRestrictedImports` layer rules) + minimal ESLint 10 (`eslint-plugin-react-hooks` 7.1.1 compiler rules, `@next/eslint-plugin-next`) + **dependency-cruiser 18.6.0** in CI for the layer graph + **knip 6.41.0**. |
| 14 | Monorepo | **pnpm 12.14.0** (`catalog:`, `minimumReleaseAge: 1440`, `trustPolicy`), **Turborepo 2.11.8**, **TypeScript 6.0.3 now** (7.0.2 has no JS API; typescript-eslint/knip need `<6.1`), source `exports`, no build step for packages. |
| 15 | Fonts | All nine candidates are OFL and usable with `next/font/local`; seven expose `tnum`, IBM Plex Sans and Source Sans 3 are tabular *by default*; Latin variable woff2 ranges 20 kB (Figtree) to 48 kB (Inter). |
| 16 | Budget | 150 kB total first-load JS is **below the framework floor** (113 kB brotli / 132 kB gzip for an empty page). Realistic Today: ~180 kB brotli with Dexie + next-intl; propose a redefined budget (see Disagreements). |

---

## 1. Next.js

**Context7:** quota exceeded; read nextjs.org docs and blog directly.

### Current version

- Latest stable: **16.4.2** (npm `latest`, published 2026-10-15). 16.4.1 (2026-10-14) is the out-of-band security release (Critical: RCE in `use cache` functions returning multiple typed arrays, GHSA-673q-mjm6-r5xr; Critical: RCE in Image Optimization with SVG through `sharp`, CVE-2026-96889, fixed by `sharp >= 0.35.5`; High: DoS through Server Actions). 16.4.0 shipped 2026-10-06; 16.0.0 on 2025-10-21/22. 15.x is Maintenance LTS at 15.5.28; secondary sources put its end of maintenance at 2026-10-21 [secondary].
- Next 16.4 peer range: `react ^18.2.0 || ^19.0.0`, `@playwright/test ^1.51.1` (optional), `babel-plugin-react-compiler *` (optional); engines `node >= 20.9.0`.

### What changed in 16.x that we rely on

- **Turbopack is the default bundler for `next dev` and `next build`** (stable since 16.0; opt out with `--webpack`). Webpack *plugins* are not supported, webpack *loaders* are (`turbopack.rules`). Build filesystem cache is on by default; `turbopackSharedRuntime`, export-name mangling and shorter CSS-module class names (16.4) shrink output. `import.meta.glob` and `import.meta.env` exist (Turbopack only).
- **Cache Components** (`cacheComponents: true`) with `'use cache'` stabilised in 16.0; 16.4 declares it "the best choice for every Next.js app", `create-next-app` now enables `cacheComponents` and `partialPrefetching`, and the build prints: *"Both Cache Components and Partial Prefetching will be enabled everywhere in the next major release, and the old configurations will be removed."* 16.4 adds `ensureStatic`, `navigation()` / `prefetch()`.
- **`proxy.ts` replaces `middleware.ts`** (16.0; `middleware` is deprecated; codemod `middleware-to-proxy`). Proxy runs on Node.js, cannot set `runtime`, and is **not supported in static export**. Proof of Calm does not need it (auth is client-side with Supabase; API routes verify bearer tokens).
- **Caching semantics (16.4 docs)**: `fetch` default is *"auto no cache"*: fetched on every request in development and once during `next build` when the route is statically prerendered; `cache: 'force-cache'` is opt-in; `next.revalidate` / `next.tags` as before. `'use cache'` requires `cacheComponents`; default `cacheLife` profile is stale 5 min (client), revalidate 15 min, never expires; the client router enforces a minimum 30 s stale time; `revalidateTag(tag, profile)` now needs a profile (`'max'` recommended), `updateTag()` and `refresh()` are Server-Action-only. **`use cache` platform support: Static export = No.** `manifest.ts` is "a special Route Handler that is cached by default".
- **React Compiler**: `reactCompiler: true` is a stable top-level option since 16.0 (needs `babel-plugin-react-compiler`, Next only runs it on files with JSX/hooks); `compilationMode: 'annotation'` for opt-in; 16.4 adds the experimental Rust compiler (`experimental.turbopackRustReactCompiler: true`).
- **`next lint` removed** in 16.0 (use ESLint CLI or Biome; `eslint-config-next` is flat-config, ESLint 9 and 10, `core-web-vitals` and `typescript` variants; 16.4 adds ESLint 10 React version detection).
- **`next/font/local`**: `src` (string or array with weight/style), `weight: '100 900'` for variable fonts, `display` (default `swap`), `preload` (default true, per route where used), `fallback`, `adjustFontFallback` (`'Arial'` default for local fonts, or `false`), `variable: '--font-x'`, `declarations`. Tailwind v4 wiring is `@theme inline { --font-sans: var(--font-x); }`. Fonts are self-hosted into `_next/static`, so they work in static export.
- **Metadata API / PWA**: `app/manifest.ts` exporting `MetadataRoute.Manifest` (name, short_name, start_url, display, icons, theme_color...) is linked automatically and is a static GET in export mode. `viewport` export carries `themeColor`.
- **TypeScript 7**: *"Next.js uses the project-local `tsc` CLI by default"* for build-time type checking (`experimental.useTypeScriptCli`), so TS 7 (no JS API) works for `next build`; CLI mode prints raw `tsc` diagnostics and checks the whole tsconfig program (tests included).
- **Breaking defaults** still relevant: async `params`/`searchParams`/`cookies()`; `images.qualities` default `[75]`, `images.minimumCacheTTL` 4 h; parallel route slots need `default.js`; browser floor **Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+**.

### `output: 'export'` constraints (docs, lastUpdated 2026-08-09)

Unsupported: dynamic routes with `dynamicParams: true` or without `generateStaticParams()`; **Route Handlers that rely on `Request`**; `cookies`; rewrites; redirects; headers; **Proxy**; ISR; **`next/image` with the default loader**; Draft Mode; **Server Actions**; Intercepting Routes. Supported: Server Components evaluated at build, Client Components fetching at runtime, `next/image` with `images.unoptimized` or a custom loader, Route Handlers with **GET + `export const dynamic = 'force-static'`** (emitted as static files), `trailingSlash: true` (emits `/me/index.html`, which is what a Capacitor asset server needs).

**Measured today:** `output: 'export'` + `cacheComponents: true` fails the build with `Error: Invariant: PPR cannot be enabled in export mode` (next 16.4.1). The export build must run with Cache Components off.

### Structure for the Capacitor wrapper

Options considered:

- **(a) One app, two builds** (env-gated `output: 'export'`): the API route handlers under `app/api/**` read `Request` (query params, auth header) and therefore fail the export build. The only way to keep them in the same app is the `pageExtensions` trick (`route.api.ts` only matched when `'api.ts'` is in `pageExtensions` for the web build), which is fragile and surprising.
- **(b) Separate API app from day one** (`apps/api`, Next route handlers or Hono on Vercel Functions, rewrites from `proofofcalm.com/api/*`): clean but adds a deployable, CORS between two origins for the web app too, and more Vercel config for one `/api/prices` endpoint.
- **(c) Two thin apps over shared packages** (recommended): `apps/web` (full Next, Vercel, route handlers, PWA/SW, metadata) and, at milestone 3, `apps/mobile` (same Next version, `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`, no SW, `NEXT_PUBLIC_API_BASE=https://proofofcalm.com`). Both import screens from `packages/features`, components from `packages/ui`, logic from `packages/core`, and talk to the API through `packages/api-client` (one module, base URL injected). Route files in each app are one-liners (`export { TodayScreen as default } from '@proofofcalm/features/today'`). This is the Turborepo-idiomatic shape (thin apps, fat packages), it keeps the API next to the web app (no CORS for the web), and it makes the dependency rule in topic 13 mechanical.

Rules that make (c) work (enforce from day one even though `apps/mobile` does not exist yet): screens never import `next/headers`, `cookies()`, Server Actions or `'use cache'`; data access only through `packages/core` + Dexie + `packages/api-client`; navigation through a tiny adapter (`@proofofcalm/ui/navigation` wrapping `next/link`/`next/navigation`) so a Vite+React Router shell could replace the mobile Next shell if Next 17 keeps PPR incompatible with export (plan B); `cacheComponents` stays **off in both apps** for parity (the app is client-rendered; Cache Components buys nothing for it); CORS allow-list on route handlers for `capacitor://localhost` and `https://localhost` (see topic 4).

### Minimal page weight (primary measurement, Next 16.4.1 + React 19.3.0, Turbopack production)

| Script (modern browsers) | raw | gzip | brotli | Contents |
|---|---|---|---|---|
| chunk A | 224.4 kB | 70.1 kB | 60.0 kB | `react-dom` client (19.3: ViewTransition, Activity) |
| chunk B | 182.3 kB | 48.7 kB | 41.0 kB | Next App Router client runtime |
| turbopack runtime | 9.8 kB | 3.8 kB | 3.4 kB | shared runtime (`turbopackSharedRuntime`) |
| 2 small chunks | 30.3 kB | 9.4 kB | 8.3 kB | layout/page + RSC client glue |
| **Total first-load JS** | **446.8 kB** | **132.0 kB** | **112.7 kB** | 5 files |
| `noModule` polyfills (not downloaded by modern browsers) | 110.0 kB | 38.6 kB | 34.3 kB | core-js subset |

HTML: 5.6 kB (1.9 kB gz) including a 4.3 kB inline RSC payload; CSS 4.1 kB. The figures are identical (±0.3 kB) for the plain config, for `output: 'export'`, and for `cacheComponents + partialPrefetching`. The Next.js team publishes no official "first-load JS" number for 16.x (the 16.x build output no longer prints the per-route size table), so this measurement is the baseline used in topic 16.

### Gotchas for the build session

- Pin `next@16.4.2` (16.4.1 is the minimum for the October security fixes; `sharp >= 0.35.5` comes with it).
- Turbopack cannot run webpack plugins: the Serwist webpack plugin needs `next build --webpack`; prefer `@serwist/turbopack` (topic 3).
- `next.config.ts` module resolution is CommonJS unless Node's native TS resolver is on (Node 22.18+ default); keep the config simple.
- `images.localPatterns` is now required for local `src` with query strings; `images.dangerouslyAllowLocalIP` blocks local IPs.
- `next typegen` / `PageProps` helpers exist; `typedRoutes: true` validates `href` literals.
- Export builds reject `cacheComponents`; keep both apps on the same flag (off).
- Watch Next 17: Cache Components become mandatory, and the export story is unknown; stay on 16.x for the M3 export build until verified.

**Sources (accessed 2026-10-16):** https://nextjs.org/blog/next-16-4 · https://nextjs.org/blog/next-16 · https://nextjs.org/blog/nextjs-security-update-october-14-2026 · https://nextjs.org/docs/app/guides/static-exports · https://nextjs.org/docs/app/api-reference/file-conventions/proxy · https://nextjs.org/docs/app/api-reference/directives/use-cache · https://nextjs.org/docs/app/api-reference/functions/fetch · https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler · https://nextjs.org/docs/app/api-reference/turbopack · https://nextjs.org/docs/app/api-reference/components/font · https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest · https://nextjs.org/docs/app/api-reference/config/eslint · https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages · https://nextjs.org/docs/app/api-reference/config/typescript · https://registry.npmjs.org/next (dist-tags/time) · local build measurement (see §0).

---

## 2. React

**Context7:** quota exceeded; read react.dev directly.

- Latest stable **19.3.1** (2026-10-14; 19.3.0 on 2026-09-09). Next 16.4 ships 19.3.
- **19.0** (2024-12-05): Actions (async transitions with pending/error/optimistic handling), `useActionState`, `useOptimistic` (*"immediately render the optimistic value while the request is in progress; when it finishes or errors React switches back"*), `use` (reads promises in render and suspends; reads context conditionally; promises must be cached, not created during render), form actions + `useFormStatus`, `ref` as a prop, document metadata hoisting, stylesheet `precedence`, better hydration diffs.
- **19.2** (2025-10-01): `<Activity>` (hide UI with `display:none` while keeping state), `useEffectEvent`, Performance Tracks.
- **19.3** (2026-09-09): `<ViewTransition>` stable (+ `addTransitionType`), Fragment refs stable, **`browser()`** from `react-dom` (*"suspends on the server, so the Suspense fallback is rendered into the HTML; on the client it renders normally after hydration"*; may be called conditionally), Trusted Types, `<Context>` renderable from Server Components, independent transitions, Strict Mode double-invokes effects on hydration, `use` warns when misused conditionally.
- **React Compiler**: v1.0 stable 2025-10-07 (`babel-plugin-react-compiler` 1.0.0); *"still an optional addition to React today, in the future some features may require the compiler"*; works with React 17/18/19; lint rules ship in `eslint-plugin-react-hooks` (7.1.1) under the `recommended-latest` preset; verify with the "Memo ✨" badge in DevTools; Next 16 integration is stable, Rust/SWC variant experimental.

**Relevance for Proof of Calm:** `browser()` is the right primitive for components that need IndexedDB (`use(browser())` instead of `next/dynamic({ ssr: false })`), keeping the static HTML shell for the Today page while the data-bound parts render after hydration. `useOptimistic` + Actions fit "add a buy" and "mark contribution done" flows with Dexie writes; `<Activity>` keeps tab state (Plan/History) alive without re-querying; `<ViewTransition>` gives calm transitions that respect reduced motion (CSS-controlled). Enable `reactCompiler: true` from day one in a new codebase (the React team's guidance is to rely on the compiler for new code); keep `eslint-plugin-react-hooks` `recommended-latest` in the minimal ESLint layer (topic 13) because Biome does not ship the compiler diagnostics.

**Pin:** `react@19.3.1`, `react-dom@19.3.1` (2026-10-14), `babel-plugin-react-compiler@1.0.0` (2025-10-07), `eslint-plugin-react-hooks@7.1.1` (2026-04-17).

**Sources:** https://react.dev/blog/2026/09/09/react-19-3 · https://react.dev/blog/2024/12/05/react-19 · https://react.dev/blog (index: 19.2, Compiler 1.0, RSC advisories) · https://react.dev/learn/react-compiler/introduction · https://react.dev/learn/react-compiler/installation · npm registry (react, react-dom, babel-plugin-react-compiler, eslint-plugin-react-hooks).

---

## 3. PWA

**Context7:** quota exceeded (Serwist); read serwist.pages.dev, webkit.org, web.dev, MDN, Capacitor docs directly.

### Options

| Option | Status / version | Fit |
|---|---|---|
| **Serwist** (`serwist`, `@serwist/next`, `@serwist/turbopack`, `@serwist/window`) | 9.5.13 (2026-10-04); 10.0.0-preview.14 exists and will require Next >= 15 | Workbox-derived, typed, maintained monthly; precache manifest injection (`self.__SW_MANIFEST`), `defaultCache` runtime strategies, `fallbacks`, `navigationPreload`, update events. Two Next integrations: `@serwist/next` = **webpack plugin** (needs `next build --webpack`); `@serwist/turbopack` = route handler `app/serwist/[path]/route.ts` re-exporting `dynamic`, `dynamicParams`, `revalidate`, `generateStaticParams`, `GET` from `createSerwistRoute({ swSrc: 'app/sw.ts', additionalPrecacheEntries, useNativeEsbuild: true })`, plus `<SerwistProvider swUrl="/serwist/sw.js">` from `@serwist/turbopack/react`; peers `esbuild >= 0.25`. |
| **Workbox directly** (`workbox-build` 7.4.1, 2026-05-04) | maintained but no Next integration; you write the manifest glue yourself | More work than Serwist for the same result. |
| **Hand-written SW** | n/a | ~120 lines: cache-first for `/_next/static/*` (immutable hashed), network-first navigations with `/~offline` fallback, SWR for `/api/prices`; but no build-time precache manifest, so the app shell is only cached once visited. Acceptable plan C for a 6-route app, risky for "works offline once installed". |

### Recommendation

Serwist 9.5.13 via **`@serwist/turbopack`** in `apps/web` (keeps the default Turbopack build); if it misbehaves, fall back to `@serwist/next` with `next build --webpack` for the web app only (dev can stay on Turbopack; `transpilePackages` then becomes necessary for workspace packages). Service worker policy:

- Precache the app shell (route HTML for `/`, `/plan/`, `/history/`, `/learn/`, `/settings/`, `/~offline`, icons, fonts) from the Serwist manifest; `cleanupOutdatedCaches: true`; `navigationPreload: true`; `runtimeCaching: defaultCache` plus a `StaleWhileRevalidate` route for `/api/prices` with an `ExpirationPlugin`.
- **"Prices from <time>" state**: do not read it from the SW cache. The price fetcher writes `{ asOf, fetchedAt, source }` into a Dexie `prices` table; the UI renders "prices from 14:05" from Dexie, so the state is identical online, offline, in the PWA and in Capacitor (where there is no SW). The SW route is only a bonus for cold starts.
- **Update flow**: `skipWaiting: false`, `clientsClaim: true`; in `@serwist/window` listen to `waiting` -> show a calm "A new version is ready — Reload" toast; on accept, listen to `controlling` -> `window.location.reload()` and call `messageSkipWaiting()`. The docs warn that `controlling` never fires without `skipWaiting()` and that `activated` must not be used to detect control.
- Register the SW only when `!Capacitor.isNativePlatform()`.

### Installability and storage facts (2026)

- **Chrome/Android** (web.dev, updated 2024-09-19): HTTPS; manifest with `name` or `short_name`, `icons` incl. 192 and 512 px, `start_url`, `display` in `fullscreen | standalone | minimal-ui | window-controls-overlay`, `prefer_related_applications` absent/false; the install prompt additionally needs engagement (a tap + 30 s). A service worker is no longer in the criteria (the page does not mention one) but is required for offline. Add screenshots + description for the Richer Install UI. **WebAPK**: Chrome mints an APK on Android; it appears in the launcher/settings, registers intent filters for the manifest `scope`, shares the Chrome profile storage, and is regenerated when the manifest changes (so change the manifest rarely).
- **iOS/iPadOS**: no install prompt API; users add via Share -> Add to Home Screen. Since iOS 26 *"every website added to the Home Screen opens as a web app by default"* (users can toggle "Open as Web App"); a manifest is no longer required for standalone display but its icons and features are used. **Web Push** (iOS 16.4+) only for Home Screen web apps whose manifest has `display: standalone | fullscreen`, permission request must follow a user gesture, Focus and Badging (`setAppBadge`) integrate, push endpoints are `*.push.apple.com`, no Developer Program membership needed. The WebKit post says nothing about silent push [not documented].
- **WebKit storage rule (webkit.org/tracking-prevention)**: *"ITP deletes all cookies created in JavaScript and all other script-writeable storage after 7 days of no user interaction"*, listing IndexedDB, LocalStorage, SessionStorage, Media keys and **Service Worker registrations and cache**. *The first-party domain of a web app saved to the home screen is "exempt from ITP's 7-day cap on all script-writeable storage"*, and its data is kept separate from Safari. Consequence: in Safari tabs, local-only mode is at risk after a week of inactivity -> nudge installation, offer backups (topic 6), and call `navigator.storage.persist()` after the first meaningful write (Chrome decides silently from engagement/installed/bookmarked/notification signals; Firefox prompts; do not call it on page load).
- next-intl/Intl requirements and OKLCH are within Next 16's browser floor (Safari 16.4+).

**Pin:** `serwist@9.5.13`, `@serwist/turbopack@9.5.13`, `@serwist/window@9.5.13` (2026-10-04); `@serwist/next@9.5.13` only for the webpack fallback; `esbuild@0.28.2` (peer of `@serwist/turbopack`).

**Sources:** https://serwist.pages.dev/docs/next/getting-started · https://serwist.pages.dev/docs/next/turbo · https://serwist.pages.dev/docs/serwist/core/serwist · https://serwist.pages.dev/docs/window · https://github.com/serwist/serwist/releases (9.5.12 notes: TS 7 bump) · https://webkit.org/tracking-prevention/ · https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ · https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ · https://web.dev/articles/install-criteria · https://web.dev/articles/webapks · https://web.dev/articles/persistent-storage · https://capacitorjs.com/docs/config (`android.resolveServiceWorkerRequests`) · npm registry.

---

## 4. Capacitor

**Context7:** quota exceeded; read capacitorjs.com, Supabase docs, Apple developer docs directly.

- **Current major: 8** (`@capacitor/core|cli|ios|android` **8.5.3**, 2026-10-07; 8.0.0 on 2025-12-08; 9.0.0-alpha on `next`). Requirements: **iOS 15+, Xcode 26+, Android minSdk 24 / compile+target 36, Android Studio 2025.2.1+, Node 22+**, Swift Package Manager by default for new iOS projects.
- Plugins (all 8.x, Oct 2026): `@capacitor/push-notifications` 8.1.3 (APNs capability + two `AppDelegate` methods; Android via FCM `google-services.json`, Android 13 permission; `requestPermissions()` then `register()`; `presentationOptions` for foreground), `@capacitor/local-notifications` 8.3.1 (DCA-day reminders without a server), `@capacitor/app` 8.1.2 (`appUrlOpen` for deep links, state), `@capacitor/browser` 8.0.5 (external links in SFSafariViewController/Custom Tabs), `@capacitor/share` 8.0.3, `@capacitor/filesystem` 8.1.5 (write the JSON backup, then Share), `@capacitor/preferences` 8.0.1 (UserDefaults/SharedPreferences, **strings only**, small key/value, iOS privacy manifest reason CA92.1 required; not a database), `@capacitor/status-bar` 8.0.4, `@capacitor/splash-screen` 8.0.2, `@capacitor/keyboard` 8.0.6, `@capacitor/haptics` 8.0.2.

### Compatibility with a Next.js static export

`webDir: 'apps/mobile/out'` (must contain `index.html`); `trailingSlash: true` so `/plan/` resolves to `plan/index.html` in the asset server; `images.unoptimized: true`; no SW; `NEXT_PUBLIC_API_BASE` absolute. Origins: iOS `capacitor://localhost` (`server.iosScheme` default `capacitor`; cannot be `http`/`https`), Android `https://localhost` (`androidScheme` default `https`; changing it breaks routing since WebView 117). `server.hostname` stays `localhost` to keep secure-context APIs.

### What breaks under those origins, and the rules

1. **Cookies**: nothing in the app may depend on cookies (first- or third-party). Supabase sessions are stored by `supabase-js` in a `storage` adapter, not cookies; API calls carry `Authorization: Bearer <jwt>`. Do not use `@supabase/ssr` cookie flows in the app; only `apps/web` server code (if any) would.
2. **CORS**: the API at `https://proofofcalm.com/api/*` must answer `OPTIONS` and set `Access-Control-Allow-Origin` for `capacitor://localhost` and `https://localhost` (exact-match allow-list) plus `Vary: Origin`. Build this into the route handler helper now, test with Playwright by sending an `Origin` header. `CapacitorHttp` (native fetch override) exists but is a last resort.
3. **Service worker**: do not register one inside the WebView. Capacitor documents a SW bridge only for Android (`android.resolveServiceWorkerRequests`); for the `capacitor://` scheme on iOS there is no documented support **[unverified today: no primary WebKit statement fetched]**; the safe rule is `if (!Capacitor.isNativePlatform()) register()`. Offline works anyway because assets are local and data is in IndexedDB (WKWebView IndexedDB persists for the app's lifetime).
4. **Auth**: magic links open in the system browser unless **Universal Links** (`https://proofofcalm.com/.well-known/apple-app-site-association`, Associated Domains `applinks:proofofcalm.com`) and **App Links** (`.well-known/assetlinks.json`, intent filter with `autoVerify`) are configured; the AASA/assetlinks files are served from `apps/web/public` (Supabase *"does not currently support hosting the AASA file"*). Handle the URL with `App.addListener('appUrlOpen')` -> router. **PKCE** stores the code verifier on the device that started the flow, so *"the code exchange must be initiated on the same browser and device where the flow was started"* (`exchangeCodeForSession(code)`; `detectSessionInUrl: false` in native and exchange manually). Because a tapped email link can still land in Safari, **the primary mobile login is the 6-digit email OTP** (`signInWithOtp` + template `{{ .Token }}`, `verifyOtp({ type: 'email' })`, 1 h expiry, 60 s resend limit): no deep link needed, same code path on web. Keep magic links for desktop web.
5. **Token storage**: `createClient(url, key, { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })` with a `storage` adapter (`getItem/setItem/removeItem`) backed by `@capacitor/preferences` in native and `localStorage` on the web (Capacitor's own docs: *"Mobile OSs may periodically clear data set in window.localStorage"*).
6. **Passkeys**: Supabase Auth MFA documents **TOTP and phone only**; WebAuthn/passkeys are not an available factor or sign-in method today, so passkeys are out of scope. For later: Apple documents passkeys in **WKWebView** when the relying party is an **associated domain** (`webcredentials`), with iOS 16.4+ detection APIs; without it the request errors.
7. **Push**: iOS APNs (device token) vs Android FCM token; the registration token is sent to our API with the bearer token; permission requested from a user gesture in Settings only.

### Plan now or defer?

Defer the wrapper itself to milestone 3, but **decide now**: two thin apps (topic 1), API client module with injectable base URL, bearer-token auth, OTP-code login, SW registration guard, no `window.location.origin` assumptions, Universal/App Link files in `apps/web/public/.well-known`, and a `platform` abstraction (`web | pwa | ios | android`) in `packages/ui` with web implementations (Web Share API, `<a download>`, Notification API) that the Capacitor plugins replace at M3.

**Pin (M3):** `@capacitor/core|cli|ios|android@8.5.3`; plugins as listed above.

**Sources:** https://capacitorjs.com/docs/updating/8-0 · https://capacitorjs.com/docs/config · https://capacitorjs.com/docs/guides/deep-links · https://capacitorjs.com/docs/apis/push-notifications · https://capacitorjs.com/docs/apis/preferences · https://capacitorjs.com/docs/web/progressive-web-apps · https://supabase.com/docs/guides/auth/native-mobile-deep-linking · https://supabase.com/docs/guides/auth/sessions/pkce-flow · https://supabase.com/docs/reference/javascript/initializing · https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp · https://supabase.com/docs/guides/auth/auth-mfa · https://developer.apple.com/documentation/authenticationservices/supporting-passkeys (JSON endpoint) · https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/limitsnavigationstoappbounddomains (JSON endpoint) · https://webkit.org/blog/10882/app-bound-domains/ · npm registry.

---

## 5. UI toolkit

**Context7:** quota exceeded (Tailwind, shadcn); read tailwindcss.com, ui.shadcn.com, base-ui.com directly.

### Tailwind CSS 4.3.3 (2026-07-16; 4.3.0 2026-05-08; 4.0.0 2025-01-21)

- CSS-first config: `@import "tailwindcss"; @theme { --color-mint-500: oklch(0.72 0.11 178); }` generates utilities; `@theme inline` emits the *value* (use it when a token references another variable, e.g. `--font-sans: var(--font-inter)`); `--color-*: initial` wipes the default palette; default palette is written in OKLCH.
- Dark mode via attribute: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` (documented verbatim); default is `prefers-color-scheme`.
- Container queries are built in: `@container`, `@sm:`/`@md:`..., `@max-md:`, ranges `@sm:@max-md:`, named `@container/main` + `@sm/main:`, `@container-size` (new in 4.3) for block-size units, custom sizes via `--container-*`.
- Setup for Next: the official Tailwind guide still documents `@tailwindcss/postcss` + `postcss.config.mjs`; `create-next-app` 16.4 instead wires `@tailwindcss/turbopack` 4.3.3 (2026-07-31) as a Turbopack loader (`turbopack.rules['*.css'] = { loaders: ['@tailwindcss/turbopack'], as: '*.css' }`). Storybook (Vite) uses `@tailwindcss/vite` 4.3.3. Either way the CSS entry (`@import "tailwindcss"; @import "tw-animate-css"; @import "./tokens.css"; @import "./theme.css";`) lives in `packages/ui/src/styles/globals.css` and is imported by `apps/web/app/layout.tsx` and `.storybook/preview.ts`.
- Release cadence: 4.3.x patches through July 2026; `text-shadow-*`, `mask-*`, `@source inline()` landed in 4.1/4.2 [release notes page truncated; 4.1 features not re-read today].

### shadcn/ui (CLI `shadcn@4.22.0`, 2026-10-16)

- **Base UI is the default primitive library since July 2026** (*"New projects now use Base UI by default. Radix is still fully supported... Radix is not being deprecated"*); `shadcn init -b radix` keeps Radix; every component ships for both. **CLI v4** (March 2026): `init --preset <code>`, `init --template next --monorepo`, `init --base radix|base-ui`, `add --diff/--dry-run/--view`, `info`, `docs <component>`, `registry:base` and `registry:font` item types. February 2026: unified `radix-ui` package (1.8.1). Tailwind v4 style since Feb 2025: tokens in `:root`/`.dark` (outside `@layer base`), `@theme inline` maps `--color-background: var(--background)` etc., OKLCH values, `tw-animate-css` replaces `tailwindcss-animate` (`@import "tw-animate-css"`), `data-slot` attributes on every primitive, no `forwardRef`, `size-*` utilities.
- **Monorepo** (official doc): `init --monorepo` creates `apps/web` + `packages/ui`; *"Every workspace must have a components.json"*; the app's `tailwind.css` points to `../../packages/ui/src/styles/globals.css`; aliases `ui -> @workspace/ui/components`, `utils -> @workspace/ui/lib/utils`; run `shadcn add` from `apps/web` and the CLI routes primitives into `packages/ui` and blocks into the app; keep `style`, `iconLibrary`, `baseColor` identical in both files; `tailwind` config block stays empty for v4.
- **Base UI** `@base-ui/react` 1.9.0 (2026-10-09; 1.0.0 stable 2025-12-11 with 35 components; `date-fns`/`@date-fns/tz` peers are *optional*, only for the date components). The old `@base-ui-components/react` name stopped at 1.0.0-rc.0.
- Alternatives if shadcn were a poor fit: React Aria Components 1.22.1 (best-in-class a11y and i18n behaviours, heavier), Ark UI 5.39.3 (Zag state machines), Base UI directly (no CLI, no styles). None is needed: shadcn is copy-in code, so restyling is total.

### Recommendation and token layout

shadcn (Base UI base, `new-york` style) installed into `packages/ui` with the monorepo `components.json` pair. Tokens live in **one place**: `packages/ui/src/styles/tokens.css` defines `:root { --background: oklch(...); ... }` and `:root[data-theme=dark] { ... }` (replace shadcn's `.dark` selector), `theme.css` holds the `@theme inline` mapping + radius/spacing/typography tokens, `globals.css` the imports and `@custom-variant dark`. `apps/web` imports `@proofofcalm/ui/styles/globals.css`; Storybook imports the same file; Capacitor shell too. Theme switching sets `data-theme` on `<html>` from an inline script in `<head>` (FOUC-free; honour `prefers-color-scheme` when the setting is "system"). Add `lucide-react` 1.58.0, `class-variance-authority` 0.7.1, `tailwind-merge` 3.7.0, `clsx` 2.1.1, `tw-animate-css` 1.4.0.

**Gotchas:** shadcn's generated CSS uses `.dark`; swap for `[data-theme=dark]` in both `tokens.css` and the `@custom-variant`. Base UI uses `render` instead of Radix's `asChild`. Biome's class sorter does not understand custom utilities (topic 13). `@tailwindcss/turbopack` only works under Turbopack: the `next build --webpack` fallback needs `@tailwindcss/postcss` instead, so keep `postcss.config.mjs` in the repo even if unused by default **[the Tailwind site has no page for `@tailwindcss/turbopack` yet; the package exists on npm and is what create-next-app installs]**.

**Pin:** `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `@tailwindcss/turbopack@4.3.3`, `@tailwindcss/vite@4.3.3`, `shadcn@4.22.0` (CLI, dev), `@base-ui/react@1.9.0`, `tw-animate-css@1.4.0`, `lucide-react@1.58.0`, `class-variance-authority@0.7.1`, `tailwind-merge@3.7.0`, `clsx@2.1.1`.

**Sources:** https://tailwindcss.com/docs/theme · https://tailwindcss.com/docs/dark-mode · https://tailwindcss.com/docs/responsive-design · https://tailwindcss.com/docs/installation/framework-guides/nextjs · https://github.com/tailwindlabs/tailwindcss/releases · https://ui.shadcn.com/docs/changelog · https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default · https://ui.shadcn.com/docs/changelog/2026-03-cli-v4 · https://ui.shadcn.com/docs/tailwind-v4 · https://ui.shadcn.com/docs/monorepo · https://ui.shadcn.com/docs/components-json · https://base-ui.com/react/overview/releases · npm registry.

---

## 6. State and persistence

**Context7:** Dexie resolved (`/websites/dexie`) and Zustand resolved (`/pmndrs/zustand`) but `query-docs` was rate-limited; read dexie.org and zustand.docs.pmnd.rs directly (the Zustand v5 migration page returned 404; v5 facts below come from the npm metadata and the v5 release line).

### Needs recap

Typed schema, migrations, reactive queries, JSON export/import as the backup format, offline-first, later LWW sync with Supabase using client UUIDs and tombstones, payloads possibly encrypted client-side.

### Options measured (gzip, realistic imports)

| Library | Version (date) | Size | Notes |
|---|---|---|---|
| **Dexie** (+ `liveQuery`) | 4.4.6 (2026-09-10) | 32.0 kB gz / 28.6 kB br | `db.version(n).stores({ t: '++id, name, [a+b]' })` declares only indexed props; `.upgrade(tx => ...)` migrations (a version with an upgrader must never be altered; failures roll back); Dexie >= 3 lets you keep only versions with upgraders; `liveQuery(querier): Observable` tracks every Dexie call and *"mutated rangesets are also broadcast across browsing contexts to wake up liveQueries in other tabs or workers"*; only Dexie async calls inside the querier (wrap others with `Dexie.waitFor`). |
| `dexie-react-hooks` (`useLiveQuery`) | 4.4.0 (2026-03-18) | +0.4 kB | returns `undefined` until the first result; deps array. |
| `dexie-export-import` | 4.4.1 (2026-09-10) | 51.9 kB gz (lazy) | `exportDB(db, { prettyJson, filter, progressCallback, numRowsPerChunk })` -> Blob; `importInto(db, blob, { overwriteValues, clearTablesBeforeImport, acceptVersionDiff, acceptNameDiff, acceptChangedPrimaryKey, filter, transform })`; format `{ formatName: "dexie", formatVersion: 1, data: { databaseName, databaseVersion, tables[], data: [{ tableName, inbound, rows }] } }` (data must be last for streaming); `peakImportFile` for previews; CryptoKeys cannot be exported. |
| `idb` | 8.0.4 (2026-10-06) | 1.3 kB gz | promise wrapper; no reactivity, no migration framework. |
| `idb-keyval` | 6.3.0 | 0.3 kB gz | key/value only. |
| TinyBase | 10.0.1 (2026-09-24) | 19.6 kB gz (store + IndexedDB persister + ui-react) | own data model; sync via MergeableStore/CRDT; not a document DB. |
| RxDB | 17.6.0 (2026-10-05) | 80.4 kB gz (core + Dexie storage) | Supabase replication plugin exists; premium plugins; heavy. |
| PowerSync `@powersync/web` | 2.4.2 | not measured (SQLite wasm, hosted service) | needs the PowerSync service; overkill. |
| ElectricSQL client | 1.5.28 | not measured | read-path Postgres sync engine + service; writes are your own. |
| TanStack DB + react-db | 0.15.0 / 0.5.10 (2026-10-15) | 86.4 kB gz | pre-1.0, collections over IndexedDB via adapters; promising, too early. |
| **Zustand** | 5.0.15 (2026-08-13) | 0.7 kB gz | `create`, `useShallow`; requires React 18+/`use-sync-external-store`. |
| Jotai | 3.0.1 | 3.1 kB gz | atoms; fine but not needed. |
| TanStack Store | 0.11.2 | 2.9 kB gz | fine but not needed. |

### Recommendation

**Dexie 4 + dexie-react-hooks**, `dexie-export-import` lazy-loaded from Settings/Backup, **Zustand** only for ephemeral cross-component UI state (selected range, open sheet, toast queue). Everything persistent is a Dexie live query; no second cache layer (no TanStack Query/SWR for local data; `@tanstack/react-query` 5.104 is only worth it if the price API grows beyond one endpoint).

Typing pattern (Dexie 4): `class AppDB extends Dexie { plans!: EntityTable<Plan, 'id'>; constructor() { super('proof-of-calm'); this.version(1).stores({ plans: 'id, updatedAt, deletedAt', ... }); } }` with string UUID primary keys (no `++`), because the sync layer needs client-generated ids.

Sync-ready schema from day one (no sync code yet): every entity row `{ id: uuid, kind, updatedAt: ISO instant, deletedAt?: ISO instant, rev: number, payload }`; writes go through a `packages/core` repository that also appends to an `outbox` table; later the sync worker pushes outbox rows to a Supabase `entities` table (`user_id, id, kind, updated_at, deleted_at, payload jsonb|bytea`, RLS by `user_id`) and pulls `updated_at > cursor`; conflict rule = last writer wins per entity by `updatedAt` (tombstones win ties); payload is an opaque JSON string or AES-GCM ciphertext, so the server never needs to parse it. Dexie's `liveQuery` makes incoming rows appear in the UI automatically. Why not the rest: RxDB/PowerSync/Electric/TanStack DB bring their own sync protocols or services and 3–30x the bytes for a product whose sync is "one user, few hundred rows, LWW"; TinyBase and raw `idb` would need a hand-written migration and reactivity layer that Dexie already provides and tests.

**Gotchas:** Dexie's `liveQuery` only observes Dexie APIs; keep decryption outside the querier or wrap it in `Dexie.waitFor`. Export files can be large; stream with `numRowsPerChunk` and write via File System Access API / `<a download>` on web, `@capacitor/filesystem` + Share in native. Safari: see the 7-day rule (topic 3). Dexie Cloud is a separate opt-in addon and is not pulled in.

**Pin:** `dexie@4.4.6`, `dexie-react-hooks@4.4.0`, `dexie-export-import@4.4.1`, `zustand@5.0.15`.

**Sources:** https://dexie.org/docs/Tutorial/Design · https://dexie.org/docs/liveQuery() · https://dexie.org/docs/Typescript · https://dexie.org/docs/ExportImport/dexie-export-import · https://zustand.docs.pmnd.rs/ (v5 migration page 404 today) · npm registry · local esbuild measurement.

---

## 7. Charts

**Context7:** quota exceeded; read lightweight-charts release notes, Recharts 3.0 release, uPlot README.

| Option | Version (date) | Size (gzip / brotli) | Rendering | SSR/export | A11y | Touch |
|---|---|---|---|---|---|---|
| **Custom SVG** (prototype, ~150 lines) | n/a | ~2–4 kB | SVG | prerenders at build | full control: `role="img"`, `<title>/<desc>`, visually hidden table | pointer events you own |
| lightweight-charts | 5.2.1 (2026-08-12; 5.0 2025-01-02) | 53.3 / 46.3 kB | Canvas | client-only (needs `browser()`/dynamic) | 5.2.1 adds an Accessibility plugin (keyboard nav, ARIA, announcements) | built in (touch drag options) |
| Recharts | 3.10.1 (2026-07-25; 3.0 2025-06-23) | 114.5 / 95.8 kB (line+bar+area set) | SVG (React) | SSR ok | `accessibilityLayer` on by default, keyboard nav | ok |
| visx (shape+scale+axis+group) | 4.0.0 (2026-06-11) | 26.7 / 23.5 kB | SVG primitives | SSR ok | you build it | you build it |
| uPlot | 1.6.32 (2025-03-14) | 22.6 / 20.4 kB | Canvas | client-only | none | drag/zoom via plugin only |
| Observable Plot | 0.6.17 (2025-02-14) | 89.1 / 76.1 kB | SVG | client (DOM) | ARIA labels | limited |
| Chart.js | 4.5.1 (2025-10-13) | 53.0 / 46.5 kB | Canvas | client-only | fallback content only | ok |

**Recommendation:** keep the prototype's approach: a small `packages/ui/charts` module with pure functions in `packages/core/charts` (scales, path builders, drawdown segments, tick generation; all property-tested) and thin SVG components: `LineChart` (portfolio value, one global `RangeSelector` component controlling all charts on the page through props), `CoinChart` (line + buy/sell markers + dashed average-cost line), `AllocationBar`, `Sparkline`, `SimulatorChart` (line + shaded drawdown areas using `<path>` fills under the running maximum), `ProgressStrip`. Accessibility: `role="img"` with an `aria-label` summarising the series ("Portfolio value, 1 year, from 1,200 € to 1,860 €, +55 %"), a `<desc>`, and a `<details>` with a data table (`<table>` built from the same data) so screen readers and copy/paste work. Touch: a transparent overlay with `pointerdown/pointermove` and `touch-action: pan-y` scrubbing a crosshair, 44 px targets for the range selector, no hover-only information. Reduced motion: no path animations when `prefers-reduced-motion`. `font-variant-numeric: tabular-nums` on axis labels. Everything renders at build time (static export friendly) and costs ~3 kB. If a zoomable, many-thousand-point chart is ever needed, lazy-load lightweight-charts 5.2.1 behind `use(browser())` on that one screen; Recharts' 95–115 kB is incompatible with the budget.

**Sources:** https://tradingview.github.io/lightweight-charts/docs/release-notes · https://github.com/recharts/recharts/releases/tag/v3.0.0 · https://github.com/leeoniya/uPlot · npm registry · local esbuild measurement.

---

## 8. i18n

**Context7:** quota exceeded; read next-intl.dev, paraglidejs.com, lingui.dev directly.

| Option | Version (date) | Model | Client size | Next App Router | ICU plurals | Typed keys | Static export / client-only |
|---|---|---|---|---|---|---|---|
| **next-intl** | 4.14.9 (2026-10-02; 4.0 2025-03-12) | runtime ICU (intl-messageformat) | 12.3 kB gz / 10.9 kB br (`NextIntlClientProvider` + `useTranslations` + `useFormatter`) | first-class; peers next 12–16 | yes | `AppConfig` augmentation (`Messages`, `Locale`, `Formats`) + `createMessagesDeclaration` for strict argument types | provider accepts `locale` + `messages` props; `use-intl/core` works anywhere |
| Paraglide JS | 2.29.0 (2026-10-15) | compile-time message functions, per-message tree-shaking | ~1–2 kB runtime + used messages (all locales compiled into each function unless split) | no official Next adapter in v2 (framework-agnostic bundler plugin / CLI compile; `paraglide-next` is not part of v2) | plurals via `plural` formatter (Intl.PluralRules) and variants; ICU MF1 via plugin | compile-time types | yes (plain TS output) |
| Lingui | 6.10.0 (2026-10-16) | macros + ICU catalogs | moderate | RSC via `experimental.swcPlugins` (`linguiMacroSwcPlugin`) since 4.10 | yes | macro-level | yes |

**Recommendation: next-intl 4.14.9** in *client-provider mode*: the locale is a user setting (Dexie), not a URL segment or cookie, so `app/layout.tsx` renders `<NextIntlClientProvider locale={locale} messages={messages} timeZone={tz} formats={formats}>` from a client component that loads `messages/<locale>.json` with a dynamic import (only the active locale ships). No `i18n/request.ts`, no `proxy.ts`, which is exactly what static export allows. Message files are **colocated per feature** (`packages/features/<feature>/messages/{en,pt-PT,de}.json`) and merged into `packages/i18n/messages/<locale>.json` by a 20-line build script (or `import.meta.glob`, which Turbopack and Vite both support) so next-intl sees one object per locale; namespaces mirror feature names. Type safety via the `AppConfig` augmentation and `createMessagesDeclaration: './messages/en.json'` (generates `en.d.json.ts`; needs `allowArbitraryExtensions: true`). Runtime requirements are Intl.Locale/PluralRules/NumberFormat/DateTimeFormat/RelativeTimeFormat/ListFormat/DisplayNames, all present in Next 16's browser floor.

Why not Paraglide: strongest on bytes, but a user-selected locale means all three languages are compiled into every message function (or you add bundler-level per-locale splitting that Turbopack does not run), the Next App Router path is DIY in v2, and ICU plural/select is plugin-based. Why not Lingui: depends on an SWC plugin (experimental hook in Next) and macros.

### Formatting by COUNTRY, not only by UI language

The UI language (`en`, `pt-PT`, `de`) and the user's **country** are separate settings. CLDR has no `en-PT` data (`Intl.NumberFormat('en-PT')` silently falls back to `en` = `1,234.56`), so derive a **formatting locale** from the country with a small curated map (`PT -> pt-PT`, `DE -> de-DE`, `AT -> de-AT`, `CH -> de-CH`, `IE -> en-IE`, `GB -> en-GB`, `BE -> nl-BE`/`fr-BE` by UI language, `US -> en-US`, ...) and keep two formatters:

```ts
import { createFormatter } from 'use-intl/core'; // Props: { locale, timeZone?, now?, formats?, onError? }
const numbers = createFormatter({ locale: formattingLocale, timeZone });        // currency, percent, units, short numeric dates
const text    = createFormatter({ locale: uiLocale, timeZone });                // month/weekday names, relative time, lists
numbers.number(amount, { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol' }); // "1.234,56 €" for PT with an English UI
text.dateTime(date, { dateStyle: 'long' });                                                        // "16 October 2026"
```

`createFormatter` takes its `locale` per instance (verified in the use-intl source), so an English UI with Portuguese numbers is two instances, not a hack. Expose them through a `useFormatters()` hook in `packages/ui` and never call `toLocaleString` directly. The same formatting locale drives input parsing (topic 9): `new Intl.NumberFormat(formattingLocale).formatToParts(1234.5)` yields the group and decimal symbols.

**Pin:** `next-intl@4.14.9` (brings `use-intl`).

**Sources:** https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing · https://next-intl.dev/docs/environments/core-library · https://next-intl.dev/docs/environments/runtime-requirements · https://next-intl.dev/docs/workflows/typescript · https://raw.githubusercontent.com/amannn/next-intl/main/packages/use-intl/src/core/createFormatter.tsx · https://paraglidejs.com/ · https://lingui.dev/tutorials/react-rsc · npm registry · local esbuild measurement.

---

## 9. Forms and validation

**Context7:** quota exceeded (zod); read zod.dev, MDN directly.

- **zod 4.6.7** (2026-10-12; 4.0.0 2025-07-09). Docs: Zod 4 core 5.36 kB gz vs Zod 3 12.47 kB; **Zod Mini 1.88 kB** for `z.boolean()`; 7–14x faster parsing; `z.infer`, `safeParse` identical in both; `zod/mini` is functional/tree-shakeable (`z.optional(...)`, `.check(z.minimum(0))`); `error` replaces `message`/`errorMap`; Standard Schema v1 is implemented. **Measured today with esbuild** (realistic object schema): `import * as z from 'zod'` -> 25.6 kB gz (17.7 kB for a single `z.boolean()`), `zod/mini` -> **5.1 kB gz**. Conclusion: in client bundles use **`zod/mini`** only; classic `zod` may be used in route handlers/node scripts.
- Form libraries: react-hook-form 7.90.0 (12.8 kB gz; uncontrolled-first, `Controller` needed for custom inputs; `@hookform/resolvers` 5.9.1 has a Standard Schema resolver), TanStack Form 1.33.5 (17.3 kB gz; controlled, typed, Standard Schema natively), or none.

**Recommendation:** no form library in milestone 1. Proof of Calm's forms are small (plan editor: amount, cadence, day-of-month, coins + allocation; transaction: date, amount, units, fee; settings) and dominated by **custom numeric inputs**, which is where form libraries help least. Pattern: controlled inputs, a `zod/mini` schema per form in `packages/core` (`parsePlanInput(raw) -> Result`), React 19 `useActionState` for submit/pending/error, field errors from `safeParse().error.issues`. Adopt **TanStack Form** if a form grows beyond ~8 fields or needs arrays (coins list) with per-field validation; it consumes the same `zod/mini` schemas through Standard Schema without a resolver package.

**Numeric input on phones** (the decimal-separator problem): `<input type="text" inputMode="decimal" autoComplete="off" />`; MDN: `decimal` shows *"the digits and decimal separator for the user's locale (typically . or ,). Devices may or may not show a minus key"*, and `inputmode` enforces nothing. Never `Number(value)` or `parseFloat`. Parse with the formatting locale (topic 8): strip the group symbol, accept the locale decimal symbol and also the "other" one when it appears exactly once and the group symbol is absent (users switch keyboards), reject anything else, then build a `Big` from the normalised string. Show the normalised value back in locale format on blur. Avoid `type="number"` (browser-dependent separator acceptance, scroll-to-increment, exponent notation).

**Dates:** `<input type="date">` is Baseline (MDN: available across browsers since April 2021); its `value` is always `YYYY-MM-DD` regardless of the displayed locale format, `min`/`max`/`step` in days; the picker UI varies by OS. Use it for transaction dates with `min`/`max`; use a 1–31 select for "buy day" (clamping rules live in core, topic 11); never convert through `new Date(value)` without `T00:00` semantics, keep the string.

**Pin:** `zod@4.6.7`; `@tanstack/react-form@1.33.5` only when needed.

**Sources:** https://zod.dev/v4 · https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode · https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date · npm registry · local esbuild measurement.

---

## 10. Exact arithmetic

**Context7:** quota exceeded; read the decimal.js and big.js READMEs, the dinero.js release notes, the TC39 NumberFormat v3 README, MDN.

| Option | Version (date) | Size (gzip) | Rounding modes | Division precision | Serialisation | Notes |
|---|---|---|---|---|---|---|
| **big.js** | 7.0.1 (2025-04-21) | **2.9 kB** | `Big.RM`: 0 down, 1 half-up, 2 half-even, 3 up (`toFixed(dp, rm)`, `round(dp, rm)`) | `Big.DP` (20) applies to `div`/`sqrt`/`pow` only; everything else exact | `toString`/`toFixed`/`valueOf` strings; constructor from string | immutable; "6 KB minified"; `Big()` factory for isolated settings **[factory not re-verified today]** |
| decimal.js-light | 2.5.1 (2020) | 5.8 kB | 9 modes | significant-digit `precision` | strings | unmaintained since 2020 |
| decimal.js | 10.6.0 (2025-07-06) | 12.7 kB | 9 modes | significant digits | strings | trig/log functions we do not need; "significantly larger" per its author |
| bignumber.js | 11.1.5 (2026-07-05) | 8.6 kB | 9 modes | `DECIMAL_PLACES` for division | strings | the classic money library; `BigNumber.clone()` |
| dinero.js v2 | 2.0.2 (2026-03-13; 2.0.0 stable 2026-03-02) | 1.5 kB | n/a (integer minor units + `scale`) | no `divide`; `allocate`, `toDecimal`, bigint calculator | snapshots | excellent for 2-dp money, awkward for 8–10-dp coin units and price math |
| scaled BigInt in-house | n/a | ~1 kB | whatever you implement | yours | strings | exact and dependency-free; needs its own property-tested rounding/division |

**Recommendation: big.js 7.0.1 wrapped** in `packages/core/money` so that nothing outside the module touches the library: branded string types `Money` (2 dp, pay currency), `Units` (up to 10 dp), `Percent` (4 dp), `Price`; constructors from strings only; an **exact division helper** that avoids double rounding: `q = a.div(b)` with `DP = targetDp` and `RM = 0` (truncate), `r = a.minus(q.times(b))`, then decide the last digit from `2r` vs `b` (below / tie / above) with the requested mode (`HALF_EVEN` for money allocation, `DOWN` for coin units bought, `UP` for fees owed). Every public function takes an explicit `{ dp, mode }`. Storage holds the strings. Property tests (fast-check) assert associativity-free invariants: `sum(allocate(total, weights)) == total`, `units * price` rounds consistently, `format(parse(x)) == x`. The in-house BigInt variant is the zero-dependency alternative if the team prefers purity; big.js buys 2.9 kB of battle-tested parsing/rounding and is the "smallest adequate" choice.

**Formatting at the edge:** `Intl.NumberFormat.prototype.format` accepts a **string** and *"will use the exact value that the string represents, avoiding loss of precision"* (MDN; Intl.NumberFormat v3, shipped Chrome 106, Firefox 93, Safari 15.4 per the proposal README, all inside Next 16's floor). So `numbers.number(...)` in topic 8 should be fed the decimal string, and `formatToParts(string)` can style integer/decimal/currency parts separately (muted decimals, tabular digits). Avoid `Number()` on the way out as well. `maximumFractionDigits` may be up to 100.

**Pin:** `big.js@7.0.1` (+ `@types/big.js`).

**Sources:** https://github.com/MikeMcl/big.js · https://github.com/MikeMcl/decimal.js · https://github.com/dinerojs/dinero.js/releases · https://github.com/tc39/proposal-intl-numberformat-v3 · https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/format · npm registry · local esbuild measurement.

---

## 11. Dates

**Context7:** quota exceeded; read caniuse, date-fns blog, temporal-polyfill README, TypeScript 6.0 notes.

- **Temporal (native)**: caniuse today: Chrome/Edge **144+**, Firefox **139+** (135–138 behind flag), **Safari: no released version through 27.2** (Technology Preview only). Not shippable for an iOS-first audience. `temporal-polyfill` 1.0.6 (2026-10-13) measures **19.4 kB gz** (README: "less than 20 kB"); too much for the Today budget just for month arithmetic. TypeScript 6.0 ships Temporal types, useful later.
- **date-fns 4.4.0** (2026-05-29; v4 2024-09-16) + **@date-fns/tz 1.5.0**: `TZDate`, `tz()` context via the `in` option; measured 6.7 kB gz for the needed subset + 1.9 kB for `TZDate` + `addMonths`. Luxon 3.7.2 = 21.5 kB; dayjs 1.11.23 = 4.9 kB with utc+timezone plugins (mutable-ish API, plugin typing).
- **In-house calendar module** (recommended): `packages/core/dates` over `CalendarDate = 'YYYY-MM-DD'` branded strings. ~80 lines, no dependency, no `Date` instances in the domain:
  - `todayIn(instant: number, timeZone: string)`: `new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant))` -> assemble from parts (never from the string).
  - `addMonthsClamped(d, n, anchorDay)`: compute target `y/m`, `day = min(anchorDay, daysInMonth(y, m))` — the **anchor day** (plan's buy day) is kept separately so Jan 31 -> Feb 28 -> Mar 31, not Mar 28.
  - `addDays`, `compare` (plain string comparison works for ISO), `daysBetween` via `Date.UTC(y, m-1, d)` epoch-day arithmetic (DST-free), `isLeapYear`, `daysInMonth`, `weekday`.
  - Output through `Intl.DateTimeFormat(formattingLocale, { timeZone: 'UTC', ... }).format(Date.UTC(...))` so the rendered day never shifts with the device zone.
  - date-fns is allowed as a **dev dependency oracle** for property tests only.

**Rules to test** (fast-check + fixed vectors): month ends (31 -> 30/28/29 and back to 31 in the next long month), leap years (2024-02-29 +1y = 2025-02-28; 2100 is not leap; 2000 is), 29 Feb anniversaries counted in days vs calendar years, DST transitions in `Europe/Lisbon`/`Europe/Berlin` (today derived from an instant at 00:30 and 23:30 local on transition days), UTC-offset boundaries around midnight (instant 2026-10-16T23:30Z is 2026-10-17 in `Europe/Berlin` and 2026-10-16 in `America/Sao_Paulo`), `daysBetween` symmetric and additive, holding period in days inclusive/exclusive convention documented and tested, `addMonthsClamped` idempotence of the anchor, sorting by string equals sorting by epoch day, formatting round-trips for the three locales.

**Sources:** https://caniuse.com/temporal · https://blog.date-fns.org/v40-with-time-zone-support/ · https://github.com/fullcalendar/temporal-polyfill · https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ · npm registry · local esbuild measurement.

---

## 12. Testing

**Context7:** quota exceeded; read vitest.dev, playwright.dev, storybook.js.org, fast-check.dev, Lighthouse CI/Lighthouse GitHub docs, Chromatic/Argos/Lost Pixel pricing pages.

### Vitest 5.0.5 (2026-10-15; 5.0.0 2026-09-03)

- Requires **Node 22.12+ / 24 / 26** and Vite 6.4+/7/8 (Vite 8.3.4 current). Breaking in 5: un-awaited async assertions fail, `clearMocks` defaults to true, strict locators, `.vitest/` output dir, `Temporal` is faked by fake timers unless excluded. `test.projects` replaces the workspace file (since 4), and in 5 *"inline projects now inherit the root config by default"*. Browser Mode stable since 4.0 with provider packages (`@vitest/browser-playwright` 5.0.5); 5 adds Trace View. Coverage: v8 default with AST-aware remapping (since 3.2); set `coverage.include` so untested files count; `thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }` on the `core` project (thresholds page not re-fetched; option names from the config reference). In-source tests (`if (import.meta.vitest)`, `includeSource`, `define: { 'import.meta.vitest': 'undefined' }`) are fine for tiny utilities in core; keep separate `*.test.ts` files for the domain (readability and coverage reports).
- Projects: `core` (node, 100 % coverage), `ui` (jsdom 30.1.3 or happy-dom 21.0.3 for cheap unit tests of hooks/utilities), `stories` (Storybook plugin in browser mode, Chromium), `features` (browser mode when real layout matters).
- **fast-check 4.10.2** (2026-09-19): `fc.assert(fc.property(fc.string(), ...))`, shrinking, seeds; use `@fast-check/vitest` for `test.prop` [version not pinned today].
- **Testing Library**: `@testing-library/react` 16.3.3 (React 18/19), `jest-dom` 7.0.1, `user-event` 14.6.8.

### Playwright 1.64.1 (2026-10-14; Chromium 156, Firefox 157, WebKit 27.2)

- Projects per viewport: `projects: [{ name: 'mobile-360', use: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }, { name: 'mobile-390', use: { ...devices['iPhone 14'] } }, { name: 'tablet-768', ... }, { name: 'desktop-1280', ... }, { name: 'desktop-1920', ... }, { name: 'reduced-motion', use: { reducedMotion: 'reduce' } }, { name: 'text-zoom-125', use: { ... } }]` and `colorScheme: 'light' | 'dark'` doubled via a `forEachTheme` helper or a second project list. `colorScheme`, `reducedMotion` (`'reduce' | 'no-preference'`), `forcedColors`, `contrast`, `locale`, `timezoneId` are standard test options (standalone `reducedMotion`/`forcedColors`/`contrast` since 1.63).
- **125 % text zoom**: there is **no native option** (the emulation and test-options pages list none). Emulate the OS/browser font-size preference by injecting `html { font-size: 125% }` (via `page.addStyleTag` in a fixture, or `stylePath` for screenshots) in a dedicated project; this is faithful only if layout uses `rem`/`em`, which is the rule anyway. `deviceScaleFactor` is pixel density, not text zoom.
- **Visual regression**: `toHaveScreenshot` (`threshold` default 0.2, `maxDiffPixels`/`maxDiffPixelRatio`, `stylePath` to hide volatile parts, `animations: 'disabled'`, WebP via `type: 'webp'` since 1.64); snapshot names embed browser + platform, and the docs say *"run tests in the same environment where the baseline screenshots were generated"*. Run all visual projects **only in the pinned Docker image** `mcr.microsoft.com/playwright:v1.64.x-noble` (docs list `v1.64.0-noble`; verify the `v1.64.1` tag) with `--ipc=host --init`, locally through Docker too (`pnpm test:visual` wraps `docker run`), baselines committed, updates through a CI job triggered by a label. Mask the "prices from" timestamp and fix `timezoneId`/`locale` per project.
- **Accessibility**: `@axe-core/playwright` 4.14.0 (Node 22.12+): `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()` per screen per viewport; fixture with shared excludes; assert `violations` empty. (`wcag22aa` tag availability not re-verified today.)

### Storybook 10.6.2 (2026-10-12; 10.0 2025-10-28)

ESM-only (Node 20.16+/22.19+/24+); `@storybook/nextjs-vite` (recommended over the webpack framework; peers next ^14.1–^16, vite ^5–^8) supports `next/font` (local fonts need `staticDirs`), `next/image`, `next/navigation` mocks (`parameters.nextjs.appDirectory: true`); `@storybook/addon-vitest` turns stories into Vitest browser tests via portable stories (peers vitest ^3 || ^4 || ^5) and runs **`@storybook/addon-a11y`** checks in the same run (`parameters.a11y.test: 'error'` project-wide, `'todo'` for triage); Viewport is built in (`parameters.viewport.options`, `initialGlobals.viewport`) — define the six Proof of Calm viewports there too; the old `@storybook/test-runner` 0.26.0 is *"superseded by the Vitest addon"*. Stories are the component contract for `packages/ui` and the screen contract for `packages/features` (with Dexie mocked through a repository interface).

### Lighthouse CI

`@lhci/cli` 0.15.1 (2025-06-25; bundles Lighthouse 12.6.1; current Lighthouse is 13.5.0 — LHCI lags, acceptable). **Lighthouse 12 removed budgets** (`budgets.json`, `performance-budget`/`timing-budget` audits: changelog "remove budgets"), so express budgets as assertions; the `resource-summary` audit still exists (hidden, weight 0) and supports `resource-summary:script:size` with `maxNumericValue` in **bytes**:

```json
{ "ci": {
  "collect": { "url": ["https://<preview>/", "https://<preview>/plan/"], "numberOfRuns": 5,
               "settings": { "extraHeaders": { "x-vercel-protection-bypass": "$VERCEL_AUTOMATION_BYPASS_SECRET", "x-vercel-set-bypass-cookie": "true" } } },
  "assert": { "assertMatrix": [
    { "matchingUrlPattern": "/$", "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 1 }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 194560 }],
        "resource-summary:total:size": ["error", { "maxNumericValue": 409600 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }] } } ] },
  "upload": { "target": "temporary-public-storage" } } }
```

Lighthouse's default device is mobile (`settings.preset: 'desktop'` for a second run). Vercel preview URLs behind Deployment Protection accept the `x-vercel-protection-bypass` header/query param (secret auto-provided as `VERCEL_AUTOMATION_BYPASS_SECRET`). Performance score weights: TBT 30, LCP 25, CLS 25, FCP 10, SI 10.

### Visual-regression tooling cost (solo builder)

Playwright snapshots in Docker: free, owned, deterministic; Chromatic (`@chromatic-com/storybook` 5.5.1): free tier **5,000 snapshots/month, Chrome only**, Starter $179/mo (35k, adds Safari/Firefox); Argos: free **5,000 screenshots/month**, Pro $100/mo for 35k; **Lost Pixel is sunsetting** (joined Figma; "We are sunsetting the product") — do not adopt. Recommendation: Playwright snapshots (6 viewports x 2 themes x ~8 screens = ~100 images per run, committed as WebP), Argos later only if review UX becomes a pain.

### CI layout (GitHub Actions)

1. `verify` (ubuntu, Node 24, pnpm 12, Turbo remote cache): `turbo run lint typecheck test --affected` (Biome, tsc, Vitest node+jsdom projects, dependency-cruiser, knip).
2. `stories` (same job or parallel): Vitest browser project with the Storybook plugin + a11y, Playwright Chromium from the Docker image.
3. `e2e-visual` (container `mcr.microsoft.com/playwright:v1.64.x-noble`): Playwright matrix projects, `toHaveScreenshot`, axe; artifacts: HTML report + diffs; `update-snapshots` job on label.
4. `lighthouse` (after the Vercel preview deployment event): `lhci autorun` with the config above; comment the summary on the PR.
5. `build` is Vercel's; `turbo run build` runs in CI only for `apps/mobile` at M3.

**Pins:** `vitest@5.0.5`, `@vitest/browser-playwright@5.0.5`, `@vitest/coverage-v8@5.0.5`, `fast-check@4.10.2`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event@14.6.8`, `jsdom@30.1.3` (or `happy-dom@21.0.3`), `@playwright/test@1.64.1`, `@axe-core/playwright@4.14.0`, `storybook@10.6.2`, `@storybook/nextjs-vite@10.6.2`, `@storybook/addon-vitest@10.6.2`, `@storybook/addon-a11y@10.6.2`, `@lhci/cli@0.15.1`, `vite@8.3.4`.

**Sources:** https://vitest.dev/blog/vitest-5 · https://vitest.dev/blog/vitest-4 · https://vitest.dev/guide/browser/ · https://vitest.dev/guide/coverage · https://vitest.dev/guide/in-source · https://fast-check.dev/docs/introduction/getting-started/ · https://playwright.dev/docs/release-notes · https://playwright.dev/docs/test-projects · https://playwright.dev/docs/api/class-testoptions · https://playwright.dev/docs/emulation · https://playwright.dev/docs/test-snapshots · https://playwright.dev/docs/docker · https://playwright.dev/docs/accessibility-testing · https://storybook.js.org/blog/storybook-10/ · https://storybook.js.org/docs/get-started/frameworks/nextjs · https://storybook.js.org/docs/writing-tests/integrations/vitest-addon · https://storybook.js.org/docs/writing-tests/accessibility-testing · https://storybook.js.org/docs/essentials/viewport · https://storybook.js.org/docs/writing-tests/integrations/test-runner · https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md · https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0 · https://raw.githubusercontent.com/GoogleChrome/lighthouse/main/core/config/default-config.js · https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation · https://www.chromatic.com/pricing · https://argos-ci.com/pricing · https://www.lost-pixel.com/pricing · npm registry (peer ranges).

---

## 13. Lint and format

**Context7:** quota exceeded; read biomejs.dev, eslint.org, typescript-eslint.io, the Next ESLint page, plugin READMEs.

### Facts

- **Biome 2.5.15** (2026-09-30; 2.5.0 2026-06-12; 2.0 2025-06-17): 500+ rules; nursery rules promoted incl. type-aware ("type inference") rules (the post does not enumerate them; Biome's inference is its own, not the TS checker, so expect gaps vs typescript-eslint's `no-floating-promises`-class rules); cross-file module graph; `organizeImports` assist (bare imports, `:STYLE:` groups); `useSortedClasses` is **still nursery** (since 1.6): unsafe fix, no `tailwind.config` awareness, **screen variants (`md:`) not sorted**, plugin utilities unknown; GritQL plugins with code fixes; `--watch`; `overrides[].includes` globs with their own `linter.rules`; nested configs (`"root": false`, `"extends": "//"`); `noRestrictedImports` supports gitignore-style `patterns` groups with messages (since 2.2). Biome does not depend on the TypeScript API, so TypeScript 7 does not affect it.
- **ESLint 10.13.0** (2026-10-16; 10.0.0 2026-02-06; v9 EOL 2026-08-06), flat config only. **typescript-eslint 8.71.2 supports TypeScript `>=4.8.4 <6.1.0`** (no TS 7). `eslint-config-next` 16.4.2: `core-web-vitals` + `typescript` flat configs, ESLint 9/10, bundles `eslint-plugin-react`, `eslint-plugin-react-hooks` and `@next/eslint-plugin-next` (`settings.next.rootDir: 'apps/*/'` for monorepos). `eslint-plugin-react-hooks` 7.1.1 carries the React Compiler rules (`recommended-latest`). Prettier 3.9.10 + `prettier-plugin-tailwindcss` 0.8.1 remain the only *config-aware* Tailwind class sorter.
- Dependency rules: `eslint-plugin-boundaries` 7.2.0 (elements by `pattern`, `boundaries/dependencies` policies with `from`/`allow`/`disallow`; docs at jsboundaries.dev), `dependency-cruiser` 18.6.0 (rules on `from.path`/`to.path`, `no-circular`, TS path aliases, graph output), `knip` 6.41.0 (unused files/exports/deps; Node 20.19+; 194 plugins).

### Recommendation

- **Biome** as the formatter and primary linter for the whole repo (`biome.json` at root, `recommended` preset, `organizeImports` on, `useSortedClasses` enabled as **information-level** with `functions: ["cn", "cva", "clsx"]`, no Prettier).
- **Minimal ESLint 10** config that only loads what Biome lacks: `eslint-plugin-react-hooks` (`recommended-latest`, compiler diagnostics) and `@next/eslint-plugin-next` (core-web-vitals rules, `rootDir: ['apps/*/']`). No `typescript-eslint` (keeps the TS-API coupling out; type-aware checks come from `tsc --noEmit` with strict flags).
- **Layer rule, enforced twice**: (1) in the editor via Biome `overrides` (fast feedback), (2) authoritatively in CI via **dependency-cruiser** (`depcruise --validate .dependency-cruiser.cjs apps packages`), which also catches cycles and orphan modules. **knip** in CI for dead exports/deps (`knip --workspace` config with the Next/Storybook/Vitest/Playwright plugins).

Layer definition: `apps/*` -> `packages/features` -> `packages/ui` and `packages/core`; `packages/ui` -> `packages/core` only (plus React, Base UI, Tailwind utilities); `packages/core` -> nothing framework-ish (no `react`, `next`, `dexie`, DOM); `packages/api-client` -> `packages/core`; `packages/i18n` is leaf data. Biome sketch:

```jsonc
{ "overrides": [
  { "includes": ["packages/core/**"], "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "patterns": [
      { "group": ["react", "react-dom", "next", "next/*", "dexie", "@proofofcalm/ui", "@proofofcalm/features", "@proofofcalm/api-client"], "message": "packages/core is pure TypeScript: no framework, no I/O, no upward imports." } ] } } } } } },
  { "includes": ["packages/ui/**"], "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "patterns": [
      { "group": ["@proofofcalm/features", "@proofofcalm/api-client", "next/headers", "next/server", "dexie"], "message": "packages/ui depends only on packages/core." } ] } } } } } },
  { "includes": ["packages/features/**"], "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "patterns": [
      { "group": ["next/headers", "next/server", "next/cache", "@proofofcalm/web/*", "@proofofcalm/mobile/*"], "message": "features never import app code or server-only Next modules." } ] } } } } } }
] }
```

dependency-cruiser then expresses the same as `forbidden` rules with `from: { path: '^packages/core' }, to: { pathNot: '^packages/core' }` etc., plus `no-circular`. Why not `eslint-plugin-boundaries`: it would work, but it ties the rule to ESLint's resolver and the ESLint layer is deliberately tiny; dependency-cruiser's report doubles as architecture documentation.

**Gotchas:** keep Biome and ESLint from overlapping (disable Biome's `useExhaustiveDependencies`/`useHookAtTopLevel` or ESLint's `rules-of-hooks`, pick one — pick ESLint's since the compiler rules live there). `create-next-app`'s ESLint template conflicts with Biome formatting; do not install `eslint-config-next` wholesale, import the two plugins directly. Tailwind sorting will be imperfect until Biome's rule leaves nursery; accept it.

**Pins:** `@biomejs/biome@2.5.15`, `eslint@10.13.0`, `eslint-plugin-react-hooks@7.1.1`, `@next/eslint-plugin-next@16.4.2`, `dependency-cruiser@18.6.0`, `knip@6.41.0`.

**Sources:** https://biomejs.dev/blog/biome-v2-5/ · https://biomejs.dev/linter/rules/no-restricted-imports/ · https://biomejs.dev/linter/rules/use-sorted-classes/ · https://biomejs.dev/reference/configuration/ · https://eslint.org/blog/ · https://typescript-eslint.io/users/dependency-versions/ · https://nextjs.org/docs/app/api-reference/config/eslint · https://github.com/javierbrea/eslint-plugin-boundaries · https://knip.dev/overview/getting-started · npm registry.

---

## 14. Monorepo tooling

**Context7:** quota exceeded (Turborepo, TypeScript); read turborepo.dev (turborepo.com now redirects there), pnpm.io, the TypeScript blog.

### pnpm 12.14.0 (2026-10-15; 12.0.0 2026-08-26)

- **Catalogs** in `pnpm-workspace.yaml` (`catalog:` default + `catalogs:` named); `"react": "catalog:"` in every `package.json`; `catalogMode: strict` makes `pnpm add` refuse out-of-catalog versions; `catalogPrune: true` removes unused entries; the protocol is replaced on `pnpm publish`.
- **Supply-chain settings**: `minimumReleaseAge` (minutes; default **1440 since v11**; set explicitly to `1440`, 2880 for extra caution; `minimumReleaseAgeExclude` for own packages, `minimumReleaseAgeStrict` true when configured, `minimumReleaseAgeIgnoreMissingTime` default true), `trustPolicy: no-downgrade` (fails if a package's trust level drops), `blockExoticSubdeps` (default true since 10.26: transitive deps only from the registry), `strictDepBuilds` / `allowBuilds` (explicit allow-list for postinstall scripts: `esbuild`, `sharp`, `@biomejs/biome`, `@tailwindcss/oxide`), `verifyDepsBeforeRun`.

### Turborepo 2.11.8 (2026-10-13; 2.11.0 2026-09-18)

`turbo.json` with `"$schema": "https://turborepo.dev/schema.json"`; tasks `build` (`dependsOn: ['^build']`, `outputs: ['.next/**', '!.next/cache/**', 'out/**', 'storybook-static/**']`, `inputs: ['$TURBO_DEFAULT$', '!**/*.md']`, `env: ['NEXT_PUBLIC_*']`), `lint`, `typecheck`, `test` (`outputs: ['coverage/**']`), `test:e2e` (`cache: false`), `dev` (`cache: false, persistent: true`); `envMode: 'strict'` (default) so builds are hermetic; `globalEnv: ['NODE_ENV', 'CI']`. CI: `turbo run lint typecheck test --affected` (= `--filter=...[main...HEAD]`; needs `fetch-depth: 0` or `TURBO_SCM_BASE`), `--continue=dependencies-successful`, `--summarize` on failure. **Remote cache**: *"free to use on all plans, even if you do not host your applications on Vercel"*, `turbo login` + `turbo link`, CI via `TURBO_TOKEN`/`TURBO_TEAM` [CI guide not re-fetched], `remoteCache.signature: true` with `TURBO_REMOTE_CACHE_SIGNATURE_KEY`.

### TypeScript

- **7.0.2** (2026-07-08) is the native Go compiler: *"it does not ship with an API"*; the TS team recommends aliasing (`"typescript": "npm:@typescript/typescript6@^6.0.2"`, `"@typescript/native": "npm:typescript@^7.0.2"`) for tools that embed the JS API. New defaults in 7: `strict: true`, `module: esnext`, `target` = latest stable ES, `types: []`, `rootDir: ./`, `noUncheckedSideEffectImports: true`, `stableTypeOrdering` always on; hard errors for `baseUrl`, `moduleResolution node10/classic`, `module amd/umd/system/none`, `target es5`, `esModuleInterop: false`, `alwaysStrict: false`, `asserts` on imports.
- **6.0.3** (2026-04-16; 6.0 announced 2026-03-23) is the bridge release with the same new defaults and deprecations (`ignoreDeprecations: "6.0"` to silence), Temporal types, `#/` subpath imports, `--stableTypeOrdering`.
- Tooling today: Next 16.4 type-checks through the `tsc` CLI (TS 7 ok); Vitest/Storybook/Turbopack transpile with esbuild/SWC (no TS API); **typescript-eslint (<6.1) and knip (TS API) do not support 7**; `tsdown` 0.23.1 supports 5/6/7; VS Code's TS 7 story outside the native-preview extension **[unverified today]**.
- **Decision: pin `typescript@6.0.3` as the single `typescript` for now**, with a 7.0-ready `packages/config/tsconfig.base.json`: `"strict": true, "exactOptionalPropertyTypes": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true, "noFallthroughCasesInSwitch": true, "verbatimModuleSyntax": true, "isolatedModules": true, "module": "esnext", "moduleResolution": "bundler", "target": "es2022", "lib": ["es2023", "dom", "dom.iterable"], "types": [], "skipLibCheck": true, "noEmit": true, "paths": { "@proofofcalm/*": ["../../packages/*/src"] }` (no `baseUrl`). Each package has a 5-line `tsconfig.json` extending it and adding `types` (`["node"]`, `["vitest/globals"]`) and `include`. Switch to 7.0.x when knip and the ESLint layer are confirmed to work with the alias (or when Biome fully replaces ESLint and knip gains TS-7 support) — the flip is a one-line change because the config is already 7-compatible.

### Consuming packages without a build step

`packages/*/package.json` use `"exports": { ".": "./src/index.ts", "./*": "./src/*.ts" }` plus `"types"` pointing at source. Next docs: *"Turbopack transpiles workspace packages (npm, pnpm, or Yarn workspaces) in your monorepo automatically"*, so `transpilePackages` is **not needed** by default; add `transpilePackages: ['@proofofcalm/ui', '@proofofcalm/features', '@proofofcalm/core', '@proofofcalm/api-client']` only for the `next build --webpack` fallback. Vite (Storybook, Vitest) consumes source too. `tsc -b` project references are unnecessary at this size; one `typecheck` task per package (`tsc --noEmit`) run by Turbo in parallel is simpler. `tsup`/`tsdown`: only if a package is ever published.

**Node:** **24 LTS, pinned to >= 24.11** (`engines`, `.nvmrc`, `packageManager: pnpm@12.14.0`): satisfies Next (>= 20.9), Vitest 5 (^22.12 || ^24), Capacitor 8 (>= 22), supabase-js (>= 22), `@axe-core/playwright` (>= 22.12), tsdown (^24.11), Storybook 10 (24+); note Next 16.4's worker-thread fallback bug on Node >= 24.13.1 (affects only the experimental `workerThreads` plugin strategy).

**Pins:** `pnpm@12.14.0`, `turbo@2.11.8`, `typescript@6.0.3` (upgrade target `typescript@7.0.2`), Node 24.

**Sources:** https://pnpm.io/catalogs · https://pnpm.io/settings · https://pnpm.io/settings/dependency-resolution · https://turborepo.dev/docs/reference/configuration · https://turborepo.dev/docs/reference/run · https://turborepo.dev/docs/core-concepts/remote-caching · https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ · https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ · https://typescript-eslint.io/users/dependency-versions/ · https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages · https://nextjs.org/docs/app/api-reference/config/typescript · npm registry (engines/peers).

---

## 15. Fonts (technical facts for the brand track)

All nine families are served by Google Fonts under the SIL Open Font License (the `name` table of Geist, Inter and IBM Plex confirms OFL; the others are OFL-only on Google Fonts). Measured on the **Latin-subset, upright, `wght`-only variable woff2** that Google Fonts serves (what `next/font/google` would download; a good proxy for a self-subset `next/font/local` file). "Default tabular" = all ten digits share one advance width without any feature.

| Family | Latin variable woff2 | `wght` range | `tnum` feature | Default digits tabular? | Other numeric features in subset | Notes |
|---|---|---|---|---|---|---|
| Figtree | **20.2 kB** | 300–900 | yes | no (410–638/1000) | pnum, frac | smallest |
| Manrope | 24.8 kB | 200–800 | yes | no | pnum, frac | |
| Public Sans | 26.8 kB | 100–900 | yes | no | pnum, frac | |
| Source Sans 3 | 28.9 kB | 200–900 | **no (not needed)** | **yes (472/1000)** | pnum (switch to proportional), frac | tabular by default |
| Geist | 29.4 kB | 100–900 | yes | no (384–663/1000) | pnum, frac | upstream `geist@1.8.1` `Geist-Variable.woff2` = 69.5 kB with ss01–ss11, `case`, `dlig`; no `zero` |
| Instrument Sans | 30.1 kB | 400–700 | yes | no | pnum | narrow weight range |
| Archivo | 34.9 kB | 100–900 | yes | nearly (575–577/1000) | pnum, frac | prototype font; upstream also has `wdth` axis |
| IBM Plex Sans | 45.7 kB | 100–700 | **no (not needed)** | **yes (600/1000)** | none in Google/Fontsource builds; upstream `@ibm/plex-sans-variable` 0.2.0 Latin1 (69.0 kB) adds lnum, onum, **zero**, ss01–05 and a `wdth` 85–100 axis | tabular by default |
| Inter | 48.3 kB | 100–900 | yes | no (833–1323/2048) | pnum, frac | upstream Inter 4.1 `InterVariable.woff2` = 352 kB (opsz + wght, 2937 glyphs, `zero`, cv01–cv13, ss01–ss08); subset with `pyftsubset --layout-features+=tnum,zero,cv..` to ~50 kB |

Technical rules regardless of the choice: use `next/font/local` with one variable upright file (`weight: '100 900'`, `display: 'swap'`, `variable: '--font-sans'`, `adjustFontFallback: 'Arial'`), italics only if the brand needs them (second file); set `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`) on every numeric column/strip (no-op for Plex/Source Sans, required for the rest); if slashed zero matters for crypto amounts, only Inter (upstream) and IBM Plex (upstream) have `zero`; subset upstream files to Latin (`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD` is Google's latin range) and keep the needed features.

**Sources:** https://fonts.googleapis.com/css2 (Latin-subset files, Chrome UA) · npm `geist@1.8.1`, `@ibm/plex-sans-variable@0.2.0`, `@fontsource-variable/inter@5.3.0`, `@fontsource-variable/source-sans-3@5.3.1`, `@fontsource-variable/ibm-plex-sans@5.3.0` · https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip · https://github.com/adobe-fonts/source-sans/releases (asset names not retrievable; upstream VF not inspected) · fontTools inspection (see §0).

---

## 16. Bundle-budget reality check

Baseline and increments (measured today; brotli is what Vercel serves, gzip shown for comparison):

| Item on the Today page | gzip | brotli | Notes |
|---|---|---|---|
| Next 16.4 App Router + React 19.3 empty page (5 scripts) | **132.0 kB** | **112.7 kB** | react-dom alone 70.1 / 60.0 |
| next-intl client runtime | 12.3 | 10.9 | + the active locale's messages (~5–10 kB gz for ~300 strings) |
| Dexie + dexie-react-hooks | 32.4 | 29.0 | |
| big.js | 2.9 | 2.7 | |
| zod/mini schemas | ~5.1 | ~4.7 | |
| Zustand | 0.7 | 0.6 | |
| Custom SVG charts (sparkline, progress strip) | ~3 | ~3 | estimate |
| Today screen + shell + navigation + core logic (own code) | ~20–30 | ~18–26 | estimate for a disciplined feature slice |
| **Today total** | **~208–218 kB** | **~182–190 kB** | |
| Lazy, not on Today: lightweight-charts (46 br), supabase-js `createClient` (**57.0 gz / 48.3 br**), dexie-export-import (45.7 br), settings/onboarding/learn screens, markdown content | | | |

**Conclusion:** 150 kB of total first-load JavaScript on Today is **not realistic** with the decided framework: the empty-page floor is 113 kB brotli / 132 kB gzip, leaving 18–37 kB for i18n + persistence + domain + UI, and Dexie alone is 29 kB brotli. Two ways out:

1. **Redefine the budget** (recommended): "Today first-load JS <= **190 kB brotli** total as served (assert `resource-summary:script:size <= 194,560` bytes), of which **application code <= 60 kB**; LCP <= 2.5 s, TBT <= 200 ms on Moto G Power-class throttling; performance score >= 95". This is achievable and still forces discipline (charts, Supabase, backups, onboarding, learn content lazy; `prefetch={false}` on nav links until the prefetch cost is measured, because Next prefetches visible routes' chunks and those bytes are counted by the audit during the trace).
2. **Hit 150 kB brotli literally** by replacing Dexie with `idb` 8.0.4 (1.2 kB br) plus an in-house migration/`BroadcastChannel` live-query layer (~300 lines, more tests), and next-intl with Paraglide (saves ~8 kB). Both are costs in code and risk, for roughly 36 kB. Not recommended; the framework floor would still be 75 % of the budget.

Either way: keep the `nomodule` polyfill (not downloaded by modern browsers), serve brotli (Vercel default), enable the React Compiler (negligible size), measure with the Turbopack Bundle Analyzer (`next build --analyze`-style via the 16.4 analyzer) per PR, and split `packages/features` so that each route imports only its slice. Put the numbers above into `lighthouserc.json` from the first deploy so regressions show up as PR failures rather than as surprises.

**Sources:** local measurements (§0, §1 table, esbuild table in §6/§7/§8/§9/§10/§11); Lighthouse default config (audit availability); https://nextjs.org/blog/next-16 (prefetching rewrite) · https://nextjs.org/blog/next-16-4 (bundle analyzer, shared runtime).

---

## Pinned versions

| Package | Version | Release date | Source (accessed 2026-10-16) |
|---|---|---|---|
| next | 16.4.2 | 2026-10-15 | https://registry.npmjs.org/next · https://nextjs.org/blog/next-16-4 |
| react / react-dom | 19.3.1 | 2026-10-14 | https://registry.npmjs.org/react · https://react.dev/blog/2026/09/09/react-19-3 |
| babel-plugin-react-compiler | 1.0.0 | 2025-10-07 | https://registry.npmjs.org/babel-plugin-react-compiler |
| typescript | 6.0.3 (target 7.0.2) | 2026-04-16 (7.0.2: 2026-07-08) | https://registry.npmjs.org/typescript · https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| tailwindcss / @tailwindcss/postcss / @tailwindcss/vite | 4.3.3 | 2026-07-16 | https://registry.npmjs.org/tailwindcss · https://github.com/tailwindlabs/tailwindcss/releases |
| @tailwindcss/turbopack | 4.3.3 | 2026-07-31 | https://registry.npmjs.org/@tailwindcss/turbopack |
| shadcn (CLI) | 4.22.0 | 2026-10-16 | https://registry.npmjs.org/shadcn · https://ui.shadcn.com/docs/changelog |
| @base-ui/react | 1.9.0 | 2026-10-09 | https://registry.npmjs.org/@base-ui/react · https://base-ui.com/react/overview/releases |
| tw-animate-css | 1.4.0 | 2025-09-24 | https://registry.npmjs.org/tw-animate-css |
| lucide-react | 1.58.0 | 2026-10-16 | https://registry.npmjs.org/lucide-react |
| class-variance-authority / tailwind-merge / clsx | 0.7.1 / 3.7.0 / 2.1.1 | 2024-11-26 / 2026-09-12 / 2024-04-23 | npm registry |
| dexie | 4.4.6 | 2026-09-10 | https://registry.npmjs.org/dexie |
| dexie-react-hooks | 4.4.0 | 2026-03-18 | https://registry.npmjs.org/dexie-react-hooks |
| dexie-export-import | 4.4.1 | 2026-09-10 | https://registry.npmjs.org/dexie-export-import |
| zustand | 5.0.15 | 2026-08-13 | https://registry.npmjs.org/zustand |
| next-intl | 4.14.9 | 2026-10-02 | https://registry.npmjs.org/next-intl |
| zod | 4.6.7 | 2026-10-12 | https://registry.npmjs.org/zod · https://zod.dev/v4 |
| big.js | 7.0.1 | 2025-04-21 | https://registry.npmjs.org/big.js |
| serwist / @serwist/turbopack / @serwist/window (/ @serwist/next fallback) | 9.5.13 | 2026-10-04 | https://registry.npmjs.org/serwist · https://github.com/serwist/serwist/releases |
| esbuild (peer of @serwist/turbopack) | 0.28.2 | 2026-08-08 | https://registry.npmjs.org/esbuild |
| @supabase/supabase-js | 2.118.0 | 2026-10-15 | https://registry.npmjs.org/@supabase/supabase-js |
| @capacitor/core, cli, ios, android (M3) | 8.5.3 | 2026-10-07 | https://registry.npmjs.org/@capacitor/core · https://capacitorjs.com/docs/updating/8-0 |
| @capacitor/push-notifications / local-notifications / app / browser / share / filesystem / preferences (M3) | 8.1.3 / 8.3.1 / 8.1.2 / 8.0.5 / 8.0.3 / 8.1.5 / 8.0.1 | 2026-10-02 / 08-19 / 10-02 / 10-02 / 10-02 / 10-15 / 02-12 | npm registry |
| vitest / @vitest/browser-playwright / @vitest/coverage-v8 | 5.0.5 | 2026-10-15 (5.0.0: 2026-09-03) | https://registry.npmjs.org/vitest · https://vitest.dev/blog/vitest-5 |
| vite | 8.3.4 | 2026-10-08 | https://registry.npmjs.org/vite |
| fast-check | 4.10.2 | 2026-09-19 | https://registry.npmjs.org/fast-check |
| @testing-library/react / jest-dom / user-event | 16.3.3 / 7.0.1 / 14.6.8 | 2026-08-27 / 2026-08-09 / 2026-10-13 | npm registry |
| jsdom (or happy-dom) | 30.1.3 (21.0.3) | 2026-10-15 | npm registry |
| @playwright/test / playwright | 1.64.1 | 2026-10-14 (1.64.0: 2026-10-07) | https://registry.npmjs.org/@playwright/test · https://playwright.dev/docs/release-notes |
| @axe-core/playwright | 4.14.0 | 2026-10-15 | https://registry.npmjs.org/@axe-core/playwright |
| storybook / @storybook/nextjs-vite / addon-vitest / addon-a11y | 10.6.2 | 2026-10-12 (10.0.0: 2025-10-28) | https://registry.npmjs.org/storybook · https://storybook.js.org/blog/storybook-10/ |
| @lhci/cli | 0.15.1 (Lighthouse 12.6.1 bundled) | 2025-06-25 | https://registry.npmjs.org/@lhci/cli |
| @biomejs/biome | 2.5.15 | 2026-09-30 (2.5.0: 2026-06-12) | https://registry.npmjs.org/@biomejs/biome · https://biomejs.dev/blog/biome-v2-5/ |
| eslint | 10.13.0 | 2026-10-16 (10.0.0: 2026-02-06) | https://registry.npmjs.org/eslint · https://eslint.org/blog/ |
| eslint-plugin-react-hooks | 7.1.1 | 2026-04-17 | https://registry.npmjs.org/eslint-plugin-react-hooks |
| @next/eslint-plugin-next | 16.4.2 | 2026-10-15 | https://registry.npmjs.org/@next/eslint-plugin-next |
| dependency-cruiser | 18.6.0 | 2026-10-11 | https://registry.npmjs.org/dependency-cruiser |
| knip | 6.41.0 | 2026-10-09 | https://registry.npmjs.org/knip |
| pnpm | 12.14.0 | 2026-10-15 (12.0.0: 2026-08-26) | https://registry.npmjs.org/pnpm |
| turbo | 2.11.8 | 2026-10-13 (2.11.0: 2026-09-18) | https://registry.npmjs.org/turbo |
| Node.js | 24 LTS (>= 24.11) | — | engines of vitest/tsdown/capacitor/supabase-js (npm registry) |
| Considered, not pinned | recharts 3.10.1 (2026-07-25), lightweight-charts 5.2.1 (2026-08-12), uplot 1.6.32, @visx/* 4.0.0, chart.js 4.5.1, @observablehq/plot 0.6.17, date-fns 4.4.0 + @date-fns/tz 1.5.0, temporal-polyfill 1.0.6, luxon 3.7.2, dayjs 1.11.23, decimal.js 10.6.0, decimal.js-light 2.5.1, bignumber.js 11.1.5, dinero.js 2.0.2, react-hook-form 7.90.0, @tanstack/react-form 1.33.5, idb 8.0.4, idb-keyval 6.3.0, tinybase 10.0.1, rxdb 17.6.0, @powersync/web 2.4.2, @electric-sql/client 1.5.28, @tanstack/db 0.15.0, jotai 3.0.1, @tanstack/store 0.11.2, @inlang/paraglide-js 2.29.0, @lingui/core 6.10.0, prettier 3.9.10, prettier-plugin-tailwindcss 0.8.1, typescript-eslint 8.71.2, eslint-plugin-boundaries 7.2.0, workbox-build 7.4.1, @chromatic-com/storybook 5.5.1, react-aria-components 1.22.1, @ark-ui/react 5.39.3, radix-ui 1.8.1, tsdown 0.23.1, tsup 9.0.0 | | npm registry |

---

## Disagreements and flags

1. **The 150 kB first-load JS budget is below the framework floor.** Measured today: an empty Next 16.4 App Router page is 132 kB gzip / 113 kB brotli (react-dom 70 kB gz, Next client runtime 49 kB gz). With Dexie (29 kB br) and next-intl (11 kB br) the Today page lands at ~180–190 kB brotli even with charts, Supabase and backups lazy-loaded. Proposal: budget = **<= 190 kB brotli total script transfer on Today, <= 60 kB of it application code**, plus LCP/TBT/CLS thresholds and performance >= 95 (topic 16). If the number 150 is non-negotiable, the only honest routes are (a) `idb` + in-house live queries instead of Dexie and Paraglide instead of next-intl (~36 kB saved, more code to own), or (b) a different framework for the shell, which is out of scope of this report.
2. **Static export and Cache Components are mutually exclusive today** (`Invariant: PPR cannot be enabled in export mode`, next 16.4.1), while Next says Cache Components become the default in Next 17 and "the old configurations will be removed". Decision: keep `cacheComponents` off in both apps on 16.x, keep screens free of server-only APIs, and keep a Vite + React Router shell as plan B for the Capacitor build. Re-check at the Next 17 release before milestone 3.
3. **TypeScript 7 is current but not consumable by typescript-eslint or knip** (both require the JS API, `<6.1`). Pin TypeScript 6.0.3 with a 7-ready config; flip to 7.0.x when the ESLint layer and knip are confirmed to work through the `@typescript/typescript6` alias (or when they add native support). Not a conflict with a decided item, but it changes "TypeScript current version" to "current *consumable* version".
4. **Context7 was unavailable for the whole session** (monthly quota exceeded; the two IDs that resolved were rate-limited on query). Everything was verified against official documentation via WebFetch instead; nothing here relies on Context7. If the planning process requires Context7 evidence, re-run the resolve/query calls once the quota resets and diff against the sources listed above.
5. **Items not confirmable from a primary source today** (WebSearch budget was exhausted mid-session): service-worker behaviour under `capacitor://localhost` on iOS (rule stands: never register a SW in the native shell); the exact `mcr.microsoft.com/playwright:v1.64.1-noble` tag (docs show `v1.64.0-noble`); `wcag22aa` axe tag; big.js `Big()` constructor factory; Tailwind v4's own browser floor (believed Safari 16.4 / Chrome 111 / Firefox 128, all at or above Next 16's floor); `TURBO_TOKEN`/`TURBO_TEAM` names (CI guide not fetched); VS Code support for the TS 7 language service.
6. **Lost Pixel is sunsetting** (its pricing page announces it joined Figma); do not plan on it. Chromatic/Argos free tiers (5,000 snapshots/month) would cover a solo builder, but Playwright snapshots in the pinned container are free and sufficient.
7. **`@lhci/cli` 0.15.1 is 16 months old** and bundles Lighthouse 12.6.1 (current 13.5.0). It works, but if it stalls, the fallback is the `lighthouse` CLI in a 30-line script asserting the same audits.
