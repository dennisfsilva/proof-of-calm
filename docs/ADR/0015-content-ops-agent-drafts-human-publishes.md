# ADR-0015: Content operations: the agent drafts, a human publishes

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); detailed by the planning session

## Context

Jurisdiction rules change yearly (budget laws land in January), education statistics age, and a solo
builder will not re-read ten tax authorities' pages every quarter. An agent can; an agent can also be
wrong, be fed a manipulated page, or misread a draft law as enacted. Auto-publishing tax statements is
how someone gets hurt.

## Options considered

1. **Manual review on a calendar reminder.** Will slip.
2. **Agent auto-publishes with high confidence.** Unacceptable for tax content.
3. **Agent drafts, human publishes**: a scheduled job runs an agent over each country's official
   sources, compares with the stored rule data, and opens a pull request with the diff, the sources and
   a confidence note; the owner reviews and merges.

## Decision

Option 3. Schedule: quarterly, plus every January when budget laws land. Every rule carries
`lastReviewed` and `nextReviewDue`; if a review is more than twelve months overdue the card shows
"under review" instead of the stale claim. Education modules carry "last reviewed" too and the same
pipeline flags modules whose statistics are older than a year. Mechanism (GitHub Action versus a
scheduled Claude Code routine), source list per country, PR template and guard rails:
`docs/CONTENT-OPS.md` and ADR-0037.

## Consequences

- The agent may only edit `packages/content`; CI validates the data against the schema; CODEOWNERS
  requires the owner's review; the job never merges.
- Prompt injection through fetched pages is a named threat (`docs/SECURITY.md`): the agent's output is
  a diff for a human, never a deployment.
- Each PR cites sources with dates and sets a confidence; "proposed" and "enacted" are distinct
  fields.
- The cost is a few euros per run and an hour of the owner's time per quarter.

## Disagreement

None.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Consequences, first bullet: "CODEOWNERS requires the owner's review".** The ruleset `main`
  requires no approval and no code-owner review (`docs/OWNER-SETUP.md` §1 says why), so
  `.github/CODEOWNERS` names the owner but enforces nothing. The human gate is in CI: content
  validation (`packages/content/src/validate.ts`), a step of the required check `verify`, refuses
  `reviewedBy: agent-draft`, and the owner sets `reviewedBy: owner` after reading the sources
  (`docs/CONTENT-OPS.md`).

## Deviations

- 2026-11-02: the owner delegated the read and the merge of #290, #299 and #305 to a session, by message,
  once, with the baseline PR that follows #305. Agents opened the sources and a session merged, so on those
  files `reviewedBy: owner` records the delegation, not a person's read. What it found:
  `docs/content-review-log.md`. The rule stands for every other content PR.
- 2026-11-02: the owner delegated the read and the merge of #311 and #316 to a session, by message, once, with
  the one LEGAL §4 call #316 asked for and the baseline PR that follows #316. Agents and the session opened the
  sources and a session merged, so on those files `reviewedBy: owner` records the delegation, not a person's
  read. What it found: `docs/content-review-log.md`. The rule stands for every other content PR.
- 2026-11-05: the owner delegated the read and the merge of #325 to a session, by message, once, with the
  baseline PR that follows it (#321). The session opened the sources, counsel and brand read the four lines the
  read changed, and a session merged, so on those files `reviewedBy: owner` records the delegation, not a
  person's read. What it found: `docs/content-review-log.md`. The rule stands for every other content PR.
- 2026-11-05: the owner delegated the read and the merge of #335, #347, #338, #333, #334, #340, #339 and #332
  to a session, by message, once, with the baseline PR #328, and confirmed the merges when the session asked.
  Agents re-fetched the sources and read every value, fix builders applied the findings, and the session
  decided what a read left open and merged, so on those files `reviewedBy: owner` records the delegation, not
  a person's read. What it found: `docs/content-review-log.md`. The rule stands for every other content PR.
- 2026-11-09: the owner delegated the read and the merge of #61, the Noise and When the market drops modules,
  to a session, by message (the session's question that morning), with the session's other checkpoint PRs. An
  agent re-read every figure against its source: 30 figures, facts q and o re-run from Bitstamp's daily
  candles; 28 matched, and the 2 differences, both in fact f's BIS text, were fixed: the BIS figures moved to
  the new fact r.app-user-losses (BIS Working Paper 1049, Nov 2022, revised Jul 2023), and the October 2022
  valuation was dropped because it belongs to the paper's one-purchase case. The read is in #61's comment; on
  those files `reviewedBy: owner` records the delegation, not a person's read. What it found:
  `docs/content-review-log.md`. The rule stands for every other content PR.
- 2026-11-09: the owner delegated the read and the merge of #68, the falls as Proof of Calm's own computation,
  and #69, the Risk honestly module, to a session, by message (the session's question that day), with the
  session's other checkpoint PRs. The question said that Risk honestly "names Mt. Gox and FTX as dated
  exchange failures and adds one sentence to LEGAL §6 Q4 on naming a provider in a sourced event"; the owner
  chose "Yes, delegate" at 16:06 on 2026-11-09, so the delegation covers that sentence. An agent re-read every figure against its source before each merge: once on
  #68, twice on #69, and counsel read #69's final delta a third time. The reads changed fact a's 2011 fall to
  −94.0 %, dropped fact b's "still" and put its figures at the close, kept LINK 2021 on Bitstamp, trimmed facts
  e and m to their one source, sourced the six signs of a scam to the ESAs' factsheet, and reworded the support
  sentence and the FCA order. The session kept "first, then" in the FCA order against counsel's wording, as a
  judgment recorded on #69. The reads are in each PR's comments; on those files `reviewedBy: owner` records the
  delegation, not a person's read. What it found: `docs/content-review-log.md`. The rule stands for every other
  content PR.
- 2026-11-11: no scheduled job runs the agent (ADR-0037 Deviations). The owner starts it by typing
  `/review-content` in their own Claude Code session. The agent has no git and no gh;
  `node tools/content-review/propose.ts finish` refuses anything but agent-drafted content data, then
  commits, pushes and opens the PR, and never merges. A run costs the owner's subscription, not a few
  euros. The decision stands: the agent drafts, and only the owner publishes (`docs/CONTENT-OPS.md` §3).
- 2026-11-12: the owner delegated, for the unattended M2 run (#23, answer 2), the read of Taxes where you
  live's five sources and the merge of `test/learn-baselines`. An agent opened every source and read the
  module's product sentences against the code (#24's comment 6839452863), so on the module and its five
  facts `reviewedBy: owner` records the 2026-11-12 delegation, not a person's read. What it found:
  `docs/content-review-log.md`. The rule stands for every other content PR.
