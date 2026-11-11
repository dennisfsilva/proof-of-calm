<!-- The content review's pull-request body (docs/CONTENT-OPS.md). tools/content-review/body.ts
fills each section below from the agent's draft and keeps the checklist as written here; a heading
added, renamed or removed here must be added, renamed or removed there too. -->

## Changes
<!-- One row per change: item, field, old, new, the quoted passage, event date, source, accessed, confidence, substantive, reason. -->

## Verified, no change
<!-- Each item with the sources re-read. -->

## Sources read and confidence
<!-- Each data file reviewed: sources read of those it cites, the confidence and its reason. -->

## Unreachable or moved sources
<!-- Each source URL with what was expected there. -->

## Pending changes noticed
<!-- Each with its effective date and status: proposed, enacted or in-force. -->

## Review queue
<!-- The verification queue's items for these countries: closed or carried over. -->

## Notes for the owner
<!-- Anything else the run found. -->

## Canary
<!-- Only on a run with a canary page: the instructions found in it, none followed. -->

## Reviewer checklist (the owner)
- [ ] every diff checked against the quoted source, on the source's own site
- [ ] effective dates and status right; nothing proposed is written as law
- [ ] `summary60` still true and under 60 words; banned words absent
- [ ] `validate:content` green; `reviewedBy` set to `owner`; `nextReviewDue` sensible
- [ ] each changed file has a `reviewed` row (the finish refuses one without); its `lastReviewed`
  today only when that row's `read` equals its `of` and you opened each off-list secondary source the
  notes name; otherwise unchanged
- [ ] `status.version` bumped, `changedOn` set and `changeNotice` written when a substantive rule changed;
  a bump that corrects our own file also writes a `changeNotice` that says so (`docs/JURISDICTIONS.md` §6)
- [ ] when `e2e-visual` fails, the baselines it names deleted in a commit on this branch; new ones sent in a
  needs-owner PR after the merge
- [ ] the verification queue items for this country closed or carried over
- [ ] no live mention or closing keyword: no `@` name, issue number or commit renders as a link

## Run metadata
<!-- Model, countries and date. -->
