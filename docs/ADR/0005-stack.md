# ADR-0005: Stack: Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase EU, Vercel, pnpm, Turborepo

Status: Accepted; the runtime merging in `cn` superseded by ADR-0043; superseded in part by ADR-0045 (router and host): the Next.js hosts, plan B's "React Router" (wouter instead) and the Base UI toast (an own toast instead) · Date: 2026-10-16 · Deciders: owner (before the session); validated with reservations by the planning session (research: `docs/research/stack-frontend.md`, `docs/research/stack-backend-security.md`)

## Context

The owner chose the stack and asked the session to validate it against alternatives for this exact product, with the burden of proof on changing it. The product is a client-rendered, offline-first PWA with one small API, later wrapped with Capacitor; the quality bar includes a first-load JavaScript budget of 150 kB on the Today page and Lighthouse 95+ on mobile. Context7 was out of quota for the whole session, so every library fact was read from the vendors' own documentation and the npm registry on 2026-10-16.

## Validation results

| Component | Verdict | Pinned (release date) | Notes |
|---|---|---|---|
| Next.js App Router | Keep, with reservations below | `next@16.4.2` (2026-10-15; 16.4.1 carries the October security fixes) | Turbopack default; `proxy.ts` replaces middleware; `cacheComponents` **off** (incompatible with static export); React Compiler on |
| React | Keep | `react@19.3.1`, `react-dom@19.3.1` (2026-10-14) | Actions, `useOptimistic`, `use`, `browser()` for IndexedDB-bound components |
| TypeScript strict | Keep | `typescript@6.0.3` (2026-04-16) with a 7.0-ready config | TypeScript 7.0.2 ships no JS API; typescript-eslint and knip need < 6.1; flip when they support 7 |
| Tailwind | Keep | `tailwindcss@4.3.3` (2026-07-16), `@tailwindcss/turbopack@4.3.3`, `@tailwindcss/vite@4.3.3` for Storybook | CSS-first `@theme`, OKLCH, `@custom-variant dark` on `data-theme` |
| shadcn/ui | Keep, on Base UI | `shadcn@4.22.0` CLI (2026-10-16), `@base-ui/react@1.9.0` (2026-10-09), `tw-animate-css@1.4.0`, `lucide-react@1.58.0` | Base UI is shadcn's default primitive library since July 2026 (`render` instead of `asChild`); tokens live in `packages/ui/src/styles/tokens.css` |
| Supabase (EU) | Keep | `@supabase/supabase-js@2.118.0` (2026-10-15); project in `eu-central-1`; Pro plan at launch | Free tier pauses after a week idle and has no backups; publishable/secret key pair; passkeys native but experimental (ADR-0035) |
| Vercel | Keep | Pro at launch; functions in `fra1` | Hobby forbids commercial use; Pro unlocks hourly cron and WAF rules |
| pnpm + Turborepo | Keep | `pnpm@12.14.0` (2026-10-15), `turbo@2.11.8` (2026-10-13), Node 24 LTS (≥ 24.11) | `catalog:` single-version policy, `minimumReleaseAge`, `strictDepBuilds`; Turborepo remote cache free on Vercel |

Alternatives considered and not taken: SvelteKit, Astro, React Router v7 framework mode and a Vite SPA for the shell (lighter, simpler export, but the owner's choice stands; see Disagreement); Firebase, PocketBase, Convex for the backend (Supabase's Postgres with RLS and EU regions fits the sync design and the honesty position better); Cloudflare Pages (Vercel's Next integration and preview deployments are worth more to a solo builder).

Measured facts that shape the rest of the ADRs (`docs/research/stack-frontend.md` §1 and §16): an empty Next 16.4 App Router page ships 132 kB gzip / 113 kB brotli of JavaScript (react-dom 70 kB gzip, the router runtime 49 kB); `output: 'export'` fails when `cacheComponents` is on, and Next says Cache Components become the default in the next major; `proxy.ts` is not supported in static export.

## Decision

The stack stands. The session adds structure and limits so that its weaknesses are contained:

1. **Thin host apps over shared packages** (ADR-0032): the whole product lives in `packages/app` (features, ports, adapters, messages) plus `packages/core`, `packages/ui`, `packages/content`, `packages/data`; `apps/web` and later `apps/mobile` are routes and configuration. A host can be replaced without touching the product.
2. **`cacheComponents` off in every app, no server-only APIs in screens**, so the static-export host keeps building; CI builds it from M0.
3. **Budget restated with measurements** (ADR-0019 and `docs/ENGINEERING.md` §4): total script transfer on Today ≤ 160 kB brotli, application code ≤ 45 kB brotli, Lighthouse performance ≥ 95, TBT ≤ 200 ms, LCP ≤ 2.5 s, CLS ≤ 0.1, asserted by Lighthouse CI on every preview. The lighter persistence choice (idb plus an in-memory store instead of Dexie) is what brings Today near the owner's figure.
4. **Plan B recorded**: if Next 17 ships without a working static export, or if Today cannot be held under the budget after M1, the mobile host (and if needed the web host) becomes a Vite + React Router shell; `packages/app` is written host-agnostic (navigation through a small adapter, no `next/*` imports outside the hosts) so that this is a packaging change.

## Consequences

- Versions above go into the `pnpm-workspace.yaml` catalog; the build session installs exactly these and records any deviation in a new ADR.
- Every ADR from 0017 to 0034 names its library and version; `docs/research/stack-frontend.md` holds the full table with sources.
- Context7 must be retried at the start of the build session for the libraries it will write code against; if it is still unavailable, the vendors' documentation URLs recorded in the research files are the fallback, and the build session must not rely on memory for API shapes.

## Disagreement

The session believes a Vite + React Router shell with a small Hono or Vercel-functions API would fit this product better than Next.js: the application is client-rendered and offline-first, so server components, caching semantics and the export/Cache Components tension buy nothing and cost complexity; the framework floor alone consumes three quarters of the owner's JavaScript budget; and a static shell removes the Capacitor export problem entirely. This is a preference about fit, not a safety or legality issue, so the owner's decision is followed. The owner's 150 kB figure is below the measured floor of the chosen framework; the restated budget is the honest number for this stack, and the plan B above is the route to the original figure if it is ever required.

## Deviations recorded by the build session

The decision stands; these are the version-level deviations the build session made while installing
the catalog, recorded here as `docs/BUILD-PROMPT.md` requires.

- **2026-10-17, `@types/react` and `@types/react-dom` at 19.3.0, not 19.3.1.** Version 19.3.1 of
  both packages does not exist on npm (latest 19.3.0, published 2026-09-09); 19.3.0 is the nearest
  release and covers React 19.3.
- **2026-10-17, catalog additions.** `@types/node` 24.19.2 (Node 24 types for the repository tools,
  configs and tests), `@testing-library/dom` 10.4.2 (a required peer of `@testing-library/react` 16)
  and `@typescript-eslint/parser` 8.71.2 (ADR-0025's deviation). All three are development-only and
  add nothing to any bundle. `@types/jsdom` 30.0.0 followed for the golden-fixture tool in
  `tools/golden`, which runs the prototype in the pinned jsdom; development-only as well. `playwright`
  1.64.1, the same release as `@playwright/test`, is the required peer of `@vitest/browser-playwright`,
  which runs the Storybook stories in Chromium; development-only, nothing in a bundle. The host routes
  added `server-only` 0.0.1, the build-time guard on the modules that read secrets (`docs/SECURITY.md`
  §8); it is empty on the server and can never be part of a client bundle.
- **2026-10-17, how the shadcn components arrive.** `packages/ui` and `apps/web` carry the monorepo
  `components.json` pair (style `base-nova`, package imports). On Windows, shadcn 4.22.0 resolves the
  package-import aliases to a folder outside the workspace, and its base-nova sources now import the
  new `cn` package, which is not in the catalog. The sources are therefore taken from
  `shadcn add <name> --dry-run --view` and restyled on the tokens with the repository's own `cn`
  (clsx and tailwind-merge, already pinned; the runtime merging superseded by ADR-0043). The toast is
  shadcn's Base UI toast, not sonner. No
  runtime dependency was added beyond the pinned set.
- **2026-10-17, `catalogPrune` off.** With pruning on, the first `pnpm install` deleted every catalog
  entry no package used yet, which is most of the versions pinned for M1 to M3. Pruning stays off while
  the catalog holds versions for later milestones; knip reports unused catalog entries as warnings in
  the meantime (`knip.jsonc`). Both flip back once every entry is in use.
- **2026-10-20, Next left the catalog.** The hosts moved to Vite (ADR-0045), so `next` 16.4.2,
  `@next/eslint-plugin-next`, `next-intl`, `@serwist/turbopack`, `@serwist/window`,
  `@tailwindcss/postcss` and `@tailwindcss/turbopack` are no longer pinned; the text above that names
  Next.js 16 stays as the decision of 2026-10-16. `@sentry/nextjs` 11.8.0 stays pinned until M3 chooses
  the SDK for the Vite hosts.
- **2026-10-26, the pins for later milestones left the catalog.** No package used ten entries (knip,
  `pnpm lint:dead`): `@supabase/supabase-js`, `@sentry/nextjs` 11.8.0, `@upstash/ratelimit`,
  `@vercel/firewall`, `@vercel/functions` 3.10.1, `@testing-library/jest-dom` and the four
  `@capacitor/*` 8.5.3 pins. A milestone now pins a package's version in the pull request that adopts
  it, with the sentence `CLAUDE.md` asks for; the versions in the text above stay as the decision of
  2026-10-16. For the two entries above: every catalog entry is in use, so `catalogPrune` is on again
  (`pnpm-workspace.yaml`) and knip's catalog rule turns to error in a one-line pull request once main is
  clean (`.claude/rules/tools-ci.md`); `@sentry/nextjs` 11.8.0 is no longer pinned, and M3 pins the SDK
  it chooses for the Vite hosts (ADR-0027, ADR-0045).
- **2026-10-26, knip's catalog rule is an error.** Main had no unused catalog entry, so the warning
  became an error (`knip.jsonc`): an unused entry now fails `pnpm lint:dead` and the verify job.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Decision, item 3: "asserted by Lighthouse CI on every preview".** Lighthouse CI asserts the
  item's budgets on Today, and accessibility 1, but not the 45 kB of application code, which no
  check asserts. It runs against the local production build in CI and against every Vercel
  deployment (`apps/web/lighthouserc.json`, ADR-0024 deviations).
  On 2026-10-29 the application code gained its check: `node tools/size/today.ts` in ci.yml's
  e2e-build job, from the web build's chunk report (`docs/ENGINEERING.md` §4 has the measure).
- **Consequences, first bullet: "records any deviation in a new ADR".** A version deviation is
  recorded in the relevant ADR, in the same pull request (`docs/BUILD-PROMPT.md`, "Library facts";
  `pnpm-workspace.yaml`), as the section above does.

## Corrections recorded on 2026-11-05

- **The 2026-10-18 correction on item 3: "against every Vercel deployment".** Lighthouse CI runs
  by itself against production's deployment only, and against a preview by dispatch (ADR-0024,
  deviation of 2026-11-05).
