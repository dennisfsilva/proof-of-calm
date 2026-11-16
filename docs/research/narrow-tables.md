# Narrow tables: when a table stacks its rows

Date: 2026-11-16. The design check behind the stacking tables of `docs/DESIGN.md` §8, decided without the owner
in the unattended M2 run and listed for confirmation at the end of M2 (the comment "Design check: the pt-PT tables'
layout (2026-11-16)" on #268). Evidence, not a rule: DESIGN §8 owns the behaviour.

## The question

pt-PT's dates keep their month names (`28 de fevereiro de 2027`, `docs/CONTENT-STYLE.md` §4). At 360 px, and at
390 px with 125 % text, the Log's two columns, Today's dates table and Portfolio's coin chart table are wider than
their box, so the € of the amounts ran past the viewport or scrolled out of sight. A first fix stored the columns'
width when it stacked a table and compared later boxes with it; its two reviews found that shorter rows never turned
the table back and that text which shrinks after the switch (a smaller text size, a web font narrower than its
fallback) left it stacked. A stored width goes stale with every input it depends on.

## Method

Two blind designers, neither shown the first fix, each built a prototype on main's `Table`, `ChartTable` and
`log-row` markup with the app's formatters (`28 de fevereiro de 2027`, `12 345,67 €`, `12,34567890 BTC`), its
stylesheet and Calm Sans with its fallback, and ran it with Playwright in Chromium and WebKit at android-small
(360 × 780), zoom-125 (390 × 844, a 20 px root) and a 1280 px window at 125 %. Both chose the same mechanism on
their own. Their prototypes, harnesses (`cases.mjs`, `harness.mjs`; `run.mjs`) and outputs (`out-final.txt`,
`results.txt`) stay in the session's sandbox folder `pt-tables-design-25c` (`a`, `b`), outside the repository.

## The mechanism

1. A probe inside the table's scroller: a zero-height, overflow-hidden block as wide as the box, holding a hidden
   one-line ruler of text in the table's type. One ResizeObserver watches the probe and the ruler, so the box's
   width, a rotation, the text size and a font that swaps in all reach it. Neither changes size when the table
   switches, so the check cannot loop.
2. The check, in one task before paint: remove `data-stacked`, compare the table's width with the probe's in
   sub-pixels, set `data-stacked` when the table is wider. It runs at mount, from the ResizeObserver, and from one
   MutationObserver on the table (rows, text, the detail rows' `hidden`, a nested `<details>`' `open`, a nested
   table's `data-stacked`, but not the table's own) and on an enclosing `<details>` (`open`). A chart's table view
   nested in a table's cell is `width: 0; min-width: 100%`: it adds nothing to the cell's min-content width, so its
   probe measures the cell and it stacks there (Holdings in pt-PT at 360 px: 442 px before, 328 px after, 2026-11-16).
   A table that is not rendered is skipped (`checkVisibility`, Safari 17.4; without it the check always runs).
3. The Table's tab stop (`scrolls`) comes from the same callback.
4. Stacked, only the cells (`th`, `td`) become blocks; the table, its row groups and rows keep their display, so the
   accessibility tree is the same in both layouts.

## Results

Designer A, every case in both engines and the three windows (`out-final.txt`), on the Log's markup at 360 px:
the box 328 px (350 px at zoom-125, 592 px rotated), and every row stacked or none:

| Case | Result |
|---|---|
| Short pt-PT dates, then long | side by side 0 of 6 rows, then stacked 6 of 6 |
| Long, then short | stacked 6 of 6, then side by side 0 of 6 |
| A long-dated row added, then removed | stacked 7 of 7, then 0 of 6 |
| Root 20, 16, then 20 px (zoom-125 box, 350 px) | stacked, side by side, stacked |
| 360 × 780, rotated to 780 × 360, back | stacked, side by side (592 px box), stacked |
| English (long dates, moves, the fixture) | side by side every time |
| pt-PT, then English | stacked, then side by side |
| A closed `<details>` (table 410.67 px in a 328 px box), opened | not checked while closed; stacked on opening |
| A fallback font, then a narrower web font (needs 333.20 then 312.59 px of 322.90) | stacked, then side by side |
| A fallback font, then a wider web font (needs 308.23 then 312.59 px of 310.41) | side by side, then stacked |

No clipped total, no page overflow and no error in any case; one or two ResizeObserver callbacks per change.

Designer B (`results.txt`), what each layout needs side by side against the box:

| Table, project | Needs | Box | Result |
|---|---|---|---|
| Log, pt-PT long dates, android-small | 359 px | 336 px | stacked, 4 of 4 totals under the date |
| Log, pt-PT long dates, zoom-125 | 399 px | 358 px | stacked |
| Log, English, both projects | fits | | side by side |
| Today's dates (strip), pt-PT, android-small / zoom-125 | 408 / 509 px | 328 / 350 px | stacked (3 cells cut before) |
| Portfolio's value table, pt-PT and English | fits | | side by side |
| Portfolio's coin table, pt-PT, android-small / zoom-125 | 385 / 481 px | 328 / 350 px | stacked |
| Portfolio's coin table, English, zoom-125 | 390 px | 350 px | stacked (it overflowed before) |

The old observer on the wrapper and the table, kept beside the check: 2 "ResizeObserver loop completed with
undelivered notifications" errors in Chromium and 3 in WebKit (one a `pageerror`) over a 420, 360, 420 px resize.
axe found no violation in either layout in both engines; the keyboard reached every row toggle with its ring.

Cost: about 480 B brotli at quality 11 (570 B at quality 3) on Today through `ChartTable`; no extra React render
for a switch; one extra table layout per change, only while stacked: the Log's 12 rows +0.6 ms (+3.4 ms at 4× CPU),
a 365-row chart table +8 ms (+37 ms at 4× CPU).

## Rejected

- A stored width: both failures of the first fix reproduce (shorter rows and a smaller text size stay stacked).
- Wrapping each row with flex: each row decides alone (1 of 7, 4 of 5, 3 of 4 rows stacked).
- A container query: a fixed threshold stacks pt-PT's short dates that fit, and English at 360 px.
- The font-loading event instead of the ruler: WebKit swaps the face in without `loadingdone`.
- Observing the scroller itself: the ResizeObserver loop error.

## Known limits

WebKit's table semantics are read from its source, not heard through VoiceOver: on the owner's physical-device
check. Portfolio's coin chart table already overflowed in English at 360 px (335 of 328 px) and now stacks there.
A table wider than its box even when stacked still scrolls in its region.
