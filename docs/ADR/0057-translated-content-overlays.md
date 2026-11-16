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
  translated. Every text the app shows and the English checks read is on the list. A quoted law
  title or statutory term stays in its own language: a pending change's title and summary quote a
  statute word for word ("Testo unico delle imposte sui redditi (D.Lgs. 117/2026)" in Italy's file,
  "Loi n° 2026-534" in France's, "Tauschkryptowerte" in Germany's), so a translation keeps the
  quotation and translates the words around it.
- **How it merges.** `applyOverlay(english, overlay, kind)` walks English: a string is replaced only
  at a translatable path by a string; an array merges by index only when its length is English's,
  and `null` keeps an English item; keys keep English's order. Anything else stays English, so a
  loader never shows a malformed translation even before validation runs.
- **What validation holds.** `validateContent` checks each overlay file against its English file
  (`packages/content/src/i18n/overlay-validate.ts`): `overlay-orphan` (no English file, a language
  that is not a content language, a fact key English lacks), `overlay-unknown-path`,
  `overlay-not-translatable`, `overlay-array-length`, and `overlay-number-mismatch`: a translated
  string carries the same multiset of values as English. Each text is read with its own separators:
  English with English ones, which the English files write whatever the country (`1,000` and `5.5`
  in Germany's file); a profile's translation with the number locale `localesFor` picks for that
  language (the profile's locale in that language, else `numberFormatLocale`); a template's or a
  fact's with the language's own. The locale's decimal separator counts once, any other separator
  before a group of three digits and before the decimal separator groups, and any other place splits
  the run: in pt-PT `31,4` is
  31.4, `1 000` and `1.000` are 1000, `3,14` is not 31.4 and `15` is not 1.5. The check holds values,
  not which noun each belongs to, nor a sign: two numbers swapped between their nouns pass, and
  counsel's read of each translation holds the rest. The overlaid value then passes the schema, and
  every check its English field takes runs on the text that changed: the ban list, the no-break
  hyphen, the 60 words, the paragraphs of a template's explanation, and the percent joiner at the
  number locale `localesFor` picks. A translated fact's `value` and `unit` take the ban list and the
  no-break hyphen, which the English facts do not: counsel alone reads those, while a translation is
  new prose that a Learn page quotes.
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
  once, and a translation that changes, drops or adds a number's value fails the gate.
- A translation writes every number as a numeral, as the English does (`docs/CONTENT-STYLE.md` §4)
  and as the pt-PT voice asks. The check reads numerals only: a number written in words passes it
  wherever it stands, and fails only when it replaces a numeral English has. Counsel's read of each
  translation stays (`roles.copy`).
- The no-break hyphen check (`packages/content/src/hyphen-validate.ts`) knows English unit words
  only: a German "365-Tage-Frist" passes it, while Portuguese writes "365 dias" with no hyphen. The
  German unit stems join that check before German overlays land.
- The percent joiner of a German profile read in Portuguese is the German one, because the app
  formats that profile's numbers with its German locale; a Portuguese profile in Portuguese writes
  no joiner.
- Until the loaders take a language, an overlay is validated and shown nowhere; the app reads
  English content in every UI language.
- The Learn modules (MDX) are out of this decision.

## Corrections

- **2026-11-15.** The status line's "ADR-0024 (the UI languages)" means ADR-0023, the UI languages'
  record; ADR-0024 is the testing stack. "Why it lands second" says the service worker precaches every
  chunk: since ADR-0045's Deviations of 2026-11-15 it leaves another language's message chunks out
  (`assets/messages/<locale>/`), and the loaders' chunks join that rule when they land. Found by the
  integration read of the pt-PT checkpoint (#19).
- **2026-11-15.** "What validation holds" gains `overlay-date-mismatch`. A template's texts write
  their dates as `{date:<field>}` placeholders (`docs/CONTENT-STYLE.md` §4), which hold no digits, so
  the number check cannot see one dropped or added: a translated string carries the same multiset of
  placeholders as English, in any order. Two placeholders swapped between their nouns pass, as two
  numbers do, and counsel's read holds the rest. Found by the review of the template dates (#19's D7).
- **2026-11-16.** "The loaders in a language" has landed for the profiles and the rules:
  `loadProfile`, `loadProfiles` and `loadRules` take the language, `PROFILE_OVERLAYS` holds one
  import per overlay file (none yet), `pnpm --filter @proofofcalm/content rules` writes
  `packages/content/rules/pt-PT/`, and the stale test covers each language folder. The
  `(planned: M2)` markers in the decision text stay, because an accepted ADR changes only below its
  Corrections heading. `loadTemplates` and `loadFacts` still read English only (#270). The app's
  services pass the boot language, and a language change reboots (ADR-0045 §8). A translated chunk
  sits under `assets/messages/<locale>/`, outside the worker's precache (ADR-0045's Deviations of
  2026-11-16). Offline, a chunk never fetched fails to load, and the loader then answers the English
  profile or rules file, as it does for a missing translation. It caches no failed load, so the next
  load tries the chunk again. Every number already came from English, so a fallback changes
  only the words; the holding rule, its dates and the formatting locale are the same.
- **2026-11-16.** The entry above held in the unit tests but not in the build: a pt-PT boot with its
  `pt` rules chunk unreachable showed Plan without its holding line and Settings with its "not
  loaded on this device" line. In a build, Vite's preload wrapper dispatches `vite:preloadError` and
  rethrows only when no listener prevents the event's default. The web host's chunk reload
  (`apps/web/src/chunk-reload.ts`) prevents it. The failed import then resolves to undefined instead
  of rejecting, and reading `.default` threw outside the `catch`. `loadRules` and `loadProfile` now
  read the file inside the same `try`, so a rejected import or one that resolves to undefined
  answers English and is not cached. Found by the evaluator's offline run of the pt-PT checkpoint
  (#269).
- **2026-11-16.** "A review of an English number or source reaches every language at once" holds for
  the source and for each number's value, not for its characters: a translation that repeats a figure
  the content review changes fails `overlay-number-mismatch` until that figure changes there too, in
  the translation's number format. The review's agent makes that one edit and the owner reads its
  diff (`docs/CONTENT-OPS.md` §3 step 2 and §8 step 4). Found by the docs sync of the content review's
  translation step (#289).
- **2026-11-16.** "What validation holds" reads English with English separators except a profile's
  percentages. Since D8 (#269), a profile's literal percentage takes the decimal separator of the
  number locale its page uses, `numberLocaleFor(language, profile)`, in English too (`12,2%` for
  Portugal, `docs/CONTENT-STYLE.md` §4). The number check reads an English profile's percentages
  with `numberLocaleFor('en', profile)` and its other figures with English ones (`1,000`), and a
  translation's `decimal-separator` problem joins the checks its English field takes.
