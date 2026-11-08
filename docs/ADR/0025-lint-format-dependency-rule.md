# ADR-0025: Linting, formatting and the dependency rule

Status: Accepted; the Next.js ESLint and knip plugins superseded by ADR-0045 · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §13–14, `docs/research/stack-backend-security.md` §6)

## Context

The standards (`docs/ENGINEERING.md`) must be enforced by tools: formatting, lint, the layer rule ("app routes → features → lib → packages, nothing points upward"), dead code, and supply-chain hygiene. Next 16 removed `next lint`; Biome 2.5 covers formatting and most lint rules but not the React Compiler diagnostics or config-aware Tailwind class sorting; typescript-eslint does not support TypeScript 7.

## Decision

- **Biome 2.5.15** as the formatter and primary linter for the whole repository (`biome.json` at the root, `recommended`, `organizeImports`, `useSortedClasses` at information level with `functions: ["cn", "cva", "clsx"]`); no Prettier.
- **A minimal ESLint 10.13.0** loading only what Biome lacks: `eslint-plugin-react-hooks@7.1.1` (`recommended-latest`, the React Compiler rules) and `@next/eslint-plugin-next@16.4.2` (core-web-vitals rules, `rootDir: ['apps/*/']`); no typescript-eslint (type-level checks come from `tsc --noEmit` with the strict flags). Biome's hook rules are disabled to avoid overlap.
- **The dependency rule, enforced twice**: fast feedback in the editor through Biome `overrides` with `noRestrictedImports` patterns per layer; authoritatively in CI through **dependency-cruiser 18.6.0** (`forbidden` rules: `packages/core` imports nothing framework-ish; `packages/ui` imports only `packages/core` types and React/Base UI/Tailwind utilities; `packages/content` imports `packages/core` types only; `packages/app/lib` never imports `packages/app/features`; features import only each other's `index.ts`; nothing imports from `apps/*`; `no-circular`; `no-orphans`). Its graph output doubles as architecture documentation.
- **knip 6.41.0** for unused files, exports and dependencies, with the Next, Storybook, Vitest and Playwright plugins.
- **Content lints**: the banned-words lint over message files, MDX modules, templates and emails (`docs/CONTENT-STYLE.md`); zod validation of every content file; a lint that forbids `Date`, `Math.random`, `fetch`, `window`, `process`, `console` and `number`-typed amounts in `packages/core`; a lint that forbids `payload->` in server code and migrations (ADR-0030); a grep of client bundles for secret-key prefixes.
- **Supply chain**: pnpm settings in `pnpm-workspace.yaml`: `minimumReleaseAge: 4320` (three days), `minimumReleaseAgeExclude` for own packages, `trustPolicy: no-downgrade`, `blockExoticSubdeps: true`, `strictDepBuilds: true` with an explicit `allowBuilds` list (`esbuild`, `sharp`, `@biomejs/biome`, `@tailwindcss/oxide`), `catalogMode: strict`, `saveExact: true`, `engineStrict: true`; CI installs with `--frozen-lockfile`. **Renovate** (not Dependabot: Dependabot's lockfile regeneration conflicts with pnpm's release-age gate in open issues) with `config:best-practices`, `minimumReleaseAge: "3 days"`, a weekly grouped minor-and-patch PR, automerge for dev-dependency patches after CI, majors separate, GitHub Actions pinned to digests; Dependabot security alerts stay on. OSV-Scanner reusable workflows and Socket (free) in CI; `pnpm audit` weekly; CodeQL only if the repository is public.
- **Conventional commits** checked by a commit-message lint in CI; a PR template with the checklist in `docs/ENGINEERING.md` §8; branch protection through rulesets with required checks `verify`, `stories`, `e2e-visual`, `lighthouse`, `export-build`, `validate-content` and code-owner review for `packages/content`, `.github` and `supabase`.

## Consequences

- Two lint tools run, but each does one job; the ESLint config stays under thirty lines.
- Tailwind class sorting is imperfect until Biome's rule leaves nursery; accepted.
- The layer definitions live in one place (`packages/config/dependency-cruiser.cjs`) and are mirrored, not duplicated, in Biome overrides by a small generator script.
- Repository visibility affects cost: public gives free CodeQL, rulesets and Actions minutes; private needs GitHub Pro for protections. Open question for the owner (`docs/LEGAL.md` §9).

## Disagreement

None.

## Deviations recorded by the build session

The decision stands; these are the deviations the build session made while bootstrapping the
workspace on 2026-10-17.

- **A time-boxed release-age exemption.** Twenty-one pinned versions were younger than the three-day
  `minimumReleaseAge` when the workspace was bootstrapped (Next.js 16.4.2 and its platform binaries,
  React 19.3.1, Vitest 5.0.5, ESLint 10.13.0, Playwright 1.64.1 and their sub-packages). Downgrading
  would have dropped Next.js 16.4.1's critical security fixes, so the exact versions are listed in
  `minimumReleaseAgeExclude` (pnpm's `name@version` form). Every entry is older than three days by
  2026-10-20; the block is removed then, without a lockfile change. The golden-fixture tool added three
  more on 2026-10-17: `jsdom@30.1.3` (published 2026-10-15) and two of its dependencies that only that
  release requires, `@asamuzakjp/dom-selector@10.0.3` and `undici@8.12.1` (both 2026-10-14); they leave
  with the same block. `packages/ui` added eight on the same day: `shadcn@4.22.0` and
  `@shadcn/registry@0.2.0` (2026-10-16), `lucide-react@1.58.0` (2026-10-16), and the Vitest 5.0.5
  browser packages the Storybook tests need, `@vitest/browser`, `@vitest/browser-playwright`,
  `@vitest/pretty-format`, `@vitest/ui` and `@vitest/utils` (2026-10-15). All are older than three days
  by 2026-10-19 13:26 UTC and leave with the same block. The viewport matrix added
  `@axe-core/playwright@4.14.0` (2026-10-15 13:33 UTC), which leaves with the same block.
- **One reviewed trust-policy exemption.** `trustPolicy: no-downgrade` refused `semver@6.3.1`, which
  `@babel/core` 7 requires: the 2023 release predates the provenance that later semver releases
  carry. The exact version is in `trustPolicyExclude`; the policy stays on for everything else.
- **`allowBuilds` is a map in pnpm 11 and later.** The list form in the planning scaffold no longer
  parses. `@swc/core` and `@parcel/watcher`, which next-intl's message extractor pulled in until
  ADR-0045 step 1, are explicitly disallowed: both ship prebuilt binaries and their scripts only
  build from source. `@serwist/turbopack` still pulls in `@swc/core` until ADR-0045's switch.
- **`@typescript-eslint/parser` 8.71.2 is installed.** ESLint's default parser cannot read TypeScript.
  Only the parser is used, with no typescript-eslint rules, so type-level checks remain tsc's as
  decided; it supports TypeScript 6.0 (`>=4.8.4 <6.1.0`) and ESLint 10.
- **Configuration lives at the repository root.** Biome resolves its configuration from the root and
  ESLint's flat config is a root file, so `biome.json` and `eslint.config.mjs` are root files. The
  dependency rule stays in `packages/config/dependency-cruiser.cjs`.
- **The commit-message lint is a script.** `tools/commits/check.ts` checks every commit of a pull
  request against one regular expression, instead of commitlint and its dependencies.
- **The styling lint is a script as well.** Biome's `noHexColors` reads CSS only, so
  `tools/lint/styles.ts` (run by `pnpm lint`) enforces `docs/DESIGN.md` §10 in TS, TSX, CSS and MDX:
  no hex colours, px font sizes or font-family declarations outside `packages/ui/src/styles`, in inline
  styles, SVG attributes and Tailwind arbitrary values too, and no removed focus outline. A line may
  opt out only with `styles-lint-ignore: <reason>` on the line above it.
- **OSV-Scanner results stay in the job.** Uploading SARIF to code scanning needs GitHub Advanced
  Security on a private repository, so the reusable workflows run with `upload-sarif: false` and fail
  the job on any finding.
- **Known advisories in development tooling.** The first OSV-Scanner run found 12 advisories in 9
  transitive development dependencies, 7 of them under `@lhci/cli` 0.15.1. Where a fixed release
  keeps the same API, a pnpm `override` installs it (`semver` 5.7.2, `tmp` 0.2.7; `semver@5.7.2`
  joins the reviewed trust-policy exemptions because it predates provenance). Where no fixed
  release exists in the same major (braces, extract-zip, sprintf-js, basic-ftp, uuid), `osv-scanner.toml`
  lists each advisory with the reason it cannot be reached and an expiry date (2027-01-31) that
  makes the scan fail until someone looks again. Replacing `@lhci/cli` with the `lighthouse` package
  would not remove them: Lighthouse 13 depends on puppeteer-core, which brings the same downloader.
- **2026-10-20, Next left the lint and the supply-chain settings** (ADR-0045, migration step 6).
  The time-boxed `minimumReleaseAgeExclude` block above left on its date, as written, leaving only
  `@proofofcalm/*`. `@next/eslint-plugin-next` and its rules are gone from `eslint.config.mjs`, so the
  Decision's ESLint line names one plugin too many and the correction below counts the Next rules
  among its 58 lines. `@serwist/turbopack` and the `@swc/core` it brought are out of the lockfile; the
  two `allowBuilds: false` entries stay as a guard. The `braces` advisory in `osv-scanner.toml` is now
  reached through the shadcn CLI, not the Next plugin.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Decision, content lints: "a lint that forbids `Date`, `Math.random`, `fetch`, `window`,
  `process`, `console` and `number`-typed amounts in `packages/core`".** Biome's override for
  `packages/core/src` (`biome.json`) forbids `Date`, `Math.random`, `fetch`, `window`, `process` and
  `console`, and the DOM, storage and timer globals too; no lint rule reads the type of an amount. A
  `number` amount is refused at typecheck by the branded decimal types and at run time by big.js
  strict mode (`packages/core/src/money/decimal.ts`).
- **Decision, supply chain: "Socket (free) in CI; `pnpm audit` weekly".** No Socket integration
  runs, and nothing runs `pnpm audit` on a schedule; `pnpm audit` is a release check
  (`docs/RELEASE.md`). OSV-Scanner's reusable workflows run on pull requests that change the
  lockfile, a `package.json`, `pnpm-workspace.yaml` or the workflow, on pushes to `main` and weekly
  (`.github/workflows/osv-scanner.yml`).
- **Decision, conventional commits: "required checks `verify`, `stories`, `e2e-visual`,
  `lighthouse`, `export-build`, `validate-content` and code-owner review for `packages/content`,
  `.github` and `supabase`".** The ruleset `main` takes pull requests only, merged by rebase, with
  no approval and no code-owner review: the build session commits under the owner's account, and
  GitHub never counts an author's review of their own pull request (`docs/OWNER-SETUP.md` §1). Its
  required checks are `verify`, `stories`, `export-build`, `e2e-visual`, `lighthouse` and
  `lighthouse-vercel`. There is no `validate-content` check: content validation is a step of
  `verify` (`.github/workflows/ci.yml`), and its refusal of `reviewedBy: agent-draft` is content's
  human gate. `.github/CODEOWNERS` names the owner for everything and for `packages/content/`, with
  no entry for `.github` or `supabase`, and nothing enforces it.
- **Consequences, first bullet: "the ESLint config stays under thirty lines".** `eslint.config.mjs`
  has 58 lines: the ignores, the TypeScript parser, the React hooks rules, the `toFixed` and
  `parseFloat` ban of `docs/ENGINEERING.md` §1.2, and the Next rules.
- **Consequences, third bullet: "mirrored, not duplicated, in Biome overrides by a small generator
  script".** No generator exists. The `noRestrictedImports` overrides in `biome.json` mirror the
  coarse layer rules by hand, for editor feedback; `packages/config/dependency-cruiser.cjs` is the
  authority, as its header says.
- **2026-10-29, `eslint.config.mjs` has 46 lines, not 58.** The reading of the first Consequences
  bullet above and the 2026-10-20 deviation count 58 with the Next rules, which left on 2026-10-20
  (ADR-0045, migration step 6). What is left: the ignores, the TypeScript parser, the React hooks rules
  and the `toFixed` and `parseFloat` ban.

## Corrections recorded on 2026-11-05

- **The 2026-10-18 correction on the required checks.** `lighthouse` and `lighthouse-vercel` left
  them on 2026-11-05 (ADR-0024, deviation of 2026-11-05); `docs/OWNER-SETUP.md` §1 has the list.
