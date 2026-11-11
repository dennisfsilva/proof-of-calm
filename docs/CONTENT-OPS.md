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
  in a commit on the agent's branch, sets `lastReviewed`, and merges. CI blocks `agent-draft` on
  `main`. A session's content PR cannot
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

1. **Start.** `node tools/content-review/propose.ts start` fetches origin/main and refuses a dirty
   tree or a HEAD other than origin/main.
2. **Edits.** The agent edits only content data, marks every change `agent-draft` and deletes
   nothing. The rules files change only as the output of `pnpm --filter @proofofcalm/content rules`.
3. **The expected failure.** The agent runs the content checks, and the skill tells it: "The one
   failure you expect is `agent-draft` on the entries you marked; fix or revert anything else."
4. **The draft.** The agent writes its findings as JSON in the shape of `ReviewDraft`
   (`tools/content-review/body.ts`) to .content-review/draft.json, a gitignored folder. A change row's
   `item` is the data file relative to `packages/content/` (`jurisdictions/ie.json`) and its `field`
   the changed leaf's path (`card.allowances[0]`); a pending change's `item` is a file too, and its
   `status` is `proposed`, `enacted` or `in-force`. Each file reviewed gets a `reviewed` row: the
   sources read of those it cites, the confidence and its reason. Bookkeeping needs no change row:
   `accessed`, `reviewedBy` and `status.confidence`. The agent never sets `lastReviewed` or
   `nextReviewDue`; the owner sets `lastReviewed` in the flip (§8), once every source was read.
   A `reviewed` row's `of` counts the sources on the item's list (the country's list plus `EU`, or
   `facts`), each `pendingChanges[].source` included. The agent fetches no off-list `secondary`
   source, which `packages/content/src/validate.ts` lets a profile cite: it names it in the notes as
   `secondary, off the list, not fetched: <url>` with the lines that cite only it, and leaves those
   lines unchanged; the owner opens it (§8, step 1). The agent reads a PDF through
   `node tools/content-review/pdf.ts <url>`. When that prints the filing rule, the PDF is an
   `unreachable` row (its `url`, and in `expected` what it should show) plus a note
   `PDF not read: <url>` naming the lines that rest only on it, which stay unchanged.
5. **The finish.** `node tools/content-review/propose.ts finish` stages everything and refuses a
   path outside content data, a mode, a binary, a deletion, an entry not at `agent-draft` or a draft
   problem. It compares the draft's rows with the staged diff both ways
   (`tools/content-review/rows.ts`): a changed leaf with no row, a row for a leaf that did not
   change, a changed module with no row, a file changed only in bookkeeping with no `reviewed` row,
   and any change to `lastReviewed` or `nextReviewDue` (in a module, any changed line naming either)
   are refused; the generated `rules/*.json` are skipped. A refusal leaves the index as it found
   it. Without `--dry` it first refuses a HEAD other than origin/main. When nothing is refused, it
   renders the body, commits on `agent/content-review-<date>`, pushes, and opens the PR labelled
   `needs-owner` and `content-review`. It never merges.
6. **Dry mode.** On `dry`, `node tools/content-review/propose.ts finish --dry` writes the body to
   .content-review/body.md and commits, pushes and opens nothing.

The agent has no git and no gh. The skill's `allowed-tools` pre-approve the data edits, the three
pnpm commands and the three `propose.ts` commands, and name no git, gh, WebFetch, WebSearch or
pdf.ts rule. `node tools/content-review/pdf.ts <url>` is not pre-approved: each run asks the owner
and shows its URL, and it fetches only an https URL on the allow-list, checks every redirect hop the
same way and writes only under .content-review/pdf/. Pre-approval does not confine: any other tool
still asks the owner. WebFetch
keeps the session's own permission settings, so each new domain's first WebFetch shows the owner
what the agent reads.

Until the owner's first run, only the tests, which check its git and gh argv, cover the finish's
non-dry path. The `finish-dry` job of `.github/workflows/content-review.yml` runs the dry path on fixtures. A second
run on the same day fails, at the branch switch or at the push, because today's branch,
`agent/content-review-<date>`, exists. Delete today's branch, local and remote, only once its PR
exists or when it holds nothing you need: after a pushed finish whose PR did not open, it holds the
only copy of the review's edits. Then open the PR by hand from the pushed branch, labelled
`needs-owner` and `content-review`, with the body the finish wrote to .content-review/body.md.

Trust layers. The agent runs under the owner's identity, so the layers make an injected instruction
visible rather than impossible:

- The agent's free Markdown never reaches GitHub. `body.ts` writes every text cell of the draft as
  literal text, and `tools/content-review/render-check.ts` proves that through GitHub's renderer in
  the `render` job of `.github/workflows/content-review.yml`.
- Every link is https, on `packages/content/sources.allow.json` or a subdomain of a listed domain,
  and shows its true host as its text. A change's or pending change's link must be on its item's
  list: a country's file on that country's list or `EU`, any other data file on `facts`; verified
  and unreachable links on any list. The finish refuses any other link, and `pnpm validate:content`
  refuses an off-list source in the data.
- `tools/content-review/pdf.ts` is not pre-approved: each run asks the owner and shows its URL. It
  takes one URL, fetches it only over https, checks it and every redirect hop against the allow-list, keeps only bytes that start as a PDF and writes only
  under .content-review/pdf/. The agent reads its text as data, like any fetched page.
- Deletions are refused: the finish refuses every one, so the agent deletes nothing, and CI's guard
  refuses every one but a removed baseline (next item). The draft names a gone source, and the owner
  deletes it in a session's PR.
- CI's guard: ci.yml's `verify` job runs the base commit's copy of `tools/content-review/check.ts`
  before pnpm or any PR code. An `agent/*` branch or a PR labelled `content-review` may change only
  content data and delete none of it, with one exception: the guard also accepts the removal of a
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
`docs/EDUCATION.md` §9. Modules reference facts by key in their front matter; the
content test fails when a module cites a key that does not exist or whose `lastReviewed` is older
than twelve months; the owner's manual review (§3) re-reads the sources and proposes updates.
Templates carry `lastReviewed` too (the Cycle plan's dates age). The chart rows of the risk module
and the Red day page live in `packages/content/cycles/drawdowns.json`. `docs/EDUCATION.md` §9 a and b
quote the same falls to one decimal, each on the series it names; the file rounds them to whole
percents. A fall runs to the lowest low before the coin regains its high; a coin that has not regained it, as LINK on 2 Nov 2026,
is read again at every review, because its low can still move.

## 8. The owner's review, step by step

1. Open the PR and read its file list first. Close it unmerged when any path lies outside the data
   folders of §1, such as `.github/`, `tools/`, a `src/` folder or a package file. Then, for each
   change, open the source URL yourself (not the quote) and find the passage. Open also each
   off-list secondary source the notes name as not fetched, on its own site, and read the lines that
   cite it.
2. Check the effective date and the status word; a proposal is never a rule.
3. Read the `summary60` aloud; cut anything that sounds like advice.
4. In a commit on the agent's branch, flip `reviewedBy`; set `lastReviewed` to today only when every
   `reviewed` row read all its sources and you opened each secondary source of step 1, otherwise
   leave it unchanged (a partial review moves nothing); bump `status.version`,
   set `changedOn` and write `changeNotice` when a rule changed in substance; a bump that corrects our
   own file also writes a `changeNotice` that says so (`docs/JURISDICTIONS.md` §6). The Learn country
   screens print `lastReviewed`, so `e2e-visual` can fail on the new date: delete the baselines it names
   in a commit on the agent's branch (the guard accepts a removed baseline, nothing else outside the
   data folders), and send new ones in a needs-owner PR after the merge (`CLAUDE.md`, Visual
   snapshots). Merge; the next deploy shows the dated notice to affected users.
5. Log the run in `docs/content-review-log.md`: its date, the PR, the model and what you corrected,
   so the skill improves. The log goes in its own PR, since the agent's branch takes content data only.
