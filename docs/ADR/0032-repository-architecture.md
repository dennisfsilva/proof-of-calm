# ADR-0032: Repository architecture and the store-wrapper build

Status: Accepted; the Next.js hosts and `proxy.ts` superseded by ADR-0045 (Vite hosts, wouter behind `lib/navigation`) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §1, §4, §14)

## Context

ADR-0002 requires the Capacitor wrapper to be a packaging step. A Next.js static export (`output: 'export'`) rejects route handlers that read the request, `proxy.ts`, server actions and `cacheComponents`; the brief's candidate (one app with a `pageExtensions` switch per build) is fragile. The research measured that `output: 'export'` with `cacheComponents` fails today and that Next intends Cache Components as the default in its next major. A solo builder also needs few moving parts.

## Options considered

1. **One Next app, two builds** with env-gated `output` and a `pageExtensions` trick to exclude route handlers. Fragile and surprising.
2. **A separate API app from day one** (`apps/api` with Hono or route handlers). Clean, but adds a deployable and CORS for the web app too, for one price endpoint.
3. **Thin host apps over shared packages**: the product lives in packages; `apps/web` is the full Next host (routes as one-line re-exports, API route handlers, `proxy.ts`, PWA, legal and site pages); `apps/mobile` (M3) is a second Next host with `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`, no service worker, the API base URL pointing at the hosted app, wrapped by Capacitor.

## Decision

Option 3. The layout (`docs/ARCHITECTURE.md` is the detailed version):

```
apps/web        Next host: app/ routes (re-exports), app/api/* route handlers, proxy.ts (CSP nonce, security headers, UK geo-block), manifest, service worker, (site) pages, e2e
apps/mobile     Next static-export host (skeleton from M0 so CI catches drift; Capacitor project in M3)
packages/app    the product: features/*, lib/ (ports, adapters, api-client, i18n, format, errors, pwa, platform), messages/
packages/core   pure domain logic
packages/ui     tokens, components, charts, Storybook
packages/content jurisdictions, templates, Learn modules, cycle data, banned words, schemas
packages/data   the reference-close price history and its licence (ADR-0036)
packages/config tsconfig base, Biome and ESLint config, dependency-cruiser rules, Vitest and Playwright presets
tools/          scripts: content validation, reference-close pipeline, golden-fixture generation, message merge
```

Rules that keep both hosts thin and the wrapper a packaging step:

1. Screens and features never import `next/headers`, `cookies()`, server actions, `'use cache'` or anything from `apps/*`; `cacheComponents` stays off in both hosts.
2. Navigation goes through a small adapter in `packages/app/lib/navigation` (wrapping `next/link` and `next/navigation` today) so a Vite + React Router host could replace a Next host (plan B in ADR-0005).
3. All API calls go through `packages/app/lib/api-client` with an injectable base URL; requests carry `Authorization: Bearer <token>`; the API's CORS allow-list contains `capacitor://localhost` and `https://localhost` besides the web origin; nothing depends on cookies.
4. Auth uses the browser Supabase client with a storage adapter (localStorage on the web and the PWA, `@capacitor/preferences` in the wrapper); `proxy.ts` does not handle auth; it sets the CSP nonce, the security headers and the UK block.
5. A `platform` abstraction (`web | pwa | ios | android`) in `packages/app/lib/platform` with web implementations (Web Share, `<a download>`, Notification API) that Capacitor plugins replace in M3; the service worker registers only when not native.
6. The static-export build of `apps/mobile` runs in CI from M0; a screen that breaks it fails the PR.
7. Universal Links and App Links files live in `apps/web/public/.well-known` from M3.

Package consumption: `exports` point at source (`./src/index.ts`); Turbopack transpiles workspace packages automatically (`transpilePackages` only for the webpack fallback); one `tsc --noEmit` per package through Turborepo instead of project references; `packages/config/tsconfig.base.json` holds the strict flags (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `module: esnext`, `moduleResolution: bundler`, `target: es2022`, `types: []`, no `baseUrl`), TypeScript 7-ready.

## Consequences

- The dependency rule becomes mechanical: `apps/*` → `packages/app` → `packages/{core,ui,content,data}`; `packages/ui` and `packages/content` → `packages/core` (types); `packages/core` → nothing (ADR-0025 enforces it).
- `apps/mobile` is a skeleton until M3, but its build is a required check from M0.
- Supabase sessions are not httpOnly cookies on the web; the strict CSP (no third-party scripts, nonces, `strict-dynamic`) is the compensating control, and a server-only session design remains possible later for the web host alone.

## Disagreement

None; this replaces the candidate mechanism named in the brief with a cleaner one.

## Corrections recorded on 2026-10-18

The decision stands; the text above stays as accepted (`docs/ADR/README.md`). These statements in it
were wrong on 2026-10-18, each with the fact and where it can be checked.

- **Decision, the layout's `packages/config` line, "tsconfig base, Biome and ESLint config,
  dependency-cruiser rules, Vitest and Playwright presets".** `packages/config` holds the TypeScript
  bases (`tsconfig.base.json`, `tsconfig.react.json`) and the dependency-cruiser rules
  (`dependency-cruiser.cjs`); its `package.json` exports only the two bases. Biome and ESLint are root
  files (`biome.json`, `eslint.config.mjs`; ADR-0025's deviations). There are no shared presets: each
  package with tests has its own `vitest.config.ts`, and the Playwright configuration is
  `apps/web/playwright.config.ts`.
- **Decision, the layout's `apps/web` line, "proxy.ts (CSP nonce, security headers, UK geo-block)",
  and rule 4, "it sets the CSP nonce, the security headers and the UK block".** `proxy.ts` sets the
  CSP with its nonce and the `Reporting-Endpoints` header on pages, and serves the UK page with
  every security header. The static security headers come from `apps/web/lib/security/headers.ts`,
  which `next.config.ts` applies to the app's responses; the redirects Vercel answers before the app
  carry none of them (`docs/SECURITY.md` §4). ADR-0045 supersedes `proxy.ts`.
- **Rule 2, "a small adapter in `packages/app/lib/navigation` (wrapping `next/link` and
  `next/navigation` today)".** The adapter was never built: no commit holds
  `packages/app/src/lib/navigation`, and nothing in `packages/app` imports `next/link` or
  `next/navigation`. What exists is the `Router` port in `packages/app/src/lib/ports/index.ts`
  (push, replace, back), with no implementation and no caller yet. ADR-0045 builds `lib/navigation`
  over wouter with the switch to Vite (its own corrections record the same fact).
- **Rule 3, "`packages/app/lib/api-client`".** The api-client is an adapter,
  `packages/app/src/lib/adapters/api-client.ts`, with the injectable base URL; the rule itself
  holds.
- **Rule 5, "a `platform` abstraction (`web | pwa | ios | android`) in `packages/app/lib/platform`
  with web implementations (Web Share, `<a download>`, Notification API)".** The abstraction is the
  `Platform` port in `packages/app/src/lib/ports/index.ts`, with a `native` flag in place of the
  four names; its web adapter is `packages/app/src/lib/adapters/web-platform.ts`, with share,
  download and the storage-persistence request. It has no notification method yet: the reminders
  that would use one arrive in M3. The service worker registers only in the web host, as the rule
  says.
- **2026-10-29, `packages/config` exports `./vite` too.** The layout bullet above says its
  `package.json` exports only the two bases; it also exports `./vite`, the hosts' Vite factory and its
  plugins (ADR-0045), tested by its own `packages/config/vitest.config.ts`. The bases and the
  dependency-cruiser rules stand.
