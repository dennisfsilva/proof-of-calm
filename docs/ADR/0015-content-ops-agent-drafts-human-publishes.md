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
