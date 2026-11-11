# Content review log

What each owner's review found wrong in the drafts, so the review skill improves
(`docs/CONTENT-OPS.md` §8 step 5). Newest first. A run of `/review-content` is logged with its date,
its PR, the model and what the owner corrected. Each row names the kind of mistake, which is what the
next draft can check for.

## 2026-11-09: #68 and #69, the falls as our computation and the Risk honestly module

The owner delegated these reads and the merges to a session, by message (the session's question that day), with
the session's other checkpoint PRs (ADR-0015 Deviations). The question said that Risk honestly "names Mt. Gox
and FTX as dated exchange failures and adds one sentence to LEGAL §6 Q4 on naming a provider in a sourced
event"; the owner chose "Yes, delegate" at 16:06 on 2026-11-09, so the delegation covers that sentence.
`reviewedBy: owner` on these files records that delegation; no person opened the sources. An agent re-fetched every source and re-read every figure before each
merge: on #68, 10 drawdown rows recomputed from their candles, all 10 matching; on #69, a first read of the
module and its facts and a second of the fix round, every quotation matched against the cited PDF's text.
Counsel read #69's final delta a third time. The reads are in #68's comment and #69's three comments.

| Kind | What was wrong | What it became |
|---|---|---|
| A range no cited series gives | Fact a's 2011 fall read "−93 to −94 %"; Mt. Gox's high and CoinMarketCap's low give −94.0 %, and no series gives −93 | −94.0 % |
| A word the data contradicts | Fact b said LINK and SOL were "still" below their 2021 highs; SOL passed $260 on 10 days from 22 Nov 2024 to 25 Jan 2025 | "still" dropped, the figures put at the close of 16 Oct 2026 |
| Source windows that miss part of the span | The Coinbase windows #68 gave LINK 2021 left 26 Jan to 31 Dec 2022 uncovered and stopped at 27 Oct 2023 | LINK 2021 kept on Bitstamp, whose 3-day candles run its low window to today; both give 91 % |
| Items the cited source does not hold | Fact e held 14 items Chainalysis' report does not contain, and fact m BaFin's 3 months' income and a CFPB line the FCA page does not hold | e and m trimmed to their one source |
| Patterns with no source of their own | 4 of the 6 scam patterns the module named rested on fact e, which does not hold them | Six signs, each quoted from the ESAs' factsheet of 15 Dec 2025 in its own fact |
| A sentence that says more than its source | "Nobody from support ever asks for a seed phrase, so a request for one is a scam": the factsheet calls a request a warning sign | Reworded from the factsheet: a request is a warning sign, whoever it seems to come from |
| An order the cited page does not give | "A common order:" put the emergency fund first; the FCA page puts paying off short-term debt first | The paragraph worded from the FCA page itself |

Counsel's judgment the session did not take: counsel asked for "puts paying off short-term debt and building an
emergency cash fund first", reading the FCA page as listing the two side by side. The session kept "first, then":
the page says "Prioritise paying off any short-term debt, build an emergency cash fund" and orders its sections
the same way, and the change would add a word to a body at its limit. Recorded on #69.

Found outside the reads: counsel's Q4 note rested on main's `docs/LEGAL.md`, which did not yet hold the
branch's new §6 Q4 sentence on naming a provider as the subject of a dated event; and counsel's FTX note rested
on main's old `d.exchange-failures`. Both were already answered on the branch.

## 2026-11-09: #61, the Noise and When the market drops modules

The owner delegated this read and the merge to a session, by message (the session's question that morning), with
the session's other checkpoint PRs (ADR-0015 Deviations). `reviewedBy: owner` on these modules records that
delegation; no person opened the sources. An agent re-read every figure against its source: 30 figures, with facts q
and o re-run from Bitstamp's daily candles. 28 matched; the 2 differences, both in fact f's BIS text, were fixed
before the merge. The read is in #61's comment.

| Kind | What was wrong | What it became |
|---|---|---|
| A figure under another source's fact | The BIS app-user figures sat in the text of fact `f.leverage`, a fact about leverage | The new fact `r.app-user-losses`, sourced to BIS Working Paper 1049 (Nov 2022, revised Jul 2023) |
| A figure from another case of the same paper | The October 2022 valuation belongs to the paper's one-purchase case, not to the monthly buyer the module describes | Dropped |

Found outside the read: the builder's and the session's check of the modules' product claims against the code
found that #61 said the fall page shows "the next buy day", which it leaves out when no buy is ahead; the page is
now described by what it always holds. The read only listed the claims for the code reviewer.

## 2026-11-05: #335, #347, #338, #333, #334, #340, #339 and #332, the 8 country PRs

Read on 5 November 2026 at each source's own address: agents re-fetched every source of each PR that day
and read every value against it. The fetch was refused at 4 sites. Légifrance (HTTP 403) refused France's 3
Légifrance pages, whose content the card leans on through BOFiP and the FAQ. The congress.gov refusal (HTTP
403) touched no card source. No card line rests on the gov.ie Budget 2027 tax-policy PDF (HTTP 403). The DGT's
petete search failed (HTTP 502 and 504), so Spain's 2 DGT rulings left §7.9. The owner delegated the read and
the merge to a session by message on 5 November 2026 and confirmed the merges when the session asked (ADR-0015
Deviations). Fix builders applied the findings, and the session decided what a read left open and merged. On
these files `reviewedBy: owner` records that delegation. No person opened the sources.

A value held when its passage, fetched that day, holds it as stated; a finding is a correction, so a PR's
findings can sit in its §7 rows while every card value held (Ireland), and a value can go unread that day
without a finding (Portugal).

| PR | Country | Values read | Held | Findings |
|---|---|---|---|---|
| #335 | Portugal | 27 | 26 | 0 |
| #347 | United Kingdom | 35 | 32 | 3 |
| #338 | Ireland | 49 | 49 | 6, all in §7.3 |
| #333 | Spain | 46 | 44 | 5 |
| #334 | France | 30 | 25 | 6 |
| #340 | United States | 32 | 27 | 8 |
| #339 | Italy | 46 | 38 | 6 |
| #332 | the Netherlands | 28 | 20 | 9 |

### #335 Portugal

No findings: Decreto-Lei n.º 212/2026 of 4 November 2026 holds the rates, the date in force and the effect
from 1 January 2026 the PR states, and art. 68 CIRS at the AT already carries its text.

### #347 United Kingdom

| Kind | What was wrong | What it became |
|---|---|---|
| A claim wider than its source | The gift note and summary60 put charity inside the disposal exception; CRYPTO22100 puts only a spouse or civil partner there and gives charity its own paragraph, with the tainted-donation exception | "unless to a spouse or civil partner; a gift to charity has no Capital Gains Tax unless tainted"; summary60 "(except to a spouse or civil partner)"; §7.4 the same |
| A claim with no source left | §7.4's Rates row kept the Autumn Budget of 2025-11-26 and a 2031 threshold freeze after its only source (Freshfields) left | The rates the GOV.UK table and OOTLAR Annex A hold: 18 % and 24 % for 2025/26, from 2026-04-06 and for 2027/28 |
| A word looser than its source | §7.4's Losses row: "carry forward indefinitely"; the losses page says "to a future tax year" | "carry the rest forward to a future tax year" |

### #338 Ireland

| Kind | What was wrong | What it became |
|---|---|---|
| A §7 row that contradicts the card | §7.3's Taxable events: staking, mining and airdrops "income tax at marginal rates", and "spouses no gain/no loss"; TDM 02-01-03 names neither staking nor airdrops, and no page read holds the spouse clause | "staking/airdrop: depends; the manual is silent; a trade of dealing falls under income tax"; the gift clause in the How to calculate CGT page's words |
| A claim wider than its source | Identity: "a return is due even for a loss"; the loss page says a loss-only year need not be in a return | "a return is due even if no tax is due because of reliefs or losses" (the pay-and-file page) |
| Sources that back no line | Allowances: "not transferable, not carried forward" | TDM Part 19-07-01 §1.2's words, with that manual in Decisive sources |
| A claim with no source | Losses: "without time limit" and "no offset against income" | "unused losses carry forward against the next available gains; no carry-back except in the year of death" |
| A source that backs a line but is not named | Reporting: the late-filing surcharge figures | The figures for 2025 returns beside the Form CG1 helpsheet 2025 |
| A draft without the source that reported it (CONTENT-OPS §5) | Pending changes and Rates: an Investment Account from 2027-07-01 that excludes crypto, "Budget 2028 may move the rate again", "enactment expected by December"; Lot rule: an undated forum post | The forecasts and the Investment Account dropped; the Lot rule says "Revenue's crypto manual is silent" |

### #333 Spain

| Kind | What was wrong | What it became |
|---|---|---|
| A §7 row that contradicts the card | §7.9: staking and lending rewards savings-base income at receipt, airdrops general base; the card says `depends`, and the manual (updated 17 March 2026) names neither | "staking/airdrop: depends (no AEAT page read covers them)" |
| A claim wider than its source | The filing note: "early April to 30 June of the following year"; Orden HAC/277/2026 art. 7.1 holds one year, "entre los días 8 de abril y 30 de junio de 2026" | "for 2025 is filed from 8 April to 30 June 2026 (Orden HAC/277/2026); each year an order sets the dates" |
| A word looser than its source | Modelo 721 again "when that balance grew by more than EUR 20,000"; RGAT art. 42 quater.6 measures from the last return filed | "once that balance has grown by more than EUR 20,000 since the last one filed" |
| Sources that back no line (CONTENT-OPS §5) | §7.9 named the TSJPV judgment, 2 DGT rulings and bill 121/000060 as bare numbers | The bill beside its congreso.es page (lapsed); the judgment beside Cuatrecasas's note of 2025-02-28 with its ECLI; the DGT rulings dropped |
| Two names for one form | §7.9 "Modelo 100" against the card's "Modelo D-100" | "Modelo D-100" (Orden art. 3.a) |

### #334 France

| Kind | What was wrong | What it became |
|---|---|---|
| A status word | Amendment I-3898 stood as a `proposed` pending change, and the stablecoin note said "voted by the Assemblée nationale but not law"; the Assemblée rejected the whole bill on 4 November 2026 (T.A. n° 362) | The pending change dropped; the note "Deferred like any swap."; the caveat on the 2027 budget measures kept |
| A status word, §7 | §7.10 gave a solemn-vote date and a promulgation target no page holds, and named other bills bare | The bill "rejected by the Assemblée nationale on 2026-11-04 (T.A. n° 362)"; I-3898 "adopted 2026-10-16 in a bill rejected 2026-11-04"; the other amendments "named by ORWL Avocats, 2026-10-16"; LFSS 2027 dropped |
| A claim narrower than its source | The classification named only BNC; the FAQ names BNC (like a professional) and BIC (commercial) | "Trading like a professional: non-commercial profits (BNC); as a business: commercial profits (BIC)." |
| A §7 row that contradicts the card | §7.10 called staking "unsettled" and gave airdrops a EUR 0 cost no source holds | "mining and staking rewards are BNC (FAQ); airdrops not addressed by the FAQ" |
| Sources that back no line, §7 | §7.10's Reporting row listed surcharges, penalty rates and a DAC8 clause no cited source holds | The art. 1736 X fines as BOFiP 30-30 § 80 states them |
| A note on a source, too absolute | §7.10's Identity row said no source held the filing dates | The impots.gouv.fr calendar for April 2026: opening 14 April, online closing 21 May, 28 May or 4 June 2026 by département |

### #340 United States

| Kind | What was wrong | What it became |
|---|---|---|
| One rate given as the only one | The rate note named only head of household as differing; Rev. Proc. 2025-32 §4.03 also has married filing separately | "other filing statuses differ (Rev. Proc. 2025-32 §4.03)" |
| A review date after the lapse | `nextReviewDue` 2027-01-15, 2 weeks after the relief and the 2026 rows lapse | 2027-01-01 |
| A claim wider than its source | Mining and staking rewards "at the fair market value when received; that amount becomes the basis"; FAQ A24 and A25 hold that only for an airdrop after a hard fork | The rewards reported as income on Form 1040 Schedule 1; the airdrop after a hard fork as ordinary income at its fair market value |
| A word looser than its source | "A broker reports basis only for units bought after 2025"; the 1099-DA instructions make it mandatory for covered securities and voluntary for the rest | "A broker must report basis only for units acquired after 2025 in the custodial account that sells them", voluntary for units transferred in |
| One value given as the only one | Inherited units "with the value at death as basis"; Pub. 551 lists the alternate valuation date and others | "generally with the value at death as basis" |
| A §7 row that contradicts the card | §7.5 "collectibles 28 %"; the card and Topic 409 say a maximum of 28 % | "collectibles up to 28 %" |
| A bill without its reporting source (CONTENT-OPS §5) | §7.5 named H.R. 10357 and S. 2207 with "outcome not verified" | Each beside the source that reported it, with its date and "text not fetched" (Decrypt via Yahoo Finance, 2026-09-15; NTU Foundation, 2025-08-13) |
| A bill without its reporting source, §7.11 | Item 4 named both bills bare | The same 2 sources inline |

### #339 Italy

| Kind | What was wrong | What it became |
|---|---|---|
| A wrong taxable status | The stablecoin swap said `yes` and summary60 "selling for euro or stablecoins is" taxed; Circolare 30/E p. 49: a swap into an asset-referenced token "non è fiscalmente rilevante" | `depends`; summary60 "selling for euro or e-money tokens is"; §7.1 the same |
| A claim wider than its source | A move to someone else's account counted as a disposal in general; §3.2.2 says it for the risparmio amministrato regime only | The note names that regime, gifts and inheritances excepted (Circolare 30/E §3.2.2) |
| A date narrower than its source | The 26 % row started on 2025-01-01; the regime and the 26 % apply from 1 January 2023 (§3.1, §3.2.1) | `validFrom` 2023-01-01, "up to 31 December 2024 only the part above EUR 2,000 a year counted" |
| One form given as the only one | Only the Modello Redditi PF named; the 730/2026 instructions: "Il 730 ordinario si presenta entro il 30 settembre", gains in quadro T | The 730 source added; "The Modello 730 is filed by 30 September."; "(quadro T of the 730)" |
| A URL that does not serve the article | The decree's URL served art. 1, not art. 304 | The normattiva URL that serves art. 304 c. 7 |
| A draft without the source that reported it, §7 | An intergroup draft without its reporter inline, and a stale "DDL Bilancio 2027 expected" | "named by SpazioCrypto, 2026-09-24; text not fetched"; AC 3174 (presented 2026-10-30) "holds no crypto change as presented" |

### #332 the Netherlands

| Kind | What was wrong | What it became |
|---|---|---|
| A wrong date | The box 3 reform "meant to start on 1 January 2028"; the cabinet's letter of 3 November 2026: "met ingang van 1 januari 2029, tenzij … per 1 januari 2028" | summary60 "proposed for 2029"; the caveat and the pending change "proposed for 2029 (2028 if feasible)", the pending change linking to the letter |
| A figure out of date | The 2027 allowance "EUR 60,098" rested on the factor 1.01248, which the third nota van wijziging (nr. 29, 4 November 2026) raised to 1.015548 | The figure dropped; §7.8 records the factor's change |
| Out of date and unsourced, §7 | §7.8 kept the cut to EUR 30,846 and the +1.5-point forfait of 29 September 2026, withdrawn on 3 November 2026, and an Eerste Kamer vote date no dossier shows | The withdrawal recorded; "then the Eerste Kamer" |
| A claim narrower than its source | "extending the capital-gains part to shares, bonds, and options"; the government's timeline says all financial instruments | The scope beside the timeline in §7.8's Pending changes row |
| A status word | "The 2027 allowance and deemed percentage, proposed in the Tax plan 2027"; the bill holds no 6.37 % | "The 2027 allowance, which depends on the Tax plan 2027, and the 2027 deemed percentage." |
| A claim wider than its source | The filing note let anyone extend the deadline and said "filed in the spring"; an extension needs a filing letter, and no page holds "spring" | The letter's due date, "often 1 May", and the extension "if you got that letter"; the deadline page added as a source |
| A date with no source, §7 | §7.8 "1 March–1 May" | "due by the date in the aangiftebrief, often 1 May" |
| A claim wider than its source | Staking and airdrops `taxable: no`, while the sources name neither | `depends` |
| A claim wider than its source | "costs are not deductible"; the actual-return page allows interest on a box 3 debt | "…except interest paid on a box 3 debt" |

Decided by the session:

- Spain's only pending change, the general election of 29 November 2026 (RD 806/2026), left `pendingChanges`,
  since JURISDICTIONS §2 keeps that list for rule changes.
- France's amendment I-3898 left `pendingChanges`, since the Assemblée nationale rejected the bill that held
  it on 4 November 2026.
- The Netherlands' pending change links to the cabinet's letter of 3 November 2026 and says only what the
  letter holds.
- France keeps `nextReviewDue` 2027-01-01, since the Senate's reading and a new budget bill are open and
  JURISDICTIONS §6 allows any date within 12 months.
- Ireland's Form 12 wording and Italy's quadro W stay as they are, since the sources' words would pass the
  field's 240 characters.

## 2026-11-05: #325, Germany's and Portugal's profiles

Read on 2026-11-05 at each source's own address: art. 10 CIRS, and articles 1, 4 and 6 and the Tabela Geral
of the Código do Imposto do Selo, on the AT's site; the CMS update of 26 Jun 2025; the BMF letters of 10 May
2022 and 6 Mar 2025 and Lei n.º 24-D/2022 from their PDFs; BFH IX R 3/22; § 108 AO; and §§ 187 and 188 BGB.
The owner delegated this read and the merge to a session, by message, once (ADR-0015 Deviations).
`reviewedBy: owner` on these files records that delegation; no person opened the sources. Every line the PR
changed and each of the 11 sources it added held against its passage. Counsel and brand read the four lines
this read changed.

| Kind | What was wrong | What it became |
|---|---|---|
| A claim narrower than its source | Portugal's gift note named gifts of crypto held with institutions in Portugal. CIS art. 4 n.º 4 e) also reaches crypto deposited with no institution when the recipient of a gift, or for an inheritance the deceased, is domiciled in Portugal, and the event covers inheritances | The note states both cases in the law's word, `deposited`, and §7.6 cites art. 4 n.º 4 e). The review had proposed `held anywhere`, which is wider than the source: crypto deposited with a foreign institution is in neither case |
| One rate given as the only one | summary60 said `a flat 28 %`; art. 72 CIRS makes aggregation at the progressive scale optional | `28 % by default` |
| A word looser than its source | The swap note said `resident outside` and summary60 `the counterparty is in`; n.º 24 says `residentes para efeitos fiscais` | `tax-resident` in both |
| Sources that back no line | `pt-kpmg-oe2027` backed only the OE2027 pending change, which carries its own source, and `de-haufe-dac8` only the DAC8 line #325 dropped | Both left `sources`. Germany's three reform-draft entries stay: summary60's last sentence and the reform caveat rest on them |
| A note on a source, too absolute | The PR said the BMF letter of 6 March 2025 has no sentence on the burden of proof; Rz. 100 names `die allgemeinen Beweislastregeln` | No change: the reporting line rests on CMS, which holds it, and Rz. 90 holds the plausible reports |

## 2026-11-02: Portugal's authorisation to lower six IRS rates

Read from the PDF of Lei n.º 64-B/2026, art. 68 CIRS in the AT's text, the Council of Ministers'
communiqué of 29 Oct 2026, the Presidency's note of 2 Nov 2026, and the Diário da República's feed of the
day. The owner delegated the last read and the merge to a session, by message, once (ADR-0015 Deviations).
`reviewedBy: owner` on this file records that delegation; no person opened the sources.

| Kind | What was wrong | What it became |
|---|---|---|
| A status word | `pendingChanges` called the cut `enacted`, and the card's rate note said approved. The Lei of 22 Oct 2026 only authorises it, and no decree-law using it was found published on 2 Nov 2026 | `proposed`, and both say so with that date |
| A name wider than its source | The title said "Extra 2026 IRS cut"; the Lei cuts nothing itself | "Proposed lower rates in six IRS brackets", the change `proposed` describes, with the Lei's number before the Proposta's, and the same name in JURISDICTIONS §7.6 and §7.12 |
| A claim wider than its source | The row cited KPMG for "retroactive to 1 January 2026"; the Lei does not say it. "0.3 to 0.5 points" is not the Lei's wording either: art. 2 gives the six rates, and the gap comes from art. 68 n.º 1 | The rates as art. 2 gives them, no retroactive claim, and the Lei as the source |
| A date with no source | `effectiveFrom` read 2026-01-01; the Lei states no date for the rates | `null`, as the OE2027 row has it; a date comes with the published decree-law |
| A claim the Lei does not make | "It changes crypto gains only for those who opt for aggregation (medium confidence)" spoke for the reader's case | Removed. The row says what the Lei covers: art. 68 n.º 1 CIRS only, not the 28 % rate of art. 72(1)(c) |
| A clause that reads two ways | The first draft's "for 180 days" read as the cut's length; art. 3 sets the authorisation's | A sentence of its own |
| A citation at one remove | The card's rate note cited art. 72(13) for the scale, which art. 68(1) holds | Art. 68(1), with the article and the Lei added to the profile's `sources` |
| A date without its year | "22 October" and "3 June" named a law | The full date, both times |
| A claim with no source | "Penalties under the RGIT, plus interest" had none in the profile | Removed from the card and from JURISDICTIONS §7.6 |
| A sentence with no subject | `Only when the counterparty ...` reaches a person beside the date on Log and Plan, under a line that is not about the date | It starts `Tax-free only when`, and the list has its serial comma |
| A stage the check did not read | The first check went from the Council of Ministers to the Diário da República and read "not found published". The Presidency's note of 2 Nov 2026 says the President has promulgated the decree-law | The row, the rate note and JURISDICTIONS §7.6 and §7.12 say so, "by" that date because the note does not date the act. `presidencia.pt` is not on the allow-list, so the note is a source in §7.6, not in the profile. A check for an act reads the Presidency's notes as well as the feed |
| A reason that did not hold | "The numbering leaves no gap" ruled out issues 209 to 211, but supplements take suffixed numbers: Decreto-Lei n.º 206-A/2026 is in one, on 29 Oct 2026 | No act appears before its promulgation, so the note's date rules them out. Issue 212 of 2 Nov 2026 was read in the feed, with no supplement |

## 2026-11-02: #290, #299 and #305

The owner delegated this read and these merges to a session, by message, once (ADR-0015 Deviations).
`reviewedBy: owner` on these files records that delegation; no person opened the sources. Agents opened
every source and recomputed every computed figure from the raw responses, and the session re-derived
each changed figure with separate code. Of 168 market figures, 151 matched; of 113 sourced claims, 99
held, 4 of those with a narrower wording below, 12 differed and 2 could not be opened at a primary
source, neither one carrying a figure that stayed.

| Kind | What was wrong | What it became |
|---|---|---|
| A response that ended too early | `limit=730` ended on 31 Dec 2022, so LINK's low read 12 May 2022 in #299, in the Cycle plan template and its explanation; the fall went on | $4.83 on 10 Jun 2023, −91 % on Bitstamp, −90.7 % on Coinbase. A fall runs to the lowest low before the coin regains its high. The two-series question the PR asked dissolved: neither date was the low |
| One word, two measures | `under water` in facts o and p meant value below cost; the simulator means peak to recovery (EDUCATION §8), so one plan read 64 days in the fact and 375 on the screen | `below cost` in the facts; `under water` stays the simulator's |
| A price with no time | $81,533 was a close in the research and "about 16:00 UTC" in the facts; it is neither (it traded around 16:20 to 16:30 UTC) | The 16 Oct 2026 closes, $81,501 and $2,420, which moved ETH's multiple from 1.10× to 1.09× |
| A window one day long | The 90-day high was computed over 91 closes; `redDay` reads 90 | 11.8, 19.2, 15.1 and 28.0 % in place of 11.9, 19.4, 15.2 and 28.1 % |
| A licence the figure could not use | The lump-sum sentence used Coin Metrics Community, CC BY-NC and excluded by ADR-0006, and "cross-check identical" was not true of the median | The same sentence on Bitstamp closes: +31.2 %, 7 days, −13.3 %, 33 days, −35.4 % |
| A figure on its rounding edge | `j`'s date, `i`'s lower bound and `c`'s distance from the high each reproduced on one reading only | 13 Mar 2028, 15.8×, 35.5 % |
| A status word | Ireland's cut read "announced ... pending the Finance Act"; it is in effect under a Dáil resolution, and the law is the Finance (No. 2) Bill 2026. Chainalysis "estimates" hid "we project ... could exceed" | The fact cites the Bill and says it is not enacted; "says the figure could exceed" |
| A claim wider than its source | Mt. Gox halted bitcoin withdrawals only; FTX's "8 Nov to 10 Nov" read as a span; the FCA's 7 % covers crime, scams or fraud; the UK's 18 and 24 % are individuals' main rates; row k's "changed crypto tax rules" counted general taxes that cover crypto; the OSC's report is its staff's | Each now says what its source says |
| A citation that does not hold the claim | Bybit as the largest hack is not in the 18 Dec 2025 post; CoinGlass's quotation is on X, not in its annual report; the FTC does not describe fake exchanges; $473m has no primary source; the Normattiva URL shows Italy's comma as repealed without a date view | Chainalysis 8 Jan 2026; "on X"; the FTC's and the ESAs' own words; the figure dropped; `!vig=2026-11-02` |
| A summary narrower than the paper | BIS's "73 to 81 % ... initial investment" hides that 81 % is $100 of bitcoin a month, the median investor down 48 % of $900 | The fact states both cases, its window and the median investor |
| A live reading stored as a daily one | CoinMarketCap's 49 on 16 Oct 2026; its daily series holds 50 | 50, and 13 points apart |
| A sentence true only on the default path | Start here's "on this device", "Export a copy", "the day each purchase passes it", "with its date and price" and "yourself" each failed for a real person: Safari's storage, the CSV log, Germany's year, the one-tap entry, a recurring buy | The module states the browser or installed app, the JSON backup, the first day that meets the period, and the recorded date |

Sources this read added, which the research report does not hold:

- FTX's pause of 8 Nov 2022: the SEC's complaint, para 79,
  https://www.sec.gov/litigation/complaints/2022/comp-pr2022-219.pdf
- Fake apps: the FTC's Data Spotlight of June 2022,
  https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2022/06/reports-show-scammers-cashing-crypto-craze
- Ireland's resolution: Financial Resolution No. 3 in the Dáil record of 6 Oct 2026,
  https://data.oireachtas.ie/akn/ie/debateRecord/dail/2026-10-06/debate/mul@/main.xml
- CoinMarketCap's daily index: https://api.coinmarketcap.com/data-api/v3/fear-greed/chart?start=1791900000&end=1792400000
- Italy's euro e-money tokens: L. 199/2025, comma 28, read on Normattiva

Found in the same read and left for the session that owns them: `packages/content/jurisdictions/pt.json`
calls an authorisation "enacted" and JURISDICTIONS §7.4 is behind the UK's Budget of 28 Oct 2026
(#267). The research report keeps its 2026-10-16 text as evidence; this log is where it stands corrected.

## 2026-11-02: the Cycles module, #316

The owner delegated this read, the merge and the one LEGAL §4 call to a session, by message, once (ADR-0015
Deviations). `reviewedBy: owner` on this module records that delegation; no person opened the sources. The session
fetched the raw data itself, apart from the build and its review: Bitstamp's 5,539 daily candles to 16 Oct 2026,
mempool.space's four halving blocks, Bitcoinity's Mt. Gox series and CoinMarketCap's quotes for 2011. Every price,
date, fall and halving in the module matched, and each sentence about the product was read against `tranches.ts` and
the Cycle plan template. Counsel read the final text, with the two sentences no content role had seen.

| Kind | What was wrong | What it became |
|---|---|---|
| An exception argued from the mechanism | LEGAL §4 had the line stand alone in a module because a body holds no link. That is true of a Markdown link, not of what the renderer sets. Learn's route opens with no plan, so a reader could meet the figures with no disclosure and no way to the Risk page; ADR-0047 asks for the link; and the sentence would have bound the simulator's result too | `<PastPerformance />` sets the sentence and `Risk disclosure` as one, and the content test refuses those words in a module's own text |
| A rule checked on text that only a tree can read | The read's first check matched one exact sentence and its second read paragraphs from blank lines; two review rounds broke both with rewordings, lists, quotes, headings, abbreviations and entities | One element holds the sentence and its link, so nothing has to be checked beside anything |
| A citation at the wrong section | §6 Q4 cited EDUCATION §2, the Risk module's section, for the credits in Cycles | EDUCATION §9, and the sentence says what keeps a credit from being a recommendation |
| A sentence that lost what it pointed to | `The high can come ...` after a rewrite, and `Why? The sell window` lands on that section | `A high can come ...` |
| A name split by a line end | `(Mt.` and `Gox)` on two lines at 360 px | A no-break space inside the name, with a test |

One figure stands with a note. 12.1 months from the 2012 halving to the 2013 high is the count from the dates the
module prints, 12 months and 2 days. From the block at 15:24 UTC to the high in the 03:00 UTC candle it is 12.04. The
other three rows read the same either way.
