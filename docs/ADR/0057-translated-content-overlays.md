# ADR-0057: Translated content overlays: sparse prose over the English files, English the source of every number

Status: Accepted · Date: 2026-11-15 · Deciders: taken without the owner under the owner's rule for the unattended M2 run (decide and record; the owner confirms it at the end of M2), from the design of the pt-PT checkpoint (#19, 2026-11-15) · Reads ADR-0049 (the generated rules files) and ADR-0024 (the UI languages)

## Context

M2 ships the app in European Portuguese and German. The UI messages are translated per locale
(`packages/app/src/messages`); the content is not. A country profile, a template and a fact carry
prose a person reads (the card, the conditions of the holding rule, the template's explanation, a
fact's statement) next to numbers, dates, sources and rules the core computes with. A translation
that changes a rate, drops a day count or edits a source would tell a person something the English
file, the one counsel and the owner reviewed against its source, does not say. Every English file is
held by the schema, the ban list, the no-break hyphen, the percent joiner and the 60-word card
(`pnpm validate:content`); a translation needs the same checks, in its own language's number locale.

## Options considered

1. **A full copy of each file per language.** Simple to load; every number, date and source is
   written twice and drifts the first time a review changes the English file.
2. **Translation keys in the UI message files.** Content becomes messages; the content gate, the
   sources and the review flow of `packages/content` stop applying to the text a person reads.
3. **Sparse overlays of prose over the English files.** A translation file holds only the strings it
   translates, at their English paths; English stays the schema and the source of everything else.

## Decision

Option 3, in two halves: the overlays with their validation, then the loaders in a language with the
generated rules files of each language.

### The overlays and their validation

- **Where.** `packages/content/i18n/<language>/{jurisdictions,templates,facts}/<English file name>`,
  one folder per content language other than English. The content languages are the UI languages:
  `CONTENT_LANGUAGES = ['en', 'pt-PT', 'de']` (`packages/content/src/i18n/overlay.ts`). A
  jurisdiction or template overlay has the English file's shape, sparse; a facts overlay maps each
  fact's `key` to its translated fields.
- **What.** Only the paths `TRANSLATABLE` names (same file): a profile's `name`, `filingNote`,
  `lotRuleNote`, `holdingRuleConditions`, the card's prose (classification, holding-rule and lot-rule
  texts, losses, the 60-word summary, allowances, reporting, caveats, each taxable event's note, each
  rate's label, value and note), each holding rule override's note, each pending change's title and
  summary and `status.changeNotice`; a template's `name`, `oneLine`, `riskLabel` and `explanation`; a
  fact's `value` and `unit`. Codes, dates, numbers, rules, sources and review fields are never
  translated. Every text the app shows and the English checks read is on the list.
- **How it merges.** `applyOverlay(english, overlay, kind)` walks English: a string is replaced only
  at a translatable path by a string; an array merges by index only when its length is English's,
  and `null` keeps an English item; keys keep English's order. Anything else stays English, so a
  loader never shows a malformed translation even before validation runs.
- **What validation holds.** `validateContent` checks each overlay file against its English file
  (`packages/content/src/i18n/overlay-validate.ts`): `overlay-orphan` (no English file, a language
  that is not a content language, a fact key English lacks), `overlay-unknown-path`,
  `overlay-not-translatable`, `overlay-array-length`, and `overlay-number-mismatch`: a translated
  string carries the same multiset of numbers as English, compared after removing the decimal and
  group separators between digits (`31.4` and `31,4`, `1,000` and `1 000` are one number; a space
  joins only a group of three digits). The overlaid value then passes the schema, and every check its
  English field takes runs on the text that changed: the ban list, the no-break hyphen, the 60 words,
  the paragraphs of a template's explanation, and the percent joiner at the number locale
  `localesFor` picks for that language (the profile's locale in that language, else
  `numberFormatLocale`).
- **What the gate reads.** `pnpm validate:content` collects every `.json` file at any depth under
  `packages/content/i18n/` (`packages/content/scripts/overlay-paths.ts`), so a folder that is not a
  content language and a misspelled kind folder are reported, not skipped.

### The loaders in a language

- **How it loads.** `loadProfile`, `loadProfiles`, `loadRules`, `loadTemplates` and `loadFacts` take
  an optional language, `'en'` by default, and English answers the same objects as before (planned: M2).
  Each translation is its own dynamic import in a record the loader owns (`PROFILE_OVERLAYS`,
  `TEMPLATE_OVERLAYS`, `FACT_OVERLAYS`); a test holds each record to the files under `i18n/` (planned: M2).
  A language without a translation of a file shows the English text.
- **The rules files.** `pnpm --filter @proofofcalm/content rules` writes `rules/<language>/<code>.json` (planned: M2)
  over the translated profile for each content language with a folder under `i18n/` (ADR-0049's
  shell boots on it; only the name, the conditions and the change notice differ). The stale test
  covers every language folder (planned: M2).
- **Why it lands second.** The loaders in a language emit one lazy chunk per translated file and per
  language's rules file into the app's build, and the service worker precaches every chunk for every
  visitor. Until the app passes a language, nothing fetches them, so they would only add bytes. They
  land with the change that passes the UI language from `packages/app`, where their bytes and the
  precache are measured; the validation stands alone before them, so a translation can be written
  and checked first.

## Consequences

- A translator edits prose only; a review of an English number or source reaches every language at
  once, and a translation that restates a figure differently fails the gate.
- A translation of English text that has no number may still add none; one that spells a number in
  words passes the number check, so counsel's read of each translation stays (`roles.copy`).
- The percent joiner of a German profile read in Portuguese is the German one, because the app
  formats that profile's numbers with its German locale; a Portuguese profile in Portuguese writes
  no joiner.
- Until the loaders take a language, an overlay is validated and shown nowhere; the app reads
  English content in every UI language.
- The Learn modules (MDX) are out of this decision.
