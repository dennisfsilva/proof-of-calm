# Jurisdictions: the country content model

How Proof of Calm knows a country's holding rule, tax year, formats and the short jurisdiction card, and
how that knowledge stays honest. Everything here is general information, never advice, and the app
says so wherever the holding rule's computed date is shown (once per jurisdiction on a screen, and
in the card's date line; `docs/LEGAL.md` §4, ADR-0047). Decision record: ADR-0014 and ADR-0031. Review pipeline:
`docs/CONTENT-OPS.md`. Country facts with sources: §7 (added from `docs/research/jurisdictions-*.md`).

## 1. The honesty rule

- The app never claims a benefit the country does not give. With no holding exemption, the hold phase
  is still a hold, "tax-free from" disappears, the sellable-now line disappears, and the card says
  every sale is a taxable event.
- The app never computes a tax bill. It flags holding status per lot (a date computed from the
  user's own entries and the rule, with no rate and no amount) and offers a tax-year export. The
  German line's wording is pending the StBerG check (`docs/BENCHMARK.md` §4); until answered it stays
  as §7.7 and `docs/CONTENT-STYLE.md` §3 write it.
- Every card shows its `lastReviewed` date and links to its sources. A card more than twelve months
  past `nextReviewDue` is under review: it keeps its title, shows neither its rule's words nor its
  Sources, and its date line takes the under-review form (`docs/LEGAL.md` §4 owns the words). On
  every surface `docs/LEGAL.md` §4 names the profile's conditions stay beside the holding-status
  date, followed by that line.
- A rule change is announced once, dated, and asks the user to review the plan; it never silently
  changes the plan.

## 2. Data model

One file per country in `packages/content/jurisdictions/<code>.json`, validated by this schema in
`packages/content/src/schema/jurisdiction.ts` (the build session writes the code; the shape is fixed
here). The code makes every object a `z.strictObject`, so an unknown key fails validation. Types are
inferred from the schema. The core consumes `CountryRules` (`packages/core/src/schema/country.ts`),
which `countryRules(profile)` from `packages/content` derives from a profile (the shell boots on that
derivation's generated `packages/content/rules/<code>.json`, ADR-0049); the card and the sources stay
with the profile.

```ts
import { z } from 'zod';

const CalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MonthDay = z.string().regex(/^\d{2}-\d{2}$/);
const Confidence = z.enum(['high', 'medium', 'low']);

const HoldingEffect = z.enum(['exempt', 'lower-rate']);   // what passing the period does; drives the label "tax-free from" vs "long-term rate from"

export const HoldingRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('days'), days: z.number().int().min(1).max(36_500), effect: HoldingEffect }),     // Portugal: 365 days, exempt
  z.object({ kind: z.literal('years'), years: z.number().int().min(1).max(100), effect: HoldingEffect }),   // Germany: 1 year, exempt; US: 1 year, lower-rate; eligible the day after the anniversary
]);

export const SourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().min(1),           // e.g. "Autoridade Tributária e Aduaneira"
  kind: z.enum(['law', 'authority', 'court', 'secondary']),
  published: CalendarDate.nullable(),     // publication or last-updated date if the page states one
  accessed: CalendarDate,
});

const SourceKey = z.string().regex(/^[a-z0-9-]+$/);   // names what the source is: "pt-cirs-art10", "de-estg-23"
export const ProfileSourceSchema = SourceSchema.extend({ key: SourceKey });   // unique within the profile

export const TaxableEventSchema = z.object({
  event: z.enum(['sale-to-fiat', 'crypto-to-crypto', 'crypto-to-stablecoin', 'spending', 'own-wallet-transfer', 'gift-or-inheritance', 'staking-or-airdrop']),
  // 'crypto-to-stablecoin' exists because Italy taxes a swap into a euro e-money token but not a like-for-like swap
  taxable: z.enum(['yes', 'no', 'depends']),
  note: z.string().max(240),              // one plain sentence
});

export const RateSchema = z.object({
  label: z.string().max(80),              // "Flat rate on gains", "Income tax rate", "Box 3 notional return"
  value: z.string().max(80),              // "28 %", "19–30 % by bracket", "your marginal rate"; text, because rates are not always a number
  validFrom: CalendarDate,                // first DISPOSAL date the value applies to (Ireland changed its rate on 2026-10-07, mid tax year)
  validTo: CalendarDate.nullable(),       // last disposal date, null = still current
  note: z.string().max(240).optional(),
});

export const PendingChangeSchema = z.object({
  title: z.string().max(160),
  status: z.enum(['proposed', 'enacted', 'in-force']),
  effectiveFrom: CalendarDate.nullable(),
  summary: z.string().max(400),
  source: SourceSchema,
});

export const JurisdictionCardSchema = z.object({
  classification: z.string().max(240),    // how the country classifies privately held crypto
  taxableEvents: z.array(TaxableEventSchema).min(1),
  rates: z.array(RateSchema).min(1),
  allowances: z.array(z.string().max(240)),
  holdingRuleText: z.string().max(400),   // the rule in words, or "No holding exemption: every sale is a taxable event."
  lotRuleText: z.string().max(240),
  losses: z.string().max(240),
  reporting: z.array(z.string().max(240)).min(1),
  caveats: z.array(z.string().max(240)).min(1),   // what needs an accountant
  summary60: z.string().max(420),         // the 60-word card text shown in the app
});

export const ComputationModelSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('per-lot') }),                            // PT, DE, ES, IT, BE, IE, GB, US: each lot has a cost and a date
  z.object({ kind: z.literal('portfolio-wide') }),                     // FR: gain = price − total acquisition cost × price ÷ value of the whole portfolio at the sale
  z.object({ kind: z.literal('wealth-snapshot'), date: MonthDay }),    // NL: no gains tax; a deemed return on the value held on 1 January
]);

export const HoldingRuleOverrideSchema = z.object({
  acquiredFrom: CalendarDate,            // applies to lots acquired on or after this date (Germany's draft reform would set 2027-01-01 → none)
  rule: HoldingRuleSchema,
  note: z.string().max(240),
});                                       // only ENACTED rules; proposals stay in pendingChanges until they are law

export const CountryProfileSchema = z.object({
  schemaVersion: z.literal(1),
  code: z.string().regex(/^[A-Z]{2}$/),   // ISO 3166-1 alpha-2; "XX" is the generic no-exemption profile
  name: z.string(),
  currency: z.enum(['EUR', 'USD', 'GBP', 'CHF']),   // the v1 set of docs/DOMAIN.md §1; another currency needs its minor unit in the core first
  locales: z.array(z.string()).min(1),    // BCP 47, first is the suggested UI language
  numberFormatLocale: z.string(),         // drives Intl.NumberFormat
  dateFormatLocale: z.string(),           // the numeric date order where digits are needed; dates in copy follow the UI language (ADR-0023)
  timezones: z.array(z.string()).min(1),  // IANA, used for the suggestion logic
  englishConfidence: z.enum(['medium', 'low']).optional(),   // §3: 'low' where many English speakers in the zone are visitors (PT)
  taxYear: z.object({ start: MonthDay, end: MonthDay }),   // "01-01"/"12-31"; GB "04-06"/"04-05"
  filingNote: z.string().max(240),
  computationModel: ComputationModelSchema,
  holdingRule: HoldingRuleSchema,
  holdingRuleOverrides: z.array(HoldingRuleOverrideSchema),   // empty until the core applies them everywhere (below)
  holdingRuleConditions: z.array(z.string().max(240)),        // conditions the app cannot verify, shown beside the first holding-status date on the surfaces docs/LEGAL.md §4 names: Portugal's EU/EEA counterparty rule, the swap question. List a condition that can deny the date first; the rest wait behind the control (docs/CONTENT-STYLE.md §3). The country card in Learn lists every condition in a plain list
  lotRule: z.enum(['fifo', 'lifo', 'average', 'pooled', 'specific', 'unspecified']),
  lotScope: z.enum(['global', 'per-venue']),                  // Portugal: FIFO per platform; Germany and the US: per wallet or account
  lotRuleNote: z.string().max(240),       // the matching rules that modify it: UK same-day and 30-day rules; Ireland 4-week rules; US per-wallet identification
  card: JurisdictionCardSchema,
  pendingChanges: z.array(PendingChangeSchema),
  sources: z.array(ProfileSourceSchema).min(1),
  ruleSources: z.object({                 // the key of the source each rule of the card links to
    holdingRule: SourceKey, lotRule: SourceKey, rates: SourceKey, losses: SourceKey, reporting: SourceKey,
  }),
  status: z.object({
    confidence: Confidence,
    version: z.number().int().positive(),  // bumped on every substantive change; the app compares it with the plan's stored version
    changedOn: CalendarDate,               // the day the country's rule changed, from the source; not the day this file changed;
                                           // for `XX`, which states no country's rule, the day the profile's text changed
    changeNotice: z.string().max(240).nullable(),   // "Portugal updated its rule for 2027. Review your plan."
    lastReviewed: CalendarDate,
    nextReviewDue: CalendarDate,
    reviewedBy: z.enum(['owner', 'agent-draft']),  // a file can only be published with 'owner'
  }),
});
export type CountryProfile = z.infer<typeof CountryProfileSchema>;
```

Validation tests in `packages/content` fail CI when: a file does not parse; `reviewedBy` is
`agent-draft` (on a pull request too, so the owner flips it before the merge); `nextReviewDue` is more
than twelve months past at build time (`docs/CONTENT-OPS.md` §2; from then the app shows "under
review"); a source URL is not `https`; a source other than a `secondary` one is off the country's
allow-list (`sources.allow.json`, with the `EU` domains for every country), or every source is
secondary; the file name is not the lower-case code; `summary60` exceeds 60 words; any banned word
appears in what users read (`docs/CONTENT-STYLE.md`); two sources share a key (`source-key-duplicate`);
a `ruleSources` key names no source (`source-key-unknown`); `holdingRuleOverrides` is not empty
(`overrides-unapplied`). The gate is `pnpm validate:content`
(`packages/content/scripts/validate.ts`), which also lints every UI message file.

The holding card links the source `ruleSources.holdingRule` names; each other rule links to the source its
`ruleSources` key names once a card shows that rule. No link points to a position in `sources`, so
reordering or adding a source cannot move one. A source's key names what it is (`pt-cirs-art10`), not
the rule it backs, and stays fixed once published. The country card in Learn ends with every source in
`sources`, in the file's order, with its publisher and its published date, else its accessed date. `sources`
hold only sources that back a current card line, so a pending change's source lives in `pendingChanges` and
enters `sources` only when a card line cites it; the card's foot lists `sources` as they stand. That list backs
the classification, the taxable events and the allowances, which have no `ruleSources` key.

Holding-rule overrides are built when the first profile needs one (decided 2026-10-30): the early-window
check and `saleWarning`'s per-lot effect do not apply them yet (`docs/ROADMAP.md` M2, "Carried from M1"),
so `overrides-unapplied` fails any profile that holds one. The build that applies them everywhere removes
the check in the same pull request as the profile that needs it.

### Generic profile `XX`

`holdingRule: none`, `lotRule: unspecified`, currency chosen by the user (EUR default), formats from
the browser locale, card: "Proof of Calm has no reviewed rule set for your country. Treat every sale as a
possibly taxable event and check with a local accountant. You can still use the plan, the log and the
portfolio." `confidence: high` (the statement is about us, not about a country).

The one exception to §1's source link: the `XX` card shows its `lastReviewed` date but links no source.
Its source, DAC8 (Directive (EU) 2023/2226), is a reporting directive, not the source of a holding rule,
and the profile states no holding rule; a link beside the card would present the directive as the source of
one. Its `ruleSources` names that one source for every rule only because the schema wants a key; the app
links none of them for `XX`. The `XX` card is never under review (§1): it states no country's rule, so a late
review leaves nothing stale to withdraw.

## 3. Locale and timezone suggestion (never IP)

Inputs: `navigator.languages` (ordered), `Intl.DateTimeFormat().resolvedOptions().timeZone`.
Output: `{ country, confidence: 'high' | 'medium' | 'low', languageDiffers }`, or `null` for no
suggestion. The onboarding shows the suggestion as one tap to confirm and a list to change; with `null`
it shows the list; `languageDiffers` adds the line "residence, not language, decides tax".

Algorithm (pure, in `packages/core/src/country/suggest.ts`, tested against the table below, which it
reproduces row by row; the build session rewrote the first draft's steps on 2026-10-17 because the
steps and the table disagreed):

1. Read each language tag in order: its language and, if present, its region subtag (`pt-PT` → `pt`,
   `PT`; `es-419` → `es`, `419`); a tag that cannot be read is skipped.
2. A timezone says where the device is unless it is missing, `UTC` or `Etc/*`. If it is listed in
   exactly one profile's `timezones`, that is the timezone country. A known timezone in no profile (or
   in several) suggests nothing: residence, not language, decides tax, so a German-language device in
   Vienna or a Portuguese-language one in São Paulo gets the list.
3. If any tag's region is the timezone country and its language is one of that country's `locales` →
   `high` (`en-US` in New York, `fr-BE` in Brussels; not `es-US`, which the US profile does not list).
4. Else if the first tag's language is not English and its region is another country with a profile
   (`de-DE` in Madrid, `nl-BE` in Amsterdam) → the timezone country, `low`, `languageDiffers`. English
   is a lingua franca and never points elsewhere. A region points elsewhere only when it names a profile
   the shell passes to `suggestCountry` (`codes.has(first.region)`), not one the table knows. `nl-BE` in
   Amsterdam reads `NL medium` until Belgium ships a profile and `NL low` after.
5. Else if the first language is English and the profile's `englishConfidence` is `low` (Portugal: many
   English speakers in Lisbon are visitors, not residents) → the timezone country, `low`.
6. Else → the timezone country, `medium` (people travel; expats are common; the tap confirms).
7. Without a usable timezone: the first tag whose region is a profile → `low`; else the first bare
   language that names a profile by its own code (`pt` → PT, `de` → DE, `nl` → NL; `en` names none) →
   `low`; else `null`.

Ambiguity table (kept in the profiles' test fixtures):

| Signal | Suggest | Confidence |
|---|---|---|
| `pt-BR`, `America/Sao_Paulo` | none (XX offered first in the list) | — |
| `nl-BE`, `Europe/Brussels` | BE | high |
| `fr-BE`, `Europe/Brussels` | BE | high |
| `fr-CH`, `de-CH`, `Europe/Zurich` | none (CH not a profile) | — |
| `de-AT`, `Europe/Vienna` | none | — |
| `en-GB`, `Europe/Dublin` | IE | medium |
| `en-IE`, `Europe/London` | GB | medium |
| `en-US`, `Europe/Berlin` | DE | medium |
| `es-MX`, `America/Mexico_City` | none | — |
| `en`, `America/New_York` | US | medium |
| `en-US`, any `America/*` zone that is US territory (not Toronto, Vancouver, Mexico_City, Sao_Paulo…) | US | high |
| `es-US`, US zone | US | medium |
| `en-CA`, `fr-CA`, `America/Toronto` | none | — |
| `it-CH`, `Europe/Zurich` | none | — |
| `en-GB`, `Europe/Dublin` | IE | medium |
| `en-*`, `Europe/Rome` or `Europe/Brussels` | IT or BE (the timezone country) | medium |
| `pt-BR`, `Europe/Lisbon` | PT | medium (Brazilian residents in Portugal are common) |
| `de-AT`, `de-CH`, `de-LU`, `Europe/Berlin` | DE | medium (the timezone wins) |
| `fr-CH`, `fr-LU`, `fr-CA`, `Europe/Paris` | FR | medium |
| `fr-BE`, `Europe/Paris` | FR | low once Belgium ships a profile, medium until then (step 4; as `nl-BE` in Amsterdam; the first draft listed it with the row above) |
| `es-MX`, `es-AR`, `es-419`, `Europe/Madrid` or `Atlantic/Canary` | ES | medium |
| `nl-BE`, `Europe/Amsterdam` | NL | low once Belgium ships a profile, medium until then (step 4) |
| `en-*`, `Europe/Lisbon` | PT | low (expats; the full list stays visible) |
| `en-*`, `Europe/Berlin`, `Europe/Amsterdam`, `Europe/Madrid`, `Europe/Paris` | the timezone country | medium |
| language and timezone disagree (`de-DE` + `Europe/Madrid`) | the timezone country | low, with the line "residence, not language, decides tax" |
| any locale, `Europe/Monaco`, `Europe/Andorra`, `Europe/Gibraltar`, `Europe/Luxembourg`, `Europe/Vienna`, `Europe/Zurich` | none | — |
| any locale, `Asia/*` or `Australia/*` | none | — |
| timezone unavailable or `UTC` | the language's country if it is a profile | low |

The US zone list is explicit in the US profile (`America/New_York`, `America/Chicago`, `America/Denver`,
`America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `Pacific/Honolulu`);
a Canadian or Mexican zone never maps to US.

The country is stored on the plan; the timezone used for `today` and reminders is stored separately
and re-read from the device (a user who moves keeps the country until they change it).

## 4. Tax year and the tax-year export

`taxYear` is `{ start, end }` as month-day. The export (M2) takes the span of one tax year, named by
the calendar year it ends in (`taxYearEndingIn: number`). Its rows, columns, rounding and file name
are in `docs/DOMAIN.md` §3.13. Its header names the country, the span and the lot rule used, with the
sentence "Data from your log. Not a tax computation." Calendar-year countries: 01-01 to 12-31. The UK: 6 April to 5 April,
the year 2026-27 ending in 2027.
Ireland's two CGT payment windows (initial period to 30 November, later period 1 to 31 December) are a
`filingNote`, not logic.

## 5. Holding rules and lot rules in the core

`HoldingRule` and `lotRule` are passed from the profile into `packages/core` (`docs/DOMAIN.md` §3.7).
The user may override the holding rule in Settings ("Hold & sell"). The plan stores the rule itself;
the core compares it with the country's rule field by field (`sameHoldingRule`), and a rule that
differs applies to every purchase, without the country's acquisition-date overrides. The card still
shows the country's rule.

## 6. Rule changes and reviews

- `status.version` increases on any substantive change (rate, allowance, holding rule, taxable event,
  reporting duty). The plan stores `countryRuleVersion` at setup and whenever the user dismisses a
  notice or follows its `Review`. When `profile.status.version > plan.countryRuleVersion`, Today shows
  the `rule-change` banner (priority below Red day), once: `changeNotice` after its date, or the generic
  sentence when the profile has none (`docs/CONTENT-STYLE.md` §3). A plan on the generic profile `XX`
  gets the notice: its `changeNotice` after its date, or, with none, the generic form, which names
  the general profile (`docs/CONTENT-STYLE.md` §3, the Rule change notice row); a plan in a country
  with no profile of its own, which falls back to the general profile, or whose profile is not
  loaded, gets none. A plan on `XX` in a country that gains its own profile keeps `XX` and gets no
  notice (`docs/DOMAIN.md` §3.12). A version bump for a correction of our own file sets a
  `changeNotice` that says so, since the generic sentence names the country's rules.
- A typographic change, such as the percent sign's joiner (`docs/CONTENT-STYLE.md` §4), keeps a
  profile's `version`, `lastReviewed` and `reviewedBy`, since a raised version fires the rule-change
  notice.
- `lastReviewed` is set by the owner when merging a review PR, even if nothing changed.
- `nextReviewDue` defaults to `lastReviewed + 12 months`, or the next known effective date of a
  pending change if earlier.
- The scheduled job (`docs/CONTENT-OPS.md`) proposes changes as PRs with `reviewedBy: agent-draft`;
  the owner flips it to `owner` when merging. CI blocks `agent-draft` on `main`.

## 7. Country facts

One section per country with the card fields, the pending changes and the decisive sources with
dates; the full source lists (about 80 for IT/BE/IE/GB/US alone) are in
`docs/research/jurisdictions-it-be-ie-uk-us.md` and `docs/research/jurisdictions-pt-de-nl-es-fr.md`,
which are the audit trail. Confidence is per country. These sections are the source for the JSON
files the build session creates in M1 (PT, DE, XX) and M2 (the rest); the JSON must not contain
anything that is not traceable to a source listed in this document or the research files, or added
later through the review pipeline. All facts below were researched on 2026-10-16 and are general
information, not advice.

The §7 tables keep one compact form: tax years as 2024/25, the usual abbreviations (CGT, BNC, BIC,
IRPF), ISO dates, and numerals for every number outside quotations. Beyond that form, a row restates its
card in the card's words and never disagrees with it on a fact (decided in the owner's delegated read of
2026-11-05).

A finding that shapes the whole feature: of the ten countries, only Portugal and Germany give a
holding **exemption**; the US changes the **rate** after one year; the other seven have no holding
rule at all. "No holding rule here: every sale is a taxable event" is the common case, not the
exception, and the UI copy, the templates and the onboarding are written with that in mind. Two
countries do not even fit the per-lot model: France computes each gain on the whole portfolio (form 2086
asks for the estimated portfolio value at each sale; what the export carries: §7.10, Product note). The Netherlands taxes a deemed
return on the value held on 1 January (the export is a snapshot, and the Portfolio page shows the
1 January value for Dutch users). Portugal applies FIFO per platform and Germany per wallet, which
is why entries carry an optional venue label.

### 7.1 Italy (IT) — confidence high

| Field | Value |
|---|---|
| Identity | EUR · it-IT · `1.234,56 €` · `16/10/2026` · Europe/Rome · Agenzia delle Entrate, https://www.agenziaentrate.gov.it · tax year = calendar year · Redditi PF by 31 October of the following year (Modello 730 by 30 September) |
| Classification | Cripto-attività; gains are "redditi diversi di natura finanziaria" taxed by a flat substitute tax (art. 67 c. 1 lett. c-sexies TUIR, L. 197/2022) |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: **depends** (swaps between assets "with the same characteristics and functions", e.g. BTC→ETH, are not taxable; the new asset inherits the euro cost; Circ. 30/E example) · crypto-to-stablecoin: depends (a swap into an e-money token is a realisation; into an asset-referenced token it is not) · spending: yes · own-wallet transfer: no · gift: not a realisation for the donor; donee takes the donor's cost · staking/airdrop: yes, taxed gross (classification can differ by set-up) |
| Rates | 26 % substitute tax, validFrom 2023-01-01, validTo 2025-12-31 · **33 %** validFrom 2026-01-01 (L. 207/2024 art. 1 c. 24) · 26 % for proceeds from euro-denominated e-money tokens validFrom 2026-01-01 (L. 199/2025 art. 1 c. 28) |
| Allowances | none since 2025-01-01 (the EUR 2,000 franchigia was removed by L. 207/2024 art. 1 c. 25) |
| Holding rule | `none` |
| Lot rule | `lifo` — the cost or acquisition value "must be taken as the one determined with the L.I.F.O. (last in first out) method" ("deve essere assunto come costo o valore di acquisto quello determinato con il metodo L.I.F.O. (last in first out)", Circ. 30/E §3.2.1, regime dichiarativo); cost must be proven "with certain and precise elements", otherwise the cost counts as EUR 0 |
| Losses | offset gains of the same category in the year; the excess carries forward up to the 4th following year, only if declared in the year realised |
| Reporting | Quadro RT sezione V (gains; quadro T of the 730) · Quadro RW monitoring of crypto held in wallets or on exchanges (asset code 21) plus the 0.2 % yearly tax on the 31 December value (code 1727), unless an Italian intermediary already applied stamp duty · DAC8 reporting by service providers from 2026-01-01 · penalties: omitted RW 3–15 % of the undeclared value; unfaithful return 70 % of the extra tax |
| Pending changes | Proposal (not a bill): a parliamentary intergroup draft would return the rate to 26 % from 2027 and allow cross-asset loss offset (named by SpazioCrypto, 2026-09-24; text not fetched). The DDL Bilancio 2027 (AC 3174, presented 2026-10-30) holds no crypto change as presented (read 2026-11-05). The 18 % "affrancamento" step-up window closed on 2025-11-30. |
| summary60 | "Italy taxes crypto gains at a flat 33% from 1 January 2026 (26% in 2025), with no exempt amount or holding-period exemption. Swapping one crypto for a similar one is not taxed; selling for euro or e-money tokens is. Last-in, first-out. Losses carry forward 4 years. Holdings are reported yearly (Quadro RW, 0.2% tax on value held)." |
| Caveats | which swaps count as "same characteristics and functions" (stablecoins, NFTs); staking classification; whether 2025 disposals paid in 2026 stay at 26 %; the RW details; any 2027 rate change |
| Decisive sources | Fisco Oggi (Agenzia delle Entrate magazine), "Bilancio 2026: aliquota più leggera per le criptoattività in euro", 2026-02-12, https://www.fiscooggi.it/portale/-/bilancio-2026-aliquota-pi%C3%B9-leggera-per-le-criptoattivit%C3%A0-in-euro · Circolare 30/E, 2023-10-27 (mirror) https://www.dirittobancario.it/wp-content/uploads/2023/10/Circolare-Agenzia-delle-Entrate-27-ottobre-2023-n.-30-E.pdf · Istruzioni Redditi PF 2026 fascicolo 2, 2026-05-13, https://www.agenziaentrate.gov.it/portale/documents/d/guest/pf2_istruzioni_2026_agg-13-05-2026 · SpazioCrypto on the intergroup draft, 2026-09-24 (medium) |

### 7.2 Belgium (BE) — confidence medium-high (new law, circular of July 2026)

| Field | Value |
|---|---|
| Identity | EUR · nl-BE, fr-BE, de-BE · `1.234,56 €` (nl-BE) / `1 234,56 €` (fr-BE) · `16/10/2026` · Europe/Brussels · SPF Finances / FOD Financiën, https://finances.belgium.be · income year = calendar year, assessed the following year (income 2026 = assessment year 2027) · return for income 2026 due mid-2027 (dates published spring 2027) |
| Classification | 3 regimes by facts and circumstances: normal management of private assets (from 2026-01-01 inside the new capital-gains tax on financial assets), speculative (miscellaneous income), professional. The new law was approved on 2026-04-03, published in the Belgisch Staatsblad on 2026-04-21, and applies to gains realised from 2026-01-01; crypto-assets are "financial assets" in the residual 10 % category |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: yes · crypto-to-stablecoin: yes · spending: yes · own-wallet transfer: no · gift: not a transfer for consideration; the recipient keeps the original value and date (regional gift and inheritance taxes apply separately) · staking: yes, as income from movable property (30 % per practitioners; not fully settled) |
| Rates | **10 %** on gains realised from 2026-01-01 under normal management, measured from the asset's value on 2025-12-31 (or the real, higher, evidenced acquisition cost, usable until 2030-12-31) · 33 % plus communal surcharge if speculative (unchanged, no 2025-12-31 reset, no exemption) · progressive rates if professional |
| Allowances | EUR 10,000 per taxpayer per year (indexed), only within the 10 % regime; the unused part carries forward by up to EUR 1,000 a year for at most 5 years (so at most EUR 15,000); claimed in the return, never applied at source for crypto |
| Holding rule | `none` — holding time is 1 factor of several in the normal-versus-speculative test; circular 2026/C/74 of 2026-07-22 says crypto gains are "not automatically" speculative (factors: share of financial assets, borrowing, trading bots) |
| Lot rule | `fifo` for historical gains; average price for the 2025-12-31 value (EY wording; medium). Missing proof of acquisition value means the whole sale price is taxed |
| Losses | 10 % regime: offset same-year gains of the same category only; no loss carry-forward (only the exemption carries forward). Whether crypto losses offset share gains is disputed between sources |
| Reporting | no withholding on crypto gains: declared in the return for income 2026 (new codes in the 2027 form) · speculative gains: part 2, box XV, codes 1440/2440 · foreign accounts, including foreign exchanges: box XIII and the National Bank's Central Point of Contact · DAC8 collection from 2026-01-01, first exchange by 2027-09-30 · penalties: tax increases of 10–200 % and fines of EUR 50–1,250 |
| Pending changes | a draft law of 2025-10-14 extends Central Point of Contact reporting to crypto-platform accounts (window around December 2026) · the indexed exemption for income year 2027 · the assessment-year-2027 return codes (spring 2027) · possible constitutional challenges to the law |
| summary60 | "Belgium taxes gains on crypto and other financial assets at 10 % from 1 January 2026, on growth since 31 December 2025 and above EUR 10,000 a year. Swaps and spending count as sales. No holding-period exemption. Losses only offset same-year gains. Gains on foreign platforms must be declared; frequent or leveraged trading can be taxed at 33 %." |
| Caveats | normal versus speculative versus professional qualification (the app cannot determine it); the 2025-12-31 valuation and proof of cost; whether crypto losses offset share gains; staking; the 2027 declaration codes; foreign-account reporting |
| Decisive sources | EY Belgium, "The new Belgian capital gains tax: what changes in 2026", 2026-03-27, https://www.ey.com/en_be/insights/tax/the-new-belgian-capital-gains-tax-what-changes-in-2026 · ACS, "Meerwaardebelasting eindelijk gestemd", 2026-04-27, https://www.acs.be/nieuws/meerwaardebelasting-eindelijk-gestemd · Vandelanotte on circular 2026/C/74, 2026-07-31, https://www.vandelanotte.be/nl/nieuws/meerwaardebelasting-dit-verduidelijkt-de-nieuwe-circulaire · Argenta, 2026-04-23, https://www.argenta.be/nl/argenta-informeert/meerwaardebelasting.html · Andersen Belgium on the 3 regimes, 2025-10-29, https://be.andersen.com/en/news/tax-challenges-for-cryptocurrency-investors · Moniteur belge of 2026-04-21, p. 22432, no. 2026002780, https://www.ejustice.just.fgov.be/img_l/pdf/2026/04/06/2026002780_F.pdf. Open item: the circular's own text |

### 7.3 Ireland (IE) — confidence high (the 31 % rate rests on a Dáil resolution until the Finance (No. 2) Act)

| Field | Value |
|---|---|
| Identity | EUR · en-IE · `€1,234.56` · `16/10/2026` · Europe/Dublin · Revenue Commissioners, https://www.revenue.ie · tax year = calendar year · CGT **payment**: disposals 1 January–30 November by 15 December of the same year, December disposals by 31 January · **return** by 31 October of the following year (Form CG1, Form 11 or Form 12); a return is due even if no tax is due because of reliefs or losses |
| Classification | Chargeable assets for Capital Gains Tax (Revenue Tax and Duty Manual Part 02-01-03, reviewed January 2026); income tax only where there is a trade |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: yes · crypto-to-stablecoin: yes · spending: yes (TDM example: paying in a café) · own-wallet transfer: no · gift: a disposal for the giver (CGT; market value unless to a spouse or civil partner, How to calculate CGT) and a CAT event for the recipient; on death no CGT · staking/airdrop: depends; the manual is silent; a trade of dealing falls under income tax |
| Rates | 33 %, validFrom 2012-12-06 (Finance Act 2013 s. 43; Revenue's table prints 2021-12-06), validTo 2026-10-06 · **31 %** validFrom 2026-10-07 (Budget 2027, Financial Resolution No. 3 of 2026-10-06 with temporary statutory effect; Revenue pages updated 2026-10-07; Finance (No. 2) Bill 2026, section 36, initiated 2026-10-19, passed Dáil Second Stage 2026-10-20 and referred to the Select Committee, not enacted on 2026-11-05). Tax year 2026 is therefore split by disposal date |
| Allowances | EUR 1,270 per person per year, applied after losses; a part left over cannot be used; not transferable between spouses or civil partners (TDM Part 19-07-01 §1.2) |
| Holding rule | `none` |
| Lot rule | `fifo`; the 4-week rules for shares (disposals within 4 weeks of an acquisition matched to it; a loss followed by re-acquisition within 4 weeks restricted) may apply to crypto: Revenue's crypto manual is silent. Default FIFO, flagged "may apply" |
| Losses | offset same-year gains first; unused losses carry forward against the next available gains; no carry-back except in the year of death |
| Reporting | CG1 / Form 11 / Form 12 with a computation attached · late filing surcharge on 2025 returns: 5 % of the tax due, up to EUR 12,695, if filed between 2026-11-01 and 2026-12-31; 10 % of the tax due, up to EUR 63,485, if filed after 2026-12-31 (Revenue, Form CG1 helpsheet 2025, https://www.revenue.ie/en/gains-gifts-and-inheritance/documents/form-cg1-helpsheet.pdf) · CARF/DAC8 in force from 2026-01-01 (s. 891HA TCA; providers report by 31 May for the previous year, first on 2027-05-31; users receive a copy of their data) |
| Pending changes | Finance (No. 2) Bill 2026 enacting the 31 % rate |
| summary60 | "Ireland charges Capital Gains Tax on every crypto disposal: selling, swapping, spending, or gifting. Rate 33% to 6 October 2026 and 31% from 7 October 2026, after a EUR 1,270 yearly exemption. No holding-period exemption. Pay by 15 December for January to November disposals, by 31 January for December's; file by 31 October next year. Losses carry forward." |
| Caveats | the 4-week rules; staking and airdrop income; trading versus investing; Capital Acquisitions Tax on gifts; enactment of the 31 % rate |
| Decisive sources | Revenue TDM Part 02-01-03, reviewed 2026-01, https://www.revenue.ie/en/tax-professionals/tdm/income-tax-capital-gains-tax-corporation-tax/part-02/02-01-03.pdf · Revenue TDM Part 19-07-01 (Annual exempt amount, s. 601), reviewed 2024-12, https://www.revenue.ie/en/tax-professionals/tdm/income-tax-capital-gains-tax-corporation-tax/part-19/19-07-01.pdf · Revenue, "When and how do you pay and file CGT", 2026-10-27, https://revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/when-and-how-do-you-pay-and-file-cgt.aspx · Revenue, "How to calculate CGT", 2026-10-07, https://www.revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/how-to-calculate-cgt.aspx · Financial Resolution No. 3, Dáil record of 2026-10-06, https://data.oireachtas.ie/akn/ie/debateRecord/dail/2026-10-06/debate/mul@/main.xml · Finance (No. 2) Bill 2026, section 36, https://data.oireachtas.ie/ie/oireachtas/bill/2026/98/eng/initiated/b9826d.pdf · Finance (No. 2) Bill 2026 Second Stage, Dáil record of 2026-10-20, https://data.oireachtas.ie/akn/ie/debateRecord/dail/2026-10-20/debate/mul@/main.xml · Department of Finance, Budget 2027 tax policy changes, 2026-10-06, https://assets.gov.ie/static/documents/c6792805/Budget_2027_-_Tax_Policy_Changes_-_Publication_Version.pdf · Revenue DAC8/CARF page, 2026-03-30, https://www.revenue.ie/en/companies-and-charities/international-tax/aeoi/dac8/index.aspx · Finance Act 2013 s. 43, Irish Statute Book, accessed 2026-11-05, https://www.irishstatutebook.ie/eli/2013/act/8/section/43/enacted/en/html |

### 7.4 United Kingdom (GB) — confidence high (product handling: ADR-0029)

| Field | Value |
|---|---|
| Identity | GBP · en-GB · `£1,234.56` · `16/10/2026` · Europe/London · HM Revenue & Customs · tax year **6 April to 5 April** · online Self Assessment by 31 January after the tax year; the real time Capital Gains Tax service by 31 December after the tax year; payment by 31 January |
| Classification | Most individuals hold tokens as a personal investment and pay CGT on disposal; Income Tax on tokens received from an employer, mining, transaction confirmation, or some airdrops (an airdrop received for nothing in return is not Income Tax at receipt), and when the activity is a trade (HMRC Cryptoassets Manual CRYPTO20050 and CRYPTO21250, updated 2025-11-28) |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: yes ("exchanging tokens for a different type of token") · crypto-to-stablecoin: yes (an exchange for a different type of token) · spending: yes · own-wallet transfer: no · gift: a disposal at sterling market value except to a spouse or civil partner; a gift to charity has no CGT unless tainted; inherited tokens are not covered by the card · staking: depends (miscellaneous income at receipt if not a trade; airdrops for nothing: CGT only later) |
| Rates | 18 % within the basic-rate band and 24 % above, validFrom 2024-10-30; 18 % and 24 % again for 2025/26 and from 2026-04-06 (GOV.UK rates and allowances table, updated 2026-04-13: "6 April 2026 onwards ... 18% and 24% for individuals") and for 2027/28 (OOTLAR Annex A) |
| Allowances | Annual exempt amount £3,000 for individuals for 2024/25, 2025/26 and 2026/27; tax is due only on gains above it |
| Holding rule | `none` |
| Lot rule | `pooled` — section 104 pool with an average cost per token type, after the same-day rule (TCGA 1992 s. 105) and the 30-day rule (s. 106A: tokens bought within 30 days after a disposal are matched to that disposal, earliest first). For a DCA plan: any purchase within 30 days after a sale is matched to that sale, not to the pool |
| Losses | must be claimed (within 4 years); set against same-year gains before the exempt amount; carry the rest forward to a future tax year; negligible-value claims for worthless tokens |
| Reporting | SA108 has a dedicated Cryptoassets section (boxes 13.1–13.8) for tax year 2024/25 · the real time Capital Gains Tax service: a report by 31 December after the tax year and payment by 31 January; the gain or loss already reported goes in SA108 box 13.7, the tax paid in box 13.8, the reference numbers in box 54 · CARF: UK providers collect data from 2026-01-01 and file their first report by 2027-05-31 |
| Pending changes | Budget 2026 of 2026-10-28 (OOTLAR 1.48): legislation in Finance Bill 2026-27 for cryptoasset loans and liquidity pools: certain transfers by individuals and trustees into and out of qualifying arrangements on a no gain no loss basis until an economic disposal, to take effect from 2027-04-06 once enacted; announced 2026-07-13 with draft legislation (TCGA 1992 Part 4A, ss. 151YA–151YK) · the Budget left the 18 % and 24 % rates and the £3,000 exempt amount unchanged for 2027/28 (OOTLAR Annex A) · first CARF data at HMRC by 2027-05-31 |
| summary60 | "The UK taxes crypto gains at 18% or 24% by income band, after a £3,000 allowance. Selling, swapping, spending, and gifting (except to a spouse or civil partner) are disposals; own-wallet moves are not. No holding exemption. Costs pool per token with same-day and 30-day matching. Self Assessment by 31 January; real time service by 31 December." |
| Caveats | which band the gains fall in; the 30-day rule around any sale; the pooled cost per token type (Proof of Calm lists each purchase and leaves the pooling to the accountant); staking and airdrop income; inherited tokens; negligible-value claims; cryptoasset loans and liquidity pools from 2027-04-06 (a proposal in Finance Bill 2026-27) |
| Decisive sources | GOV.UK CGT rates, https://www.gov.uk/capital-gains-tax/rates · GOV.UK CGT rates and allowances by tax year, updated 2026-04-13, https://www.gov.uk/guidance/capital-gains-tax-rates-and-allowances · HMRC Cryptoassets Manual CRYPTO20050, CRYPTO21200, CRYPTO21250, CRYPTO22100, CRYPTO22200 and CRYPTO22500, updated 2025-11-28, https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22100 and its siblings · GOV.UK CGT losses, https://www.gov.uk/capital-gains-tax/losses · GOV.UK Self Assessment deadlines, https://www.gov.uk/self-assessment-tax-returns/deadlines · GOV.UK Report and pay your CGT, other gains (the real time Capital Gains Tax service), https://www.gov.uk/report-and-pay-your-capital-gains-tax/if-you-have-other-capital-gains-to-report · HMRC SA108 Notes 2025, https://assets.publishing.service.gov.uk/media/67e1612564220b68ed6a7009/SA108-Notes-2025.pdf · HMRC, Budget 2026 OOTLAR, 2026-10-28, https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar/budget-2026-overview-of-tax-legislation-and-rates-ootlar · HMRC, "Cryptoasset loans and liquidity pools", 2026-07-13 (updated 2026-10-28), https://www.gov.uk/government/publications/cryptoasset-loans-and-liquidity-pools · GOV.UK CARF guidance, updated 2026-11-02, https://www.gov.uk/guidance/reporting-cryptoasset-user-and-transaction-data |

### 7.5 United States (US), federal only — confidence high (state taxes are extra and vary)

| Field | Value |
|---|---|
| Identity | USD · en-US · `$1,234.56` · `10/16/2026` · America/New_York, America/Chicago, America/Denver, America/Phoenix, America/Los_Angeles, America/Anchorage, Pacific/Honolulu · Internal Revenue Service, https://www.irs.gov · tax year = calendar year · Form 1040 by 15 April of the following year (an automatic 6-month extension moves the date to file, not the date to pay) |
| Classification | Digital assets are property, not currency (Notice 2014-21); held for investment they are capital assets; receipts for services, mining, staking or airdrops are ordinary income |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: yes (no like-kind deferral since 2018) · crypto-to-stablecoin: yes · spending: yes (paying a network fee in crypto is also a disposal of the fee units) · own-wallet transfer: no · gift: not a capital-gains event for the giver (gift-tax rules; $19,000 annual exclusion in 2026); the recipient takes carryover basis and the giver's holding period; inherited assets are stepped up and long-term · staking/mining/airdrop: ordinary income at receipt (Rev. Rul. 2019-24, 2023-14) |
| Rates | Short-term (held 1 year or less): ordinary rates 10–37 % by 2026 bracket · **Long-term (held more than 1 year): 0 %, 15 %, 20 %**; 2026 thresholds of taxable income (Rev. Proc. 2025-32): 0 % up to $49,450 single / $98,900 married filing jointly, 15 % up to $545,500 / $613,700, 20 % above · plus 3.8 % Net Investment Income Tax above $200,000 single / $250,000 joint (not indexed) · collectibles up to 28 % (some NFTs) |
| Allowances | none specific to crypto (no de minimis for personal transactions); net capital losses offset up to $3,000 of ordinary income a year |
| Holding rule | `{ kind: 'years', years: 1, effect: 'lower-rate' }` — "more than one year", counted from the day after acquisition to the day of disposal; the label is "long-term rate from", never "tax-free from" |
| Lot rule | `specific` — adequate identification per wallet or account since 2025-01-01 (Treas. Reg. 1.1012-1(j); the "universal" method ended; one-time allocation safe harbour of Rev. Proc. 2024-28), otherwise FIFO; Notice 2026-20 (2026-03-18) extends the relief for broker-held units to 2026-12-31 · no wash-sale rule for digital assets at present |
| Losses | short- and long-term netted; net losses offset $3,000 of ordinary income a year and carry forward indefinitely |
| Reporting | Form 1040 digital-asset question · Form 8949 and Schedule D; Schedule 1 for staking and airdrop income · Form 1099-DA from brokers: gross proceeds for sales from 2025-01-01 (first forms February 2026), adjusted basis for covered assets acquired from 2026-01-01 (first in early 2027) · penalties: failure to file 5 % a month up to 25 %; failure to pay 0.5 % a month; accuracy-related 20 % |
| Pending changes | H.R. 10357 "Digital Asset Tax Certainty Act" ($10 de minimis for network or transaction fees, wash-sale extension, staking and mining as ordinary income; Ways and Means markup scheduled for 2026-09-16; named by Decrypt via Yahoo Finance, 2026-09-15; text not fetched) · S. 2207 (de minimis for personal transactions with a gain under $300, capped at $5,000 a year; wash-sale extension; named by NTU Foundation, 2025-08-13; text not fetched) · Notice 2026-20 relief ends 2026-12-31 · 2027 thresholds in the autumn revenue procedure |
| summary60 | "The US taxes crypto as property. Selling, swapping or spending is a taxable event; moving between your own wallets is not. Held more than one year, gains use the lower long-term rates; one year or less, ordinary rates up to 37%. Sales match purchases per wallet. Losses offset gains, then USD 3,000 of income a year. Federal rules only." |
| Caveats (the first is mandatory on the card; the holding condition "Federal rate only … Confirm your state." carries the state warning on the Log and the Plan) | "State income tax: 42 states levy one, with top rates from 2.5% to 13.3%; eight levy none, and Washington taxes capital gains only (Tax Foundation, 2026; medium confidence)." · identification method and standing orders per broker (Notice 2026-20 relief ends 2026-12-31) · NFT collectibles rate (Notice 2023-27 look-through; Topic 409) · pending de minimis or wash-sale legislation · 1099-DA reconciliation · staking and airdrop income · gifts and inheritances · NIIT |
| Decisive sources | IRS, Digital assets, reviewed 2026-09-02, https://www.irs.gov/filing/digital-assets · Rev. Proc. 2025-32, 2025-10-09, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf · IRS Topic 409, reviewed 2026-09-24, https://www.irs.gov/taxtopics/tc409 · IRS virtual-currency FAQ, reviewed 2026-06-30, https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions · Rev. Proc. 2024-28, https://www.irs.gov/pub/irs-drop/rp-24-28.pdf · Notice 2026-20, 2026-03-18, https://www.irs.gov/pub/irs-drop/n-26-20.pdf · Instructions for Form 1099-DA (2026), reviewed 2026-04-30, https://www.irs.gov/instructions/i1099da · Tax Foundation, State individual income tax rates and brackets, 2026, 2026-02-17, https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/ |

### 7.6 Portugal (PT) — confidence high · ships in M1

| Field | Value |
|---|---|
| Identity | EUR · pt-PT · `1 234 567,89` (official: space thousands, comma decimal) · `16/10/2026` · Europe/Lisbon, Atlantic/Madeira, Atlantic/Azores · Autoridade Tributária e Aduaneira, Portal das Finanças, https://www.portaldasfinancas.gov.pt · tax year = calendar year · Modelo 3 filed 1 April–30 June of the following year |
| Classification | Category G (mais-valias), art. 10(1)(k) CIRS, for disposals of crypto-assets that are not securities · Category E (28 %) for staking or lending paid in fiat; paid in crypto it is taxed on later disposal · Category B when habitual or professional, and always for mining and validation · NFTs are outside the crypto definition · gratuitous transfers: stamp duty, not IRS |
| Computation model | per-lot |
| Taxable events | sale-to-fiat: yes (excluded when held ≥ 365 days and the counterparty is tax-resident in the EU, the EEA, or a treaty jurisdiction, but still declared in Anexo G1 Q7) · crypto-to-crypto: **no, deferred** (art. 10 n.º 23: the received crypto takes the acquisition value of the one given; no deferral when either party is tax-resident outside the EU/EEA or a treaty jurisdiction, n.º 24) · crypto-to-stablecoin: no, deferred like any swap (AT ruling PIV 28969 of 2025-10-31 treats an immediate technical conversion as a non-event; medium) · spending: yes · own-wallet transfer: no · gift or inheritance: no IRS; stamp duty 10 % on crypto deposited with an institution in Portugal, or with no institution when a gift's recipient or, for an inheritance, the deceased is domiciled there (CIS art. 4 n.º 4 e)); spouses, partners, descendants, and ascendants exempt (medium) · staking/lending: yes (Category E at 28 % when paid in fiat) |
| Rates | **28 %** autonomous rate on the positive balance of category-G crypto gains (art. 72(1)(c)), validFrom 2023-01-01 · optional aggregation (englobamento) at the progressive scale, 12.2–48 % in 2026 plus the solidarity surcharge (art. 68(1) as amended by Decreto-Lei n.º 212/2026 of 2026-11-04, in force 2026-11-05, for 2026 income from 2026-01-01) · the 35 % blacklisted-jurisdiction rate does not list art. 10(1)(k); the anti-haven mechanism for crypto is the loss of the exclusion and of the swap deferral |
| Allowances | none; the only relief is the 365-day exclusion · fees "necessárias e efetivamente suportadas" are deductible · purchases before 2023 count toward the 365 days (art. 220 Lei 24-D/2022) |
| Holding rule | `{ kind: 'days', days: 365, effect: 'exempt' }` — gains **and losses** on crypto "detidos por um período igual ou superior a 365 dias" are excluded (art. 10 n.º 22, numbered n.º 19 in 2023–2025 documents); a unit bought on 2026-03-01 qualifies on 2027-03-01 |
| Holding-rule conditions (shown beside the date) | "Tax-free only when the counterparty is tax-resident in the EU, the EEA, or a treaty jurisdiction (declared in Anexo G Q18B otherwise)." · "Exempt sales must still be declared (Anexo G1 Q7)." · "Whether the holding period carries across a crypto-to-crypto swap is unsettled. Proof of Calm treats a swap as a sale and a new purchase, so a new holding period starts for the coins received." · "Loss of Portuguese tax residence counts as a disposal (art. 10 n.º 25 CIRS, numbered n.º 22 in 2023–2025 documents)." |
| Lot rule | `fifo`, `lotScope: per-venue` — "os alienados são os adquiridos há mais tempo" (art. 43 n.º 8(g)), applied separately per custodian or platform when held at more than one (art. 43 n.º 9) |
| Losses | netted against crypto gains of the same year in category G; losses on units held ≥ 365 days are excluded along with the gains; the net loss carries forward 5 years **only** with englobamento (art. 55(1)(d)); losses against blacklisted-regime counterparties never count (art. 43 n.º 7) |
| Reporting | Modelo 3: Anexo G Quadro 18A (disposals held < 365 days, per operation with counterparty country), Quadro 18B (non-EU/EEA counterparties), **Anexo G1 Quadro 7 (exempt disposals, mandatory)**, Anexo J 9.4 for income treated as foreign-sourced (which annex applies to a foreign exchange is a recurring practitioner question), Anexo E code E21, Anexo B fields 419/422 · DAC8: Lei n.º 26/2026 de 3 de junho, effects from 2026-01-01; providers report residents to the AT by 31 May of the following year, first on 2027-05-31 |
| Pending changes | OE2027 proposal delivered 2026-10-08 with no crypto measure (general debate from 2026-10-27, final vote late November 2026) · OE2026 (Lei n.º 73-A/2025) had no crypto change (as reported by Montepio, 2025-10-10; the law itself located, not read) · "Lower rates in six IRS brackets" (Decreto-Lei n.º 212/2026), in force: the 28 % rate of art. 72(1)(c) does not change; Decreto-Lei n.º 212/2026 of 2026-11-04 (DR n.º 214/2026, Série I; approved 2026-10-29, promulgated 2026-11-02, in force 2026-11-05, the day after publication), under the authorisation Lei n.º 64-B/2026 of 2026-10-22 (Proposta de Lei n.º 108/XVII/2.ª), lowers the first 6 art. 68 n.º 1 rates to 12.2 %, 15.2 %, 20.7 %, 23.6 %, 30.6 %, and 34.6 %; its preamble applies the cut to 2026 income with effect from 2026-01-01, and its articles carry no other date; the AT consolidated text of 2026-11-05 holds the new table; `effectiveFrom` is 2026-01-01, `status.version` 2, `changedOn` 2026-11-05, `changeNotice` names the lower rates and the unchanged 28 % rate and 365-day rule · AT rulings PIV 28969 (2025-10-31) and PIV 29052 (2025-12-04: 2019 purchases qualify; exclusion limited to EU/EEA/treaty counterparties; habituality test) · the AT consolidated text renumbered the crypto rules to art. 10 n.ºs 20–25 (formerly 17–22); the data file stores both numberings |
| summary60 | "Portugal: gains on crypto held under 365 days are taxed at 28% by default. Units held 365 days or more are exempt when the counterparty is tax-resident in the EU, the EEA, or a treaty jurisdiction, but every sale must be declared. Crypto-to-crypto swaps are not taxed at the time. First-in, first-out per platform. Return filed April to June." |
| Caveats | counterparties outside the EU/EEA; the holding period across swaps; Anexo G 18A versus J 9.4 for foreign platforms; losses usable only with aggregation; staking; professional-activity risk; stamp duty on gifts |
| Decisive sources | CIRS art. 10, 43, 55, 72, AT consolidated text, accessed 2026-10-16 (art. 10 again on 2026-11-03), https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx (and irs43, irs55, irs72) · CIRS art. 68, AT consolidated text, accessed 2026-11-02 and again on 2026-11-05 with the table of Decreto-Lei n.º 212/2026, https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx · AT leaflet "Criptoativos – Conceito fiscal e tributação", 2024-03, https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/Criptoativos.pdf · Ofício Circulado n.º 20269/2024, 2024-03-24, https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Oficio_Circulado_20269_2024.pdf · PIV 28969, 2025-10-31, https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/cirs/Documents/PIV_28969.pdf · PIV 29052, 2025-12-04, https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/cirs/Documents/PIV_29052.pdf · Lei n.º 26/2026, DR n.º 107/2026 Série I, 2026-06-03, https://files.diariodarepublica.pt/1s/2026/06/10700/0001000066.pdf · Lei n.º 24-D/2022 (art. 220), DR n.º 251/2022 Série I, 2.º supplement, 2022-12-30, accessed 2026-11-04, https://files.diariodarepublica.pt/1s/2022/12/25102/0009000377.pdf · Código do Imposto do Selo art. 1, 4, 6 and the Tabela Geral (verba 1.2), AT consolidated text, accessed 2026-11-04, https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/selo/Pages/selo1.aspx (and selo4, selo6, ccod-selo-tabgiselo) · Lei n.º 64-B/2026, DR n.º 205/2026 Série I, supplement, 2026-10-22, https://files.diariodarepublica.pt/1s/2026/10/20501/0000400004.pdf · Decreto-Lei n.º 212/2026, DR n.º 214/2026 Série I, pages 5–6, 2026-11-04, accessed 2026-11-05, https://files.diariodarepublica.pt/1s/2026/11/21400/0000500006.pdf · Comunicado do Conselho de Ministros, 2026-10-29, accessed 2026-11-02, https://portugal.gov.pt/gc25/governo/comunicados-do-conselho-de-ministros/comunicado-do-conselho-de-ministros-de-29-de-outubro-de-2026 · Presidência da República, note of 2026-11-02, accessed 2026-11-02, https://www.presidencia.pt/atualidade/toda-a-atualidade/2026/11/presidente-da-republica-promulga-dois-diplomas-do-governo/ · KPMG Portugal on the OE2027 proposal, 2026-10 (medium) |

### 7.7 Germany (DE) — confidence high for 2026, medium for 2027 · ships in M1

| Field | Value |
|---|---|
| Identity | EUR · de-DE · `1.234.567,89` · `16.10.2026` · Europe/Berlin, Europe/Busingen · Bundesministerium der Finanzen (policy and BMF-Schreiben), Bundeszentralamt für Steuern (DAC8), the local Finanzamt, filing via ELSTER · tax year = calendar year · return for 2026 due 2027-07-31 (with an adviser 2028-02-29) |
| Classification | Private Veräußerungsgeschäft, § 23(1) sentence 1 no. 2 EStG, taxed at the personal progressive rate (not Abgeltungsteuer) · staking and lending rewards § 22 no. 3 EStG · administrative basis BMF-Schreiben of 2025-03-06 "Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte" · BFH judgment of 2023-02-14, IX R 3/22 |
| Computation model | per-lot |
| Taxable events | sale-to-fiat: yes when 1 year or less between acquisition and sale; tax-free after more than 1 year · crypto-to-crypto: yes (a disposal at market value and a new acquisition; a new holding period starts for the coin received) · crypto-to-stablecoin: yes (same) · spending: yes · own-wallet transfer: no (keep records so the holding period can be traced) · gift: no income tax; Schenkungsteuer may apply; the recipient steps into the giver's acquisition date and cost (§ 23(1) sentence 3) · staking/lending: yes, § 22 no. 3 income at receipt (Freigrenze EUR 256); passive staking or lending does **not** extend the holding period to 10 years (BMF 2022 and 2025) |
| Rates | personal progressive scale § 32a EStG for 2026: 0 % to EUR 12,348; 14 % rising to 42 % at EUR 69,879; 45 % from EUR 277,826; plus Solidaritätszuschlag 5.5 % of the income tax above EUR 20,350 (single) / 40,700 (joint) with a sliding zone; plus church tax 8–9 % where applicable (validFrom 2026-01-01) · proposed from 2027 for new acquisitions only: 25 % plus Soli (26.375 %) (draft, see pending) |
| Allowances | **Freigrenze EUR 1,000 per calendar year** on the total of all § 23 gains (crypto plus other private sales): at EUR 1,000 or more the entire amount is taxable (a cliff, not an allowance); in force since assessment year 2024 (previously EUR 600) · Freigrenze EUR 256 per year for § 22 no. 3 income · the Sparer-Pauschbetrag does not apply to § 23 gains today |
| Holding rule | `{ kind: 'years', years: 1, effect: 'exempt' }` (the in-app "tax-free from" line: wording pending the StBerG check, `docs/BENCHMARK.md` §4) — taxable only when "der Zeitraum zwischen Anschaffung und Veräußerung nicht mehr als ein Jahr beträgt"; the day of acquisition is excluded and the period ends on the corresponding calendar day 1 year later (§ 108 AO with §§ 187–188 BGB): bought 2026-03-15 → a sale on 2027-03-15 is still inside the year; from 2027-03-16 it is tax-free. "365 days" is wrong in leap years; the core's `years` rule (anniversary plus 1 day) is right |
| Holding-rule conditions | "A swap or a purchase paid in crypto starts a new holding period for the coins received." · "Gifts keep the giver's holding period." |
| Lot rule | `fifo`, `lotScope: per-venue` — "walletbezogene Betrachtung"; the BMF accepts FIFO or individual identification elected per wallet and per crypto-asset, applied consistently; average cost as the fallback (medium-high) |
| Losses | only against § 23 gains (not salary or capital income); carry-back 1 year, carry-forward unlimited within § 23; § 22 no. 3 losses only against § 22 no. 3 income |
| Reporting | the taxpayer bears the burden of proof; software tax reports accepted if plausible and consistent (BMF-Schreiben of 2025-03-06), as CMS 2025-06-26 holds it, the source the card links for reporting |
| Pending changes | **BMF Referentenentwurf of 2026-09-30, "Gesetz zur Reform der Besteuerung bestimmter Kryptowerte im Privatvermögen" — status: proposed.** "Tauschkryptowerte" (MiCA crypto-assets used as a means of exchange, e.g. BTC and ETH) acquired **after 2026-12-31** would become § 20 EStG capital income: 25 % plus Soli regardless of holding period; staking and lending rewards as § 20(1) no. 12-E; withholding by domestic providers from 2028-01-01; substitute base of 50 % of proceeds when the cost is unknown; e-money tokens, NFTs, security and RWA tokens excluded; pre-2027 holdings grandfathered under §§ 22/23. The cabinet slot of 2026-10-14 passed without a decision; the Bundestag rejected a Greens bill to abolish the holding period immediately on 2026-10-08 (445–132). If enacted, the profile gets `holdingRuleOverrides: [{ acquiredFrom: '2027-01-01', rule: { kind: 'none' } }]` and the card changes · 2027 tariff values (Grundfreibetrag) and Soli thresholds arrive with the annual tax law |
| summary60 | "Germany: crypto sold more than one year after purchase is tax-free. Sold within a year, the gain is taxed at your personal income-tax rate, and swaps and purchases with crypto count as sales. All such gains under EUR 1,000 per year are tax-free. First-in, first-out per wallet. A draft law would end the one-year rule for coins bought from 2027." |
| Caveats | the exact day count; the EUR 1,000 cliff; staking and lending (EUR 256 rule); the reform's cut-off and grandfathering (a draft, may change); losses; church tax; the records the Finanzamt expects |
| Decisive sources | § 23 EStG, § 22 EStG, § 32a EStG, gesetze-im-internet.de, accessed 2026-10-16 (§ 23 again on 2026-11-03), https://www.gesetze-im-internet.de/estg/__23.html (and __22, __32a) · § 3 SolZG 1995, https://www.gesetze-im-internet.de/solzg_1995/__3.html · BMF-Schreiben 2025-03-06, IV C 1 - S 2256/00042/064/043, https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte.html (server error on 2026-10-16; content via Forvis Mazars 2025 and CMS 2025-06-26, medium-high; the letter's PDF read on 2026-11-04, https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte-bmf-schreiben.pdf?__blob=publicationFile&v=2) · BMF-Schreiben 2022-05-10, IV C 1 - S 2256/19/10003 :001, accessed 2026-11-04, https://www.bundesfinanzministerium.de/Content/DE/Pressemitteilungen/Finanzpolitik/2022/05/2022-05-09-einzelfragen-zur-ertragsteuerrechtlichen-behandlung-von-virtuellen-waehrungen-und-von-sonstigen-token-bmf-schreiben.pdf?__blob=publicationFile&v=1 · BFH, Urteil of 2023-02-14, IX R 3/22, accessed 2026-11-04, https://www.bundesfinanzhof.de/en/entscheidungen/entscheidungen-online/decision-detail/STRE202310057/ · § 108 AO, §§ 187–188 BGB, gesetze-im-internet.de, accessed 2026-11-04, https://www.gesetze-im-internet.de/ao_1977/__108.html (and bgb/__187, bgb/__188) · PwC Germany on the Referentenentwurf, 2026-10-05, https://blogs.pwc.de/de/steuern-und-recht/article/257144/ · Grant Thornton, 2026-09-25, https://www.grantthornton.de/themen/2026/bmf-plant-reform-der-krypto-besteuerung/ · ETL, 2026-10-12, https://www.etl.de/aktuelles/kryptobesteuerung-soll-sich-ab-2027-aendern/ · Haufe on the DAC8-Umsetzungsgesetz, 2025-12-19, https://www.haufe.de/steuern/gesetzgebung-politik/dac8-umsetzungsgesetz_168_635554.html · the BMF draft PDF (to be read by the reviewer): https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/2026-09-30-Reform-Besteuerung-Kryptowerte-PV/1-Referentenentwurf.pdf |

### 7.8 Netherlands (NL) — confidence high

| Field | Value |
|---|---|
| Identity | EUR · nl-NL · `1.234.567,89` (`€ 1.234,56`) · `16-10-2026` · Europe/Amsterdam · Belastingdienst, https://www.belastingdienst.nl · tax year = calendar year · aangifte inkomstenbelasting due by the date in the aangiftebrief, often 1 May of the following year (extension to 1 September on request, with an aangiftebrief) |
| Classification | Box 3 (inkomen uit sparen en beleggen): crypto is an "overige bezitting"; a deemed (forfaitair) return on the value at 1 January is taxed, not the actual gain; the tegenbewijsregeling lets the taxpayer prove a lower actual return (which counts realised and unrealised changes, with no allowance) · box 1 only when activity exceeds normal asset management |
| Computation model | `wealth-snapshot`, date `01-01` |
| Taxable events | none of sale, swap, stablecoin swap, spending or own-wallet transfer is a taxable event; what matters is what is held on 1 January 00:00 · gifts and inheritance: schenk- or erfbelasting for the recipient · staking rewards: no separate tax under the forfait (they raise next year's value); direct return under the tegenbewijsregeling (the Belastingdienst pages the profile cites name neither staking nor airdrops, read 2026-11-05) |
| Rates | box 3 rate **36 %** on the deemed return · forfait for overige bezittingen **6.00 %** for 2026 (final; 2025: 5.88 %; 2024: 6.04 %), so the effective burden on crypto is about 2.16 % of the 1 January value above the allowance · 2027 (Belastingplan 2027, Kamerstuk 37022, pending): 36 %, forfait 6.37 % (Deloitte 2026-09-17); allowance at the bill's indexation, factor 1.01248 raised to 1.015548 by the third nota van wijziging (2026-11-04); the cabinet's 2026-09-29 cut to EUR 30,846 and +1.5 points on the forfait withdrawn 2026-11-03 |
| Allowances | heffingsvrij vermogen **EUR 59,357** per person for 2026, EUR 118,714 for fiscal partners (2025: EUR 57,684); the Belastingplan 2026 bill's EUR 51,396 and 7.78 % were removed by a Tweede Kamer amendment in November 2025 · no allowance under the tegenbewijsregeling · minors' crypto is attributed to the parents |
| Holding rule | `none` (no gains tax exists; "the Netherlands does not tax your sale; it taxes a deemed return on what you hold on 1 January") |
| Lot rule | `unspecified` (irrelevant under the forfait; under the tegenbewijsregeling the year's totals of purchases and sales plus the 1 January and 31 December values are needed, not lots) |
| Losses | no loss concept under the forfait; a negative actual return counts as EUR 0 with no carry-forward or carry-back; the box 3 bill as adopted by the Tweede Kamer (start proposed for 2029, 2028 if feasible, in the cabinet's letter of 2026-11-03) would allow carry-forward above a EUR 500 threshold |
| Reporting | tick "Cryptobezittingen" (from tax year 2025) and enter the 1 January value using the rate of the exchange used; inaccessible crypto can be valued at nil if proven · the return asks whether to report werkelijk rendement · DAC8: Wet implementatie EU-richtlijn gegevensuitwisseling cryptoactiva, Stb. 2026/79 (2026-04-10), effective from 2026-01-01; providers report to the Belastingdienst by 2027-01-31 for 2026; the Belastingdienst states no 1 January balances are delivered, so self-reporting stays · penalties: verzuimboete EUR 385 for late filing (medium), vergrijpboete up to 300 % for concealed box 3 assets, 12-year recovery for foreign assets |
| Pending changes | **Wet werkelijk rendement box 3**: adopted by the Tweede Kamer 2026-02-12 (Rijksoverheid timeline); the Eerste Kamer postponed its vote on 2026-06-30 pending a novelle; cabinet letters of 2026-09-15 and 2026-09-29 ("scenario 4": a realisation-based vermogenswinstbelasting for financial instruments from 2028 and all assets by 2030; heffingsvrij inkomen EUR 1,000); novelle to the Raad van State 2026-10-02; Eerste Kamer January 2027 at the earliest; start proposed for 2029-01-01, 2028-01-01 if feasible (letter of 2026-11-03); whether crypto counts as a "financial instrument" is not yet published · amendment sent to the Tweede Kamer 2026-11-03 (Rijksoverheid timeline): the vermogenswinstbelasting of the new box 3 system extends to all financial instruments, shares and tradable debt instruments such as bonds and options included · Belastingplan 2027 votes 2026-11-12 (TK), then the Eerste Kamer |
| summary60 | "Netherlands: selling, swapping, or spending crypto is not taxed. Your crypto's value on 1 January counts in box 3: in 2026 a deemed 6.00% of assets above EUR 59,357 per person is taxed at 36%. If what you actually made was lower, you can report that instead. A system taxing what you actually make is proposed for 2029." |
| Caveats | whether to use the tegenbewijsregeling (unrealised gains count); the 2027 allowance (which depends on the Belastingplan 2027) and forfait; the reform proposed for 2029 (2028 if feasible) and crypto's treatment under it; box 1 risk for very active traders; the valuation source at 1 January; DAC8 data matching |
| Product note | Dutch users get a "Value on 1 January <year>" line on Portfolio, for the current calendar year (built: the holdings at the start of 1 January are those at the end of 31 December of the year before, priced at the daily closes dated that day, the price at 00:00 UTC on 1 January, ADR-0036, shown only from a copy fetched at or after 00:10:30 UTC on 1 January, since CoinGecko serves that point from 00:10 UTC and caches its answer 30 s (ADR-0036's Readings of 2026-11-08); in the currency of the closes Portfolio loads, never stored; labelled as an estimate with the closes' date, the coins it covers and the credit, and with the past-performance line when the value chart above it shows none; `docs/CONTENT-STYLE.md` §3 words it, `docs/DOMAIN.md` §3.13 owns `snapshotValue`) and a snapshot export (1 January value, totals of purchases and sales, 31 December value) instead of a lot export: the 1 January units, then the year's purchases, `held` entries and sales, and the 31 December units, empty while the year runs (built 2026-11-08 on `taxYearSnapshot`, `docs/DOMAIN.md` §3.13). The file's value cells stay empty until the reference closes of `packages/data` exist (planned: M2), since no downloaded file holds values derived from CoinGecko data (ADR-0036 Readings, 2026-11-08); it names no box, rate, allowance or deadline |
| Decisive sources | Belastingdienst, "Moet ik aangifte doen en belasting betalen over mijn crypto's?", accessed 2026-10-16, https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/aangifte-doen-en-belasting-betalen-met-cryptos · Belastingdienst, "Wat is mijn werkelijk rendement?", https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/wat-is-mijn-werkelijk-rendement · Belastingdienst, "Box 3: uitleg en tarieven", https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_3/box_3 · Belastingdienst DAC8 page, https://www.belastingdienst.nl/wps/wcm/connect/nl/ondernemers/content/wet-implementatie-eu-richtlijn-gegevensuitwisseling-cryptoactiva · Eerste Kamer dossier 36.782, https://www.eerstekamer.nl/wetsvoorstel/36782_wet_implementatie_eu · Rijksoverheid, "Tijdlijn Wet werkelijk rendement box 3", latest entry 2026-11-03 (read 2026-11-05), https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting/plannen-werkelijk-rendement-box-3/tijdlijn-werkelijk-rendement-box-3 · Ministerie van Financiën, letter of 2026-11-03 (Kamerstuk 37053, nr. 5; read 2026-11-05), https://www.eerstekamer.nl/behandeling/20261103/brief_regering_aanbiedingsbrief/document3/f=/vn2boh2krkzv.pdf · Belastingdienst, "Wanneer moet mijn aangifte inkomstenbelasting binnen zijn?", accessed 2026-11-05, https://www.belastingdienst.nl/wps/wcm/connect/nl/belastingaangifte/content/wanneer-moet-ik-aangifte-doen · TaxLive dossier, updated 2026-10-06 (medium-high) · SRA, box 3 figures 2026, 2026-01-08 (medium) |

### 7.9 Spain (ES) — confidence high

| Field | Value |
|---|---|
| Identity | EUR · es-ES (also ca-ES, gl-ES, eu-ES) · `1.234.567,89` · `16/10/2026` · Europe/Madrid, Atlantic/Canary (Africa/Ceuta) · Agencia Estatal de Administración Tributaria, https://sede.agenciatributaria.gob.es (the Basque and Navarre foral haciendas have their own IRPF) · tax year = calendar year · Renta (Modelo D-100) for 2025: 8 April to 30 June 2026, set each year by order; Modelo 721 from 1 January to 31 March |
| Classification | ganancias y pérdidas patrimoniales in the savings base (art. 46(b) LIRPF); each type of coin is a distinct asset · professional trading or mining: economic activity · the regional wealth tax (Impuesto sobre el Patrimonio, 31 December value) and the temporary solidarity tax above EUR 3 million also exist |
| Computation model | per-lot |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: yes (a permuta, art. 37.1.h: gain against the higher of the market values of the coin given or received, which becomes the new cost) · crypto-to-stablecoin: yes · spending: yes · own-wallet transfer: no · gift: **the giver realises a taxable gain** (losses from gifts are not deductible, art. 33.5.c); the recipient pays regional ISD; inheritance: no IRPF gain for the deceased · staking/airdrop: depends (no AEAT page read covers them) |
| Rates | savings scale (state plus regional halves, identical): **19 %** to EUR 6,000; **21 %** to 50,000; **23 %** to 200,000; **27 %** to 300,000; **30 %** above 300,000, applied progressively to the whole savings base; validFrom 2025-01-01 (Ley 7/2024 added the 30 % bracket; 2024 top rate 28 %); unchanged for 2026 because no 2026 tax law passed · general base 19–47 % (up to about 54 % in some regions) for professional income |
| Allowances | none for crypto gains · Modelo 721 only when crypto held with a **foreign custodian** exceeds EUR 50,000 at 31 December (art. 42 quater RGAT); later returns once that balance has grown by more than EUR 20,000 since the last one filed; self-custody wallets excluded · wealth tax: state allowance EUR 700,000 plus EUR 300,000 main home, regions vary |
| Holding rule | `none` |
| Lot rule | `fifo` per type of coin (AEAT manual updated 2026-03-17); the TSJ del País Vasco (judgment of 2025-01-09, ECLI:ES:TSJPV:2025:41, a Bizkaia foral case, as reported by Cuatrecasas on 2025-02-28; text not fetched) held that FIFO is not mandatory for crypto; the AEAT manual still states FIFO. Working rule FIFO, dispute flagged |
| Losses | gains and losses from transfers netted within the savings base; a remaining negative balance offsets positive capital income up to 25 %; the rest carries forward 4 years (art. 49 LIRPF) · losses from platform insolvency only under art. 14.2.k conditions · losses from gifts not deductible |
| Reporting | Modelo D-100: a specific section for transfers and exchanges of virtual currencies; losses pending carry-forward in annex C · Modelo 721 (Orden HFP/886/2023) · Modelos 172/173 are filed by Spanish-resident providers, not individuals · **DAC8 not transposed**: the LGT reform bill 121/000060 (filed 2025-06-05, "Caducado" on the Congreso de los Diputados initiative page read 2026-11-05) lapsed when the Cortes were dissolved (RD 806/2026, BOE 2026-10-06, https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20742); foreign providers still report Spanish residents to their own member state, which exchanges with the AEAT · penalties LGT arts. 191 ff.: 50–150 % of unpaid tax plus interest (the former Modelo 720 "super-penalties" were struck down by the CJEU in 2022) |
| Pending changes | none (`pendingChanges` holds rule changes only) · caveat: "What changes after the election of 29 November 2026" · the watched facts: §7.12 |
| summary60 | "Spain: every sale, crypto-to-crypto swap, or payment with crypto is a taxable event. No holding-period exemption. Net gains are taxed in the savings base at 19 % to 30 %. First-in, first-out per coin. Losses offset gains and carry forward 4 years. Crypto held with a foreign custodian above EUR 50,000 must be reported on Modelo 721 by 31 March." |
| Caveats | the FIFO dispute; staking and airdrop classification; the 25 % cross-offset; gifts (the giver pays); regional wealth tax; Basque and Navarre foral rules; the pending DAC8 law; post-election changes |
| Decisive sources | AEAT, Manual práctico de Renta 2025, "Compra y venta de monedas virtuales", updated 2026-03-17, https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c11-ganancias-perdidas-patrimoniales/monedas-virtuales/compra-venta-monedas-virtuales-tributacion-inversor.html · AEAT manual, savings-base scale (gravamen estatal / autonómico) and integración y compensación pages (same manual) · AEAT, Modelo 721 FAQ and deadlines, https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-721-decla-sobre-monedas-extranjero/preguntas-frecuentes-sobre-modelo-721.html · BOE, RD 1065/2007 (RGAT) art. 42 quater, https://www.boe.es/buscar/act.php?id=BOE-A-2007-15984 · La Moncloa, election announcement, 2026-10-05, https://www.lamoncloa.gob.es/presidente/actividades/Paginas/2026/051026-sanchez-convocatoria-elecciones.aspx · Ministerio de Hacienda, prórroga PGE, 2025-12-23 · Cuatrecasas, "El TSJPV resuelve que el método FIFO no se aplica a criptomonedas", 2025-02-28, https://www.cuatrecasas.com/es/spain/fiscalidad/art/criptomonedas-metodo-fifo-hacienda-foral (medium; the judgment's text not fetched) · Congreso de los Diputados, initiative 121/000060 (proyecto de ley, presented 2025-06-05, "Caducado"), read 2026-11-05, https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura=XV&_iniciativas_id=121%2F000060 |

### 7.10 France (FR) — confidence high

| Field | Value |
|---|---|
| Identity | EUR · fr-FR · `1 234 567,89` (`1 234,56 €`, narrow no-break space) · `16/10/2026` · Europe/Paris plus overseas zones · Direction générale des Finances publiques, https://www.impots.gouv.fr, doctrine at https://bofip.impots.gouv.fr · tax year = calendar year · online declaration opens in April of the following year; the closing date differs by département (14 April 2026; online closing 21 May, 28 May or 4 June 2026 by département number; impots.gouv.fr calendrier fiscal 2026-04, https://www.impots.gouv.fr/particulier/calendrier-fiscal/2026-04, read 2026-11-05) |
| Classification | plus-values de cession d'actifs numériques, art. 150 VH bis CGI, for occasional disposals; since loi n° 2026-534 of 2026-06-25 (art. 91) the article covers only MiCA crypto-assets for disposals from 2026-01-01; NFTs under the new art. 150 VH ter · activity like a professional one: BNC; commercial activity: BIC |
| Computation model | **`portfolio-wide`**: for each taxable cession, gain = cession price − (total acquisition price of the whole portfolio × cession price ÷ global value of the whole portfolio immediately before the cession); fractions used in earlier cessions reduce the total acquisition price; fees reduce the cession price. The app cannot flag a lot as exempt; form 2086 asks for the estimated global portfolio value at each sale; what the export carries: the Product note |
| Taxable events | sale-to-fiat: yes · crypto-to-crypto: **no, deferred** (sursis; an exchange with a cash balancing payment is taxable) · crypto-to-stablecoin: no, deferred like any swap (I-3898, adopted 2026-10-16 in a bill rejected 2026-11-04) · spending: yes · own-wallet transfer: no · gift: not a cession à titre onéreux; gift and inheritance duties apply · staking/airdrop: mining and staking rewards are BNC (FAQ); airdrops not addressed by the FAQ |
| Rates | **PFU 31.4 %** = 12.8 % income tax + 18.6 % social levies (CSG 10.6 % after the LFSS 2026, CRDS 0.5 %, prélèvement de solidarité 7.5 %), validFrom 2025-01-01 (LOI n° 2025-1403 du 30 décembre 2025, art. 12, read on Légifrance on 2026-11-05: « A compter de l'imposition des revenus de l'année 2025 »; the social levies were 17.2 % and the flat total 30 % before, BOI-RPPM-PVBMC-30-30 § 10; the card's note holds only the FAQ's split and option) · irrevocable yearly option for the progressive scale instead of the 12.8 % (BOI-RPPM-PVBMC-30-30 § 15: exercised for all the year's gains, irrevocable; the FAQ: box 3CN, « Cette option est définitive ») · CEHR 3 %/4 % and the CDHR 20 % floor for high incomes |
| Allowances | **EUR 305** threshold (art. 150 VH bis II B; BOI-RPPM-PVBMC-30-10 § 90) on the household's total gross disposal prices (not gains) of taxable cessions in the year, excluding deferred swaps: at or below it, all gains are exempt; above it, everything is taxable from the first euro (a cliff; not indexed since 2019); PLF 2027 amendments to raise it were not supported (named by ORWL Avocats, 2026-10-16) |
| Holding rule | `none` |
| Lot rule | `unspecified` (no lots; see the computation model); a per-asset weighted-average cost method was in I-3898, adopted 2026-10-16 in a bill rejected 2026-11-04 |
| Losses | a loss offsets only gains of the same nature in the same year (art. 150 VH bis IV); no carry-forward (a 10-year carry-forward amendment was rejected on 2026-10-16, named by ORWL Avocats, 2026-10-16) |
| Reporting | form 2042 C boxes 3AN (gain), 3BN (loss), 3CN (progressive option) · **annexe 2086** listing every taxable cession (date, global portfolio value, cession price, fees, total acquisition price, fractions already used) · **3916 / 3916-bis** for every account opened, held, used or closed abroad (foreign exchanges), each year with the income return (BOI-RPPM-PVBMC-30-30 § 70): EUR 750 per undeclared account, EUR 125 per omission, at most EUR 10,000 per return; EUR 1,500 and EUR 250 when the accounts exceed EUR 50,000 at any time in the year (art. 1736 X CGI, § 80); loi 2026-534 extended this to wallet references |
| Pending changes | **PLF 2027** (n° 3210, filed 2026-10-01) rejected by the Assemblée nationale on 2026-11-04 (T.A. n° 362, AN dossier, read 2026-11-05); amendment I-3898 had been adopted on 2026-10-16 (AN amendment page https://www.assemblee-nationale.fr/dyn/17/amendements/3210A/AN/3898) · other amendments to the bill, named by ORWL Avocats, 2026-10-16: an exit tax on crypto, a self-hosted wallet declaration, a personal wealth-type tax including crypto · a BOFiP update for the MiCA scope (the BOI-RPPM-PVBMC-30 series still shows the 2019 text) |
| summary60 | "France: selling crypto for euros or paying with crypto is taxable; swapping one crypto for another is not. Gains are taxed at a flat 31.4 %, or at your progressive rate on request. If your household's sales in a year total EUR 305 or less, nothing is due. Gains are computed on your whole portfolio, not per coin." |
| Caveats | the portfolio-wide formula (the value of all holdings at each sale); the EUR 305 cliff; losses same-year only; foreign-platform declarations and their penalties; staking and airdrops; CEHR and CDHR; the PLF 2027 measures (not law yet) |
| Product note | the French tax-year export (built 2026-11-08 on `taxYearCessions`, `docs/DOMAIN.md` §3.13) lists each sale in the log as a block: a holding row per coin held just before it, then the sale row with the date, the proceeds and the fee as logged and the sums of the purchases and costed `held` entries logged before it, never reduced by earlier sales. The estimated global portfolio value form 2086 asks for fills only when the coin sold was the only coin held: the file holds no market price but the sale's own, since no downloaded file holds values derived from CoinGecko data (ADR-0036 Readings, 2026-11-08), until the reference closes of `packages/data` exist (planned: M2). It computes nothing from line 221 on (no fraction, net cost, gain or EUR 305 test, §1) and names no form line |
| Decisive sources | impots.gouv.fr, "Comment déclarer les plus ou moins-values sur cessions d'actifs numériques ?", modified 2026-07-17, https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques · BOFiP BOI-RPPM-PVBMC-30-10, -20, -30 (2019-09-02; -30 also 2024-04-23), https://bofip.impots.gouv.fr/doctrine/pgp/11967-PGP · DGFiP formulaire 2086 for gains made in 2025, https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf · Assemblée nationale, PLF 2027 dossier, read 2026-11-05, https://www.assemblee-nationale.fr/dyn/17/dossiers/PLF_2027 · CMS Francis Lefebvre on loi 2026-534, 2026-06-10, https://cms.law/fr/fra/legal-updates/loi-fraudes-plusieurs-mesures-concernent-les-crypto-actifs · ORWL Avocats on the PLF 2027 amendments, 2026-10-16, https://www.orwl.fr/plf-2027-et-cryptos-ce-que-le-budget-pourrait-changer-pour-vos-impots/ · Légifrance, LOI n° 2025-1403 du 30 décembre 2025 de financement de la sécurité sociale pour 2026, art. 12, read 2026-11-05, https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000053226452 · DLA Piper on the LFSS 2026 CSG rise, 2026-01 (medium, the secondary that reported the rise) · Légifrance, loi n° 2026-103 du 19 février 2026 de finances pour 2026 (identity only) |

### 7.11 Facts the review job watches first (IT, BE, IE, GB, US)

1. Italy: the 33 % rate and the crypto-only loss ring-fence (intergroup draft of 2026-09-24; DDL Bilancio 2027 by 2026-12-31).
2. Ireland: enactment of 31 % (Finance (No. 2) Act 2026, December 2026); Budget 2028 (October 2027).
3. Belgium: the 2027 indexed exemption, the assessment-year-2027 return codes, further circulars on crypto valuation and loss categories, constitutional challenges.
4. US: the end of Notice 2026-20 relief on 2026-12-31; first basis-bearing 1099-DA forms in early 2027; H.R. 10357 (named by Decrypt via Yahoo Finance, 2026-09-15) and S. 2207 (named by NTU Foundation, 2025-08-13), texts not fetched; 2027 thresholds.
5. UK: Finance Bill 2026-27's passage (the loans and liquidity pools measure, in effect from 2027-04-06 once enacted); SA108 2026/27; first CARF data by 2027-05-31.

Open items the first review run must close: the text of Belgian circular 2026/C/74; the outcome of the US House markup; the official UK Autumn Budget 2025 overview document; the Gazzetta Ufficiale article text for L. 207/2024 c. 28 and 29.

### 7.12 Facts the review job watches first (PT, DE, NL, ES, FR)

1. Germany: the end of the one-year holding period for new purchases (BMF draft of 2026-09-30; cabinet decision, Bundestag and Bundesrat readings, the final cut-off date, whether grandfathering survives). If enacted, the profile gets a holding-rule override by acquisition date.
2. France: PLF 2027 rejected by the Assemblée nationale on 2026-11-04 (T.A. n° 362); the Senate's reading and any new budget text.
3. Netherlands: the 2027 allowance and forfait: the Tweede Kamer vote on the Belastingplan 2027 (2026-11-12, Rijksoverheid), then the Eerste Kamer; the werkelijk-rendement novelle in the Eerste Kamer (January 2027 at the earliest); whether crypto is taxed on realised or unrealised gains in the box 3 reform proposed for 2029-01-01, 2028-01-01 if feasible (letter of 2026-11-03).
4. Spain: post-election legislation (election 2026-11-29; the lapsed DAC8/LGT bill and Modelo 175; a 2027 budget); the FIFO dispute.
5. Portugal: the OE2027 final text (votes from 2026-10-27 to late November 2026); the "Lower rates in six IRS brackets" (Decreto-Lei n.º 212/2026 of 2026-11-04 under Lei n.º 64-B/2026, in force 2026-11-05, for 2026 income from 2026-01-01): the AT's withholding tables and guidance that apply it, and the 2027 assessment of 2026 income under the new scale; AT positions on holding periods across swaps (PIV 28969 and successors); the first DAC8 reports by 2027-05-31 and any guidance on Anexo G versus J for foreign platforms.

Also watched: Germany's 2027 tariff values and Soli thresholds; the Dutch 2027 bank-deposit and debt percentages; the EU's first DAC8 exchange by 2027-09-30.

Verification queue for the first human review (gaps left by the research budget): read the BMF Referentenentwurf PDF directly (the BMF site returned an error on 2026-10-16 and 2026-10-17), then add it to `packages/content/jurisdictions/de.json`'s sources with the day it was read (until then the profile cites the secondary sources that carry its content; the BMF-Schreiben of 2025-03-06 is in those sources since #325, read on 2026-11-04 for Rz. 62 and 63); read Lei n.º 73-A/2025 (OE2026) and cite it in place of the press report; confirm the Dutch verzuimboete amount for 2026; confirm the Portuguese RGIT fine ranges; confirm the Renta 2026 campaign dates when the AEAT publishes them; cite Council Directive (EU) 2023/2226 (DAC8) from EUR-Lex.
