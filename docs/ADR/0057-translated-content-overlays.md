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
- **2026-11-16.** The entry above describes the chunk reload before ADR-0045's Deviations of
  2026-11-16: `apps/web/src/chunk-reload.ts` no longer prevents the default of `vite:preloadError`,
  so in the web host a failed content chunk now rejects with its own error instead of resolving to
  undefined. `loadRules`, `loadProfile` and `loadTemplateTexts` keep reading the file inside their
  `try`, so either outcome answers English and is not cached; the guard for an import that resolves
  without the file stays as defence. Recorded with ADR-0045's entry (#308).
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
- **2026-11-16.** "The loaders in a language" has landed for the templates, with another name than
  `loadTemplates`. `TEMPLATES` and `templateById` stay English and synchronous, so English shows on the
  first render and every plan is checked against English templates; `loadTemplateTexts(language)`
  answers a template's `name`, `oneLine`, `riskLabel` and `explanation` by id. `TEMPLATE_OVERLAYS`
  holds one import per file of `packages/content/i18n/pt-PT/templates/`, and their chunks sit under
  `assets/messages/pt-PT/`, outside the precache. The loader reads `.default` inside its `try`: a
  failed import, or one that resolves to undefined, answers English and is not cached. Onboarding
  starts the load at mount, as it starts `loadProfiles`. In English it renders the list at once; in
  another language it renders every step that shows a template's text, the template step and the
  summary (a draft reopened on it too), only once the texts settle, so no English name shows first,
  and English if the load fails. The cards sort by the name shown in the UI locale. The plan
  stores the template's id, never its text. "What validation holds" gains `overlay-percent-mismatch`
  for templates. A template's explanation writes `N %`, which the app finds and writes with
  `format.percent` (`docs/CONTENT-STYLE.md` §4). A translation therefore writes the same
  percentages, in the same order and with the same ordinary space before the sign, each value read
  with its own text's separators. A wrong value stays `overlay-number-mismatch` alone. Profiles keep
  their own percent rules (the joiner and the separator, D8). The dependency rule's product folders
  gain `packages/content/i18n/`, so `product-reaches-only-product` lets product code import an overlay
  as it imports the English file beside it (`packages/config/dependency-cruiser.cjs`).
- **2026-11-16.** English content text on a pt-PT screen is marked (WCAG 2.2 SC 3.1.2, D4). The
  loaders mark each profile, rules file and template text they return with its language in a
  WeakMap (`contentLanguageOf`, `packages/content/src/loaders/language.ts`): English and every
  fallback as `en`, a merged overlay as its language; a rules file is `pt-PT` only for a code in
  `PROFILE_OVERLAYS`, since the others are generated from English. A copy (a spread, a parse) is
  unmarked and keeps the page's language. `textLang` (`packages/app/src/lib/i18n/text-lang.ts`) gives
  an element `lang="en"` where the text's language is not the screen's: the country card, the
  holding conditions, the early-opening notice's conditions, the rule editor's general-profile line,
  and a Learn module's title, idea (the Learn index's rows too), caveat and body, which no loader
  returns and are English. Each `lang` comes from the object whose text the element shows: the
  general-profile line from the profile, not the rules, since offline the two loaders can answer two
  languages. The app's own lines inside a module's body, its chart and its past-performance line,
  carry the UI's language (`uiLang`) on a screen that is not English. A country card whose text is
  English on a screen that is not says so under its title (`learn.card.inEnglish`, D5), outside the
  marked text and only while the text is on the card; a Portuguese card on an English screen does
  not; the static site pages are English and never show it. Known limit: no overlay holds a `null` item today; a future one keeps its English under
  the object's language, so that item would be marked as the overlay's language.
- **2026-11-16.** Two sites are not marked yet. Settings' change-country confirmation lists the new
  country's holding conditions without `lang` when its eligible-day row replaces the early-opening
  notice's list. Onboarding's template cards read the template texts through a spread, which drops
  the mark, and fall back to unmarked English texts, seen only offline since every template has a
  pt-PT overlay. Both wait for #271, the last session before pt-PT can show.
- **2026-11-16.** A profile's grouped figures on a page whose number locale writes a comma decimal
  (Germany, Spain, France, Italy, the Netherlands, Portugal). A figure of 10 000 or more groups its
  digits in threes with a no-break space (U+00A0): `EUR 20 350`; a smaller one takes none:
  `EUR 1000`. Both hold in English and in every translation. A decimal in a profile's text
  takes the comma, and a point in it is only a citation's (`art. 33.1`). No locale reads the space
  as a decimal, so the comma keeps one role beside D8's percentages. For these pages this reverses
  "What validation holds" (`1,000` in Germany's file) and the D8 entry's English reading of other
  figures. The number check reads both texts of a profile with `numberLocaleFor(language, profile)`
  and compares a figure holding a point as written. A template's and a fact's texts keep the
  reading "What validation holds" gives them: English with English separators, the translation
  with its language's own. `number-group` refuses other grouping beside a currency code, before or
  after the figure, and expects a point's cents after a comma (`EUR 12,50`). Its suggestion keeps
  the figure's value (amended 2026-11-17 by #318's design check, D10 of #316): only a figure with
  one value, read as English writes numbers and as the page does, gets the page's form; a figure
  the two read as different values (`EUR 20,350`, `EUR 1.125`), one neither reads and a range not
  already in the page's form get §4's rule and no suggestion. CONTENT-STYLE §4 owns the reading.
  The number check names no computed fix for a translated figure (2026-11-17, D16 of #318): its
  detail names the mismatch and English's figures as written, and the translator copies English's
  figure. A fix picked from English's figures by value named one the translation already held
  (`write 1` beside `1 pessoa`) and withheld the right one, so each review round found one more
  case. Brand's point to name the fix where English's own figure is refused is declined under D16
  (D6 of #322): `number-group` reports that figure on the English file in its own words. A summary counts a grouped
  figure as one word. Britain, Ireland, and the US keep theirs
  (`£37,700`), in English and in every translation. Decided by the unanchored design check of the
  grouped figures (`docs/research/grouped-figures.md`).
- **2026-11-16.** The facts overlay and its loader are cut: nothing in `packages/app` or `apps/web` loads
  `facts/education.json`, so no `loadFacts` or `FACT_OVERLAYS` is built. A translated module ties its figures to
  English instead, through `overlay-number-mismatch` in `translatedModuleProblems`
  (`packages/content/src/i18n/module-overlay-validate.ts`), with the same elements in the same order. The app shows a
  module through `useModuleBody`, which loads the language's chunk and falls back to English, marked `lang="en"`, when
  there is none, when it fails or when it resolves to nothing. A failure is not kept, so the next mount tries again.
  The mount that shows English also loads the chunk once more and shows the translation if it loads. WebKit keeps a
  failed import for the page's life, so on WebKit English stays until a reload. The owner confirms the cut at the end of
  M2. This narrows the textLang entry above (2026-11-17): a module's route and sheet show the translation's title,
  idea, caveat and body, while the Learn index's rows stay English, marked `lang="en"`, since a translation's meta
  travels in its chunk, outside the entry; showing a translated title and idea in the index is the next step (D13 of
  #322).
- **2026-11-17.** The Consequences' "knows English unit words only" no longer holds for Portuguese:
  the number-unit hyphen check (`packages/content/src/hyphen-validate.ts`) also reads the Portuguese
  unit words (dia, semana, mês, ano, hora, minuto and their plurals), so `90-dias` and `1-mês` are
  refused. Portuguese writes `90 dias` with no hyphen, the numeral joined to its unit by a no-break
  space (U+00A0) wherever English joins its figure (`docs/CONTENT-STYLE.md` §9). The German unit
  stems still join the check before German overlays land. Found by the review of the first pt-PT
  Learn modules (D12 of #322).
- **2026-11-17.** The Learn index's rows no longer stay English: each translated module's title, idea
  and reading time show in the person's language, and an untranslated module's stay English, marked
  `lang="en"` (#352). This ends the narrowing above on the index; how the metadata travels is
  ADR-0048's Deviations entry of 2026-11-17 on `virtual:learn-meta/<language>`.
- **2026-11-18.** `overlay-percent-mismatch` reads every percentage a template's text writes: a
  figure, a gap of nothing, white space, hyphens, or hidden characters, and any of the signs `%`,
  `٪`, `﹪`, `％`, `‰`, or `‱`. Its detail shows a gap of one ordinary space as that space, and
  names every character of any other gap by its code point, the ordinary space as U+0020, then
  the sign (`40U+2060 U+0020 ‰, English 40 %`), and no form to write. Before, it read only `%`
  after at most one space, so `40٪` or `40-%` was missing from the translation's list rather
  than named. Its pattern stays in `packages/content/src/i18n/overlay-validate.ts`,
  apart from `packages/content/src/percent-token.ts`: that file holds the one token the app
  formats, while this check compares two texts and reads more than the app formats. Profiles keep
  their own percent rules, as above. A Learn module's `figure-chart` join detail prints its gap the
  same way, except that it shows one no-break space as written too, since that space is one of its
  two joiners (`"97U+202F %" in "…"`); both read `packages/content/src/percent-gap.ts`.
- **2026-11-18.** One printing for every detail that quotes a text or a gap: `figure-join`,
  `range-join`, `citation-join`, `figure-chart` and `overlay-percent-mismatch`. A quoted text names
  each space but U+0020, each format or control character, U+2010 and U+2011 by its code point
  followed by one space that is not in the text (for example `fellU+2009 50 %`; `printedText` in
  `packages/content/src/percent-gap.ts`), and a gap names every character of it the same way
  (`printedGap`), so two ordinary spaces print `U+0020 U+0020` and a no-break hyphen `U+2011`
  rather than a character a reader cannot tell from `-`. A Learn module's quoted text first folds
  tabs, line breaks and runs of spaces into one space, as the page does. It shows its no-break
  percent joiner (U+00A0; its other, U+0020, is never named) as written only directly before a
  percent sign, the one place its check accepts one, and names it anywhere else
  (`EtherU+00A0 fell`, `printedPercentText`).
  Before, the joins check printed JSON escapes (`\u00a0`, `\u2060`) and the module check
  folded every white space into one space, which hid the very gap it refused. The overlay's
  percent gap now reads every hyphen and dash (`\p{Pd}`), not the hyphen-minus alone, so `40–%`
  is named rather than missing from the list; its sign class is unchanged. A source's title, in any
  language, never holds U+2011 (`range-join`; `docs/CONTENT-STYLE.md` §4): it keeps the published
  U+002D, with U+2060 after it inside a law number (C3, C7, C9, C10 and C11 of #370).
