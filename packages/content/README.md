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
| `templates/*.json` | the four starting points | `docs/DOMAIN.md` §5, ADR-0009 |
| `cycles/drawdowns.json` | the completed cycles' maximum drawdowns per coin, each recomputed from its source | `docs/EDUCATION.md` §2, §6 and §9 |
| `coins.json` | the coin catalogue: the picker's coins and the price route's allow-list | ADR-0036, `docs/DESIGN.md` §5 rule 7 |
| `style/banned.json` | the banned-words lint | `docs/CONTENT-STYLE.md` §2, `docs/LEGAL.md` §6 |
| `sources.allow.json` | the domains a primary source may come from | `docs/CONTENT-OPS.md` §5 |
| `learn/*.mdx` | the Learn modules: flat front matter and a closed body | `docs/EDUCATION.md`, `docs/CONTENT-STYLE.md` §5, ADR-0048 |

`pnpm validate:content` (`scripts/validate.ts` over `src/validate.ts`) checks every file against its
schema and the rules of `docs/JURISDICTIONS.md` §2: owner review, review dates, sources on the
allow-list, the 60-word card, and the banned words in everything the app shows (the card, the
taxable-event notes, the rates, the holding-rule override notes, the pending changes; source titles
are quoted as published), each literal percentage with the number locale's joiner (`percent-joiner`)
and each locale tag well formed (`locale-tag`), as `docs/JURISDICTIONS.md` §2 says. Templates must split exactly 100 over their own coins, each coin as the
catalogue lists it, and keep each paragraph of the explanation (paragraphs separated by a blank line)
to five sentences (`docs/CONTENT-STYLE.md` §1 rule 4). Each template carries at least one drawdown,
its sources and any `lowSource` on the facts allow-list and `accessed` no later than `lastReviewed`;
the validator refuses a low before its high (`drawdown-low-before-high`), a coin the template does
not buy (`drawdown-unknown-coin`) and a fall of 0 or of more than 100 percent
(`drawdown-fall-out-of-range`). The cycles file takes the same drawdown checks against the catalogue's
tickers and adds 4 of its own: whole percents (`drawdown-fall-not-whole`), rows in catalogue order
then by high (`cycles-out-of-order`), each coin's high once (`cycles-duplicate`), and the one name
`cycles/drawdowns.json` (`file-name`). The owner's sign-off is `reviewedBy: owner` (`agent-draft` until
the owner sets it), and the reviewer still recomputes every fall from its source. The catalogue lists
unique tickers and CoinGecko ids in ticker order, an order that ranks no coin.

## Loaders (the public index)

| Export | Gives | For |
|---|---|---|
| `loadProfile(code)`, `loadProfiles()` | `CountryProfile` (the content type: card, sources, status) | the card, the onboarding, Settings |
| `loadRules(code)` | the core's `CountryRules` from the generated `rules/<code>.json`, one chunk each, or `null` for a code without one | the shell's boot (`packages/app/src/lib/services/browser.ts`), the generic country's rules standing in |
| `loadedProfile(code)` | the `CountryProfile` a load has already read, synchronously, else `null`; it answers after any load, not at boot (ADR-0049) | `useProfile` (`packages/app/src/lib/services/use-profile.ts`), which the holding conditions (`packages/app/src/features/learn/components/holding-conditions.tsx`) and Settings' holding-rule card (`packages/app/src/features/settings/components/use-holding-country.ts`) read; the country card does not call it |
| `ruleSource(profile, rule)` | the URL of the source `ruleSources[rule]` names (`rates`, `holdingRule`, `lotRule`, `losses`, `reporting`), or `null` | the country card's Sources link after each rule |
| `holdingRuleSource(profile)` | `ruleSource(profile, 'holdingRule')` | the date line's Sources link |
| `countryRules(profile)` | the core's `CountryRules` | `holdingContext`, `ruleChangeNotice`, `changeCountry` |
| `suggestionProfiles(profiles)` | what `suggestCountry` reads, without `XX` | the onboarding's suggestion |
| `countryChoices(profiles, suggestion)` | the picker's order | the onboarding, Settings |
| `TEMPLATES`, `templateById(id)` | `OfferedTemplate`: the core's `Template` with its `drawdowns` | `planFromTemplate`, `followsTemplate`, the card's dated band |
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
  parses the cycles file with `zod/mini`, through the `./cycles` subpath (2026-11-09).
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
`src/loaders/countries.ts` (a test fails while a file has no loader), a line in `RULES` in
`src/loaders/rules.ts` and its rules file from `pnpm --filter @proofofcalm/content rules` (a test
fails while the file is missing or stale), its domains in `sources.allow.json`. The app's
`packages/app/src/features/learn/components/country-section.test.tsx` keeps its three-profile harness:
`countryChoices`' test proves every profile's position in the picker.
