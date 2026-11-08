# ADR-0008: EU-first, worldwide-ready; i18n wired from day one

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session · Amended by ADR-0041 (pt-PT and German ship with the launch in M2, not in M3)

## Context

The audience is European first (Portugal, Germany), not American: euros, comma decimals, day-month
dates, holding-period rules that differ per country, and languages other than English. Retrofitting
i18n and country formats into an English-only, dot-decimal app is the classic expensive rewrite.

## Options considered

1. **English and en-US formats at launch, i18n later.** Fastest; every string and every number and
   date format has to be revisited; the prototype's `en-GB`/`en-IE` formatting was already a patch.
2. **Full translation at launch.** Delays launch for content that will change weekly in the first
   months.
3. **English UI at launch, i18n infrastructure from day one**: every string externalised, number and
   date formatting driven by the user's country profile (an English UI can show `1 234,56 €` and
   `16/10/2026` for a Portuguese user), pt-PT and German next (M3), more by demand.

## Decision

Option 3. The library is ADR-0023. Country-specific content lives in `packages/content` as versioned,
dated, sourced data with a "last reviewed" field (ADR-0014, ADR-0031). The language suggestion follows
the country's main locale but is a separate, changeable setting.

## Consequences

- No string literal in a component; a lint rule flags user-visible literals outside the message files.
- Formatting is one layer at the edge (`apps/web/lib/format`) that takes decimal strings from the core
  and the country profile's locales; the core never formats.
- Pluralisation and ICU messages from the start (months, buys, entries).
- Date inputs show the country's format; numeric inputs accept the country's decimal separator
  (ADR-0034).
- Translators get context: each message key carries a description.

## Disagreement

None.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Consequences, second bullet: "(`apps/web/lib/format`)".** The formatting layer is
  `packages/app/src/lib/format` (ADR-0032, `docs/ARCHITECTURE.md`); `apps/web/lib` has no format
  folder.
- **Consequences, last bullet: "each message key carries a description".** No message key carries a
  description: the message files hold plain strings, and the merge tool's `MessageTree`
  (`tools/messages/merge.ts`) allows only strings as leaves.
- **2026-10-20, Options considered, option 3: "`16/10/2026` for a Portuguese user".** The product
  never shows an all-numeric date: a date in copy is the day, the month's name and the year in the UI
  language (ADR-0023, corrections of 2026-10-20; `dateOptions` in
  `packages/app/src/lib/format/time.ts`), so a Portuguese user of the English UI reads `16 Oct 2026`.
