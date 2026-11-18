# Content operations: the agent drafts, a human publishes

How jurisdiction rules, templates and education facts stay current without anyone auto-publishing
tax statements. Decision: ADR-0015 (principle), ADR-0037 (scheduling); mechanics researched in
`docs/research/stack-backend-security.md` §11; the country facts and their sources in
`docs/JURISDICTIONS.md` §7; the education facts in `docs/EDUCATION.md` §9.

## 1. Roles

- **The agent** (the `/review-content` skill, which the owner starts in their own Claude Code
  session, §3) reads the stored data, fetches the official sources and compares. It edits the content
  data and writes a draft with quoted evidence, dates and a confidence per change, and the finish
  script opens one pull request per run. It never merges, never edits anything outside the content
  data, never deletes, never adds a source that is not on the allow-list, and treats every fetched
  page as untrusted data.
- **The owner** reads the PR against the sources, flips `reviewedBy` from `agent-draft` to `owner`
  in a commit on the agent's branch, sets `lastReviewed` only when every source was read (§8), and
  merges. CI blocks `agent-draft` on `main`. A session's content PR cannot
  carry `agent-draft` past the pre-PR check, so it carries `owner`, is labelled `needs-owner`, and
  the owner's merge is the flip. A session's PR that adds or changes a rule, figure, date or source
  is the owner's to merge, and the session merges one that does not. A new module counts: its
  `Last reviewed` date and `reviewedBy` are the owner's.
- **CI** validates every content file against its zod schema, the 60-word card limit, the banned
  words, the source-domain allow-list and the coin catalogue (unique tickers and CoinGecko ids, in
  ticker order, and every template coin as the catalogue lists it). On an `agent/*` branch or a PR
  labelled `content-review`, ci.yml's `verify` job also fails a change outside the content data or a
  deletion, the removal of a visual baseline excepted (§3).

## 2. Schedule

| When | What |
|---|---|
| 1 January, 1 April, 1 July, 1 October (06:23 UTC) | full review of every jurisdiction and every module's facts: a reminder issue opens, and the owner runs `/review-content` in a Claude Code session |
| 15 January | second pass on jurisdictions, because budget laws land late December and tax authorities update pages in the first fortnight: a reminder issue opens, and the owner runs `/review-content` with the country codes only, so the pass skips facts, templates and cycles |
| any time | `/review-content <codes>` on demand (a reader reports a change; a `pendingChanges[].effectiveFrom` date has passed) |
| continuous | CI fails the build when any profile's `nextReviewDue` is more than twelve months past, so a stale card cannot ship silently |

The reminder is `.github/workflows/content-review-reminder.yml` (`tools/content-review/reminder.ts`):
on each date above it opens one issue labelled `content-review`, assigned to the owner, or comments
`Still due` on the one it opened that is still open. It counts only issues the workflow opened, since
anyone's issue can carry the label: a date counts as reminded only when such an issue, open or
closed, carries its hidden `content-review-due` marker in its body or in a comment from the workflow,
the owner or a collaborator. While a review is due, the `SessionStart` hook in
`.claude/settings.json` shows the owner one line, also when GitHub paused the schedule after 60 days
without activity: restart it with `gh workflow enable content-review-reminder.yml`, then open the
missing issue with `gh workflow run content-review-reminder.yml -f dry_run=false`.

The app shows a card as under review when `nextReviewDue` is more than twelve months past
(`docs/JURISDICTIONS.md` §1), and shows the dated `changeNotice` once when `status.version` increases (`docs/JURISDICTIONS.md` §6).

## 3. Mechanics

The run is manual (ADR-0037 Deviations). The owner types `/review-content` in their own Claude Code
session, on a reminder's date (§2) or on demand, with country codes, `canary=<path>` or `dry` as
arguments. The skill `.claude/skills/review-content/SKILL.md` owns the agent's steps; this section
owns the pipeline around them and its security model.

1. **Start.** `node tools/content-review/propose.ts start` fetches origin/main and the agent/
   branches with `--prune` and refuses a dirty tree or a HEAD other than origin/main; a dirty tree
   beside a draft (.content-review/draft.json) is a review whose finish has not gone through, and it
   says to run finish again. At a clean origin/main it names the review's branch: the day's first
   free name of nine (below). On a review branch it prints that branch's pull requests (a fork's pull
   request from a branch of the same name is left out) and what finish would decide there, and
   refuses. On a HEAD that holds commits origin/main lacks it says to save them before switching
   back, never to detach. It refuses first, changing nothing, when the fetch fails or gh is missing,
   logged out (no token, or GitHub's HTTP 401 for an expired or revoked one) or offline, and names
   the fix: reconnect, install GitHub CLI, or `gh auth login`.
2. **Edits.** The agent edits only content data, marks every change `agent-draft` and deletes
   nothing. The rules files, a locale's folder under `packages/content/rules/` too, change only as the
   output of `pnpm --filter @proofofcalm/content rules`. A translation under `packages/content/i18n/`
   (ADR-0057) that repeats a figure the agent changed fails `pnpm validate:content`
   (`overlay-number-mismatch`). The agent then changes that figure in the translation, at the path
   the check names, to the English file's value written in the translation's number format, and
   nothing else there. The check reads each file with its own number locale: a profile's English
   file and its translation both with the page's, `numberLocaleFor`, so the translation copies each
   figure as written; a template's or a fact's English with English separators, and its translation
   with the language's own, so English characters copied as written can read as another value
   (ADR-0057; the skill's §1 gives the rule and its examples). A profile's percentage, in English and in a
   translation alike, takes its number locale's decimal separator (`docs/CONTENT-STYLE.md` §4), and
   `pnpm validate:content` refuses any other with `decimal-separator` (the skill's §3 step 2). No `allowed-tools` rule approves that edit, so Claude Code asks
   the owner unless the session's permission mode approves it; either way the agent names the
   figure and the English row first and lists the edit in its closing report. The guard and the
   finish accept the translation's file and its locale's generated rules files. Nothing refuses a
   prose edit in a translation, and a translation carries no `reviewedBy`, so the owner's diff read
   (§8) is its review.
3. **The expected failure.** The agent runs the content checks, and the skill tells it: "The one
   failure you expect is `agent-draft` on the entries you marked; when `overlay-number-mismatch`
   names a figure you changed in its English file, change the same figure in the translation (never
   a translated module: §1), written in the translation's number format (§1), run
   `pnpm --filter @proofofcalm/content rules` and run the checks again; fix or revert anything
   else, a figure check's refusal only as §1 says, from its source. A test that fails because it
   asserts what your change replaced (the value a leaf other than `reviewedBy` held, a module
   sentence it pins, or a figure it derives from a value you changed) is not yours to satisfy:
   revert nothing for it; name its file and line and both values in the draft's notes and your
   closing report, and say in both that `verify` fails on `pnpm test` until the owner removes that
   assertion in a pull request of its own (`docs/ENGINEERING.md` §2): one changed to your new
   value would fail on main, where the data still holds the old one."
   A translated module (`i18n/<locale>/learn/*.mdx`) is the skill's translation item too, but the
   agent edits none: the finish and CI's guard refuse its path (`DATA_PATHS` holds no translated
   module), and the guard stays so. An English change that draws `overlay-number-mismatch` or that
   language's `figure-chart` there is one more refusal no edit of the agent's fixes: it reverts the
   change, a chart row's too, in every file it touched and notes the translated module's path, each
   English file and field to change with its new value, every source and each test that failed
   before the revert; the owner makes the
   change in the English and translated files in a pull request of their own (decided 2026-11-17: the owner's commit of the
   digits on the agent's branch fails the guard). A translation's figure that still does
   not match after the agent changes it and runs the checks again is reverted on neither side: the
   agent names it in the draft's notes and its report, and says in both that the PR's `verify`
   check fails on `pnpm validate:content` until it is fixed.
   The finish does not run that check; CI's `verify` job does (`.github/workflows/ci.yml`), so the
   owner fixes the figure before merging (§8 step 4).
   Of "anything else", a figure check's refusal has its own rule in the skill's §1, which names the
   refusals by code family: a code that starts with `figure-` (`figure-join` aside), a
   `percent-token` refusal and a `number-group` refusal with no suggestion. A new code in the
   family falls under that rule, but one that no figure from the source fixes needs a skill edit,
   as `figure-unstated` did (2026-11-17). The agent fixes each from the cited source's figure and changes no other
   word. It never rewords a sentence toward a shape and never picks one of the two readings a
   `number-group` detail names. When the source's figure fits no shape of `docs/CONTENT-STYLE.md`
   §4, it stops on that item, leaves it as it was and names it in the notes and its report: a new
   wording needs a new reviewed shape, which a session pull request adds (decided 2026-11-17).
   In a module's chart section the agent changes only the digits of a fall an E sentence already
   states, to its chart row's new fall, and keeps the figure's joiner. A row change that draws a
   module refusal no such edit fixes (a row no sentence states, a B sentence's count, years or
   bound, a coin with no fall, a row it would remove) it reverts in the same way, noting the coin,
   the dates, the fall and the sources, or a removal's reason, and the templates' copies of the
   row, for the owner, who rewrites the sentence in a reviewed shape. When a run holds a note but
   would change no file, the agent marks a fact entry or file the note names (never a module), so a
   pull request carries the note (the skill's §6). It never changes a bound, adds, moves or deletes a clause or a sentence, or removes a row
   (decided 2026-11-17).
4. **The draft.** The agent writes its findings as JSON in the shape of `ReviewDraft`
   (`tools/content-review/body.ts`) to .content-review/draft.json, a gitignored folder. A change row's
   `item` is the data file relative to `packages/content/` (`jurisdictions/ie.json`) and its `field`
   the changed leaf's path (`card.allowances[0]`); a pending change's `item` is a file too, and its
   `status` is `proposed`, `enacted` or `in-force`. Each file reviewed gets a `reviewed` row: the
   sources read of those it cites, the confidence and its reason. Bookkeeping needs no change row:
   `accessed`, `reviewedBy` and `status.confidence`. The agent never sets `lastReviewed` or
   `nextReviewDue`; the owner sets `lastReviewed` in the flip (§8), once every source was read.
   A changed translation leaf gets a change row too, its `item` the English file's under
   `i18n/<locale>/` and its quote, date and reason the English row's, and no `reviewed` row: its
   `lastReviewed` is its English file's.
   A `reviewed` row's `of` counts the item's sources as the skill's §3 step 1 says. The agent
   fetches no off-list `secondary`
   source, which `packages/content/src/validate.ts` lets a profile cite: it names it in the notes as
   `secondary, off the list, not fetched: <url>` with the lines that cite only it, and leaves those
   lines unchanged; the owner opens it (§8, step 1). The agent reads a PDF through
   `node tools/content-review/pdf.ts <url>`. When that prints the filing rule, the PDF is an
   `unreachable` row (its `url`, and in `expected` what it should show) plus a note
   `PDF not read: <url>` naming the lines that rest only on it, which stay unchanged.
5. **The finish.** `node tools/content-review/propose.ts finish` stages everything and refuses a
   path outside content data, a mode, a binary, a deletion, an entry not at `agent-draft` or a draft
   problem. A deletion is a deleted file, a deleted fact entry (by `key`) or a removed chart row of
   `packages/content/cycles/*.json`: a coin with fewer rows than before, one line per coin. Rows are
   counted per coin, not keyed by coin and high, so a corrected `high` passes; so does a row swapped
   for another of its coin, a hole the owner's diff read (§8) covers (decided 2026-11-17). A
   template's own `drawdowns` rows are not counted. It compares the draft's rows with the staged diff both ways
   (`tools/content-review/rows.ts`): a changed leaf with no row, a row for a leaf that did not
   change, a changed module with no row, a changed file (a module too, a translation not) with no
   `reviewed` row,
   and any change to `lastReviewed` or `nextReviewDue` (in a module, any changed line naming either)
   are refused; the generated rules files, a locale's too, are skipped. A refusal leaves the index as it found
   it. Without `--dry` at origin/main it first refuses, changing nothing, a HEAD other than
   origin/main, then a failed fetch of the agent/ branches or a gh that is missing, logged out or
   offline, and takes the day's first free name. When nothing is refused, it renders the body,
   commits on that name, pushes it with a plain push that only creates the branch, and opens the PR
   labelled `needs-owner` and `content-review`. On a review branch it reads the branch's
   pull-request record first and resumes only a part-way failure (below). A failed step prints
   `<step>: <git's or gh's first line>: run finish again` and exits 1. It never merges and never
   forces a push.
6. **Dry mode.** On `dry`, `node tools/content-review/propose.ts finish --dry` writes the body to
   .content-review/body.md and commits, pushes and opens nothing.

The agent has no git and no gh. The skill's `allowed-tools` pre-approve the data edits, the three
pnpm commands and the three `propose.ts` commands, and name no git, gh, WebFetch, WebSearch or
pdf.ts rule. `node tools/content-review/pdf.ts <url>` is not pre-approved: unless the session's
permission mode approves it, each run asks the owner and shows its URL, and it fetches only an https
URL on the allow-list, checks every redirect hop the same way and writes only under
.content-review/pdf/. Pre-approval does not confine: any other tool still goes through the session's
permission mode, which in the default mode asks the owner. WebFetch
keeps the session's own permission settings, so in the default mode each new domain's first
WebFetch shows the owner what the agent reads; a mode that approves it shows nothing.

Until the owner's first run, only the tests, which run it against a local origin and a fake gh,
cover the finish's non-dry path. The `finish-dry` job of `.github/workflows/content-review.yml` runs the dry path on fixtures.

A day has nine names: `agent/content-review-<date>`, then the same with `-2` to `-9`. A review
takes the first with no local branch, no origin branch and no pull request, so a second review on
the same day takes `-2` and never touches the first one's branch or PR; with all nine taken, start
and finish refuse. On a review branch the pull-request record decides before anything else
(`decide` in `tools/content-review/resume.ts`; the states and the evidence:
`docs/research/review-resume.md`):

- An open PR is the review's proposal. With a clean tree and HEAD at or behind its remote branch
  (the owner's flip commits included), finish prints its URL, adds `needs-owner` if it is missing,
  and exits 0; otherwise it prints the URL and the facts and exits 1. It commits and pushes nothing.
- A merged or closed PR is done: finish refuses and never pushes that branch again.
- With no PR, finish resumes only a part-way failure: edits not committed (commit, push, PR), one
  commit not pushed (push, PR), or one commit pushed (the PR). Every other state is refused with
  the facts.

The only advice it gives is `git switch --detach origin/main` (to start another review, on a clean
tree) and `run finish again`; no line names a reset, a deletion, a force push or a close. A force
push is never the answer: when today's PR is open and the local branch is gone, a push from a new
branch of the same name is rejected as non-fast-forward, and forcing it would replace the live
PR's head and the owner's flip commits.

Trust layers. The agent runs under the owner's identity, so the layers make an injected instruction
visible rather than impossible:

- The agent's free Markdown never reaches GitHub. `body.ts` writes every text cell of the draft as
  literal text, and `tools/content-review/render-check.ts` proves that through GitHub's renderer in
  the `render` job of `.github/workflows/content-review.yml`.
- Every link is https, on `packages/content/sources.allow.json` or a subdomain of a listed domain,
  and shows its true host as its text. A change's or pending change's link must be on its item's
  list: a country's file on that country's list or `EU`, any other data file on `facts`, a
  translation under `i18n/<locale>/` on its English file's; verified
  and unreachable links on any list. The finish refuses any other link. `pnpm validate:content`
  refuses an off-list source in the data unless its `kind` is `secondary`: a secondary source may
  sit off the list, and it is never a profile's only evidence (`packages/content/src/validate.ts`).
- `tools/content-review/pdf.ts` is not pre-approved: unless the session's permission mode approves
  it, each run asks the owner and shows its URL. It
  takes one URL, fetches it only over https, checks it and every redirect hop against the allow-list, keeps only bytes that start as a PDF and writes only
  under .content-review/pdf/. The agent reads its text as data, like any fetched page.
- Deletions are refused: the finish refuses every one, so the agent deletes nothing, and CI's guard
  refuses every one but a removed baseline (next item). The draft names a gone source, and the owner
  deletes it in a session's PR.
- CI's guard: ci.yml's `verify` job runs the base commit's copy of `tools/content-review/check.ts`
  before pnpm or any PR code. An `agent/*` branch or a PR labelled `content-review` may change only
  content data (`DATA_PATHS`: one file name per data folder, a translation in `jurisdictions/`,
  `templates/` or `facts/` of a locale under `packages/content/i18n/`, and a locale's generated rules
  file) and delete none of it, with one exception: the guard also accepts the removal of a
  visual baseline PNG under `apps/web/e2e/*-snapshots/`, the owner's step 4 in §8.
- The guard step is a tripwire. It lives in the PR's own copy of ci.yml, so a PR that edits ci.yml
  can change or drop it. The robust form, a `pull_request_target` guard as a required check, is not
  built for the manual mode.
- The control is the owner's diff read (§8), which starts with the PR's file list. CI fails any
  entry still at `agent-draft`, so nothing merges before the owner's flip.

There is no model job in CI (ADR-0037 Deviations), so no model credential goes into GitHub. The run
costs the owner's Claude subscription and the owner's time; there is no API cost.

## 4. Pull request template

`.github/PULL_REQUEST_TEMPLATE/content-review.md` owns the body's headings and the owner's checklist;
`tools/content-review/body.ts` fills the agent's sections from the draft.

## 5. Source allow-list (`packages/content/sources.allow.json`)

Primary sources per country; secondary sources (professional firms, press) may be used to discover a
change but never as the sole evidence for one.

| Country | Allowed domains |
|---|---|
| PT | `info.portaldasfinancas.gov.pt`, `portaldasfinancas.gov.pt`, `diariodarepublica.pt`, `files.diariodarepublica.pt`, `dre.pt`, `parlamento.pt` |
| DE | `gesetze-im-internet.de`, `bundesfinanzministerium.de`, `bzst.de`, `bundestag.de`, `bundesrat.de`, `recht.bund.de`, `bundesfinanzhof.de` |
| NL | `belastingdienst.nl`, `rijksoverheid.nl`, `eerstekamer.nl`, `tweedekamer.nl`, `officielebekendmakingen.nl`, `wetten.overheid.nl` |
| ES | `sede.agenciatributaria.gob.es`, `agenciatributaria.gob.es`, `boe.es`, `hacienda.gob.es`, `lamoncloa.gob.es`, `congreso.es` |
| FR | `impots.gouv.fr`, `bofip.impots.gouv.fr`, `legifrance.gouv.fr`, `assemblee-nationale.fr`, `senat.fr`, `economie.gouv.fr` |
| IT | `agenziaentrate.gov.it`, `fiscooggi.it`, `gazzettaufficiale.it`, `mef.gov.it`, `normattiva.it` |
| BE | `finances.belgium.be`, `financien.belgium.be`, `ejustice.just.fgov.be`, `ruling.be`, `news.belgium.be`, `lachambre.be`, `dekamer.be` |
| IE | `revenue.ie`, `gov.ie`, `assets.gov.ie`, `oireachtas.ie`, `irishstatutebook.ie` |
| GB | `gov.uk`, `legislation.gov.uk`, `assets.publishing.service.gov.uk`, `fca.org.uk` |
| US | `irs.gov`, `congress.gov`, `federalregister.gov`, `treasury.gov`, `taxfoundation.org` (state rates only) |
| EU | `eur-lex.europa.eu`, `esma.europa.eu`, `ecb.europa.eu`, `taxation-customs.ec.europa.eu` |
| Education facts | `mempool.space`, `blockchain.com`, `bitstamp.net`, `exchange.coinbase.com`, `api.coingecko.com`, `coinmarketcap.com`, `bitcoinity.org` (the Mt. Gox daily export, the only series for the 2011 high), `alternative.me`, `coinglass.com`, `cftc.gov` and `mtgox.com` (the company's and the regulator's own documents on a failure, one source each; a provider named only as the subject of a dated event its customers suffered, `docs/LEGAL.md` §6 Q4), `bis.org`, `esma.europa.eu`, `fca.org.uk`; for the tax-rule changes (`docs/EDUCATION.md` §9 row k), `diariodarepublica.pt`, `recht.bund.de`, `normattiva.it`, `ejustice.just.fgov.be`, `gov.uk`, `revenue.ie`, `oireachtas.ie` |

A bill, a case or a draft appears in a `docs/JURISDICTIONS.md` §7 row or a research row only beside
the source that reported it, named inline with its date (for instance "named by Freshfields,
2025-12-18; text not fetched"), never as a bare number with "outcome not verified"; no CI job fetches
a third-party site for such a row, since the owner's manual review (§3, §6) already watches the fact (decided
2026-11-05, after congress.gov refused a fetch with HTTP 403).

## 6. What the review watches first

The per-country watch lists in `docs/JURISDICTIONS.md` §7.11 and §7.12 (Italy's 2027 rate, Ireland's
Finance (No. 2) Act 2026, Belgium's 2027 parameters and circulars, the US identification relief and bills, the
UK autumn Budget and DeFi legislation, Germany's reform draft, France's PLF 2027 amendments, the
Dutch 2027 and 2028 decisions, Spain's post-election bills, Portugal's OE2027 and AT rulings), plus
the verification queues left by the research of 2026-10-16 (unread primary PDFs, law numbers to
confirm, penalty figures to quote).

The templates' ETH rows for the 2021–22 fall cite Bitstamp, while `packages/content/cycles/drawdowns.json`
cites Coinbase for the same fall. The first full run proposes one source for both, or records why
they differ.

## 7. Education facts

`packages/content/facts/*.json` holds every number the modules cite: key, value, unit, date, source
URL, publisher, accessed date, confidence, `lastReviewed`, `reviewedBy` (CI blocks a fact still at
`agent-draft`, as it does a profile or a template, §1); the facts test holds its keys against
`docs/EDUCATION.md` §9, and each value against its row: a value a review changed passes only at
the value its `unlogged` entry pins, from the owner's session pull request until the log pull
request updates the row and removes the entry (§8 steps 4 and 5). Modules reference facts by key in their front matter; the
content test fails when a module cites a key that does not exist or whose `lastReviewed` is older
than twelve months; the owner's manual review (§3) re-reads the sources and proposes updates.
Templates carry `lastReviewed` too (the Cycle plan's dates age). The chart rows of the risk module
and the Red day page live in `packages/content/cycles/drawdowns.json`. `docs/EDUCATION.md` §9 a and b
quote the same falls to one decimal, each on the series it names; the file rounds them to the
nearest whole percent (96.923 % is 97, never 96), and a template's own `drawdowns` copy of a row
holds the same high, low and fall, tied only by `packages/content/src/cycles.test.ts`. A fall runs to the lowest low before the coin regains its high; a coin that has not regained it, as LINK on 2 Nov 2026,
is read again at every review, because its low can still move.
A fact that cites Coinbase Exchange's daily candles names one request: `start` and `end` at
`T00:00:00Z`, fewer than 300 days apart, since a request answers at most 300 candles and one without
a window only the latest days. The window holds where the review starts: `b.alt-drawdowns`' ETH 2021
high and 2022 low (its row's window in the cycles file), a simulation's first buy
(`p.simulator-examples-eth`'s worst value-to-cost too); the review reaches the rest of the series by
moving both, and another coin by its product (`SOL-USD`, `LINK-USD`), so the review trims no such
fact to the window its URL names (the skill's §4 step 3).
`packages/content/src/fact-windows.test.ts` holds each window.

## 8. The owner's review, step by step

1. Open the PR and read its file list first. Close it unmerged when any path lies outside the
   content data the guard accepts (§3, `DATA_PATHS`), such as `.github/`, `tools/`, a `src/` folder
   or a package file. Then, for each
   change, open the source URL yourself (not the quote) and find the passage. An exchange's price API
   answers one window per request: a Bitstamp OHLC source opens at its `start` and returns at most
   `limit` daily candles (1000 at most), so for a figure past that window set `start` in the same URL
   to the figure's day, in Unix seconds. Open also each
   off-list secondary source the notes name as not fetched, on its own site, and read the lines that
   cite it.
2. Check the effective date and the status word; a proposal is never a rule.
3. Read the `summary60` aloud; cut anything that sounds like advice.
4. In a commit on the agent's branch, flip `reviewedBy` only on the files and fact entries whose
   changes you checked in steps 1 to 3. After a partial review the rest stay at `agent-draft`, which
   `verify` fails, so the PR waits until you check them or revert their changes. Set a file's
   `lastReviewed` (in a facts file, every fact entry's) to today only after a whole-file review: its `reviewed` row shows every source
   read (`read` equals `of`; the finish refuses a changed file with no row), you opened each
   secondary source of step 1 and you checked every change in the file; otherwise leave it
   unchanged (a partial review moves nothing). An `accessed` later than an unchanged `lastReviewed`
   then fails the flip: `accessed-after-review` in `pnpm validate:content` on a template's or the
   cycles file's `drawdowns` row, `packages/content/src/facts.test.ts` on a fact. So after a
   partial review the agent leaves those `accessed` dates as they were and gives the read day in
   the change row (the skill's §4 step 1); revert one it set, or review the whole file. Bump `status.version`,
   set `changedOn` and write `changeNotice` when a rule changed in substance; a bump that corrects our
   own file also writes a `changeNotice` that says so (`docs/JURISDICTIONS.md` §6). When `verify`
   fails on `pnpm test`, or an end-to-end spec fails in CI, because a test asserts a value the review
   changed other than `reviewedBy` (named in the notes, or shown only by CI, as an app, web or
   end-to-end test is), have every assertion that pins the old value removed in a session pull
   request to main first, not only the line a failure prints (Vitest prints a test's first failing
   assertion alone; the notes name each, a constant's line with every assertion that reads it),
   since one changed to the new value fails on main, where the data still holds the old one; push
   the flip after it merges. For the tie of a fact's value to its `docs/EDUCATION.md` §9 row, that pull
   request keeps the tie and adds the fact's old and new value, as you read them in the diff, to
   `unlogged` in `packages/content/src/facts.test.ts`; the agent's branch cannot change that file,
   so a later push that moves the value fails the tie (decided 2026-11-17: letting the guard accept
   the document would open a path from a fetched page into a file later build sessions read as
   instructions, §3). For a `FALLS` literal of `packages/content/src/cycles.test.ts` that a
   `FALLS entry for the owner` note names, that pull request keeps the literal and adds the note's
   `now` to `unloggedFalls` in the same test, keyed `<coin> <high>` of the literal
   (`ETH 2021-11-10`): the test reads the literal while the data does, and `now` once the review
   merges. Deleting or changing the literal instead fails the test's whole-array comparison on
   main. When the review's PR closes unmerged, or no longer holds the value an `unlogged` or
   `unloggedFalls` entry pins, remove that entry in a pull request to main: no test can tell it
   from the entry of a review still open, since main holds the old value in both, and a later
   review that writes exactly its `now` would pass with no session pull request of its own. When the PR
   changes a translation (§3 step 2), check that its diff changes only the figures its English file
   changed, at the same paths and to the same values, and nothing else there: compare the values,
   not the characters, since the translation writes each in its number locale's format (§3 step 2;
   the pt-PT translation of Germany is read in de-DE, as its English file is, so it copies each
   figure as written: `EUR 20 350` stays `EUR 20 350` and `5,5 %` stays `5,5 %`, since a
   profile's English figures already take the page's form and draw `decimal-separator` or
   `number-group` otherwise).
   When the notes name a JSON translation's figure that still fails `overlay-number-mismatch` (§3
   step 3), write that figure in the translation, in its number locale's format (the skill's §1),
   or revert the English change, in a commit on the agent's branch before merging; `verify` stays
   red until then. A note for a translated module or a chart row names a change the agent
   reverted: make it in a pull request of your own, never on the agent's branch. A file or fact entry
   changed only in its mark carries a note (§3 step 3): flip it back, and close the pull request
   unmerged when nothing else is left in it. The Learn country
   screens print `lastReviewed`, so `e2e-visual` can fail on the new date: delete the baselines it names
   in a commit on the agent's branch (the guard accepts a removed baseline, nothing else outside the
   data folders), and send new ones in a needs-owner PR after the merge (`CLAUDE.md`, Visual
   snapshots). Merge; the next deploy shows the dated notice to affected users.
5. Log the run in `docs/content-review-log.md`: its date, the PR, the model and what you corrected,
   so the skill improves. The log goes in its own PR, since the agent's branch takes content data only.
   The log PR also updates each `docs/JURISDICTIONS.md` §7 row and `docs/EDUCATION.md` §9 row that the
   merged review changed, and removes each updated fact's `unlogged` entry (step 4), since the facts
   test fails while one stays. It also writes each `unloggedFalls` entry's `now` into `FALLS` in
   `packages/content/src/cycles.test.ts` in place of its literal and removes the entry, since that
   test's stale check fails on an entry whose literal reads `now` or is gone. When `now` moves a
   row's high, it also writes the new `<coin> <high>` in place of the old one in that test's
   `UNREGAINED_KEYS`, which reads the old key through the entry only while it stays (its check
   names a key no `FALLS` literal holds); a changed publisher needs no such edit, since the test
   reads its Coinbase rows from `FALLS` and the entries; that makes it a tier 2 pull request with the content roles
   (`.claude/rules/content.md`).
