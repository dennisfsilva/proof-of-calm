# Content operations: the agent drafts, a human publishes

How jurisdiction rules, templates and education facts stay current without anyone auto-publishing
tax statements. Decision: ADR-0015 (principle), ADR-0037 (scheduling); mechanics researched in
`docs/research/stack-backend-security.md` §11; the country facts and their sources in
`docs/JURISDICTIONS.md` §7; the education facts in `docs/EDUCATION.md` §9.

## 1. Roles

- **The agent** (a scheduled Claude Code run in GitHub Actions) reads the stored data, fetches the
  official sources, compares, and opens one pull request per run with a diff, quoted evidence, dates
  and a confidence per change. It never merges, never edits anything outside `packages/content/**`,
  never adds a source that is not on the allow-list, and treats every fetched page as untrusted data.
- **The owner** reads the PR against the sources, flips `reviewedBy` from `agent-draft` to `owner`,
  sets `lastReviewed`, and merges. CI blocks `agent-draft` on `main`. A session's content PR cannot
  carry `agent-draft` past the pre-PR check, so it carries `owner`, is labelled `needs-owner`, and
  the owner's merge is the flip. A session's PR that adds or changes a rule, figure, date or source
  is the owner's to merge, and the session merges one that does not. A new module counts: its
  `Last reviewed` date and `reviewedBy` are the owner's.
- **CI** validates every content file against its zod schema, the 60-word card limit, the banned
  words, the source-domain allow-list and the coin catalogue (unique tickers and CoinGecko ids, in
  ticker order, and every template coin as the catalogue lists it). With the review job (M2), a
  required check also asserts that the diff is confined to `packages/content/**` (§3).

## 2. Schedule

| When | What |
|---|---|
| 1 January, 1 April, 1 July, 1 October (06:23 UTC) | full review of every jurisdiction and every module's facts: a reminder issue opens, and the owner runs `/review-content` in a Claude Code session |
| 15 January | second pass on jurisdictions, because budget laws land late December and tax authorities update pages in the first fortnight: a reminder issue opens, and the owner runs `/review-content` with the country codes only |
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

Workflow, `.github/workflows/content-review.yml` (planned: M2):

```yaml
name: Content review (agent drafts, human publishes)
on:
  schedule:
    - cron: "23 6 1 1,4,7,10 *"
    - cron: "23 6 15 1 *"
  workflow_dispatch:
    inputs:
      countries: { description: "comma-separated ISO codes, empty = all", required: false }
concurrency: { group: content-review, cancel-in-progress: false }
permissions: {}
jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    permissions: { contents: write, pull-requests: write, id-token: write }
    steps:
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: anthropics/claude-code-action@<sha> # v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          branch_prefix: agent/
          use_commit_signing: "true"
          prompt: "/review-content ${{ inputs.countries }}"
          claude_args: |
            --model claude-opus-5-5
            --max-turns 80
            --allowedTools "Read,Grep,Glob,WebFetch,WebSearch,Edit(packages/content/**),Write(packages/content/**),Bash(pnpm run validate:content),Bash(pnpm --filter @proofofcalm/content test),Bash(git status:*),Bash(git add packages/content:*),Bash(git commit:*),Bash(git push:*),Bash(gh pr create:*)"
```

The prompt is the repository skill `.claude/skills/review-content/SKILL.md`, built on 2026-11-11
(#123); it owns the agent's steps (its boundary, what it reads first, the reads per country and per
fact, the checks on each draft, the `agent-draft` marks and the finish), and this section points to
it rather than restating them.

Guard rails: human review mandatory, because the job never merges and CI fails any profile,
template or fact still at `reviewedBy: agent-draft`, on the pull request too; the ruleset `main` requires no
approval and no code-owner review (`docs/OWNER-SETUP.md` §1), so the CODEOWNERS line
`/packages/content/` names the owner without gating the merge; the action's token is scoped and
short-lived; tools and paths restricted as above; `permissions` minimal; only `ANTHROPIC_API_KEY` is
available to the job; `--max-turns` and `timeout-minutes` cap cost; `concurrency` prevents
overlapping runs; a required check asserts the diff is confined to `packages/content/**`; signed
commits; labels `agent-draft` and `needs-human-review`.

Cost: about five runs a year at roughly USD 5 per run with Opus 5.5 (USD 16 pessimistic, USD 3 with
Sonnet 5.5), under EUR 100 a year.

## 4. Pull request template, `.github/PULL_REQUEST_TEMPLATE/content-review.md` (planned: M2)

```
## Changes
| Country/fact | Field | Old | New | Source URL | Accessed | Confidence |

## Verified, no change
<country list with the sources re-read>

## Unreachable or moved sources
<url, what was expected>

## Pending changes noticed (with effective dates and status: proposed / enacted / in force)

## Reviewer checklist (the owner)
- [ ] every diff checked against the quoted source, on the source's own site
- [ ] effective dates and status right; nothing proposed is written as law
- [ ] `summary60` still true and under 60 words; banned words absent
- [ ] `validate:content` green; `reviewedBy` set to `owner`; `lastReviewed` today; `nextReviewDue` sensible
- [ ] `status.version` bumped, `changedOn` set and `changeNotice` written when a substantive rule changed;
  a bump that corrects our own file also writes a `changeNotice` that says so (`docs/JURISDICTIONS.md` §6)
- [ ] the verification queue items for this country closed or carried over

## Run metadata
model, turns, tokens (from the Actions log)
```

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
a third-party site for such a row, since the review job (§6) already watches the fact (decided
2026-11-05, after congress.gov refused a fetch with HTTP 403).

## 6. What the job watches first

The per-country watch lists in `docs/JURISDICTIONS.md` §7.11 and §7.12 (Italy's 2027 rate, Ireland's
Finance (No. 2) Act 2026, Belgium's 2027 parameters and circulars, the US identification relief and bills, the
UK autumn Budget and DeFi legislation, Germany's reform draft, France's PLF 2027 amendments, the
Dutch 2027 and 2028 decisions, Spain's post-election bills, Portugal's OE2027 and AT rulings), plus
the verification queues left by the research of 2026-10-16 (unread primary PDFs, law numbers to
confirm, penalty figures to quote).

## 7. Education facts

`packages/content/facts/*.json` holds every number the modules cite: key, value, unit, date, source
URL, publisher, accessed date, confidence, `lastReviewed`, `reviewedBy` (CI blocks a fact still at
`agent-draft`, as it does a profile or a template, §1); the facts test holds its keys against
`docs/EDUCATION.md` §9. Modules reference facts by key in their front matter; the
content test fails when a module cites a key that does not exist or whose `lastReviewed` is older
than twelve months; the review job re-reads the sources and proposes updates.
Templates carry `lastReviewed` too (the Cycle plan's dates age). The chart rows of the risk module
and the Red day page live in `packages/content/cycles/drawdowns.json`. `docs/EDUCATION.md` §9 a and b
quote the same falls to one decimal, each on the series it names; the file rounds them to whole
percents. A fall runs to the lowest low before the coin regains its high; a coin that has not regained it, as LINK on 2 Nov 2026,
is read again at every review, because its low can still move.

## 8. The owner's review, step by step

1. Open the PR; for each change open the source URL yourself (not the quote) and find the passage.
2. Check the effective date and the status word; a proposal is never a rule.
3. Read the `summary60` aloud; cut anything that sounds like advice.
4. Flip `reviewedBy`, set `lastReviewed`, bump `status.version`, set `changedOn` and write
   `changeNotice` when a rule changed in substance; a bump that corrects our own file also writes a
   `changeNotice` that says so (`docs/JURISDICTIONS.md` §6); merge; the next deploy shows the dated notice to affected users.
5. Note anything the agent got wrong in `docs/content-review-log.md` so the skill improves.
