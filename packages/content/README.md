# @proofofcalm/content

Content as data: jurisdiction profiles and cards, templates (starting points), the coin catalogue,
education modules (MDX, M2), past-cycle data, the banned-words list, and the schemas that validate all
of it. Specifications: `docs/JURISDICTIONS.md`, `docs/EDUCATION.md`, `docs/CONTENT-STYLE.md`,
`docs/CONTENT-OPS.md`.

## Files

| Path | What | Written from |
|---|---|---|
| `jurisdictions/pt.json`, `de.json` | country profiles (M1) | `docs/JURISDICTIONS.md` §7.6, §7.7 and the research file |
| `jurisdictions/es.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.9 and the research file |
| `jurisdictions/fr.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.10 and the research file |
| `jurisdictions/gb.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.4 and the research file |
| `jurisdictions/ie.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.3 and the research file |
| `jurisdictions/it.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.1 and the research file |
| `jurisdictions/nl.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.8 and the research file |
| `jurisdictions/us.json` | country profile (M2) | `docs/JURISDICTIONS.md` §7.5 and the research file |
| `jurisdictions/xx.json` | the generic profile for every other country | `docs/JURISDICTIONS.md` §2 |
| `rules/<code>.json` | generated: the core's `CountryRules` of each profile, what the shell boots on (ADR-0049); never edited | `pnpm --filter @proofofcalm/content rules` (`scripts/rules.ts`); a test fails while one is stale |
| `rules/<language>/<code>.json` | generated: the same rules over each profile's translation, one folder per content language with a folder under `i18n/` (`pt-PT` today), with no `locales.json` of its own (ADR-0057); never edited | `pnpm --filter @proofofcalm/content rules` (`scripts/rules.ts`); a test fails while one is stale |
| `rules/locales.json` | generated: every profile's locales by code, shipped statically in the app's entry chunk as the fallback when a rules file fails to load (ADR-0049, Deviations of 2026-11-15); never edited | `pnpm --filter @proofofcalm/content rules` (`scripts/rules.ts`); a test fails while it is stale |
| `templates/*.json` | the four starting points | `docs/DOMAIN.md` §5, ADR-0009 |
| `cycles/drawdowns.json` | the completed cycles' maximum drawdowns per coin, each recomputed from its source | `docs/EDUCATION.md` §2, §6 and §9 |
| `coins.json` | the coin catalogue: the picker's coins and the price route's allow-list | ADR-0036, `docs/DESIGN.md` §5 rule 7 |
| `style/banned.json` | the banned-words lint | `docs/CONTENT-STYLE.md` §2, `docs/LEGAL.md` §6 |
| `sources.allow.json` | the domains a primary source may come from | `docs/CONTENT-OPS.md` §5 |
| `learn/*.mdx` | the Learn modules: flat front matter and a closed body | `docs/EDUCATION.md`, `docs/CONTENT-STYLE.md` §5, ADR-0048 |
| `i18n/pt-PT/` | the European Portuguese translations, sparse: prose only, at the English paths, under the English file name in `jurisdictions/`, `templates/`, `facts/` or `learn/` (what is translated so far: `i18n/pt-PT/README.md`; validated) | ADR-0057, ADR-0048 |

A profile's translation loads once `PROFILE_OVERLAYS` lists it, a template's once `TEMPLATE_OVERLAYS` does, a Learn
module's once `LEARN_TRANSLATIONS` lists it, and the facts' never, since their loader is cut.

`pnpm validate:content` (`scripts/validate.ts` over `src/validate.ts`) checks every file against its
schema and the rules of `docs/JURISDICTIONS.md` §2: owner review, review dates, sources on the
allow-list, the 60-word card, and the banned words in everything the app shows (the card, the
taxable-event notes, the rates, the holding-rule override notes, the pending changes; source titles
are quoted as published), each literal percentage with the number locale's joiner (`percent-joiner`)
and its decimal separator (`decimal-separator`, D8, #292; `docs/CONTENT-STYLE.md` §4), each money figure on a comma-decimal page grouped as that page writes it (`number-group`, `docs/CONTENT-STYLE.md` §4), each currency code and form name joined to its figure by U+00A0 on every page (`figure-join`, `src/join-validate.ts`), no `;` in a profile text the tax-year header copies, English or overlay (`header-semicolon`, #298), and each locale tag well formed (`locale-tag`), as `docs/JURISDICTIONS.md` §2 says. It refuses an ordinary
hyphen between a numeral and its unit in text a screen shows (`number-unit-hyphen`; which text:
`docs/CONTENT-STYLE.md` §4). Templates must split exactly 100 over their own coins, each coin as the
catalogue lists it, and keep each paragraph of the explanation (paragraphs as `paragraphsOf` reads them,
the split the template step renders) to five sentences (`docs/CONTENT-STYLE.md` §1 rule 4). A template writes each date as a
`{date:<field>}` placeholder in `oneLine` or `explanation` (`docs/CONTENT-STYLE.md` §4): the
validator refuses one that names no date of the template or is cut short (`template-date-unresolved`),
one in the name or the risk label (`template-date-field`) and a written month name
(`template-date-month`), in the English file and in each translation. Each template carries at least one drawdown,
its sources and any `lowSource` on the facts allow-list and `accessed` no later than `lastReviewed` once signed off (below);
the validator refuses a low before its high (`drawdown-low-before-high`), a coin the template does
not buy (`drawdown-unknown-coin`), drawdown rows that are not one per coin in the order of `coins`
(`drawdown-coins`) and a fall of 0 or of more than 100 percent
(`drawdown-fall-out-of-range`). In the English explanation, `src/template-figures.ts` reads each sentence that holds
a percentage or a drawdown date against the closed shapes of `docs/CONTENT-STYLE.md` §4 (F1, F2 and S1 to S4), whole.
It refuses a dated sentence that matches neither fall shape, a fall that names another row's coin, or a coin given
two shares (`figure-form`), a figure other than its row's fall or its coin's share (`figure-mismatch`), and a
percentage in a sentence of no shape (`figure-unclassed`). Each detail quotes the sentence and names the figure, its
coin, the row's fall or the coin's share, and the rule. A translation's figures are tied to English's by
`overlay-number-mismatch`. The cycles file takes the same drawdown checks against the catalogue's
tickers and adds 4 of its own: whole percents (`drawdown-fall-not-whole`), rows in catalogue order
then by high (`cycles-out-of-order`), each coin's high once (`cycles-duplicate`), and the one name
`cycles/drawdowns.json` (`file-name`). The owner's sign-off is `reviewedBy: owner` (`agent-draft` until
the owner sets it), and the reviewer still recomputes every fall from its source. The review reads an
`agent-draft` file's sources again, so `accessed` may pass `lastReviewed` until the owner signs the
file off. `accessed-after-review` and `src/facts.test.ts` refuse such a date only once `reviewedBy` is
`owner`. The catalogue lists unique tickers and CoinGecko ids in ticker order, an order that ranks no
coin. Each Learn module's body also goes through the build's own compiler and element list
(`scripts/closed-body.ts`, ADR-0048 Deviations): one `module-closed-body` problem, with the line, per
module the build would refuse.
A translation under `i18n/`, every `.json` file at any depth (`scripts/overlay-paths.ts`), is checked
against its English file (`src/i18n/overlay-validate.ts`, ADR-0057): the `overlay-*` problems for its
shape, its numbers and its date placeholders (`overlay-date-mismatch`: each text names the
English text's `{date:<field>}` placeholders, each as often, in any order; a swap of two stays with
the copy review, as a swap of two numbers does), and in a template its `N %` tokens
(`overlay-percent-mismatch`, templates only, #295; ADR-0057, Corrections of 2026-11-16), then the schema and the English field's checks on
each text it changes.

## Loaders (the public index)

| Export | Gives | For |
|---|---|---|
| `loadProfile(code, language)`, `loadProfiles(language)` | `CountryProfile` (the content type: card, sources, status) in `language` (default `'en'`): the English profile with its translation from `PROFILE_OVERLAYS` applied; the English profile for a language without a translation or when the translation's chunk fails to load (why: ADR-0057, Corrections of 2026-11-16) | the card, the onboarding, Settings |
| `loadRules(code, language)` | the core's `CountryRules` from the generated `rules/<code>.json`, or `rules/<language>/<code>.json` for a language in `RULES_LANGUAGES` (default `'en'`), one chunk each; the English file for a language without one or when its chunk fails to load (ADR-0057, Corrections of 2026-11-16); `null` for a code without a profile | the shell's boot (`packages/app/src/lib/services/browser.ts`), the generic country's rules standing in |
| `spokenLocale(language, profile)`, `numberLocaleFor(language, profile)` | the profile's locale in `language`'s language (de-BE for German), if it has one; the locale its numbers take in `language`, that locale else `numberFormatLocale` (ADR-0023) | the app's formats (`packages/app/src/lib/i18n/locale.ts`), the percentage check over a translation (`src/percent-validate.ts`) |
| `CONTENT_LANGUAGES`, `ContentLanguage`, `OverlayLanguage` | the languages content is written in, its type, and the same without English (the languages an overlay holds) | the loaders' `language` argument, the overlay validation, the app's language list |
| `PROFILE_OVERLAYS`, `RULES_LANGUAGES` | one import per translated profile file by overlay language and code (pt-PT's: the profiles `i18n/pt-PT/README.md` lists); the languages with generated rules folders | `loadProfile`'s translation; the tests that hold both to the files under `i18n/` |
| `countryLocales(code)`, `CountryLocales` | a country's `locales`, `numberFormatLocale` and `dateFormatLocale` from the generated `rules/locales.json`, synchronously; the generic country's for a code without a profile | the number and date locale when a country's rules did not load (`useNumberInput` and `useFormatters` in `packages/app/src/lib/services/hooks.ts`, `packages/app/src/lib/i18n/locale.ts`, the entry and move forms) |
| `loadedProfile(code, language)` | the `CountryProfile` in `language` (default `'en'`) a load has already read, synchronously, else `null`; the English one for a code without a translation in that language; it answers after any load, not at boot (ADR-0049) | `useProfile` (`packages/app/src/lib/services/use-profile.ts`), which the holding conditions (`packages/app/src/features/learn/components/holding-conditions.tsx`) and Settings' holding-rule card (`packages/app/src/features/settings/components/use-holding-country.ts`) read; the country card does not call it |
| `ruleSource(profile, rule)` | the URL of the source `ruleSources[rule]` names (`rates`, `holdingRule`, `lotRule`, `losses`, `reporting`), or `null` | the country card's Sources link after each rule |
| `holdingRuleSource(profile)` | `ruleSource(profile, 'holdingRule')` | the date line's Sources link |
| `countryRules(profile)` | the core's `CountryRules` | `holdingContext`, `ruleChangeNotice`, `changeCountry` |
| `suggestionProfiles(profiles)` | what `suggestCountry` reads, without `XX` | the onboarding's suggestion |
| `countryChoices(profiles, suggestion)` | the picker's order | the onboarding, Settings |
| `TEMPLATES`, `templateById(id)` | `OfferedTemplate`: the core's `Template` with its `drawdowns` and its `dates`, each date field by its `{date:<field>}` path | `planFromTemplate`, `followsTemplate`, the card's dated band, the template step's texts |
| `loadTemplateTexts(language)`, `TemplateTexts` | every template's `name`, `oneLine`, `riskLabel` and `explanation` in `language` (default `'en'`) by template id, in `TEMPLATES`' order: the English texts with the template's translation from `TEMPLATE_OVERLAYS` applied, kept once loaded; the English texts, not kept, for a template without a translation or when its import fails or resolves to undefined (ADR-0057, Corrections of 2026-11-16) | the template step and the onboarding summary in the UI language |
| `TEMPLATE_OVERLAYS` | one lazy import per translated template file by overlay language and template id (the four pt-PT templates today) | `loadTemplateTexts`; the test that holds it to the files under `i18n/<language>/templates/` |
| `contentLanguageOf(value)` | the language of the text in a profile, a rules file or a template's texts as its loader returned it (`'en'` for English and every fallback, an overlay's language where it applied), `undefined` for an object no loader returned, a copy or a parse (`src/loaders/language.ts`; ADR-0057, Corrections of 2026-11-16) | `textLang` (`packages/app/src/lib/i18n/text-lang.ts`), which marks English text on a screen in another language `lang="en"` |
| `fillTemplateDates(text, dates, formatDate)`, `templateDatePaths(template)` | the text with each `{date:<field>}` placeholder written by `formatDate`; every date field of a content template by its path | the template step (`packages/app/src/features/onboarding/components/template-step.tsx`), which writes each date with `format.date`; the loader, which builds `dates` |
| `COINS` | the core's `Coin` | the coin picker, `/api/prices` |

Two exports sit apart, on the subpaths `@proofofcalm/content/modules` and `@proofofcalm/content/cycles`, because they need zod at run time:

| Export | Gives | For |
|---|---|---|
| `parseModule(path, source)` | `LearnModule`: the front matter, the body, `words` and `readingMinutes`, or its problems | the hosts' Learn plugin, `pnpm validate:content`, the content test |
| `loadCycleDrawdowns(source?)` (`./cycles`) | the cycles file's rows in its order, each with its publisher, parsed with the `zod/mini` cycles schema, or one line per issue | the red-day model's earlier falls (`packages/app/src/lib/services/red-day-model.ts`), loaded on demand |

Three decisions shape them:

- **No zod in the browser.** The files are validated in CI and by this package's tests, with the
  content schemas and, after mapping, with the core's own schemas. The loaders import the schemas as
  types only and assert the core's brands (dates, tickers, decimals) in one place,
  `src/loaders/brands.ts`; an app that imports a loader from the index ships the data and nothing
  else (checked in the web build on 2026-10-17: the price route's chunk holds `coins.json` and two
  small modules). So Today's entry carries no zod from content; the red-day model's lazy chunk alone
  parses the cycles file with `zod/mini`, through the `./cycles` subpath (checked in the web build's
  chunks on 2026-11-09: content's schemas sit only in that chunk, and Today's static chunks hold
  content's loaders alone, their zod coming from the app's own boundaries).
- **One chunk per profile.** A profile is 1.3 to 4.0 kB brotli (quality 3) of card text and
  sources, so `loadProfile` imports its file dynamically, and the shell does not load it at all: it
  boots on the country's rules file, a small generated file (the measurement: ADR-0049), so Today pays for the
  plan's country's rules only; the profile loads where a card, a source link or the picker shows it; the
  onboarding loads all of them. If the onboarding's cost matters once eleven profiles exist (M2), a
  small index of names, locales and timezones, guarded by a test against the files, can replace
  `loadProfiles` there.
- **`XX` is never suggested.** It lists the locale `und` (undetermined), which `Intl` resolves to the
  browser's own locale, so it formats as the browser does; and the timezone `UTC`, which the suggestion
  treats as no timezone. `suggestionProfiles` leaves it out as well. With no suggestion, the picker
  shows it first ("pt-BR in São Paulo: XX first", `docs/JURISDICTIONS.md` §3); otherwise last.

Adding a profile in M2: its JSON file, a line in `COUNTRY_CODES` and `FILES` in
`src/loaders/countries.ts` (a test fails while a file has no loader), a line in `RULES` and, for each
overlay language (`pt-PT` today), in `TRANSLATED` in `src/loaders/rules.ts`, and its rules files from `pnpm --filter @proofofcalm/content rules` (a test
fails while the file is missing or stale), its domains in `sources.allow.json`. The app's
`packages/app/src/features/learn/components/country-section.test.tsx` keeps its three-profile harness:
`countryChoices`' test proves every profile's position in the picker.
