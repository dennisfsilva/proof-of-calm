# Grouped figures: how a comma-decimal profile writes 20 350

Date: 2026-11-16. The unanchored design check behind ADR-0057's Corrections entry of that day on grouped figures,
run for #287: two blind designers (neither saw `packages/content/src/i18n/overlay-validate.ts`, ADR-0057 or the
overlays), then a judge who read everything and tested every stated reason against the code, Intl (Node 24.20,
ICU 78.3), and probes. Evidence, not a rule: `docs/CONTENT-STYLE.md` §4 owns the rule. File and line references are
the code of that day.

## The questions

- Q1: in a profile text whose page formats numbers with a comma decimal (de-DE, nl-NL, it-IT, es-ES), how is a
  grouped figure (money or a count of 1000 or more) written, in English and in its pt-PT translation, beside a
  comma-decimal percentage (D8): (a) the English grouping `EUR 20,350`, as the files wrote it, (b) the page's
  grouping `EUR 20.350`, (c) no group separator, or a variant? Can a reader misread a comma in two roles (nl
  `card.summary60` "a deemed 6,00% of assets above EUR 59,357"; de `5,5 %` beside `EUR 20,350`)?
- Q2: in a comma-decimal translation, how is a point followed by exactly three digits read: a thousands group
  (`1.000`), a citation that keeps its point (`art. 33.100`, `Quadro 9.4`), or an English decimal (`0.125 BTC`)?

## The designers

- A (lens: the reader) chose (b) for English and pt-PT alike, what `Intl.NumberFormat` writes in the page's
  locale (nl-NL and de-DE `EUR 59.357`, `EUR 1.000`; es-ES and it-IT `EUR 50.000` but `EUR 6000`, since they group
  only from five digits): the text already writes its decimals in that locale, the app's `readNumber` reads
  `20,350` as 20.35 there, and the card would match the app's own amounts (`€ 59.357,00`). Q2: `1.000` a group
  only where the page groups with a point, `33.100` a citation after its citation word, `0.125 BTC` written
  `0,125 BTC`.
- B (lens: the figures and the checker) chose a no-break space (U+00A0) between groups from five digits, none at
  four (`EUR 1000`, `EUR 20 350`), what Intl pt-PT returns; identifiers keep no group (`PIV 28969`, `Modelo 721`).
  Under (b) a point is both a group and a citation's (`EUR 1.125` and `1.125 BTC` share one shape); (b) is not one
  rule (es `6000` but `50.000`); U+00A0 is no locale's decimal mark; (c) is hard to skim at six digits. Cost: a
  summary splits on whitespace, so es `card.summary60` would count 61 words. Q2: a comma is always the decimal,
  U+00A0 the only group, a point kept as written, so a checker need not decide which figure is a citation.

## The judge's decision

- Q1, on the comma-decimal pages (de, es, fr, it, nl, pt): B's variant (`EUR 1000`, `EUR 20 350`), identifiers
  plain, and the pt-PT translation copies the English figure character for character. GB, IE, US, and XX are
  unchanged (`£37,700`).
- Q2, both texts of a comma-decimal profile: a comma is always the decimal (`0,125 BTC`) and U+00A0 the only group;
  a point is a citation's, compared as written; `1.000` is a finding; a money range reads `EUR 1000 to EUR 2000`.
- Why not (b): it puts the English decimal mark where the group goes, so the point takes two roles and needs a
  list of citation words to tell them apart, and an English voice reads `20.350` as another value. Why not (a): it
  contradicts D8's comma decimal inside the same card. Why B: each mark keeps one role, and no reader of either
  convention gets another value.

## Reasons tested

The judge tested 23 stated reasons. Verified: (a) is another value on these pages (de-DE `20,350` is 20.35, nl-NL
`59,357` is 59.357), `readNumber` misreads it and nothing corrects it at render; 22 figures in 13 fields (DE 9, ES 8,
NL 3, IT 2); (b) is not one rule (es `6000` but `50.000`); U+00A0 is no locale's decimal; B's cost (es
`card.summary60` 60 to 61 words). Partly true: decimals already follow the page (only percentages were read). False:
§4's "1,234 in Portugal" (Intl pt-PT writes `1234`).

## The live English defect

On 13 fields: nl `card.summary60` put `6,00%` beside `EUR 59,357`, de `card.rates.1` put `5,5 %` above `EUR 20,350`,
and Italy's card `0,2%` beside `EUR 2,000`; the Log screen under the sheet writes the comma as the decimal. A reader
who applies the card's own decimal comma gets a value a thousand times smaller. Screen readers were not run.

## The suggestion's design check (2026-11-17)

Four rounds each found a shape whose suggestion changed the value, so #318 ran a design check (D10 of #316):
designer A from the problem alone, B against 25l's closed list, then a judge. A suggested only where both readers,
English and the page's, read one value; B let English decide `EUR 20,350` in an English text. The judge kept A's
rule with B's structural readers (D6). B's English reading turned `EUR 1,125`, the comma decimal §4 asks for, into
1125, while the number check reads it as 1,125. 118 test rows and a 50 000-text fuzz against a separate regex reader
found no suggestion that changes a value.
