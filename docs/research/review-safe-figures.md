# Review-safe figures: tying a text's figures to its data in any wording

Date: 2026-11-16. The design check behind the figures validator of #287: two blind designers and a judge, each with
a probe run on the same literal fixtures and on main's live files. Evidence, not a rule: `packages/content/README.md`
owns the validator's codes once they exist, and `docs/CONTENT-STYLE.md` §4 the house form of a bound.

## The question

A content review changes a template's or a Learn module's falls, facts and words (`docs/ENGINEERING.md` §2), so
main's pins of each fall and of the sentences that quote them fail a true review. The branch that removed them read
each percent of a text for a nearby coin. Its round 1 found two holes. The reader dropped every `more than N %` bound:
"Solana fell more than 98 %" passed against a row of 97. The reader read a figure written before its coin for the coin
named earlier, so true wordings failed: "Falls of 94 % and 82 % hit Ether, 89 % and 91 % hit Chainlink, …".

The question: which relation ties every figure a text states to its data, in any wording, without a word list, so a
review can change the words and the figures together and fails only when they disagree?

The cases, 51 in the judge's probe: must-fail ones (a fall that differs from its row, worded either way; a bound in a
dated sentence that the row does not meet; a swapped split; a chart row added with the text unchanged; facts f, m and
d moved with the text kept; a fall dated by one end) and must-pass ones (main's live files; figures before their
coins; fact c under its own heading; a pronoun; a review that changes data and text together). P1 is main's live
files. R1 to R6 move one datum (a template row, a chart row, facts f, m and d, a split), with the text kept (must
fail) or changed with it (must pass). X1 to X19, X3b, X12b and H4 are the judge's further wordings, glossed only where
the text needs the wording; the rest are listed in the judge's probe (#286, the design check of 2026-11-16). A fact's
letter is its key's in `packages/content/facts/education.json`. In the audit, A and B number each design's claims; C1,
C2 and Br1 are claims on both designs and on the earlier branch.

## Design A

Structure decides the reading, never wording: coin names (ticker, catalogue name, or a fixed table of unit names
such as `bitcoin` and `Ether`), the `{date:drawdowns.<COIN>.high}` and `.low` placeholders, the house bound forms
(`more than`, `less than`, `or more`, `or less`, a prose range), the sentence's years and the paragraph's dates. Two
readings, figures to the nearest coin on their left or on their right; a sentence passes if either is true. A dated
template sentence quotes its coin's fall; an undated one quotes a share; a module's exact figures match distinct chart
rows in the sentence's window and a bound's count matches the rows it holds for; fact quotes are taken out first. An
optional completeness check names a chart row no text states. Known hole: "Bitcoin fell 87 %, and 94 % hit Ether."
passes after ETH 2018 goes from 94 to 93, since the left reading gives 94 to Bitcoin. About 210 to 250 lines.

## Design B

One reading, fixed by the clause's order: a clause ends at `;` or `:` inside a sentence; if a coin is named before
the clause's first percentage, each figure takes the name before it, else the name after it; a clause naming no coin
continues the last coin named. A template sentence with one coin's placeholders quotes that coin's fall (both ends
present); a sentence with none quotes a split. Risk honestly's chart section (from `<Chart />` to the next heading)
quotes only the chart, with coverage (every row stated); elsewhere each sentence's figures come from one listed fact.
Only `more than N %` bounds: a whole percent more than N was more than N before rounding. As validator rules, not
tests, because the review skill would leave a failing test-only check to the owner. Known holes: a coin named without
a figure is not read; within one coin, figures are not paired to rows by year. About 200 to 230 lines.

## The judge's audit

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| B1 | Validator, because the skill's "not yours to satisfy" would leave a test-only check to the owner | Partly | The skill's lines 225-230 and CONTENT-OPS lines 84-90. Literally a relation test asserts no leaf's value, so "fix or revert anything else" applies; but its message prints the old figure beside the new one, the "both values" the carve-out asks for. Filed there, §8 step 4 (CONTENT-OPS lines 274-279) has the owner remove the assertion in a session PR: the risk is real and worse than B says. |
| B2 | The validator needs one clause in the skill and §3 | Partly | A validator code already falls under "fix or revert anything else" (the skill's line 225); the clause only removes the option to revert. |
| B3 | "All pass the content gate" covers the live files | Partly | The content test (lines 25-28) passes 16 files (coins, cycles, jurisdictions, templates), no facts and no modules; only the validate script (lines 33-56) passes facts and modules. |
| B4 | `more than` matches the module and LEGAL's plan-creation text | True | risk-honestly.mdx line 18; LEGAL line 88 ("more than 75 % from a high four times since 2011"). |
| B5 | Rounding argument | True | A row R ≥ N+1 means u ≥ N+0.5 > N; R = N allows u = N−0.5; the same for `less than`. |
| B6 | The check against fact a's unrounded values becomes unnecessary | True | Follows from B5. |
| B7 | B's P1 and review simulations | True | Ran B's probe: all as expected. |
| B8 | An undated fall breaks CONTENT-STYLE §1 rule 1 | Partly | Rule 1 asks a number that can change to carry its date; the high-and-low form is LEGAL §4 and ADR-0009. |
| B9 | cycles.mdx 7 problems, noise.mdx 2, cycles needs 3 extensions | True | With the union, the fact dates and counts read only beside a figure: cycles 0, noise 1. |
| B10 | B's list of holes | Partly | Also lets X2, X3b, X15, X16, X17 through, unlisted. |
| A1 | EDUCATION lines 51-52 write both bound forms | True, weak | It is the module's spec, not copy, and the inclusive form is not safe under rounding. |
| A2 | The unit-name table is "the asset-name list CONTENT-STYLE §2 already uses" | Partly | CONTENT-STYLE lines 158-160 list names in any case for the Portuguese imperative lint; it maps no name to a ticker and includes `crypto`; A's table is case-sensitive. |
| A3 | A skimmer pairs a figure with the nearest coin name (§1 rule 10) | Partly | Rule 10 says "write for the skimmer"; the pairing is A's inference. |
| A4 | §5 "always a window with its dates" | True | CONTENT-STYLE §5. |
| A5 | One form per meaning | Partly | True as meaning; inclusive forms and ranges are not safe under rounding. |
| A6 | A sentence ends at `.`, `!` or `?` before a space | Partly | §2 (line 161) ends it at a dot no digit follows, or a line end. |
| A7 | A's P1 and review simulations | True | Ran; identical to A's output. |
| A8 | Other modules | True | Ran under A's rule. |
| A9 | Removes the templates test's lines 121-156 and 183-189 | True | Pins at 121, lookup 134-146, verb list 148, `' fell '` count 183. |
| A10 | A's list of holes | Partly | Unlisted: R4 (fact m's "3 to 6 months" goes stale silently), X10, X14. |
| C1 | `oneLine` is not read | Partly moot | The templates test (line 86) refuses any percentage in a `oneLine`. |
| C2 | An undated fall equal to a coin's split passes | True | In A, B and J; it cannot be closed without reading words. |
| Br1 | The branch refuses a dated fact-cited figure and other bound words | True | `fallsQuoted` read the whole body, so 35.5 % had to equal a BTC chart fall. |

Line numbers are main's on 2026-11-16.

## Cases

Right verdicts on 51 cases: A 40, A with completeness 42, B 36, J 41. J's wrong verdicts are loud false failures with
a message naming the fix (a fact's figure in the chart section, `75 % or more` and `over 75 %`, a respectively list,
lowercase `eth`, X11's two windows in one clause, X13 a share in a dated sentence, X19 a comparison aside, H4 a
coinless split opening a paragraph) and one silent pass every design shares (counsel's share coincidence). Must-fail
cases J fails: the bound in a dated sentence (template and module), R1 to R6 with the text kept, X2, X3b, X7 to X10,
X12 (a chart row added), X14, X15 to X18. Must-pass cases J passes: P1, figures before their coins (module and
template), fact c under its own heading, R1 to R3 with the text changed, X1, X3, X5, X6, X12b.

## Decision: J, a merge of the two designs

1. Attribution: B's reading, fixed by the clause's order, plus three of A's checks (a dated template sentence reads its
   figures for the dated coin; a percentage naming no coin fails; a year sets the window a figure is matched in, and a
   bound names its years) and one new check, J1: every coin a clause names is given one of the clause's percentages.
   Not A's "pass if either reading is true": J1 refuses every true copy A's rule would add, and A's rule also lets X9
   ("Bitcoin fell 87 %, and 94 % hit Ether." after ETH 2018 goes from 94 to 93) and X10 through. Not B alone: it lets
   X2, X3b, X10, X15, X16 and X17 through. Of the must-fail cases, J lets through only counsel's share coincidence, as
   every design does.
2. A validator rule, not a test: `docs/ENGINEERING.md` §2 puts "a rule that holds for every file" in the validator; a
   test also risks being filed as an old-value assertion and removed (audit B1).
3. Bounds, in a chart section's figures and a template's fall only: `more than N %` or `less than N %`, with the
   clause's years and an optional count; there `over`, `at least`, `N % or more` and ranges read as exact figures and
   fail, naming the house form. A threshold elsewhere, such as Noise's "10 % or more in 7 days", falls under item 5,
   the fact rule.
4. Coverage, in a module whose front matter has `chart: drawdowns-bar`: every chart row is stated by an exact figure
   or counted by a bound (the only check that fails when a review adds a row, X12).
5. Fact quotes: the chart's section quotes only the chart; elsewhere in every module, each sentence's figures must be
   in the module's listed facts (their values, plus each fact's `date` written `d Mon yyyy`); counts and years are read
   only in a sentence that also has a date, money or a percentage. On main this passes risk-honestly, cycles,
   when-the-market-drops, start-here and taxes; noise.mdx fails one sentence (the red-day thresholds) until it lists
   `q.red-day-frequency`.
6. Templates: the rules read `explanation`; `oneLine` stays under main's no-percentage test. At most one coin's
   drawdown placeholders per sentence; with them, both ends, and every percentage is that coin's fall or a strict bound
   its fall meets; without them, every percentage names its coin and equals its share.

## The split

Each part is true on main by itself.

1. Part 1, branch `test/review-safe-facts`, re-cut from main on 2026-11-17 (#318's D1): `readAfterReview` in
   `packages/content/src/validate.ts` and its test `packages/content/src/draft-accessed.test.ts`, and main's tests
   minus only the pins a content review sets. An agent's draft may read its sources after its `lastReviewed`; once the
   owner signs the file off (`reviewedBy: owner`), accessed-after-review and `packages/content/src/facts.test.ts`
   refuse such a read day (`packages/content/README.md`). The pins that go are each module's and fact's
   `lastReviewed`, `nextReviewDue`, `reviewedBy` and `accessed`, k.de-2024's source and fact r's URL (D12), in
   `packages/content/src/taxes.test.ts`, `packages/content/src/drops-noise.test.ts` and
   `packages/content/src/risk-honestly.test.ts`; every other pin there is main's, each refusal and limit included.
   `packages/content/src/loaders/templates.test.ts` reads a drawdown's read day through `readAfterReview`, drops the
   Cycle plan's `lastReviewed` pin and keeps its other fields as its file holds them. Main's figure tests stay whole
   in `packages/content/src/cycles.test.ts` and `packages/content/src/template-dates.test.ts` (the Cycle plan's text
   as written); `packages/content/src/facts.test.ts` keeps each value against its `docs/EDUCATION.md` §9 row and f
   with neither ESMA nor the FCA named, and its pin of f's day (10 Oct 2025) becomes a leverage figure dated by a
   day; `apps/web/e2e/onboarding.spec.ts` stays as main has it. Until part 2 lands, a review that updates one of those figures fails the pin, as on main; a review
   that only moves its dates on passes.
   The earlier cut replaced main's pins with relations and restored them over three review rounds, since each
   relation let a review make a statement false while the suite passed (a reversed change, swapped tax years, a
   negated condition, an unsourced scam sign). The re-cut keeps main's pins instead. Its mutation run
   (2026-11-17), each change on a scratch copy and reverted: a leverage figure without its day, a month in place of
   the day, no dollar figure, ESMA or the FCA named, an owner's fact or template read after review, Taxes' examples
   reversed, swapped, negated or at another rate, fact r's publisher or the body's paper name changed, a chart
   added, a second past-performance line, an e.* fact's date or a sign's quote changed, a banned scam pattern, a
   cycles series or two coins' labels swapped: each red. Fact r's URL replaced alone passes, D12's accepted limit:
   the publisher and the body's "BIS Working Paper 1049" hold the paper, and `packages/content/src/facts.test.ts`
   holds the URL to the allow-list.
2. Part 2, the figures validator, the next session's first branch (#287): the validator, its wiring and fixtures, the
   content gate's extension, the CONTENT-STYLE §4 sentence and noise.mdx's key. It removes the pins and the verb
   list, in about 240 to 270 lines. The design note follows.
3. Part 3, tier 2 with a dry rehearsal: the review-content skill's clause, `docs/CONTENT-OPS.md` §3 step 3, and a §8
   step 4 note that a `figure-*` code is the text's to fix and never an assertion to remove. Until then the skill's
   "fix or revert anything else" already covers a `figure-*` code.

## Holes accepted

A template's undated fall equal to its coin's share; a true figure under false words (the copy review reads verbs);
"Bitcoin fell hard", once the verb list goes; figures in words, unknown aliases; a stale fact figure another listed
fact holds; the loud false failures above. The design ties neither LEGAL §4's plan-creation text nor the messages.

## Design note for part 2 (the validator), as the judge wrote it

Files: new `packages/content/src/figures-validate.ts` and its test (planned: M2); changed
`packages/content/src/validate.ts`, `packages/content/src/modules-validate.ts`, `packages/content/src/content.test.ts`,
`packages/content/src/risk-honestly.test.ts`, `packages/content/src/loaders/templates.test.ts`,
`packages/content/src/cycles.test.ts`, `packages/content/README.md` (the codes), `docs/CONTENT-STYLE.md` §4,
`packages/content/learn/noise.mdx` (add `q.red-day-frequency` to its facts).

Interfaces: `templateFigureProblems(path, t: { coins: { id, name }[]; split: Record<string, string>; drawdowns: {
coin, fall }[]; explanation: string }): Problem[]`, called from `template()` in the validator for English only
(`overlay-number-mismatch` ties the translations); `moduleFigureProblems(path, module: LearnModule, context: { chart:
{ coin, high, low, fall }[] | null; facts: { key, value, date }[] | null; catalogue: { id, name }[] | null }):
Problem[]`, called from `moduleProblems`; `validateContent` fills the context from `cycles/drawdowns.json`, the facts
file and the catalogue; a null skips the check. Codes: `figure-mismatch` (a template's figure), `figure-chart` (a
chart-section figure, bound, count or years), `figure-unstated` (a chart row no text states), `figure-unread` (J1),
`figure-fact` (a figure no listed fact holds).

Reader:

```
protect {date:…}: its dots end nothing; record {coin, end} for drawdowns.<COIN>.high|low
flatten U+00A0 and U+202F to spaces
paragraphs = blank-line blocks (a heading or list item is its own); sentences split after . ! ? + space; clauses split at ; and :
tokens in order: placeholder | date `d Mon yyyy` | bound `(more|less) than N %` | pct `−?N %` | money `[$€£]N[ billion|million]` | year 19xx/20xx | count | coin
coin(word): ticker (exact case), or the catalogue name or ETH's `ether` (any case, plural s and ’s/'s stripped); only coins in scope
attribute(clause, previous):
  no coin named → every figure → previous; last = previous
  lead = first name comes before the first percentage (or there is none)
  figure → lead ? (nearest name before ?? nearest after) : (nearest name after ?? nearest before); last = coin of the last name
  J1: the clause has a percentage and a named coin is given none → figure-unread
```

Templates (explanation; `previous` resets each paragraph):

```
D = coins of drawdowns placeholders in the sentence
|D| > 1 → mismatch (one fall to a sentence)
D = {X} and a percentage present → both X.high and X.low present, else mismatch
  each p: (coin(p) ?? X) must be X; exact p == X.fall; bound holds for X.fall
D = {} → each p: a bound → mismatch (a fall needs its row's dates); coin(p) null → mismatch; p ≠ split[coin] → mismatch
```

Module, when the front matter has `chart: drawdowns-bar` (chart section = from `<Chart />` to the next heading):

```
per clause, per coin C:
  own = C's chart rows (none → chart)
  window = no years: own; one Y: rows with year(high) ≤ Y ≤ year(low); else rows with year(high) ≥ min and year(low) ≤ max
  bound b: no years → chart; meeting = window rows b holds for
    with count n: n == |meeting|; without: meeting == window and is non-empty
    then mark the meeting rows stated
  no bound: each count == |window|
  exact p: a window row with fall == p not yet used in this clause → stated; else chart
  date or money → chart ("a fact's figure goes outside the chart's section")
  a percentage read for no coin → chart
afterwards: each unstated row → unstated
```

Fact rule, every module (idea, caveat, and the body outside the chart's section):

```
listed = figure tokens of the listed facts' values ∪ each fact's date written `d Mon yyyy`
per sentence: if it has a date, money or a percentage, read all its figures; otherwise read none of its counts or years
each figure ∉ listed → figure-fact
```

Tests to write first (must-fail fixtures through `validateContent` on literal files): templates: "Solana fell more
than 98 % from its high on {…SOL.high} to its low on {…SOL.low}." against a row of 97; "Ethereum went down 82 %."
against a row of 83; "Bitcoin fell 82 %" with ETH's placeholders; an ETH fall dated by one end; "A fall of 40 % can
come again." in a 40/30/15/15 split. Module: "Chainlink's drops were 88 % and 91 %."; "Solana fell more than 98 % from
2021 to 2022."; "Falls of 89 % and 91 % hit Chainlink and Ether."; "Bitcoin fell 87 %, and 94 % hit Ether." with ETH
2018 at 93; a BTC row of 54 added with the text unchanged; "4 falls of more than 75 %" with no years; "Ether fell 82 %
in 2018"; fact f at "$19.2 billion" with the text at "$19 billion"; fact m at "3 and 9 months" with the text at "3 to
6 months"; fact c's sentence inside the chart section. Must-pass guards: "Falls of 94 % and 82 % hit Ether, 89 % and
91 % hit Chainlink, and 97 % hit Solana."; "40 % to Bitcoin, 30 % to Ethereum, 15 % to Solana, and 15 % to
Chainlink."; "Falls of 97 % hit Solana from its high on … to its low on …"; the pronoun "It then fell 91 %."; fact c
under its own heading. Live half: the content test's gate also passes the facts file and the modules (two lines); the
module-gate test in the Risk honestly test passes the live chart and facts in its context.

Remove: the templates test's lines 122-133 (the fall pins), in 135-148 the `${fall} %` lookup and the two
`toContain('… fell …')` pins (keep the `readAfterReview` check of `accessed` as its own test), 150-158 (the verb
list), 185-191 (the `' fell '` count); the Risk honestly test's fact phrase pins (`25 Feb 2014`, `$19 billion`,
`3 and 6 months`, the 25 Feb Mt. Gox and CoinGlass sentences), the sentence regex and the pinned "Ether fell …"
sentence; the cycles test's cycles.mdx figure pins. Part 1 keeps every one of them as main has it. Line numbers are
part 1's branch on 2026-11-17.

CONTENT-STYLE §4 sentences: "In a module's chart section and in a template's fall, a sourced percentage is bounded only
as `more than N %` or `less than N %`, with its window's years (§5). A whole percent more than N was more than N before
rounding, while one shown as N % may have been less (77.6 % shows as 78 %). Every coin a clause names gets its own
figure, written next to it, and a template's fall shares its sentence only with its row's
`{date:drawdowns.<COIN>.high}` and `.low`."

Out of scope for part 2: the skill and CONTENT-OPS clause (part 3), the plan-creation text (LEGAL §4, versioned), the
messages' copy, reading words. If the content review guard in CI refuses the noise.mdx edit in a session PR, move that
line to its own PR before part 2.

## Amendments 1 to 5, 2026-11-17

A second judge read part 2's design against #318 before it was built; these amend the decision and the design note
above.

1. The kind comes first. A template sentence with one row's placeholders is a fall, one that names the amount is a
   share, and any other percentage fails. A bound is read only inside its kind: `more than N %` in a fall (D14 of
   #318) and none in a share; other comparison words and ranges fail. This amends J item 6, and it closes the hole "a
   template's undated fall equal to its coin's share" for a sentence that does not name the amount.
2. No coin crosses a sentence. J item 1 loses design B's "a clause naming no coin continues the last coin named". A
   clause made of a coin name joins the next clause, and a fall's placeholders name its coin. The must-pass guard "It
   then fell 91 %." becomes a must-fail.
3. No message prints a text to write (D17 of #318). Each detail names the figure, a template's datum where one exists,
   and its §4 rule, and a test writes each datum in and re-runs one step past it.
4. The Remove list above shrinks to the templates test's lines 122-133, 142-143 and 146-147, with `drawdown-coins` and
   a figure-free pin of two-coins' ETH dates. The verb list, the `' fell '` count, the cycles test, template-dates.test.ts
   and Risk honestly's pins stay, each for a mutation the validator passes (D13 of #318).
5. Part 2 becomes two PRs from main: the reader and the template rule (about 205 lines), then the module rules (about
   190 lines, removing no pin).

## Amendment 7, 2026-11-17

A template sentence that holds a percentage or a drawdown date passes only when it matches one of the closed shapes
CONTENT-STYLE §4 lists, as a whole. Anything else is `figure-form` when it holds a drawdown date and `figure-unclassed`
otherwise, and a new wording needs a new reviewed shape. A fall names its coin, so F1 takes no `It` (amendment 2). The
validator lands with main's template pins kept; a later PR removes a pin only with D13's mutation table.

This replaces amendment 6, the word lists a reader allowed around a figure, which never reached main: its second review
found wordings one step past those lists that the reader still passed (#334, D1). A shape matches the whole sentence, so
those wordings fail.

2026-11-17: the trigger that sends a sentence to the shapes is a closed set too. It is one of the four signs `%`, `٪`,
`﹪`, and `％`, or "per" and "cent" at the start of a word or right after a digit, joined by nothing, any space, U+002D,
U+2010, or U+2011, in any case and with nothing required after "cent". The second review of #334 found `15percent` and
`15-percentage-point` passing the earlier trigger (#340). The numeral condition on "percentage" is dropped, since no
live template holds "percent" or "percentage" (a search of the four templates on this date found none), so a bare
"percentage" now fails as `figure-unclassed`. The trigger also runs over the whole explanation, so a paragraph break
between "per" and "cent", which splits them into two sentences, does not hide them, and a single line break reads as a
space. A match that spans a paragraph break is `figure-unclassed`. The holes on record stay with the copy review
(`docs/LEGAL.md` §6 Q6): `pct`, `pc`, `‰`, `bps`, and `points`. So do "per" and "cent" joined by any other character,
such as an en dash, a minus sign, a soft hyphen, or a zero-width space.

2026-11-17: the checker and the onboarding template step read an explanation's paragraphs through one function,
`paragraphsOf` (`packages/content/src/paragraphs.ts`): a line holding only spaces, tabs, carriage returns or form
feeds ends a paragraph, and inside a paragraph each run of those characters and line feeds reads as one space, as CSS
shows it. Rounds 3 and 4 of #340 found wording hidden where the checker split paragraphs and the app did not.

2026-11-17: an explanation's percentage, English or translated, is the one token the app formats, `N %` with an
ordinary space, read by the shapes, the `percent-token` check and the template step from
`packages/content/src/percent-token.ts`. Before, the shapes took U+00A0, U+202F or nothing, which the app showed as
typed (#343).

## Amendment 8, 2026-11-17

The module rules are CONTENT-STYLE §4 R5 and R6 (`packages/content/src/module-figures.ts`), on closed shapes as the
templates' are (amendment 7). A judge read both designs of #349 and merged them. The chart's section is read on the page
the build's compiler gives, never on the MDX source a second time. A sentence there that holds a trigger (a number
character, a percentage, a number word, a month, a currency sign, or a coin the chart draws) passes only as B, a bound
on one coin's falls, or E, each coin's falls in the chart's order, as a whole. Anything else is `figure-chart`, and a
row no sentence states is `figure-unstated`. The page marks a paragraph's emphasis, strong, code spans, hard breaks,
text elements and removed hidden characters (`pageOf`'s `marks`), and the rule refuses a trigger beside any of them.
A figure meets `%` only through the joiners the app formats (`MODULE_PERCENT_JOINERS`). A translation's section fails
closed until its language has shapes. `pnpm validate:content` takes the root it reads as an argument, and a test runs
it on a copy with a chart row changed. The PR removes no pin.

R7 (`figure-fact`: the module's other figures, and the idea's and the caveat's, against its listed facts) moves after
M2. Its trigger was open. A date written "17 June 2025" or "June 17, 2025" passed it, and so did money written "USD 9
billion". A bound word other than "more than" and "less than", a fact's figure under the wrong coin or window, and a
count, a year or a figure in words passed it too. R7's PR names the date and money forms a module may hold and refuses
the rest; until then the copy review (`docs/LEGAL.md` §6) reads those figures.

Holes accepted with it:

1. A sentence with no trigger passes in any paragraph of the section: a hedge (`Or so it seems.`), a projection by
   pronoun (`It may fall that far again.`), a superlative without a coin. The copy review (`docs/LEGAL.md` §6 Q6)
   reads it.
2. `one`, `a`, `each`, `every`, `all`, `both`, `last`, `several`, `few`, `many`, `most`, a date or amount in words
   outside the lists (`last spring`, `dollars`) and Roman numerals in letters (`IX`) stay prose.
3. A catalogue coin the chart does not draw, named in a sentence with no other trigger, passes.
4. The lists are English: another language's number word or month inside an English module passes. A pt-PT
   section reads English's lists beside its own (hole 13), so an English word inside a pt-PT translation counts.
5. A true, weaker statement passes: a lower `N`, or a second bound over rows another bound counts.
6. A chart figure moved under the next heading leaves the section. Its rows get `figure-unstated`, and no rule reads
   the moved sentence until R7; the copy review (`docs/LEGAL.md` §6 Q6) does.
7. A translated chart section other than pt-PT's fails closed until its language's shapes land. pt-PT's B and E
   (CONTENT-STYLE §9) landed with the pt-PT Risk honestly on 2026-11-17.
8. A chart other than `drawdowns-bar` has no rows, so any figure in its section fails.
9. Loud false failures: any wording outside B and E (a label, a ticker, a verb in a later clause, `from 2011 to 2022`,
   years in E). Each needs a reviewed shape.
10. A mark or hidden character refuses its whole figure paragraph, and a refused sentence's coins also get
    `figure-unstated`.
11. The rows are whole (`drawdown-fall-not-whole`), so the rule compares exactly. A decimal row fails both checks.
12. In the Cycles list a figure moved to another line passes: no rule reads that list until R7's PR, and the cycles
    test holds only the 2017 line.

pt-PT's trigger and shapes, 2026-11-17 (D4 and D5, `packages/content/src/module-figures.ts`). The pt-PT trigger is
the union of English's lists and pt-PT's: `por cento`, joined by nothing, white space, U+002D, U+2010 or U+2011, in
any case, reported as 'a percentage sign or word'; the cardinals without `um` and `uma`, with `cem` and `cento`, the
hundreds as `(duz|trez|quatroc|quinh|seisc|setec|oitoc|novec)ent[oa]s`, `milhar`, `milhares`, `trilião`,
`triliões` and the singular and plural `dúzia`, `dezena` and `centena`; the Brazilian spellings `dezesseis`,
`dezessete`, `dezenove`, `bilhão` and `bilhões`, so a Brazilian slip counts too; the ordinal stems with o, a, os
or as; the months `janeiro` to `dezembro` and `jan fev abr mai jun jul ago set out nov dez` in any case, and `Mar`
only capitalised. B is `No gráfico, C teve K queda|quedas de mais de N J% entre Y e Y.`, E is `C1 caiu L.` or
`C1 caiu L`, any number of `, C L`, then ` e C L.`, with no comma before `e`; C is `a` and the catalogue name for every coin, `o ether` for
ETH, and C1 the same with its article capitalised, only to open E. Agreement is part of the shape: `A ether caiu`,
`o Solana` and `a Ether` fail, `a Ethereum` passes.

13. pt-PT's lists close only what they list: `um`, `uma`, `cada`, `todos`, `ambos`, `vários`, `alguns`, `muitos`,
    `poucos`, `último`, `meio`, `terço`, `década`, a date or amount in words outside the lists (`no verão passado`,
    `dólares`), lowercase `mar` and `sol` (the ticker kind is case-sensitive) stay prose, as hole 2's English words
    do.
14. Loud false failures in pt-PT: `segundo` ('according to'), `metade` and `primeira` trigger and fail outside B and
    E, so a section writes `de acordo com`; a capitalised `Mar` at a sentence's start fails («Mar e montanha»).
