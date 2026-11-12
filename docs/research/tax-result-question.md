# The tax-result question: counsel's question 14

Research date: **2026-11-12**. Scope: whether counsel's checklist asks of every copy change if it
computes a tax result, and the design check of the Taxes module that decided it (issue #24). The
question and its breach rule live in `docs/LEGAL.md` §6, and `docs/JURISDICTIONS.md` §1 points to it;
this file holds the evidence. Line references (`file:line`) are to main at commit fd98de32
(2026-11-12). Short names: log-row.tsx is `packages/app/src/features/log/components/log-row.tsx`,
transactions.ts is `packages/core/src/log/transactions.ts`, country-card.tsx is
`packages/app/src/features/learn/components/country-card.tsx`, and the k rows are in
`packages/content/facts/education.json`.

## 1. The gap

Counsel's perimeter read of the French and Dutch tax-year files (2026-11-08, issue #8, "Counsel's
perimeter read") ruled France's line 221 on outside `docs/JURISDICTIONS.md` §1: no fraction of
capital, no net cost, no gain, no total for the year, no EUR 305 test. It also recorded an open
point for the owner: `docs/LEGAL.md` §6 had no checklist question for "computes a tax result". The
checklist is the only list counsel asks of every string (`.claude/agents/counsel.md`), and none of
its 13 questions caught a gain, a fraction, a threshold or tax due. The rule lived only in documents
counsel does not ask about: JURISDICTIONS.md:14-15 ("never computes a tax bill"), DOMAIN.md:1319-1322
(§11, "no tax computation"), DOMAIN.md:916 (France's file), DOMAIN.md:992-994 (no header line names
a gain, a loss, tax due, a rate or an allowance) and JURISDICTIONS.md:520 (nothing from line 221 on).

## 2. Options

- (a) No question: rely on JURISDICTIONS §1 and the reviewers. Refused: counsel would still never be
  asked, which is the gap.
- (b) Question 14 as an ordinary finding the PR fixes. Refused: a figure that is filed cannot be
  recalled by a later PR.
- (c) Question 14 as a perimeter breach that blocks the merge. Chosen, with the wording of §4 below
  in place of the planner's closed list of what may stand.

## 3. The decision and its reasons

`docs/LEGAL.md` §6 gains question 14, and a finding on it is a perimeter breach that blocks the
merge, as all four designs and counsel hold. Three reasons:

1. It is the tax half of what the product is, as questions 1 to 5 and 12 are the advice and UK
   halves: JURISDICTIONS §1 ("never computes a tax bill"), DOMAIN §11 ("no tax computation") and the
   acknowledged "no financial or tax advice" of `docs/LEGAL.md` §4.
2. A figure that is filed cannot be recalled by a later PR.
3. A test or a formula run on one person's figures goes further than the holding date, which is
   already the open StBerG § 2(2) question (`docs/BENCHMARK.md` §4: "rechtliche Prüfung des
   Einzelfalls").

The refused kinds are the closed list, so a reviewer checks a figure against six kinds. The list of
what stands settles the edge cases without binding every other figure of the app (the Red day, the
plan totals, the simulator) to a list written for tax. Computing a refused kind would also need a
rate, allowance or threshold in the core's `CountryRulesSchema`, which holds none
(`packages/core/src/schema/country.ts` lines 28 to 52), so a tier-2 review of the core sees it too.
Not changed: `.claude/agents/counsel.md` reads §6 by number; the StBerG row of BENCHMARK §4 stays
open; no ADR is written, since LEGAL owns the question.

## 4. Where the wording comes from

The planner's wording was replaced. Its closed "Only these may stand" list refused Portfolio's P/L
(netted), invested, average cost and live value, and the generic profile's FIFO cost shares, all of
which its own coverage table passed (the audit's row 6). It had no clause for a sentence that only
claims a computation (counsel). The final text takes:

- blind 2's definition of a tax result (the six kinds) and its claim clause ("or say that Proof of
  Calm computes one");
- counsel's explicit Portfolio carve-out: value, invested, average cost and P/L, one formula in every
  country, beside no word that calls them taxable.

## 5. Coverage of what ships today

Every item passes.

| Item | Standing class | Where |
|---|---|---|
| The Log's `Tax-free from` / `Long-term rate from`; Plan's `Last buy tax-free`; the country change's row | holding date | log-row.tsx:131-139; transactions.ts:99; CONTENT-STYLE.md:117, :120, :210 |
| The sale warning ("Only 0.10 of the 0.15 BTC sold are past the holding rule … may be taxed"); sellable now | units past the date; no figure of tax | CONTENT-STYLE.md:153, :121 |
| The per-lot file: `cost_basis`, `fee`, `proceeds` shares; `eligible_from`, `past_holding_rule` | logged amounts shared under the Log's matching (FIFO under the generic profile's `unspecified`); holding date | DOMAIN.md:908-913 |
| The raw listing (GB `pooled`, US `specific`) | amounts as logged; no pool's cost | DOMAIN.md:927-946 |
| France's blocks: lines 211, 213, 214 as logged, line 212's parts, `price`, `value`, `estimated_portfolio_value`, `purchase_costs_to_date` | as logged; the sale's own price; values at it or at a dated close, named as an estimate; gross sums never reduced by sales; nothing from line 221 on | DOMAIN.md:916-919; JURISDICTIONS.md:520 |
| The Netherlands' snapshot (units on 1 January and 31 December, the year's sums, empty values) | units and amounts as logged and summed | DOMAIN.md:922-926 |
| Portfolio's `Value on 1 January` (NL) | a value at a dated close, worded "Estimate from the daily closes …" | CONTENT-STYLE.md:149 |
| Portfolio's value, invested, average cost and P/L | Portfolio's figures, one formula in every country | DOMAIN.md:361-383 |
| The country cards' rates and allowances; the Taxes module's dated examples | a country's rule as its card or a dated fact states it | country-card.tsx:110-127; the k rows |

## 6. What question 14 refuses

Refused if anyone builds them: France's line 221 on (the fraction of capital, the net cost, the
plus-value, the EUR 305 test), Germany's €1,000 Freigrenze test, a UK section 104 pool's cost or the
£3,000 exempt amount applied, a Dutch deemed return or allowance test, Irish or any other tax due, an
"estimated tax" line, a gain or loss column, and a country's allowance printed beside the person's
total.

## 7. The design check (2026-11-12)

Method: the planner's plan, three blind designers who had not seen it, a judge who walked people
along the app's defaults, a judge who audited every stated reason in the code and the documents, and
counsel; a reconciler checked every disputed claim at the line cited. The reports, posted on #24 the
same day:

- the planner's plan: https://github.com/dennisfsilva/proof-of-calm/issues/24#issuecomment-6837057923
- the blind designs: https://github.com/dennisfsilva/proof-of-calm/issues/24#issuecomment-6838994490
- the judges' reports: https://github.com/dennisfsilva/proof-of-calm/issues/24#issuecomment-6838995204
- the reconciled notes: https://github.com/dennisfsilva/proof-of-calm/issues/24#issuecomment-6838995851

| Decision | Verdict | The deciding reason |
|---|---|---|
| D1 · question 14 in LEGAL §6, a perimeter breach | changed (the wording; the decision stands) | The planner's closed list of what may stand refused Portfolio's figures and the generic profile's FIFO shares, which its own table passed, and had no clause for a claim; the refused kinds became the closed list (§3, §4). |
| D2 · what the Taxes module says the app computes | changed | Five of the planner's sentences claimed more than the code does: the module now says the app cannot check the rule's other conditions, calls the tax-year file "figures from your entries for one tax year", says the cards and the file keep the country's rule under a period of the person's own, lists what is not computed in one sentence with a corrected P/L sentence, and says a plan "follows the general profile's rule". |
| D3 · the no-break hyphen between a numeral and its unit | changed (the scope) | The rule and the `number-unit-hyphen` check of `pnpm validate:content` cover the profile text a screen shows now: a typographic profile change keeps the version and the review dates, CONTENT-OPS §1 reserves to the owner only a rule, figure, date or source, and deferring would put an ordinary hyphen on the module's own lead card (pt.json:81). |
| D4 · the review line | kept | A module is overdue from the day after its `nextReviewDue`, as `underReview` counts (`packages/core/src/reminders/reminders.ts` lines 58 to 63); all four designs agree. |
| D5 · the lead card and the list | kept, contract made exact | The plan's country card leads (the generic card on the generic profile or a country with no profile, none without a plan), because a body without its card reads as "no rules here"; the planner's matrix entry had no phase, so it seeded no plan. |
| D6 · the module's percentages | kept, mechanism corrected | The card prints the profile's percentages with the locale's joiner, so the body takes the page's joiner too; the planner's mechanism failed, since `moduleElements` returns the plain elements for every module without a chart. |
| D7 · the facts, the front matter and the delegated read | changed | Five facts, `k.ie-2026` out (its rate rests on a second source and lapses with the bill), each value trimmed to what the module quotes; `nextReviewDue` is 2027-01-01, the next quarterly full review, since a later date would show the page as fresher than the cards it leads. |
| D8 · the Log's Why? | changed (the placement) | The Why? stands right after the date as a standalone link with the 44 px target: DESIGN §6 exempts it from the target only inside a sentence, and the holding line is a status line, not the sentence of the planner's precedent. |
| D9 · the reading time | kept | It counts the module's own text (ADR-0048, CONTENT-STYLE §5); counting the card needs per-profile counts from `packages/content`, the screens reading the plan and an ADR-0048 deviation, so it goes to the owner as a carry-over (a 385-word body reads 2 min; Portugal's card adds about 1,070 words). |

## 8. False reasons

The reasons the check found false or partly false, with the line that shows it:

1. Passing the page's joiner to the Taxes view joins its body (false): `moduleElements` returns the
   plain elements for any module without a chart (body-elements.tsx:85-86).
2. The body writes `N %` with an ordinary space, as Cycles does (false): every shipped module writes
   a no-break space (Cycles 5, Noise 9, Risk honestly 6, When the market drops 10).
3. The module branch's matrix entry, a PT plan with no phase and a pattern of `Portugal` (false): an
   entry without a phase seeds no plan (matrix.spec.ts:189-193, :236), and the pattern matches
   several elements in strict mode.
4. "The £12,300 figure is suspect" (false): HMRC's page (updated 13 Apr 2026) lists £12,300 for 2022
   to 2023.
5. "#124 fixed one place and three were left" (false): #124 fixed two messages; four places were
   left, plus `pooledListed` and five profile strings.
6. Plan's inline parts line as the precedent for the Log's Why? (false): that Why? follows a
   sentence; the Log's date is a status line, which DESIGN §6 gives the 44 px target.
7. The closed "Only these may stand" list lets every shipped item pass (partly false): it refuses
   Portfolio's P/L, invested, average cost and live value, and the generic profile's FIFO shares.
8. Profile hyphens wait because profile text is the owner's review and fields are copied into files
   (partly false): CONTENT-OPS §1 reserves a rule, figure, date or source; only `lotRuleNote`
   reaches a file; pt.json:81 is on the module's lead card.
9. `nextReviewDue` is the read day plus 12 months (partly false): no reason was given; the research
   sets 3 months for this module, and the next full review is 2027-01-01.
10. "Both k.de and k.ie cite PDFs" (partly false): k.ie is not among the five; k.de is the only PDF,
    and its "from tax year 2024" is rated medium.
11. "No fact supports 'rules change yearly'" (partly false): the facts hold a change in each year
    from 2023 to 2026, 2025 only by k.it's threshold clause; the line still reads as a forecast.
12. The tax-year file is "one tax year of your entries, in the layout your plan's country profile
    sets" (partly false): the files list earlier entries, France's has no purchase rows, and no file
    has a form's layout.
13. The module test's "every figure is in its fact's value" beside a no-break `365-day` (partly
    false): k.pt-2023 writes an ordinary hyphen, so the test must read both hyphens as one character.
14. The hyphen branch's file list and its exemption key (partly false): it misses
    red-day-banner.spec.ts:75, and the key is `data.taxYear.file.*` in the settings feature's
    messages.
15. The planner's citations (partly false): the timeline label is CONTENT-STYLE.md:120, not :117;
    the P/L formula is DOMAIN.md:381-383, not CONTENT-STYLE:147; "#290" is archive#290.
16. Counting the card costs a change to learn-plugin.ts (partly false): the plugin stays below
    `packages/content` (its line 12) and cannot read the profiles; the count needs
    `packages/content`, the screens reading the plan and an ADR-0048 deviation.
17. `filingNote` is text a downloaded file copies (false): no app code reads it; only the schema and
    validate.ts:118 name it.
18. "P/L counts coins you still hold" (false): P/L adds the costed proceeds of sales
    (DOMAIN.md:381-383).
19. "Lot by lot in most countries" (partly false): GB and US get the raw listing, and FR and NL files
    of their own.
