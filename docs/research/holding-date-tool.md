# The holding-date tool's public form: the design check

Research date: **2026-11-15**. Scope: which public form the holding-date tool takes on a site whose
pages carry no script (a visitor's purchase date and country give the day their country's holding
rule reaches, shared as a plain URL), and its three sub-questions: where the inputs live, how the
country is chosen, how the date is typed. ADR-0045 §6 owns the decision (its Decision keeps the
in-house prerender as the default for M2's public pages: "whether they need more is decided in M2 with
measurements"); this file holds its evidence. The source is issue #230: the
planner's notes in its body and the three reports posted as its comments on 2026-11-15.

## 1. Why a decision was needed

- ADR-0045 §6 is titled "Site pages prerendered with no script" and says "There is no `<script>`
  element"; SECURITY §4 says "The prerendered site pages carry no script." A tool that computes a
  visitor's own date puts the first script on a public page.
- ADR-0045's Decision keeps the in-house prerender as the default for M2's public pages, the
  holding-date page among them, and says "whether they need more is decided in M2 with
  measurements". This check supplies the measurements.
- `docs/GROWTH.md` §4.1: "Build what an AI answer cannot replace: the holding-date page, the
  simulator and the app need the visitor's own dates and numbers", and its Tools row: "shareable as
  plain URLs holding their inputs; nothing tracked". The page's static half (each country's rule,
  conditions and worked example) cannot give a visitor their own date.
- The simulator (issue #14) reuses whatever form this tool takes, and inputs in a URL are a privacy
  claim.

The planner said yes to a design check for those three reasons (the first script on a public page,
the simulator's reuse, inputs in a URL), and measured without a build: "the app shell's entry is
145,468 B brotli (`chunk-report.json`); a throwaway esbuild bundle of `parseCalendarDate` +
`holdingStatus` + DOM glue is 12,047 B raw, 4,128 B brotli (an upper bound)". The planner's notes
proposed the inputs in the query string with a native GET form and a `resource-summary:script:size`
budget of 10,240 B; the judge's notes superseded them.

## 2. Method

1. The planner wrote the session's plan with a first design of the tool (a hidden GET form, the
   inputs in the query) and the measurements above.
2. Two blind designers, who saw neither the planner's plan, the issue nor each other's report, each
   wrote a recommendation: designer A from the code and the hosting, designer B from the visitors'
   journeys. Each worked in its own worktree at main 86b140a3 with a local build served as Vercel
   would (`tools/serve/vercel-local.ts`) and tested in Playwright's Chromium and WebKit. Designer B
   served the build behind a logging proxy that recorded each request, with a cross-origin "source"
   that logged the Referer it received; its page was a stand-in, `/en/island-test`, with a 5.2 kB
   island bundled from the core.
3. The judge saw the planner's notes and both reports, re-ran every test a decision rests on in its
   own worktree (designer A's build output copied there, served with `vercel-local` on port 3311,
   stopped after), checked every stated reason at its cited line, and edited nothing in either
   designer's folder.

The experiment scripts were not committed. Designer A's: holding-island.ts in its worktree's
apps/web/src, and designer-a-experiment.ts, designer-a-browser.ts and designer-a-isolate.ts in its
apps/web/scripts. Designer B's, in the session scratchpad's designer-b folder: journeys.mjs,
probe.mjs, isolate.mjs, island.ts, holding-cases.ts and the request log requests.log. The judge's:
judge-*.ts in its worktree's apps/web/scripts and judge-island.ts in its apps/web/src/site.

Both designers reached the same form independently: a script island on the prerendered page, the
inputs in the fragment, country radios and one native date field.

## 3. The candidate forms

| Form | Outcome | Why (from the reports) |
|---|---|---|
| (1) A script island on the prerendered page | Chosen | The shell's fixed boot script with another `data-entry` runs under the unchanged CSP; about 10 KB of script against 160–209 KB for the app route (the judge's decision 1) |
| (2) The app's own route | Rejected | A: "It loads 160,816 B of script against 5,072, and Lighthouse put LCP at 2,461 ms, 4 % under the 2,500 ms budget"; "A one-time visitor gets the 1.37 MB precache worker, an IndexedDB database and a localStorage key (tested; LEGAL Q10)". B: "With JS off the page is blank. The query reaches the server even for an installed visitor, through navigation preload." |
| (3) A result rendered by the server | Rejected | A: "Under `/api/` it escapes the UK route (`vercel.json:13`) and the CSP header (`:78`); tested: a GB request to `/api/holding-date` got no 451 and no CSP. Every uncached query invokes the fra1 function and is logged with its Search Params"; "The server's UTC date, not the visitor's calendar, would decide 'passed'." B: "The function would reflect visitor input into HTML, and the API bundle would have to carry the React prerender and every profile." |
| (4) No tool | Rejected | A: "it fails GROWTH §4.1 ('Build what an AI answer cannot replace') and the Tools row". B: "Portugal for 1 Mar 2027 gives 29 Feb 2028, and 29 Feb 2024 gives 28 Feb 2025 in Portugal but 1 Mar 2025 in Germany and the US (tested)." It stays in the design as the static half |
| Other: `<script src>` trusted by an SRI hash | Rejected | A: it "changes the hash on every build, which the committed static `vercel.json` cannot carry (ADR-0045 §3; read, not tested)". The judge: "Partly true. It changes with the island's bytes, not with every build; untested; moot" |
| Other: prerendered result pages per date or country | Rejected | A: "thin pages at scale, which GROWTH §4.1's History-pages row says break Google's spam policies". B: "Precomputed pages per country cannot hold a visitor's date." |

### Measurements

Each figure as its report gives it.

| What | Figure | Who | How |
|---|---|---|---|
| The app shell's entry chunk | 145,468 B brotli | Planner, A (judge: "True") | `chunk-report.json` |
| A first island bundle | 12,047 B raw, 4,128 B brotli ("an upper bound") | Planner | A throwaway esbuild bundle of `parseCalendarDate` + `holdingStatus` + DOM glue |
| Designer A's island chunk | 12,803 B raw, **5,072 B brotli q3** (Vercel's level), 4,430 B q11 | A | Node zlib |
| Designer B's island | 12,984 B raw, 5,198 B brotli at Vercel's quality 3 | B | esbuild of `holdingStatus` with zod/mini |
| The judge's islands | Minimal: 11,687 B raw / 4,556 br-q3. With the core's rule schema and the one formatting layer (ADR-0023): 28,607 / **10,305** br-q3, "so the planner's 10,240 B budget fails" | Judge | Re-built in its worktree |
| Script over the wire | Island page: 5,072 B in 1 request. `/learn`: **160,816 B in 6 requests**, 145,468 of it the app entry chunk | A | Playwright `request.sizes()` on vercel-local |
| First visit | Form 2: 209,265 B; form 1: 52,318 B, against 47,209 B for `/en/learn` | B | The journeys run on vercel-local |
| Time until the result showed (cold, localhost) | Chromium 66.7 ms (DOMContentLoaded at 51 ms); WebKit 128 ms (96 ms) | A | MutationObserver timestamp |
| Lighthouse, mobile, one run each | Island page: performance 1.00, TBT 0 ms, LCP 1,351 ms, scripts 5,738 B. `/learn`: 0.97, 33 ms, 2,461 ms, 164,812 B | A | lighthouse 12.6.1 on Playwright's Chromium |
| Precache cost | 70 entries / 1,369,794 B before, 71 / 1,382,597 B after: 12.8 KB more for every installed app | A (B's precache numbers match) | `bundleWorker` |
| Precache, re-run | `injectManifest`: 72 entries as committed, 71 with `assets/site/**` ignored | Judge | A's `sw.js` and the worker build |
| The island as a second input of the client build | A: "a 28-byte facade importing `today-*.js` (146,097 B br-q3)". Judge: 28 B, importing the today chunk (145,943 B br) | A, judge | A Vite build with the island as a second input |
| CLS, the form revealed after the island starts (four radios) | **0.140** phone bare, **0.210** phone with a fragment, 0.034 / 0.047 desktop | Judge | Measured in Chromium |
| CLS, the form in the first paint, hidden under `@media (scripting: none)` | **0.000** in all four cases, hidden with JS off in both engines | Judge | Measured in Chromium; the JS-off check in both engines |
| The island built with esbuild | 47 ms | Judge | As `bundle-worker.ts` builds the worker |

## 4. The judge's audit

Verbatim from the judge's report on issue #230. P = planner, A = designer A, B = designer B. A
name with a line number (`holding-island.ts:50`) is designer A's uncommitted island, not a
repository file.

| Reason | Whose | Cited at | Verdict | Evidence |
|---|---|---|---|---|
| A second copy of `BOOT_SCRIPT` with another `data-entry` runs under the committed CSP, so `vercel.json` stays byte-identical | P, A, B | `boot.ts:1-12`, ADR-0045 §3 | True | Re-run in Chromium and WebKit (fragment load, submit, a no-rule country): 0 violations, 0 CSP console messages |
| The island must be its own build | A, B (risk 2) | `boot-plugin.ts:25`, `chunk-groups.ts` | True | Re-run: as a second input, `holding-island-*.js` is 28 B, `import"./today-CVUzjq8a.js"` (145,943 B br). `app.html` gets two module scripts, which `withBootScript` refuses. The `today` group takes every `$initial` module of every entry |
| The island costs about 5 kB; the planner's 4,128 B is "an upper bound" | P, A, B | measurements | Partly true (sizes); false (bound) | A minimal island is 11,687 B raw / 4,556 br-q3. With the core's rule schema and the one formatting layer (ADR-0023) it is 28,607 / **10,305** br-q3, so the planner's 10,240 B budget fails |
| The app entry is 145,468 B br | P, A | `chunk-report.json` | True | A's measurement matches |
| A native `<select>` fails WebKit's hashed CSP; radios, a date field, three fields, `<details>` and buttons do not | P, A, B | `BUILD-PROMPT.md:67-69` | True | Re-run, one control per page: WebKit records `style-src-attr` at load for the select only; Chromium records nothing; `<details>` and button: 0 |
| Inputs in the query, with a native GET | P | issue body | False as a privacy design | Vercel's runtime logs list a "Static Request" served from cache with its "Search Params", kept 1 h (Hobby), 1 day (Pro), 30 days (Observability Plus) (vercel.com/docs/logs/runtime, fetched). The query also goes out through navigation preload (`sw.ts:46`) |
| A fragment never leaves the device | A, B | RFC 3986 §3.5 | True | Re-run: no request carried `bought=` or `country=` in either engine |
| A's island writes and shares the fragment | A | report | Partly true | `holding-island.ts:50` writes `?${data}` with `replaceState`; only reading a fragment was tested |
| Static files are served for any query and no function runs | A | Vercel docs | True | Static files are "automatically cached … for the lifetime of the deployment"; "doesn't allow bypassing the cache for static files by design" (cdn-cache, fetched). The filesystem-precedence quote was not re-read; not decisive |
| `/api/` escapes the UK route and the document CSP | A, B | `vercel.json:13`, `:78` | True | Both patterns exclude `api/` |
| UK visitors get 451 | A, B | | True | Re-run on the island page |
| The precache picks up the island (70 → 71 entries) | A | `bundle-worker.ts` globs | True | A's `sw.js` lists it; `injectManifest`: 72 entries as committed, 71 with `assets/site/**` ignored. It should not be precached (decision 6) |
| A visited page works offline | A | | True | Re-run in both engines without precaching the island: the page came from `pages`, the chunk from the `assets` runtime cache |
| The worker's `pages` keys hold the fragment | B | `sw.ts:60-68` | True, Chromium and WebKit | Re-run: `/en/judge-holding#bought=2022-06-06&country=de` and `/privacy#retention`. Only the navigated URL is kept, not one written by `replaceState`. Specs: Fetch's `url` getter keeps the fragment; `Cache.put` stores the request as given; "Request Matches Cached Item" compares "with the exclude fragment flag set" |
| Without script it degrades: GET lands on `?bought=…` | A | | True, and it is a defect | A visible no-script form sends the inputs and answers nothing |
| Reveal the form only after the island starts | B | risk 7 | Partly true | No dead form, but measured CLS (four radios): **0.140** phone bare, **0.210** phone with a fragment, 0.034 / 0.047 desktop. Form in the first paint, hidden under `@media (scripting: none)`: **0.000** in all four cases, hidden with JS off in both engines |
| One date field, `YYYY-MM-DD` | A, B | ADR-0034:18, `input.tsx:35-37` | True | ADR-0034 also requires `min` and `max`, which both designs omit. Re-run: 0 violations |
| The island reads today to say "passed" | A | `holding-island.ts:12-16,42` | Allowed, rejected | LEGAL Q14 allows "whether it has passed"; `holdingStatus` takes no today (`eligible-from.ts:60-68`); see decision 4 |
| A typed date may stand with its lines | B | LEGAL §4, Q13–14 | Partly true | Q13 speaks of "the user's own entries": counsel rules on a typed date |
| CSP reports store no path or query | B | `report.ts:1-3` | True | Read |
| Referer is the origin only | B | `vercel.json:48-49`, `holding.tsx:45` | True | Read |
| PT 2027-03-01 → 2028-02-29; DE 2028-02-29 → 2029-03-01; PT 2024-02-29 → 2025-02-28; DE and US 2024-02-29 → 2025-03-01 | P, B | `eligible-from.ts` | True | PT and DE re-run in the browser; the others by `eligible-from.ts:19-20` |
| The cards' worked examples (PT, DE, US) | P | profiles | True | `pt.json`, `de.json`, `us.json` text |
| "The other seven listed countries have rule `none`" | P | | False | It is six (es, fr, gb, ie, it, nl) of nine listed |
| App route: 160–209 kB, installs the worker | A, B | | True (consistent) | Not re-run; B's precache numbers match (70 entries, 1,369,794 B) |
| An SRI hash on `<script src>` changes the CSP every build | A, B | | Partly true | It changes with the island's bytes, not with every build; untested; moot |
| Thin pages at scale | A | GROWTH:319 | True | |
| Daily rebuild "already required" | B | | Partly true | Required once indexed (ADR-0045, 2026-11-15) |
| The record is a Deviations entry | P, A, B | ADR-0045:162-164, ADR README:5 | True | |

Not raised by anyone: both designers' islands format dates with their own `Intl.DateTimeFormat` and hold English copy in literals, which bypasses ADR-0023's one formatting layer and the banned-words lint. The planner's prerendered result blocks avoid both.

## 5. The decisions

The judge's ten, verbatim:

1. **The form is a script island on the prerendered page.** The CSP is unchanged and the cost is about 10 KB, against 160–209 KB for the app route. A server-rendered result is rejected: it escapes the UK route and the CSP, and logs the inputs. "No tool" fails GROWTH:307-308.
2. **Inputs go in the fragment, not the query:** `#country=pt&bought=2026-03-01`. Opening a URL and submitting send no input anywhere. The worker strips fragments from its `pages` keys with a `cacheKeyWillBeUsed` plugin (Serwist: "both cache lookups and cache writes"), so the cookie-free statement's "pages opened" stays exact and no LEGAL change is needed.
3. **Radios and one date field.** Radios, because WebKit refuses a native select. One `type="date"` field with `min="2009-01-03"` and `max` = the build's day plus one year, read from the page, so a future purchase can be planned.
4. **The result states the date only, never "passed" or "upcoming", and the island reads no clock.** `holdingStatus` needs none. A shared link shows the same words to everyone; it avoids two "todays" on one page (the build's UTC day and the device's) and a present-tense status that reads as a cue to sell.
5. **Build with esbuild**, as `bundle-worker.ts` does: 47 ms, a hashed name from the metafile, an inputs list a test can check. A second Vite input joins Today's chunk (tested); a second Vite build would need a config that bypasses the host factory, for no gain.
6. **No precache.** Precaching costs every installed app the download and storage for a public page most never open; a visited page already works offline through the `assets` runtime cache (tested). The island goes to `assets/islands/`, and `globIgnores` excludes it.
7. **How the form is hidden.** Not hidden until the island starts (CLS 0.14–0.21 on phones). The form is in the first paint, carries `noscript:hidden` (Tailwind 4.3.3's `@media (scripting: none)`, no inline style), and uses `method="dialog"`: a native submit outside a dialog does nothing, so a failed island never puts inputs in a query (tested in both engines). The result region reserves its height.
8. **The result's facts (LEGAL §4, Q13–14; counsel and brand word them):** the purchase date it was computed from; "tax-free from" or "long-term rate from" with the date; "Computed from your dates, not tax advice"; the profile's conditions, the first in full and the rest behind one `<details>`; the rule's Sources link and the card's date line; no amount or rate.
9. **Countries without a date.** A country under review shows its name and the under-review date line, with no date, as the static half does. A country whose rule is `none` shows its card's own holding-rule text, Sources and date line, with no date.
10. **A link to the tool from each country page with a dated rule:** `/en/holding-date#country=<code>`, which preselects that country. It lives in packages/app, so it goes in the steps branch.

The judge's record: "A dated ADR-0045 Deviations entry, not a new ADR: the Decision says 'whether
they need more is decided in M2 with measurements' (lines 162-164), and nothing is superseded (same
CSP, same boot text, the same esbuild pattern as the worker; the theme script on the offline page
set the precedent, 2026-10-19). [...] An app route or a server result would have needed a new ADR."

2026-11-15, on decision 2. The worker writes no `pages` key with a fragment (#245). A browser that a
worker from before #245 still controls can store the navigated URL, fragment included. That lasts
until the current worker activates. On activation the worker deletes every `pages` key with a
fragment. `docs/LEGAL.md` §4 states the gap.

### What the island branch's tests must prove

From the judge's note for `feat/holding-date-island` (tier 2, security), "Tests first". Each test
answers a decision or an audit row above.

| Test | Must prove (the judge's words) | Answers |
|---|---|---|
| `apps/web/e2e/holding-date.spec.ts`, desktop and iphone | "submit gives `#country=…&bought=…` and no request carries either input" | Decision 2; the fragment row |
| | "the fragment URL opened fresh shows the result" | Decisions 1, 2 |
| | "`#country=de` preselects Germany" | Decision 10 |
| | "an invalid date shows the hint" | Decision 3 |
| | "with JS off the tool is hidden and the list shown" | Decision 7 |
| | "with the boot script removed, a submit leaves the URL unchanged" | Decision 7 (`method="dialog"`) |
| | "Chromium's layout-shift sum under 0.01 for the bare page and for a fragment load" | Decision 7; the CLS rows |
| `apps/web/e2e/site.spec.ts` | "every other `/en/` page 0 scripts; this page exactly the boot script, with an entry under `/assets/islands/`" | Decisions 1, 6 |
| `apps/web/e2e/holding-date.spec.ts` (csp.spec.ts runs on desktop alone) | "this page on desktop and iphone, filled and submitted, 0 violations" | Decisions 1, 3; the select row |
| `apps/web/e2e/offline.spec.ts` | "`pages` keys hold no `#`; `/sw.js` lists no `/assets/islands/`; offline, a visited fragment URL shows the result" | Decisions 2, 6 |
| `apps/web/e2e/holding-date.spec.ts`, desktop and iphone | "an earlier worker's `pages` key with a fragment is gone once the worker activates; the other keys stay" | Decision 2 |
| `apps/web/scripts/bundle-islands.test.ts` | "the metafile's inputs hold no `react`, no `features/` outside the pure module, no `adapters/clock`" (the clock adapter: no byte of it in the output, since `lib/format`'s index imports it and tree-shaking drops it) | Decisions 4, 5; the own-build row |
| `apps/web/lib/vercel-config.test.ts` | "unchanged" | Decision 1 (the CSP text) |
| Lighthouse (`apps/web/lighthouserc.json`) | "on `/en/holding-date` at error: performance 0.95, accessibility 1, console errors, script ≤ 12,288 B" | Decision 1; the size rows |

The steps branch (`feat/holding-date-steps`, tier 1) proves the pure half first: the fragment parser
refuses an unknown code, a non-date (`2025-02-29`), an extra or duplicated key and dates outside
`min`/`max`, and accepts country alone; under review wins over a rule; the dates "PT 2027-03-01 →
2028-02-29, PT 2024-02-29 → 2025-02-28, DE 2028-02-29 → 2029-03-01, DE and US 2024-02-29 →
2025-03-01"; the cards' oracle; the markup "has no `<script` or `style="`, uses `method="dialog"`
and `noscript:hidden`"; the country page's link "appears for PT, DE and US only" (decisions 3, 7, 8,
9, 10).

The judge's gate for the island branch: `lighthouse-branch.yml` and the preview checklist
(`checks=true`; the worker changes), by run id; `pwa.spec.ts` and `offline.spec.ts` before
hand-back; "the CSP spec on iphone in CI decides (local WebKit is provisional)"; the evaluator runs
the tool's flow on both projects, light and dark.

## 6. What is left to the owner

The judge's list, verbatim: "For the owner to confirm at the end of M2: (1) the island form; (2) the
fragment, and the worker stripping fragments from its `pages` keys; (3) radios and one date field,
`min` 2009-01-03 and `max` the build's day plus one year; (4) the date only, with no clock; (5) the
form shown in the first paint (hidden without script, `method="dialog"`) instead of revealed by the
island; (6) no precache; (7) the link from the dated country pages; (8) the planner's items (3) to
(6) as they stand, the 'tax-free from' wording as counsel rules, and the island's 12 KB script
budget."

The planner's items (3) to (6), from the issue body: "(3) the cards' existing examples serve as the
worked examples, no date for rule `none` or a country under review; (4) 'tax-free from' or
'long-term rate from' with a date on a public page, as a holding-status date (LEGAL §6 Q14), as
counsel rules; (5) the modules' app-only sentences reworded to name the app rather than hidden on
the public pages; (6) no country and no date preselected."

Open after the check, named by the designers and not settled by a test: "Some apps may strip
fragments; not verified. The page still works as a plain list." (designer A, risk 5); "Deploy skew.
A page held in the `pages` cache may name a chunk that is gone after a deploy. The island then fails
silently and the list stays; worth a test." (designer A, risk 4); "today's data cannot show it (2028
at the earliest); needs a test fixture" for a country under review (designer B's journeys).
