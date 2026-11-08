# ADR-0047: Disclosures at decision points

Status: Accepted · Date: 2026-10-19 · Deciders: the process session, on the owner's delegation

Supersedes the placement list of ADR-0011 (the eight places of `docs/LEGAL.md` §4 as written on
2026-10-16) and nothing else: ADR-0011's principle, honesty as part of the design, stands. The
evidence is in `docs/BENCHMARK.md`; this file holds the decision.

## Context

`docs/LEGAL.md` §4 placed a disclaimer in eight places: onboarding, the footer, the top of every Learn
module, above every template, on every jurisdiction card, on the Red day page, in every export and in
every reminder email. The research of 2026-10-19 (`docs/BENCHMARK.md` §1 to §3) found:

- No regime requires a risk warning from a product that provides none of MiCA's ten services
  (Regulation (EU) 2023/1114 Art. 2(1), 3(1)(16); ESMA Q&A 2882 of 2026-06-18; BaFin Merkblatt
  Anlageberatung of 2025-02-10). The warnings are a design choice, so their placement can follow the
  evidence on what people read.
- The FCA's risk-warning research (behaviourally informed warnings, read 2026-10-19) found a
  two-sentence plain warning with a "learn more" link raised comprehension by 6 to 10 points; 48 %
  opened the link; its decision-points research found salient information at the moment of decision
  did the work and checkboxes added nothing. Its regulation experiment found that calling
  cryptoassets "regulated" increased demand and false confidence.
- NN/g's eye tracking: anything styled like a banner gets 33 times fewer fixations and is avoided on
  later pages; users read at most 28 % of a page's words. Ben-Shahar and Schneider (The Regulatory
  Review, 2015-06-15): disclosure fails by clutter across disclosures; the cure is fewer, not plainer.
- The joint ESA warning of 2022-03-17 is the source of the "lose all invested money" sentence; the
  ESAs' factsheet of 2025-10-06 exists in PT, DE and EN as an official explainer to link.
- No competitor warns before each purchase. The calm ones (Moneybox, Scalable Capital, BISON) put one
  short sentence at the commitment point, in the product's own voice, and the long text in one
  document; the bloated ones (Bitpanda, Kraken) stack legal blocks.

## Options

1. Keep the eight placements. Compliant-looking; the warnings are skipped as banners and the app
   reads as a compliance form.
2. Four placements at decision points, with word budgets and the long text on the Risk page.
3. The legal pages only, as the self-custody apps do (Relai, Pocket, Strike). Honest about the law,
   but it drops the candour ADR-0011 promised.

## Decision

Option 2.

**The four placements** (`docs/LEGAL.md` §4 owns the texts):

| Decision point | Disclosure |
|---|---|
| Plan creation, one screen, acknowledged once | 40 to 50 words: what the software is and is not, the dated loss figures, a link to the Risk page |
| A template, before the user picks it | the risk label, then "A starting point some people use. You choose every setting. Not advice." |
| The first view of historic data (the Red day page, charts, the simulator) | one dated past-performance sentence under the figure |
| An export | one header line: generated from the user's own entries, not advice, check before tax use |

Removed: the per-module Learn line (the caveat box in every module stays; the Learn index, an app
screen, carries no site line), the jurisdiction-card sentence (folded into the card's date line),
the reminder-email footer sentence (the email names no market, coin or amount), the in-app footer
(the app shell has none; "Data and tools, not advice. Crypto-assets can lose all their value." lives
on site pages and in Settings → About).

**Style**: a disclosure is content, set in the same type and background as the sentences around it,
one or two sentences with a link to the Risk page; never a coloured bar at the top or bottom of a
screen, never a checkbox beyond the one acknowledgement at plan creation, never a modal. The Red day
banner is not a disclosure: it is a status the domain selects (`docs/DOMAIN.md` §3.11) and it stays.

**Word budgets**: at most 120 words of legal and educational copy on the path from the first screen
to the first logged purchase; at most 30 on Today; each disclosure at most two sentences plus a link;
the plan-creation text 40 to 50 words. The brand role counts them per screen.

**The status-claim ban**: "regulated", "licensed", "authorised", "authorized", "MiCA-compliant" and
"approved by", with the DE and PT forms, join the banned list (`packages/content/style/banned.json`).
The only statement on status is the Risk page's: not registered or supervised by any authority, no
compensation scheme.

**The register link**: the Risk page carries one neutral link to ESMA's public register of
crypto-asset service providers, labelled without a status word, as scam protection. ESMA Q&A 2882:
"providing solely a reference to a CASP (without further indications) equally accessible to all
potential investors should not constitute a recommendation." `docs/LEGAL.md` §3.4 keeps the permanent
ban on recommending, comparing or linking any provider; the register is a list, not a provider.

**Holding rules are data, not warnings**: the computed date and its state sit in the log row and the
plan view with one "computed from your dates, not tax advice" line per jurisdiction; the rule's
explanation lives in Learn (`docs/JURISDICTIONS.md` §1).

## Consequences

- `docs/LEGAL.md` §4 becomes the table above and lists what was removed; §3.4 allows the register
  link; §6 gains the status words and the counsel checklist. `docs/CONTENT-STYLE.md` §8 gains the
  balance step (what decision does this line protect; is a warning already on this path; one
  competitor comparison per new disclosure; the word budgets). `docs/EDUCATION.md` drops the module
  top lines; the Red day page keeps one past-performance sentence.
- The plan records the acknowledgement (`riskAcknowledgedAt`, `riskWordingVersion`, `docs/DOMAIN.md`
  §2.1, planned for session 6) and re-asks only when the wording version changes.
- A new disclosure needs a decision point it protects and a competitor comparison from
  `docs/BENCHMARK.md` §1; the counsel role blocks a merge that repeats a warning on one path or
  claims a status.
- Fewer words before the first purchase; the Risk page becomes the one long text and must be good.

## What stays open (unchanged until answered)

Recorded with sources and dates in `docs/BENCHMARK.md` §4:

- Whether a non-personalised template may name an asset under ESMA Q&A 2882. The Q&A does not address
  it; by its tests a template offered identically to everyone and not presented as suitable is not
  advice. The template line stays as written.
- Whether the German "tax-free from <date>" line is Hilfeleistung in Steuersachen under StBerG § 2(2)
  as amended on 2026-06-29 ("rechtliche Prüfung des Einzelfalls"). No source answers it for a
  computed date. The line and its wording in `docs/JURISDICTIONS.md` §7.7 stay unchanged.

## Disagreement

None.

## Deviations recorded by the build session

- **2026-10-20, the export disclosure sits beside the export action, not in a header line.** The
  backup and log formats of `docs/DOMAIN.md` §3.13 (JSON and CSV) have no header field, so the file
  carries no text. The sentence, in the present tense about what the buttons produce, stands directly
  above the export buttons in Settings, where the decision to export is taken. `docs/LEGAL.md` §4 owns the placement
  and the text.

## Corrections recorded on 2026-10-20

- Consequences: the plan's `riskAcknowledgedAt` and `riskWordingVersion` are planned for session 14,
  not session 6; the plan-creation disclosure lands with Onboarding (`docs/DOMAIN.md` §2.1).
- 2026-10-21: Onboarding, and with it the plan-creation disclosure and the two fields above, moved
  to session 17 (sessions 14 to 16 built the Settings tabs, Hold & sell and Delete everything first);
  the entry of 2026-10-20 above stands for what it corrected.
- 2026-10-22: the plan records `riskAcknowledgedAt` and `riskWordingVersion` from the PR that builds
  onboarding's template path (wording version 1). The acknowledgement is the Start button itself, no
  checkbox: it reads "Accept and start the plan", directly under the text it accepts.
- 2026-10-22: Consequences' "re-asks only when the wording version changes" is narrowed and planned
  for M2: `docs/DOMAIN.md` §2.1 owns when the acknowledgement is asked again.
- 2026-10-22: with the sentence, the reminder and the summary built on both onboarding paths, the
  acknowledged text and Start sit on the summary, the last step, still one screen and once per path;
  the amounts-and-dates steps end on Continue (`docs/DOMAIN.md` §5 owns the order of the steps).
- 2026-10-30: the Template row and "each disclosure at most two sentences" no longer say all of it:
  the Cycle plan's forecast sentence belongs to that row's disclosure, and a template's `oneLine`
  counts toward the 120 words only where it states a risk (`docs/LEGAL.md` §4 owns both).
- 2026-11-02: the re-ask named in the entry of 2026-10-22 is built, in Today's place
  (`docs/DOMAIN.md` §2.1). Its button reads "Accept and open Today", and its text counts under the
  plan-creation row's 40 to 50 words, not under Today's 30 or the path's 120 (`docs/LEGAL.md` §4).
