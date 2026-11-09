# Engineering standards

The rules for writing code in this repository, with examples. They are enforced by configuration
(TypeScript flags, lint rules, the dependency rule, CI gates), not by memory. Tool choices and pinned
versions are in the ADRs referenced; this document is about how we work whichever tool it is. The
commands are in `CLAUDE.md`; what each CI job runs is the header of `.github/workflows/ci.yml`.

## 1. Principles

### 1.1 Functional core, imperative shell (ADR-0016)

`packages/core` is pure TypeScript: no framework, no I/O, no clock, no randomness, deterministic.
Everything with side effects lives in the shell (`packages/app` and the hosts); the features reach it
through small interfaces (ports, `packages/app/src/lib/ports`) with adapters
(`packages/app/src/lib/adapters`). Time is an argument: `actionsNow(plan, entries, today)`; the shell
owns `clock.today()` and the store. Rules: the core's `package.json` has no runtime dependency
besides the decimal library and zod; a lint rule forbids `Date`, `Math.random`, `fetch`, `window`,
`process.env` and `console` in `packages/core`; tests of the core never mock anything.

### 1.2 Exact arithmetic (ADR-0017)

Money and coin units are never JavaScript floats. The core uses the decimal type; storage holds
decimal strings; formatting happens once, at the edge.

```ts
// wrong (the prototype)
const units = eur / price; const fee = Math.round(feeAll * eur / total * 100) / 100;

// right
const units = quotient<Units>(amount, price, coin.decimals, 'down'); // unitsFor: toward zero (ADR-0017)
const feeParts = splitLargestRemainder(fee, parts.map(p => p.amount), MINOR_UNITS[currency]);
```

Rules: the core's amounts, units and percents are branded decimal types (`Money`, `Units`,
`Percent`), so the typecheck refuses a `number` where one belongs; `toFixed` and `parseFloat` are
banned outside `packages/app/src/lib/format`, the formatting layer and its input-parsing module
(`packages/app/src/lib/format/number-input.ts`), by an ESLint `no-restricted-syntax` rule over the
hosts, `packages/app` and `packages/ui` (the core uses big.js's own `toFixed` and its tests build
decimals with Number's, so there the ban is a review rule); every division names its rounding mode;
sums of rounded parts are tested to equal the rounded whole.

### 1.3 One date policy (ADR-0018)

Calendar dates are `YYYY-MM-DD` strings in the user's local calendar; instants are ISO 8601 with
offset; one date library; the shell derives `today` from an instant and an IANA timezone, once per
render (the Clock adapter, ADR-0042); the core never does. Tested across month ends, leap years, DST
transitions and offset boundaries (`docs/DOMAIN.md` §8).

### 1.4 Validate at the boundaries

zod schemas for storage reads, import files, API responses, the API function's inputs and content files;
types are inferred from schemas (`z.infer`), never written twice. Inside the boundary, trust the
types: a corrupt record fails loudly in the adapter's `parse`, not in a render.

### 1.5 Feature folders with a dependency rule

`app` routes → `features` → `lib` and `packages/ui`, `packages/core`, `packages/content`,
`packages/data`; nothing points upward; features do not import each other's internals (only their
`index.ts`). The rule is enforced by the tool in ADR-0025 and fails CI.

### 1.6 Small, explicit code

- Small components: one responsibility, props typed, under about 150 lines; a component that needs
  a scroll to read is split.
- No premature abstraction: duplicate twice, abstract the third time, and only when the three uses
  agree on the shape.
- Exhaustive switches over closed unions with `assertNever(x)` in the default branch; adding a status
  must fail the build where it is not handled.
- No `any`; no non-null assertions except in tests; strict TypeScript (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`).
- Immutable state updates: core functions return new values; the shell's store writes whole entities.
- Errors as values at the core boundary: `Result<T, DomainError>` with a closed union of codes;
  the shell has a single error surface that maps codes to copy and reports unexpected errors once.

### 1.7 Naming and comments

Names say what; comments say why (a constraint, a regulation, a browser bug, a link to an ADR). A
function longer than a screen is split. A source file longer than 400 lines fails `pnpm lint:size`
unless its header carries a reason. Abbreviations only when universal (`id`, `url`).

### 1.8 Commits and pull requests

Commit, branch and PR-size rules: `CLAUDE.md`. A PR that changes behaviour changes or adds a test; a
PR that changes a decision adds an ADR; a PR that changes visuals updates snapshots and says why.

## 2. Correctness regime

What must have a test, per layer. Which CI job runs which check, and what a pull request that
changes only documents skips: the header of `.github/workflows/ci.yml`. The documents themselves
have a lint, `pnpm lint:docs`: every path, command and ADR number they name resolves, or carries a
planned marker with its milestone, `(planned: M<n>)`; a session number in the marker is a finding,
since sessions are renumbered when one is inserted.

| Layer | What must have a test | Where |
|---|---|---|
| Core unit | every exported function, every error code; 100 % statements and branches | `packages/core/src/**/*.test.ts` |
| Core property | slot generation, planned-parts splitting, eligibility monotonicity, portfolio identities, lot conservation, sync convergence (M3) | `*.property.test.ts`, or `fc.property` cases in the module's own `*.test.ts`, with `fast-check` |
| Core golden | the prototype's outputs on the same data | `packages/core/test/golden/` |
| Content | every data file validates; front matter complete; banned words absent | `packages/content/src/*.test.ts` |
| Component | every stateful component: form, coin editor, range selector, toast with undo, onboarding steps | `features/**/*.test.tsx`; `packages/ui/src/components/*.test.tsx` (jsdom per file) |
| Storybook | every component at 360 px and 1280 px, light and dark; axe; a story per component is asserted by a test | `*.stories.tsx` + test runner |
| End to end | every user flow on every viewport project | `apps/web/e2e/` |
| Visual | one screenshot per screen per project in light and dark, compared on change; a human reviews the diffs | Playwright `toHaveScreenshot` in a fixed Linux container |
| Accessibility | axe on every page in e2e; manual passes before launch and yearly | e2e + checklist |
| Performance | the budgets of §4 | `apps/web/lighthouserc.json` (the local build and Vercel's deployments; when each runs: §4) |
| Build | web build, static-export build for the wrapper | CI |
| Tooling | every repository script and every plugin of the hosts' Vite factory, case by case; the server guard against a real `vite build` of a fixture | `tools/**/*.test.ts`, `packages/config/vite/*.test.ts` (Node environment) |

Flaky tests are fixed or quarantined the same day with an issue; a quarantined test cannot stay
quarantined for more than one release. A unit test that mounts a screen loading a jurisdiction
profile or a message namespace answers them from memory through the `vi.mock` factories of
`packages/app/src/lib/services/testing-modules.ts`: Vite's module runner makes a round trip on every
`import()`, and under load that outlasts a `findBy`.

## 3. Responsiveness is tested, not assumed

Seven Playwright projects (ADR-0024), each running every flow: two phones (one WebKit), a tablet, two
desktops, a 125 % text-zoom phone and a reduced-motion phone, defined in `apps/web/playwright.config.ts`.
Assertions in every flow: `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal
page scroll); every interactive element's bounding box at least 44 × 44 px (or 24 px with sufficient
spacing per WCAG 2.5.8, checked only where the layout forces it and documented); forms remain usable
with the on-screen keyboard open (viewport height reduced to 45 % on the two phones and the tablet while a field is
focused: the focused field and the submit button stay reachable). Every spec takes `test` from
`apps/web/e2e/support.ts`, whose `page` has a 20 px root on the zoom-125 project, so every flow runs at
125 % text there. Every page of `apps/web/e2e/matrix.spec.ts` passes in light and dark, and so do the
Today, Log, end-buying, pause and Undo-focus flows; the other flows run in light. Every page of the matrix also
matches its reviewed screenshot on every project, in light and dark, with the clock fixed, the prices
and closes answered from fixtures and the prices line masked; the baselines are rendered and reviewed
as ADR-0024's Corrections say, and the test skips on a platform without one.

## 4. Performance budget

- Today page total script transfer ≤ 160 kB brotli as served (Lighthouse CI assertion
  `resource-summary:script:size ≤ 163840` bytes), of which application code ≤ 45 kB brotli
  (46,080 bytes): `node tools/size/today.ts`, in ci.yml's e2e-build job at error (its method:
  `tools/README.md`). The shell boots on the plan's country's generated rules file, under 1 kB
  brotli (the measurement: ADR-0049), never on the profile with its card text. Main at a20d28d9
  measured 40,215 bytes in 10 chunks, Portugal's the profile, on 2026-10-29; at 044e2619, with the
  country library, 46,030 bytes in 12 chunks on 2026-11-05; at 9a543833, booting on the rules file
  (ADR-0049), 42,142 bytes in 12 chunks on 2026-11-05; at 3f7d7523, with the red-day port's stub,
  44,870 bytes in 13 chunks on 2026-11-09; at 5c03211d, 44,928 bytes in 14 chunks, and with Today's
  code-splitting group 35,928 bytes in 3 chunks, the same static modules, on 2026-11-09. Rolldown
  groups modules by the entries that reach them, so a lazy chunk that imports some of the entry's
  modules would split them into new shared chunks; one group (`packages/config/vite/chunk-groups.ts`,
  both hosts) keeps every module the entry imports statically in its chunk instead, and enters
  another feature's modules only for the names Today imports through its barrel. A module Today runs
  that the group left out would sit in a chunk importing the group's back, and that chunk runs before
  the code it reads (the app stopped at boot so on 2026-11-09): the build fails on any static import
  cycle between chunks. today.ts multiplies each chunk's brotli by its app share, so its figure
  depends on how chunks mix vendor and app code (37,094 bytes in one mixed chunk against about 46,900
  under a vendor split for the same modules, 2026-11-09), and Lighthouse's script total on Today is
  the measure that decides a chunking change. The group lowered today.ts's figure by 9,000 bytes for
  the same 195 modules, so its gate in e2e-build is weaker by that margin; what replaces it is the
  script budget above, at error in Lighthouse on every push to main and, before review, on any branch
  that changes what Today loads (`gh workflow run lighthouse-branch.yml --ref <branch>`;
  `docs/BUILD-PROMPT.md`). today.ts's method and its 45 kB budget stay until its measure no longer
  depends on chunk mixing and the budget is re-based on it. With the group, dispatch 42590923685 on
  2026-11-09 measured Today at 144,222 bytes of scripts in 3 requests (main: 161,818 in 14),
  Portfolio 207,689 (225,487), Log 213,258 (230,866) and Plan 188,441 (206,179), performance medians
  0.99 on Today and 0.96 on the other three. A lazy screen still takes shared data through Services.
  Today's foot (its banners, DESIGN §8) ships statically with the screen. Before the group the
  red-day banner's branch measured 46,441 bytes in 13 chunks with the foot in the entry and 44,992 in
  17 with it on demand behind its own error boundary; with the group, a local merge with the foot
  static measured 37,270 bytes (46,466 without the group) and the rebased branch 37,414 bytes in 3
  chunks, on 2026-11-09, so the on-demand chunk and its boundary went. Lighthouse's script total on
  the branch is the measure against the budget and main's figures above. The foot asks the red-day
  model on Today's load, and its drawdowns over the year of closes, three exact divisions a day, were
  one long task: dispatch 42597401623 measured TBT 334 ms and performance 0.91 against main's 94 ms
  and 0.98. The model now reads the last two weeks' drawdowns, and earlier 90-day blocks only while
  the episode may have started before them, with a pause between its steps
  (`packages/app/src/lib/services/red-day-model.ts`); at 4x CPU locally Today's TBT median went from
  82 ms to 47 ms (main 43 ms), with no long task of its own, on 2026-11-09.
- Lighthouse mobile ≥ 95 for Performance (TBT ≤ 200 ms, LCP ≤ 2.5 s, CLS ≤ 0.1) and 100 for
  Accessibility on Today, Portfolio, Log, Plan; five runs per measured deployment, each screen with
  the fixture plan in IndexedDB (`apps/web/lighthouse/seed.ts`, run before each URL; Lighthouse's reset
  before every run clears the worker and the caches and keeps the store), so the median is of cold loads
  of a screen with data.
- Where they fail: production's deployment (`lighthouse-vercel`, by itself on main's head) fails on
  any of them, and so does a preview measured by hand; at its branch URL a preview passes only while
  its commit is the branch's head (the header of `.github/workflows/lighthouse-vercel.yml`). The local run
  (`apps/web/lighthouserc.json`, ci.yml's `lighthouse` job on push to main, the same steps in
  lighthouse-branch.yml on a branch) holds
  the performance score, TBT and LCP of Today, Portfolio, Log and Plan at warn with the same values,
  and every other assertion (the script budget, Accessibility, CLS, console errors, all of `/`) at
  error: the local medians of 2026-10-23 below miss LCP on three screens and the score on Log, Today's
  LCP sat within 6 % of the budget (2,423 ms locally; 2,349 ms in CI without data, run 39973216176 on
  main, 2026-10-23), and a check that could fail main lands in warn first (`.claude/rules/tools-ci.md`).
  The first CI run with data, dispatch 40312910780 on 2026-10-26 (medians of five), missed all three
  on every seeded screen: Today LCP 2,526 ms, performance 0.91, TBT 300 ms, CLS 0.007; Portfolio
  2,733 ms, 0.92, 224 ms, 0; Log 3,232 ms, 0.88, 238 ms, 0.047; Plan 2,742 ms, 0.92, 226 ms, 0.019.
  With TBT at warn as well, dispatch 40314073836 on 2026-10-26 passed the job: Today 2,520 ms, 0.82,
  578 ms, 0.007; Portfolio 2,740 ms, 0.91, 247 ms, 0; Log 3,226 ms, 0.87, 254 ms, 0.047; Plan
  2,699 ms, 0.93, 192 ms, 0.019; `/` 1,356 ms, 1.00, 0 ms, 0.
  The flip: a one-line PR sets them to error once a push run on main measures them within budget.
  Production Portfolio's TBT failed `lighthouse-vercel` run 40679020243 on 51a3cf60 (2026-10-28)
  with a median of 205.5 ms (runs of 318, 205.5, 97, 215.5 and 187.5 ms; green on re-run). Decided
  2026-10-29: the check keeps five runs and 200 ms, and the screen does less main-thread work at load,
  since it measured 26 ms on deedc753 and more runs would hide that growth rather than remove it.
- Why these numbers, and what the Next floor measured: ADR-0005, ADR-0043, ADR-0045. The Vite
  floor (the script transfer on Today before session 4's shell and lazy screens): 78,268 bytes
  locally, the median of five Lighthouse runs through `tools/serve/vercel-local.ts` on 2026-10-19
  (performance 1.00, accessibility 1.00, TBT 0 ms, LCP 1,661 ms, CLS 0; `/` carries no script);
  77,834 bytes on the Vercel preview, the median of five in `lighthouse-vercel` run 39320130989 on
  2026-10-19 (performance 1.00, TBT 4 ms, LCP 1,357 ms, CLS 0). With the shell of session 4 (the
  services over the browser's adapters, the IndexedDB store, the header, the tab bar, the toast
  viewport): 113,530 bytes locally, the median of five runs through the same server on 2026-10-20,
  all five equal; `packages/content`'s rules loader is about 430 bytes of it (measured by stubbing
  it), so it keeps its one entry point. With the fixture plan seeded (session 21): Today 151,267
  bytes, the median of five runs through the same server on 2026-10-23 (performance 0.97, TBT 16 ms,
  LCP 2,423 ms, CLS 0.007); Portfolio, Plan and Log missed LCP there (medians 2,585, 2,580 and
  3,033 ms) and Log the performance score (0.94). What is lazy-loaded and what the
  service worker caches: ADR-0045 §9, ADR-0033. Fonts: `docs/DESIGN.md` §5.
- A section that loads after the first render reserves its loaded height: it renders its loaded
  structure, busy and hidden, until its data arrives, so nothing below it moves (CLS), as Portfolio's
  value chart does while the daily closes load. A line whose words come with the data holds its place
  with its widest forms, invisible in one grid cell under the real line in both states, since a line
  of another length wraps onto another number of lines (the chart's source line); the forms are built
  once for each set of locales, zone, year, clock changes and words, not on every mount. A failed
  read keeps the same structure, with its line in the empty frame's place (`docs/DESIGN.md` §6).
- An upstream outage may fail the production check. It measures what production serves: a 502 that
  reaches the browser is a fault people see, and `errors-in-console` names it. Since Portfolio's
  layout holds on that path (`lighthouse-vercel` run 40917845879 on a20d28d9, 2026-10-29, measured
  CLS up to 0.209 before it did), an outage leaves only that miss, and a production failure whose only
  misses trace to an upstream 5xx of `/api/history/*` or `/api/prices` is re-run once the endpoint
  answers 200; the re-run's result stands. Serving the last good copy during an outage belongs to the
  server-side cache, which waits on the owner's answer on @vercel/functions (tracker #33).

## 5. Accessibility baseline

WCAG 2.2 AA. Visible focus everywhere; every control labelled; colour never the only cue (P/L carries
a sign, statuses carry text); `prefers-reduced-motion` respected (no movement, instant transitions);
`prefers-color-scheme` respected with a manual override; charts have an `aria-label` summary and a
table alternative; dialogs trap focus and restore it; live regions for toasts; the whole monthly loop
works with a keyboard and with a screen reader.

## 6. Security in code

Headers and CSP, secrets, dependencies and the supply chain: `docs/SECURITY.md` §4, §8 and §9. The
headers and the CSP are static (`apps/web/vercel.json`, written from the code by
`apps/web/scripts/vercel-config.ts`): a change to a header is a change to
`apps/web/lib/security` and a regenerated file, and `apps/web/lib/vercel-config.test.ts` fails
while the two differ. Server code (`apps/web/server`, `apps/web/lib/server`) imports
`server-only`; `packages/config/vite`'s guard fails a host build that pulls it into the browser.

## 7. Dependencies

The pins, the catalog and the install settings: `pnpm-workspace.yaml`; Renovate:
`docs/OWNER-SETUP.md` §2; the scanners and the accepted-advisory list: `docs/SECURITY.md` §9. A new
runtime dependency needs the sentence `CLAUDE.md` asks for.

## 8. Definition of done

A change is done when: the behaviour has tests at the right layers; the gate is green; the docs that
describe the changed thing are updated in the same PR (`docs/DOMAIN.md` for domain rules, an ADR for
a decision, `CLAUDE.md` for a command); copy passed the checklist; visuals were reviewed; it works on
a phone in light and dark; and nothing is left behind a TODO without an issue link.
