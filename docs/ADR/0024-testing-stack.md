# ADR-0024: Testing stack

Status: Accepted; the Next Storybook framework and the brotli proxy in front of `next start` superseded by ADR-0045 · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §12)

## Context

The correctness and responsiveness regimes in `docs/ENGINEERING.md` need unit, property, golden, component, story, end-to-end, visual, accessibility and performance tests, with a viewport matrix and light and dark themes, runnable by a solo builder for free.

## Decision

| Layer | Tool (pinned) | How |
|---|---|---|
| Unit and property | **Vitest 5.0.5**, `@vitest/coverage-v8`, **fast-check 4.10.2**, `@fast-check/vitest` | `test.projects`: `core` (node, thresholds lines/functions/branches/statements 100 %, `coverage.include` set so untested files count), `app` (jsdom 30.1.3 for hooks and utilities, `fake-indexeddb` for the store), `stories` (browser mode through the Storybook plugin, Chromium) |
| Component | `@testing-library/react@16.3.3`, `jest-dom@7.0.1`, `user-event@14.6.8` | every stateful component; stores seeded per test |
| Stories | **Storybook 10.6.2** with `@storybook/nextjs-vite`, `@storybook/addon-vitest`, `@storybook/addon-a11y` | stories are the contract for `packages/ui` and for feature screens; the built-in Viewport addon carries the seven project viewports; `parameters.a11y.test: 'error'`; the old test-runner is superseded by the Vitest addon |
| End to end | **Playwright 1.64.1**, `@axe-core/playwright@4.14.0` | projects `android-small` (360×780, touch, scale 3), `iphone` (390×844, WebKit, touch), `tablet` (768×1024), `desktop` (1280×800), `desktop-wide` (1920×1080), `zoom-125` (390×844 with `html { font-size: 125% }` injected by a fixture, because Playwright has no text-zoom option; faithful because layout uses rem), `reduced-motion` (`reducedMotion: 'reduce'`), each doubled for `colorScheme` light and dark by a helper; fixed `timezoneId` and `locale` per project; a `GB` geolocation scenario for ADR-0029; axe with the WCAG 2.x A and AA tags on every screen |
| Visual | Playwright `toHaveScreenshot` | one screenshot per screen per project per theme as WebP, `animations: 'disabled'`, volatile parts masked (the prices timestamp), baselines committed, run **only in the pinned container** `mcr.microsoft.com/playwright:v1.64.x-noble` locally and in CI; updates through a labelled CI job after a human reviewed the diff |
| Performance | `@lhci/cli@0.15.1` | Lighthouse 12 removed budgets.json, so budgets are assertions: `categories:performance ≥ 0.95`, `categories:accessibility = 1`, `resource-summary:script:size ≤ 163840` bytes on Today, `total-blocking-time ≤ 200`, `largest-contentful-paint ≤ 2500`, `cumulative-layout-shift ≤ 0.1`; five runs against the Vercel preview with the protection-bypass header; mobile preset, desktop as a second run |
| Database (M3) | pgTAP through `supabase test db`, plus Vitest integration tests against the local stack | positive and negative RLS cases per table; convergence property tests for sync |

CI layout (GitHub Actions, Node 24, pnpm 12, Turborepo remote cache): `verify` (Biome, tsc, Vitest node and jsdom projects, dependency-cruiser, knip, content validation) → `stories` (Vitest browser project with a11y) → `e2e-visual` (the Playwright container, matrix projects, snapshots, axe; artefacts: report and diffs) → `lighthouse` (after the Vercel preview deploys) → `export-build` (the static-export host) → `db` (M3). `--affected` for the fast path on pull requests, the full gate on `main`.

## Consequences

- Visual snapshots cost nothing beyond CI minutes; Chromatic or Argos (free tiers of 5,000 snapshots a month) are the fallback if review ergonomics become a problem; Lost Pixel is sunsetting and is not adopted.
- The pinned Playwright container tag must match the installed version exactly; Renovate updates both together.
- `@lhci/cli` lags Lighthouse (bundles 12.6.1); if it stalls, a thirty-line script around the `lighthouse` CLI asserts the same audits.
- Tests that need the clock receive it: no test calls `Date.now()` without a fixed clock fixture.

## Disagreement

None.

## Deviations recorded by the build session

- **2026-10-17, Lighthouse CI runs against the production build in CI until the Vercel project is
  connected.** No Vercel preview exists yet. `next start` only gzips, while the budget is brotli as
  served, so `tools/serve/brotli-proxy.ts` starts the production server behind a proxy that answers
  with brotli (quality 11 for content-hashed assets, 5 for documents). The assertions are the ones
  decided here. Once the preview exists, the same configuration also runs against it.
- **2026-10-17, the Vercel project is connected, and the same budgets also run against each Vercel
  deployment**, preview or production (`.github/workflows/lighthouse-vercel.yml`). Vercel's
  `repository_dispatch` event on a successful deployment starts the job, which reports the commit
  status `lighthouse-vercel` on the deployed commit; the run against the local build stays in
  `ci.yml`. Previews sit behind Vercel Authentication, so the job sends the Protection Bypass for
  Automation header, only to the project's own `vercel.app` hosts. The bypass header reaches every
  request of the page except the service worker's script fetch, which deployment protection redirects
  (run 39070269335), so `errors-in-console` is asserted on `/` until session 3 (the switch, ADR-0045,
  issue #33) revisits /today. Vercel's bypass cookie (`x-vercel-set-bypass-cookie`) is not sent: its
  redirect never reached that fetch, and it looped production's manifest, which Next links without
  credentials (runs 39072367099 and 39073337602). Lighthouse writes request headers into its reports,
  so the job removes the secret from them before it asserts or uploads.
  Vercel's `repository_dispatch` never reached the repository on 2026-10-17, for production or
  previews, so the job also starts when Vercel's own `Vercel` commit status turns success and measures
  the deployment at its branch URL (`proof-of-calm-git-<branch>-incubating.vercel.app`, which is why
  branch names stay at 34 characters or fewer); only branches of this repository qualify, so a fork's
  preview is never sent the secret.
- **2026-10-17, measured at Vercel's compression.** Vercel answers with brotli quality 3, scripts and
  documents alike: each script of the live Today page arrived byte for byte as long as its local
  quality-3 recompression (the largest, 230,276 bytes raw, as 73,493; quality 11 gives 61,636). The
  proxy had assumed 11 for build assets and 5 for documents, so the local run reported 144,819 bytes of
  script where Vercel served 167,071. `tools/serve/brotli-proxy.ts` now compresses everything at 3;
  the local run counts response headers slightly higher than Vercel does (171,537 bytes for the same
  build), because the proxy speaks HTTP/1.1 and Vercel's HTTP/2 compresses headers; that errs on the
  strict side. ADR-0043, with the Mono font no longer preloaded, brought Today back within its
  budgets.
- **2026-10-20, the proxy is gone with Next.** `tools/serve/brotli-proxy.ts` was deleted in ADR-0045's
  step 6; `tools/serve/vercel-local.ts` serves the Vite build as Vercel would for the e2e suite and
  Lighthouse (`tools/README.md`). The `errors-in-console` line of the entry above is settled by the
  switch: both pages locally, `/` only at a deployment (`docs/BUILD-PROMPT.md`, known gaps).

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Decision, unit and property: "`@fast-check/vitest`".** It is not installed: the catalog
  (`pnpm-workspace.yaml`) has `fast-check` 4.10.2 without it, and the property tests import
  `fast-check` and call `fc.assert` inside Vitest's `it` (for example
  `packages/core/src/money/split.property.test.ts`).
- **Decision, visual: "as WebP", "run only in the pinned container … locally and in CI; updates
  through a labelled CI job after a human reviewed the diff".** The baselines are PNG files
  (`apps/web/e2e/matrix.spec.ts-snapshots/`). Only `.github/workflows/snapshots.yml` renders them,
  in the container `mcr.microsoft.com/playwright:v1.64.1-noble` pinned by digest, when it is
  dispatched by hand. The images are downloaded, each one is reviewed, and they are committed in a
  pull request of their own, labelled `needs-owner`, for the owner's review
  (`docs/BUILD-PROMPT.md`). CI's `e2e-visual` compares against them in the same container. Nothing
  runs the container locally: on a platform without a baseline the visual test skips
  (`apps/web/e2e/matrix.spec.ts`).
- **Decision, performance: "mobile preset, desktop as a second run".** There is no desktop run.
  `apps/web/lighthouserc.json` has one collect configuration, five runs on `/today` and `/` with
  Lighthouse's default mobile settings, and `tools/lighthouse/vercel.ts` reuses its runs and
  settings for each Vercel deployment. The deviations above say where the runs take place.
- **CI layout: "Turborepo remote cache", the arrows between the jobs, and "`--affected` for the fast
  path on pull requests, the full gate on `main`".** No remote cache is configured (it is optional,
  `docs/OWNER-SETUP.md` §5), and nothing passes `--affected`. `verify` starts at once, beside a
  `changes` job that lists a pull request's files; `stories`, `export-build`, `e2e-visual` and
  `lighthouse` wait only for `changes`, then run in parallel (`.github/workflows/ci.yml`), and
  `lighthouse-vercel` comes from its own workflow. Every pull request runs the full gate, except
  that one touching only `docs/`, `README.md` or `CLAUDE.md` runs `verify` and skips the four app
  jobs.

## Deviations recorded on 2026-10-26

- **2026-10-26, `@testing-library/jest-dom` left the catalog** (ADR-0005, deviation of 2026-10-26).
  No package used it, so the Decision's `jest-dom@7.0.1` is no longer pinned; the component layer
  pins it again in the pull request of the first package that adopts it.

## Deviations recorded on 2026-10-27

- **2026-10-27, "the full gate on `main`" holds per tree, not per push** (#194). A push to `main`
  skips `stories`, `export-build` and `e2e-visual` when the merged pull request's head has the new
  tree, contains the previous head of `main` and has those three green: its run tested the same code
  on top of the same `main`. `verify` and `lighthouse` are unchanged, and any other push that changes
  the app runs the three (`.github/workflows/ci.yml`, its header). Of the 158 pushes to `main` from 2026-10-01 to
  2026-10-26, 89 landed such a tree, and their three jobs took about 1,400 minutes; 35 landed a tree
  no run had tested, 21 were docs-only, 12 came before `stories` existed, and on 1 the pull request's
  head had a failed run of `stories` before its green one.

## Corrections recorded on 2026-10-29

- **The 2026-10-18 correction on performance: "five runs on `/today` and `/`".**
  `apps/web/lighthouserc.json` has five runs each on `/today`, `/portfolio`, `/log`, `/plan` and
  `/` (ADR-0045, deviations of 2026-10-26); the script budget is asserted on Today.
- **The 2026-10-18 correction on visual tests: "The baselines are PNG files".** The baselines are
  PNG files at Playwright's default snapshot path beside `apps/web/e2e/matrix.spec.ts`, committed
  only from a reviewed `snapshots.yml` artifact in a pull request labelled `needs-owner`. A platform
  with no baseline skips the visual test.
- **2026-10-29, the e2e jobs.** `e2e-visual` is now the aggregate check over `e2e-build` and the
  three `e2e-shard` jobs (it needs `changes`, `e2e-build` and `e2e-shard`); `stories`,
  `export-build`, `e2e-build` and `lighthouse` still wait only for `changes`. The header comment of
  `.github/workflows/ci.yml` owns the gate's composition. The `e2e-shard` jobs compare
  against the baselines; `e2e-visual` passes when they and `e2e-build` passed.

## Deviations recorded on 2026-11-05

- **2026-11-05, `lighthouse-vercel` measures production by itself and a preview by hand.** The
  deviation of 2026-10-17 and the correction of 2026-10-18 on performance ran it against every
  deployment, preview or production. From 2026-10-27 to 2026-11-05 the previews took about three
  quarters of that workflow's minutes (the figures: `docs/OWNER-SETUP.md` §1). Vercel's status now
  starts a run only on `main`'s head, and Vercel's event only for production; a preview is measured
  by a dispatch (`.github/workflows/lighthouse-vercel.yml`, its header). Before a merge, CI still
  asserts Today's application code (`e2e-build`) and axe (`stories` and the e2e matrix); the
  Lighthouse budgets are asserted after it, on production's deployment and in `ci.yml`'s
  `lighthouse` job on each push to `main`. `lighthouse-vercel` and `lighthouse` left the required
  checks the same day (`docs/OWNER-SETUP.md` §1).
