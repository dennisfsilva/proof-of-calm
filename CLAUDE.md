# proof-of-calm

Proof of Calm: a calm, noise-free crypto DCA planner and educator (the name: ADR-0040). A person sets up a plan once, logs each monthly purchase in under a minute, sees where they are in the plan and what the holding rules of their country mean for each purchase. Custody-free, minimal account, usable without one. Not an exchange, wallet, signal service, tax tool or advice service.

## Read first

- The tracker issue named in the README status line; sessions run with `/crew:next-checkpoint` and `/crew:progress` shows where things stand.
- `docs/BUILD-PROMPT.md`: what this repository adds to the process (tiers, empirical gates, owner-only items).
- The rules file of the path you touch (`.claude/rules/`); it names the documents and ADR sections to read. The map of every document: `docs/README.md`.
- The repository's limits (subjectMax, branchMax, prLines) are also in `.claude/crew.json` for the tools; this file owns their values.

## Stack

Pinned in `pnpm-workspace.yaml`; decided in ADR-0005, ADR-0016 to ADR-0045 and ADR-0048 (`docs/ADR/README.md`). Library facts come from the vendors' documentation through WebFetch, never from memory.

## Run / test

All commands from the repo root.

- Install: `pnpm install --frozen-lockfile` (install scripts are off except the `allowBuilds` list in `pnpm-workspace.yaml`)
- Dev server: `pnpm dev` (apps/web on http://localhost:3000)
- Storybook: `pnpm storybook` (packages/ui on http://localhost:6006 and packages/app on http://localhost:6007; theme, motion and text-size toolbars, the seven viewports); static build: `pnpm storybook:build`
- Typecheck: `pnpm typecheck` (apps/web also checks the service worker against `apps/web/tsconfig.sw.json`)
- Lint, format, the dependency rule, the styling lint (no hex colours, px font sizes, font families or removed outlines outside `packages/ui/src/styles`), the docs lint and the size lint: `pnpm lint` (fix formatting: `pnpm lint:fix`); on their own: `pnpm lint:docs` (paths, commands, ADR numbers and owned literals in the documents), `pnpm lint:size` (source files over 400 lines); dead code: `pnpm lint:dead`
- Commit subjects of the branch (conventional, at most 100 characters, the check CI runs): `pnpm lint:commits` (reads `origin/main..HEAD`, so fetch `origin/main` first)
- Merge the feature and lib message files into `packages/app/src/messages/<locale>.json` and one `<locale>/<namespace>.json` per namespace: `pnpm --filter @proofofcalm/tools messages` (a test fails when a file there is stale)
- Content validation (schemas, 60-word cards, banned words, sources, the Learn modules' front matter, length, syntax and age): `pnpm validate:content`
- The generated rules files the shell boots on, after a profile changes (ADR-0049): `pnpm --filter @proofofcalm/content rules` (a test fails when one is stale)
- Unit and component tests: `pnpm test` (watch: `pnpm test:watch`; coverage: `pnpm test:coverage`)
- Golden fixtures, by hand when the prototype or `tools/golden/states.ts` changes: `node tools/golden/generate.ts [path/to/DCA-Plan.html]` (default `../dca-plan/DCA-Plan.html`, the UX reference; never import code from it); review the diff of `packages/core/test/golden/*.json`
- End-to-end on the viewport matrix: `pnpm test:e2e` (one project: `pnpm test:e2e --project=iphone`; another port: `PORT=3100 pnpm test:e2e`); browsers once per machine: `pnpm --filter @proofofcalm/web exec playwright install chromium webkit`
- Lighthouse with the budgets, after `pnpm build`: `pnpm --filter @proofofcalm/web lighthouse` (Today, Portfolio, Log and Plan with the fixture plan that `apps/web/lighthouse/seed.ts` puts into the store, and `/`; needs `CHROME_PATH` set to Chrome or Playwright's Chromium, since the seed's puppeteer finds none by itself; port 3000 must be free on `::1` as well; in CI it runs on push to main, and `gh workflow run lighthouse-branch.yml --ref <branch>` runs it on a branch too); against a Vercel deployment it runs by itself after each successful production deployment (commit status `lighthouse-vercel` on main's head), and on a preview only by hand: `gh workflow run lighthouse-vercel.yml -f url=<deployment URL> -f sha=<full commit SHA>` (the 40-character SHA; a branch URL passes only while `sha` is its branch's head), which posts the same status on that commit; the automatic run uses main's copy of the workflow, so a changed copy is tried on its branch by adding `--ref <branch>`
- The preview checklist against a Vercel deployment (ADR-0045 Risks), whenever `apps/web/vercel.json`, the function or the worker changes: the `lighthouse-vercel.yml` dispatch above with `--ref <branch> -f checks=true`, its `url` the branch URL of a branch other than main and `sha` that branch's head, runs both jobs; its `preview-checks` job runs the request-level e2e specs and `apps/web/e2e/deployment.spec.ts` on the desktop project with the bypass secret and posts the commit status `preview-checks` (by hand only: the job lives in that file because a workflow file that is not on main cannot be dispatched; the plain dispatch measures only, and with `checks=true` any other URL, production's included, is refused whatever the input says)
- Visual snapshots: rendered only in the pinned Playwright container; dispatch `gh workflow run snapshots.yml --ref <branch>`, download its `snapshots` artifact into `apps/web/e2e`, review every image, and commit them; adding or updating a baseline waits for the owner's review, deleting one that no longer matches goes in the PR that changes the screen; without a baseline for the platform the visual test skips
- Storybook a11y and interaction tests: `pnpm storybook:test` (every story of packages/ui and packages/app in Chromium at 360 and 1280 px, light and dark, with axe; needs Playwright's Chromium, installed as above)
- shadcn components: copy the source from `pnpm --filter @proofofcalm/ui shadcn add <name> --dry-run --view` and restyle it on the tokens (on Windows the CLI writes to the wrong folder; it also wants the `cn` package, which we do not use). Our `cn` joins classes without merging them (ADR-0043): give each element one utility per property; the story tests and the e2e matrix fail on a conflict
- Build: `pnpm build`; the static-export host: `pnpm build:export`
- After a web build, the bundle secret scan CI runs: `node tools/scan/secrets.ts apps/web/dist`; the security.txt check: `node tools/security-txt/check.ts`; Today's application code against its budget (`docs/ENGINEERING.md` §4), from the chunk report the web build writes into the web host's `node_modules` cache: `node tools/size/today.ts` (`--warn` prints without failing)
- App icons, after a change to the mark (`tools/icons/mark.ts`) or `apps/web/lib/pwa/brand-colors.json`: `node tools/icons/generate.ts`; review the images (a test fails while the committed files differ)
- The quiet check before handing a branch back (typecheck, lint, tests, content, the lints, commit subjects; one line per step): `pnpm check`. The full local gate (adds build, renders and e2e): `pnpm gate`; CI adds the security.txt check, the secret scan, the export check, Today's application-code size, Lighthouse and OSV-Scanner

## Structure

- `apps/web`: the Vite host (ADR-0045; the shell `apps/web/app.html`, the one API function `apps/web/server/api.ts`, `apps/web/vercel.json` with the headers, the hashed CSP and the UK route, the service worker `apps/web/src/sw.ts`, the prerendered site pages `apps/web/src/site`, e2e). `apps/mobile`: the Vite static-export host for Capacitor (hash location). The build served as Vercel would: `node tools/serve/vercel-local.ts`.
- `packages/app`: the product (features, lib, messages). `packages/core`: pure domain logic, 100 % coverage. `packages/ui`: tokens, components, charts, Storybook. `packages/content`: jurisdictions, templates, facts, banned words. `packages/data`: price history (M2).
- `packages/config`: TypeScript bases, the dependency-cruiser rules and the hosts' Vite factory with its plugins (`packages/config/vite`). `tools/`: repository scripts. `docs/`: specs, standards, ADRs, research. The package map, what each owns and the dependency rule: `docs/ARCHITECTURE.md`. Standards: `docs/ENGINEERING.md`.

## Conventions (what no tool holds)

- Time is passed in. Nothing in `packages/core` reads the clock, randomness, storage or the network.
- Money and units are decimals (strings in storage). `number` for an amount is a bug.
- Dates are `YYYY-MM-DD` strings in the user's calendar; instants are ISO with offset; one in-house date module.
- Validate at every boundary with zod (`zod/mini` in client code); infer types from schemas; never write a type twice.
- Copy: `docs/CONTENT-STYLE.md` (voice, the ban list) and `docs/LEGAL.md` §6 (the legal half); the banned-words lint runs on messages and content.
- Every bug: failing test first, then the fix, in the same PR. Docs change in the PR that changes the behaviour.
- Never edit generated files (the merged messages, the golden fixtures, the icons, the country rules files); regenerate them with the commands above.
- Small PRs (100 to 300 changed non-test lines); conventional commit subjects of at most 100 characters (`pnpm lint:commits`); branch names lowercase and at most 34 characters (a preview is measured and checked at Vercel's branch URL, which longer names would truncate); `main` takes changes only through pull requests with the required checks green, merged by rebase.
- Secrets only in `apps/web/.env.local` (gitignored) and Vercel; `.env.example` documents the shape; `server-only` on anything that reads one.
- No new runtime dependency without a sentence on why and what it weighs (brotli); prefer the platform. No `any`.
- Never add news, sentiment, alerts, affiliate links, exchange links, streaks, badges, social features or chat (ADR-0013, ADR-0010, `docs/LEGAL.md` §3); multiple portfolios (not in v1); NFTs, staking, DeFi or leverage; a questionnaire that selects templates; a third-party script, a cookie that needs consent or an analytics SDK (ADR-0028).
- Never place, schedule or transmit orders, ask for or store exchange API keys, or ask for wallet addresses or extended public keys (ADR-0039).
