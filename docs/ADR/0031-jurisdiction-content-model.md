# ADR-0031: Jurisdiction content model

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/jurisdictions-*.md`)

## Context

ADR-0014 decided that country rules live as versioned, dated, sourced data. The research of ten countries showed that the model has to carry more than "holding days": only Portugal and Germany give a holding exemption; the US changes the rate after one year; Ireland changed its rate on 7 October 2026 in the middle of a tax year; Italy taxes a swap into a euro stablecoin but not a like-for-like swap; France computes gains on the whole portfolio, not per lot; the Netherlands taxes a deemed return on the 1 January value and no sale at all; Portugal applies FIFO per platform and conditions its exemption on the counterparty's jurisdiction; Germany's draft reform would apply a different rule to lots acquired from 2027; Belgium's new tax is new enough to carry medium confidence.

## Options considered

1. A flat table of `holdingDays` and `rate` per country. Would state falsehoods for seven of ten countries.
2. Free text per country. Honest, unreviewable, untestable.
3. **A typed, validated profile** with the fields the research showed to be necessary, plus the prose card and the sources, one JSON file per country.

## Decision

Option 3, the schema in `docs/JURISDICTIONS.md` §2. The fields that exist because of a specific finding:

| Field | Because |
|---|---|
| `holdingRule.effect: 'exempt' | 'lower-rate'` | the US rule lowers the rate; the label "tax-free from" would be false there |
| `holdingRuleOverrides[] { acquiredFrom, rule }` | Germany's draft would apply by acquisition date; only enacted rules are entered |
| `holdingRuleConditions[]` | Portugal's EU/EEA counterparty condition and the unsettled swap question cannot be verified by the app |
| `computationModel: per-lot | portfolio-wide | wealth-snapshot` | France and the Netherlands |
| `lotRule` + `lotScope: global | per-venue` + `lotRuleNote` | Portugal per platform; Germany and the US per wallet; the UK's same-day and 30-day rules; Ireland's four-week rules |
| `rates[].validFrom / validTo` by disposal date | Ireland 2026-10-07 |
| `taxableEvents[]` including `crypto-to-stablecoin` | Italy |
| `pendingChanges[] { status: proposed | enacted | in-force, effectiveFrom }` | every country has something moving; the card must not present a proposal as law |
| `status { confidence, version, changedOn, changeNotice, lastReviewed, nextReviewDue, reviewedBy }` | the rule-change notice, the "under review" state, and the agent-draft gate |
| `sources[] { kind: law | authority | court | secondary, published, accessed }` | the audit trail |
| `summary60` | the card text, limited to 60 words by a test |

Rules: types are inferred from the zod schema; a file with `reviewedBy: agent-draft` cannot be on `main`; every claim in a file traces to `docs/JURISDICTIONS.md` §7 or the research files or a later review PR; the generic `XX` profile exists for every other country and says plainly that no reviewed rule set exists.

## Consequences

- The core consumes `HoldingRule`, overrides, `lotRule`, `lotScope` and `computationModel` through the shell; the export logic branches on the computation model (`docs/DOMAIN.md` §3.13).
- Entries carry an optional `venue` label so per-venue lot scopes can be honoured.
- The locale-and-timezone suggestion algorithm (`docs/JURISDICTIONS.md` §3) is pure, tested with the ambiguity table, and never uses IP.
- Writing the ten JSON files from §7 is an M1 (PT, DE, XX) and M2 (the rest) task for the build session; the review pipeline (ADR-0015, `docs/CONTENT-OPS.md`) owns them afterwards.
- The first review run closes the verification queue listed in `docs/JURISDICTIONS.md` §7.11–7.12.

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while writing the M1 files on
2026-10-17.

- **The generic profile's locale and timezone.** The schema wants at least one of each; `XX` "formats
  from the browser locale" and must never be suggested. It lists the locale `und` (BCP 47 for an
  undetermined language) as its locale and both formatting locales: `Intl` resolves `und` to the
  runtime's default, checked in Node 24, Chromium and WebKit, so the app needs no special case, and no
  UI language is suggested. Its one timezone is `UTC`, which the suggestion treats as no timezone, so no
  device timezone points to it; the loaders also leave `XX` out of what `suggestCountry` reads, so no
  language tag can either. The picker lists `XX` first when nothing is suggested and last otherwise.
- **Loading.** The app reads the profiles through `packages/content`'s loaders, which trust the files
  because CI validates them (`pnpm validate:content` and the package's tests, which also parse every
  mapped profile with the core's `CountryRulesSchema`): no zod reaches the browser for content, and the
  core's brands are asserted in one module. Each profile is its own chunk, loaded on demand.
- **Review dates.** `nextReviewDue` is `lastReviewed` plus twelve months (PT: 2027-10-16, XX:
  2027-10-17) unless a pending change has a known start date; the proposed German reform's 2027-01-01
  counts as one, so DE is due on 2027-01-01. `lastReviewed` is the day the newest fact in the file was
  researched: 2026-10-16 for PT and DE, accepted in `docs/JURISDICTIONS.md` §7; 2026-10-17 for XX, whose
  DAC8 reporting line and its source, read that day, go beyond the text of §2. `reviewedBy` is `owner`
  because this record assigns the M1 files to the build session from that accepted text, and the owner
  confirms them, the XX additions included, in the milestone's closing review.
- **What the banned-words lint reads.** Everything the card shows, including the taxable-event notes,
  the rates, the holding-rule override notes and the pending changes; source titles are quoted as their
  publishers wrote them.
- **`accessed` records a read.** A source is listed only once someone has read it, and `accessed` is
  that day; a document that could not be opened is left out, its content cited through the secondary
  sources that carry it, and the verification queue in `docs/JURISDICTIONS.md` §7.12 adds it once read
  (for DE the BMF-Schreiben of 2025-03-06 and the BMF draft of 2026-09-30; for PT Lei n.º 73-A/2025).
- **2026-10-30, source keys.** Profile sources carry a stable `key`, and `ruleSources` names each
  rule's source (#289); `docs/JURISDICTIONS.md` §2 owns the schema.
- **2026-10-30, overrides not applied.** Holding-rule overrides are not applied yet, and `validate.ts`
  fails a profile that holds one (`overrides-unapplied`, `docs/JURISDICTIONS.md` §2, decided
  2026-10-30).

## Disagreement

None.
