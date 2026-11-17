# Grouped figures: how a comma-decimal profile writes 20 350

Date: 2026-11-16. The unanchored design check behind ADR-0057's Corrections entry of that day on grouped figures,
run for #287: two blind designers (neither saw `packages/content/src/i18n/overlay-validate.ts`, ADR-0057 or the
overlays), then a judge who read everything and tested every stated reason against the code, Intl (Node 24.20,
ICU 78.3) and probes. Evidence, not a rule: `docs/CONTENT-STYLE.md` §4 owns the rule. File and line references are
the code of that day.

## The questions

- Q1: in a profile text whose page formats numbers with a comma decimal (de-DE, nl-NL, it-IT, es-ES), how is a
  grouped figure (money or a count of 1000 or more) written, in English and in its pt-PT translation, beside a
  comma-decimal percentage (D8): (a) the English grouping `EUR 20,350`, as the files wrote it, (b) the page's
  grouping `EUR 20.350`, (c) no group separator, or a variant? Can a reader misread a comma in two roles (nl
  `card.summary60` "a deemed 6,00% of assets above EUR 59,357"; de `5,5 %` beside `EUR 20,350`)?
- Q2: in a comma-decimal translation, how is a point followed by exactly three digits read: a thousands group
  (`1.000`), a citation that keeps its point (`art. 33.100`, `Quadro 9.4`) or an English decimal (`0.125 BTC`)?

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

- Q1, English, on the comma-decimal pages (de, es, fr, it, nl, pt): B's variant. A figure of 10 000 or more puts a
  no-break space between its groups of three; a smaller one takes none: `EUR 1000`, `EUR 20 350`, `EUR 59 357`.
  Identifiers stay plain. GB, IE, US and XX are unchanged (`£37,700`).
- Q1, pt-PT: the translation copies the English figure character for character.
- Q2, both texts of a comma-decimal profile: a comma is always the decimal (`2,5`, `0,125 BTC`, `12,2–48 %`);
  U+00A0 is the only group mark; a point is only a citation's, compared as written (`art. 33.1`, `Quadro 9.4`,
  `§3.2.1`); `1.000` is never a thousand and is a finding; a money range is written `EUR 1000 to EUR 2000`.
- Why not (b): it puts the English decimal mark where the group goes, so the point takes two roles and needs a
  list of citation words to tell them apart, and an English voice reads `20.350` as another value. Why not (a): it
  contradicts D8's comma decimal inside the same card. Why B: each mark keeps one role, and no reader of either
  convention gets another value.
- It reverses ADR-0057's "What validation holds" (`1,000` in Germany's file) and the D8 Corrections entry's English
  reading of other figures, for these pages.

## Reasons tested (the judge's table)

| Reason | Verdict | Evidence |
|---|---|---|
| A1: the text already writes decimals in the page locale | Partly true | `percent-validate.ts:137-143` runs `decimalProblems`, but `PERCENT_RANGE` (:107-116) reads only percentages |
| A2 = B1: (a) is another value in the page locale | Verified | de-DE `format(20.35,{min 3})` = `20,350`; nl-NL `format(59.357)` = `59,357` |
| A3: `readNumber` misreads (a) | Verified | de, nl, es, it read `20,350` as 20.35, `1,000` as 1, `59.357` as 59357; `20 350` is refused (not misread) there and read as 20350 in pt-PT |
| A4: under (b) the card matches the screen | Verified | nl-NL money = `€ 59.357,00`; `log-row.tsx:142` opens taxes-where-you-live, whose sheet leads with `PlanCountryCard` (`module-sheet.tsx:80`) |
| A5: nothing corrects the figure at render | Verified | `countries.ts:91` passes `profile.card` through; `country-card.tsx` prints the strings |
| A: es-ES and it-IT write 6000 and 2000 | Verified | it-IT `1000 / 2000 / 6000 / 20.350` |
| A: 22 figures in 13 fields | Verified | DE 9, ES 8, NL 3, IT 2 |
| A/B5: en and pt-PT number locales equal | Verified | all ten profiles |
| A: pt-PT spacing adds a third way of writing numbers | Partly true | only beside (a); under B a screen has two, the app's format and the card's |
| A: Portugal gets `EUR 1000` and `EUR 59 357` | Partly true | Intl agrees, but pt.json holds no grouped figure |
| A: no three-digit citation exists | Verified | inventory: 49.1, 37.1.h, 33.x, 6.4, 66.1, §3.2.x, 9.4 |
| A: a citation always follows its citation word | Partly true | true in the comma profiles; gb also uses box, boxes, paragraph |
| A: `1.125 BTC` reads as 1125 | Verified | de-DE reading |
| B2: `59.357` is en-GB's decimal | Verified | the group/decimal clash holds only if non-percent decimals stay English; (b) leaves a group/citation clash instead |
| B3: (b) is not one rule | Verified | es 6000 but 50.000; de 1.000; pt groups with U+00A0 |
| B4: U+00A0 is no locale's decimal | Verified | `decimalSeparator` returns `.` or `,`; pt-PT's group is U+00A0, fr-FR's U+202F |
| B6: (c) hard to skim | True (judgment) | `EUR 200000 … 300000` |
| B7: `5,5 %` and `EUR 20,350` adjacent | Partly true | same `<li>`, the validity line between (:136-148) |
| B cost: summary word count | Verified | es 60 to 61 words; nl 58 to 59 (passes) |
| B precondition: numerals in English | Words exist | de "one year", "ten years"; pt "five years", "six IRS brackets": not needed here, a separate §4 finding |
| B Q2: today's check misses four cases | Verified | passes `EUR 1000` vs `EUR 1.000`, `33.1` vs `33.10`, `9.4` vs `9,4`, `0,125` vs `0.125`; fails an identical `art. 33.100`; the prototype reading fixes all five with 0 new mismatches on the pt and xx overlays |
| Both: §4's "1,234 in Portugal" | False | Intl pt-PT writes `1234` |

The translation check of that day already refused (a): de-DE read `EUR 20,350` as 20.35.

## The live English defect

On 13 fields: nl `card.summary60` put `6,00%` beside `EUR 59,357` in one sentence; de `card.rates.1` put `5,5 %`
above `EUR 20,350` in one list item. Italy's card put `0,2%` beside `EUR 2,000`. On the de, es, it, and nl pages,
the Log screen under the sheet writes the comma as the decimal. A reader who applies the card's own decimal comma gets
a value a thousand times smaller (the amounts make that unlikely). Screen readers were not run: an English voice
reads (a) correctly, (b) as "twenty point three five zero", and may split B into two numbers, so audio does not
decide between the forms.

## Outside the question

The GB, IE, and US pt-PT overlays keep their page's number locale (`£37,700`), as D8 says; the owner confirms
it with D8 at the end of M2.
