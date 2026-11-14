# Legal

What the product must say, show and avoid; which pages exist at launch; what must be true before
money is charged. General information gathered for product design on 2026-10-16, not legal advice;
the sources and the reasoning are in `docs/research/legal-regime.md` (75 sources); the competitor
benchmark and the regulatory minimum, read on 2026-10-19, in `docs/BENCHMARK.md`. Decisions: ADR-0029
(UK), ADR-0038 (payments), ADR-0028 (analytics), ADR-0026 (email), ADR-0047 (where disclosures sit).

## 1. The name

The product is called **Proof of Calm** (ADR-0040). Before anything public ships (`docs/ROADMAP.md`, M2):

1. Search TMview by hand for "Proof of Calm" and close variants in classes 9, 36, 41 and 42, at the
   EUIPO and at the national offices of the launch countries. If it finds an identical or confusingly
   similar earlier mark, ADR-0040 is superseded before launch.
2. If the search is clean, file the EUTM in classes 9, 36, 41 and 42: EUR 850 for the first class,
   EUR 50 for the second and EUR 150 for each further class, so EUR 1,200 for four. A professional EU
   clearance opinion costs about EUR 600–1,500 and is optional.
3. Register every handle (`docs/GROWTH.md` §2.7): those found free on 2026-10-17 (YouTube, TikTok,
   Bluesky, the GitHub and npm organisations, and probably Telegram), and X, Instagram, Threads,
   LinkedIn and Reddit once checked by hand.

## 2. What Proof of Calm is, in legal terms

- **Not a crypto-asset service provider under MiCA** (Regulation (EU) 2023/1114): it provides none
  of the ten services of Art. 3(1)(16); "advice" is a personalised recommendation (Art. 3(1)(24)),
  and ESMA's Q&A 2882 (18 June 2026) reads the perimeter as broader than MiFID's because
  recommending a particular provider can itself be advice. This holds only while the product keeps to
  the behaviours in §3.
- **Not a UK financial promotion communicator**, because GB requests are blocked at the edge
  (ADR-0029; an installed shell opened in the UK is the leakage its Reading of 2026-11-05 accepts).
- **Not registered or supervised** by the CMVM, Banco de Portugal, BaFin, the FCA, the SEC or any
  authority, and no compensation scheme covers it; the Risk page says so.
- **A controller under the GDPR** (established in Portugal; settled on 2026-10-17, §9); Supabase,
  Vercel, the mail provider and Sentry are processors; CoinGecko receives no personal data.
- **A hosting service under the DSA** at most (the user's plan stored at the user's request, never
  disseminated): one point of contact and one paragraph in the Terms satisfy it.

## 3. Behaviours that keep the product on the information side

1. The user chooses coins, amounts, cadence and rules. Templates pre-fill structure and defaults the
   user sees and edits; the risk label comes first.
2. No questionnaire about income, goals, risk tolerance or age that selects or ranks templates.
3. No ranking, scoring or "top coins"; lists are alphabetical or by the user's choice.
4. No exchange or provider recommendations, comparisons, links or affiliate codes, permanently
   (ESMA: introducing a provider can be advice; UK: no "arranging"). One exception: the Risk page
   carries one neutral link to ESMA's public register of crypto-asset service providers, labelled
   without a status word, so that a reader can check a provider before sending money (ESMA Q&A 2882,
   2026-06-18: a bare reference equally accessible to all is not a recommendation; ADR-0047).
5. Second person only for the user's own plan ("the plan you set"), never for the market.
6. Historic data is descriptive, dated and carries the past-performance line; no projections (a
   template card's drawdown band is a dated fall, not a return: it carries its dates, and the line
   comes with the path's first view of historic data, §4's Template row; the dated falls in the
   template explanations read the same way; a labelled assumption naming its source, Plan's timeline
   label "Cycle high … assumes", is not a projection, `docs/CONTENT-STYLE.md` §6).
7. Reminders are mechanical: "It is your buy day", never "a good time to buy".
8. Education states facts and documented practices ("a rule some people follow"); each module
   carries its own caveat and links to no provider (ESMA's reverse-solicitation guidelines of
   2025-02: purely educational material is not solicitation unless it directs the reader to a
   firm's services).
9. The Terms say the service is software for recording and visualising a plan the user designs.

## 4. Disclosures at decision points (ADR-0047)

A disclosure is content at a decision point: it sits where a decision is made, once per path, in the
same type and background as the sentences around it, with a link to the Risk page, never a coloured
bar, a modal or a checkbox beyond the one acknowledgement below. A status the domain selects (the
Red day banner, `docs/DOMAIN.md` §3.11) is never a disclosure. The acknowledged plan-creation text
is the one long disclosure (three sentences, 40 to 50 words). The template line keeps its three
short sentences (12 words, ADR-0047). Every other disclosure is at most two sentences plus a link.
Budgets: at most 120 words of legal and educational copy from the first
screen to the first logged purchase, the data lines below excluded, at most 30 on Today. A template's
`oneLine` describes the plan and stays outside the 120 words, except a sentence that states a risk,
as the Cycle plan's second does; it counts toward the 120 words and belongs to the Template row's
disclosure, with that row's line and link. The evidence and the competitor comparison:
`docs/BENCHMARK.md` §3 and §1.

| Decision point | Text (adapt; keep the substance and the dates) |
|---|---|
| Plan creation, one screen, acknowledged once (40 to 50 words; the acknowledgement is recorded with the wording version, `docs/DOMAIN.md` §2.1, which also says when the same text is asked again, in Today's place and never as a modal; an import triggers nothing new of its own, and a plan brought in by "Replace everything" or the import with no plan, with an older recorded version, is asked once, on Today; asked again, the text counts under this row's 40 to 50 words, not under Today's 30 or the path's 120, since the same text must be asked again in Today's place) | "Proof of Calm is software for a plan you design: no orders, no financial or tax advice. You can lose all of it: Bitcoin has fallen more than 75 % from a high four times since 2011; Ethereum fell 94 % in 2018. Use only money you will not need for years." then the link `Risk disclosure`; the figures are sourced on the Risk page (§5, its volatility and drawdowns with dated ranges) |
| A template, before the user picks it | the risk label first (a worded level, "High risk" or "Very high risk" with an optional qualifier, never "low"), the Cycle plan's forecast sentence, then the card's dated drawdown band (its dates, not the past-performance line, which the next row's first view of historic data carries; decided 2026-10-29); below the cards, once, "A starting point some people use. You choose every setting. Not advice." then the link `Risk disclosure`; the band's sources stay in the template's `drawdowns` and reach the Risk page in M2; the picked template's explanation sits behind one closed control, opened only by the reader, because shown by default it would break the budget above (`docs/CONTENT-STYLE.md` §6) |
| The first view of historic data on a path (the Red day page, a chart, the simulator's result), directly under the figure | "[Source] closes, [first date] to [last date]. Past performance is not a reliable indicator of future results." Falls computed from intraday prices (the Learn drawdowns chart, the Cycles module's list) read "[Source] intraday highs and lows in US dollars, [first date] to [last date]; the falls are Proof of Calm's own computation. Past performance is not a reliable indicator of future results." In a Learn module the renderer sets the line's second sentence and the link `Risk disclosure` as one element, because Learn's route opens with no plan, so a reader can reach the figures with no plan-creation text and no footer; a module's own text never writes that sentence and holds no link (ADR-0048, Deviations), so a module with no such line shows no link (decided 2026-11-02); a module's line also stays in its sheet when the fall page's Why? opens it: the sheet's figures come with their own source and dates, and the line follows the first of them; the page's own line stays under the page's figure. |
| An export, beside the export action (the line directly above the export buttons) | "Exports are generated by Proof of Calm from your own entries; not advice. Check figures before any tax or financial use." in the present tense, as no file exists yet, then the link `Risk disclosure`. The JSON backup and the CSV log (`docs/DOMAIN.md` §3.13) carry no text of their own, because a header or comment row would break the backup's schema and the spreadsheet and tax-tool parsers of the CSV. The tax-year file is the exception: it is read by a person or an accountant, not imported, and its header names the app, the span, the country's review date and "Not a tax computation" (`docs/DOMAIN.md` §3.13); its control sits under the export buttons, so this line covers it too. An export started from a dialog ("Export a copy first": the replace dialog of the import; the delete-plan dialog, `docs/CONTENT-STYLE.md` §3) relies on this line, so the disclosure stays once per path, because the dialog opens only from a control below the line in Settings' data section, which shows the line whenever there is a plan to export. A dialog that offers an export and opens from anywhere else shows the line itself. The country change's files-first block (Settings' Currency & data, `docs/CONTENT-STYLE.md` §3 "Change country") shows the line itself too, with the link, because its tax-year control sits above Your data's line |

Lines that are data, not disclosures, and do not count as a repeat: the jurisdiction card's date line, in
one of four forms (this section owns them): plain, `Reviewed on 16 Oct 2026 · general information, not
advice`, while the rule's source is unknown; with Sources, `Reviewed on 16 Oct 2026 · general information,
not advice · Sources`; generic, `Reviewed on 17 Oct 2026: the general profile, not a rule for your country ·
general information, not advice`, for the generic profile, with no Sources; under review, `Not reviewed since
16 Oct 2026 · general information, not advice`, for a card more than twelve months past
`nextReviewDue` (`docs/JURISDICTIONS.md` §1), with no Sources; the card in Learn takes the plain form,
since each rule with a source ends with its own Sources link, and below the line the card ends with the section
`Sources for this card`, the profile's sources with their publisher and date, each opening outside the app, none
for the generic profile or a card under review (what the list holds: `docs/JURISDICTIONS.md` §2); one "Computed from your
dates, not tax advice" line per jurisdiction beside the first holding-status date ("Computed from the
template's dates, not tax advice" on onboarding's template path, where the dates are the template's)
(`docs/JURISDICTIONS.md` §1); under that line on the Log and the Plan, under the early-opening notice (Hold & sell,
the Plan tab, onboarding's numbers step, the country change) and under the country change's `Last buy tax-free
from` row, while the plan keeps the profile's rule, the profile's conditions on the date, the first in full and
the rest behind one control (`docs/CONTENT-STYLE.md` §3), then the date line. Where the country change's row
shows the note and the conditions, the notice under it shows neither. The date line stands alone where the
profile lists no conditions, with Sources once
the rule's source is known and plain until then; under review the conditions stay beside the date, with the
under-review form of the line (`docs/JURISDICTIONS.md` §2); the template cards'
dated drawdown bands (the Template row); the site line of §5 on site pages and in Settings → About.

Removed on 2026-10-19, one reason each: the footer in the app (the app shell has no footer; the line
moved to §5); the line at the top of each Learn module (a warning on every module is skipped, as
repeated banners are, `docs/BENCHMARK.md` §3; the module's caveat box and dated figures stay,
`docs/EDUCATION.md`); the jurisdiction-card
sentence (folded into the card's date line); the Red day page's three sentences (the past-performance
line under the figure does the work; the page's own text says what the user can do); the reminder
email's footer sentence (the email names no market, coin or amount, `docs/CONTENT-STYLE.md` §7, so
there is nothing to disclaim).

Regulator phrasings to adapt: MiFID II Delegated Regulation 2017/565 art. 44(4)(d) "past performance
is not a reliable indicator of future results"; the ESAs' warning of 2022-03-17 "the very real
possibility of losing all their invested money"; MiCA art. 6(5) white-paper statements (may lose its
value in part or in full; not covered by investor-compensation or deposit-guarantee schemes). Not
adapted: FCA COBS 4.12A.11R's fixed-top warning, a UK promotion rule (ADR-0029).

## 5. Pages at launch (L) and before charging (P)

| Page | When | Outline |
|---|---|---|
| Terms of use | L (Plus section P) | who we are; what Proof of Calm is and is not; 18+; blocked jurisdictions; the account (one plan, code or passkey, local-only means we hold nothing); acceptable use and the DSA notice channel; your data; prices and market data are third-party and may be wrong: CoinGecko named as the owner of the price data with its liability exclusion and its data disclaimers as its terms §7 require, and the ECB named for the reference exchange rates; risk acknowledgement; availability and changes (free core stays free); liability within the law, consumer rights unaffected; Portuguese law with home-country consumer protections; ADR information; Proof of Calm Plus section (P): what it includes, price incl. VAT, cycle, renewal, cancellation, change process, refunds, 14-day withdrawal with model form, who the seller is; tips (P); version and date |
| Privacy notice | L (update P) | controller identity; what is collected per feature and that local-only mode collects nothing; purposes and lawful bases (table in the research file §3.1); recipients: Supabase (Supabase Pte. Ltd., Singapore; EU region Frankfurt; SCCs), Vercel (US; functions in Frankfurt; DPF/SCCs), the mail provider (ADR-0026), Sentry (US entity; EU event storage; DPF/SCCs), CoinGecko (no personal data), later the payment provider; transfers and safeguards; retention (below); rights and how to use them (self-service export and delete; privacy@ address; one month); complaint to the CNPD; security in one paragraph; 18+; storage (link to the cookie-free statement); date |
| Risk disclosure | L | the one-paragraph warning; what DCA does and does not do; volatility and drawdowns with dated ranges; custody and counterparty risks; the only statement on status: not registered or supervised by any authority, no compensation scheme; tax; scams (Proof of Calm never contacts you to invest, never asks for keys or money); the register sentence: "ESMA keeps a public register of the providers authorised under MiCA: [ESMA's register of crypto-asset service providers]. Check any provider there before sending money. Proof of Calm is not a provider and is not listed." (§3.4; the link label carries no status word); how to find a professional adviser; links to official warnings (CMVM, BaFin, FCA) and to the ESAs' joint factsheet on crypto-assets and MiCA of 2025-10-06 in PT, DE and EN |
| Cookie-free statement | L | what we do not do (no advertising or analytics cookies, no third-party scripts, no fingerprinting); what the browser stores and why (the session, from M3 with accounts; the plan, the entries, and the prices fetched for your coins, so the app works offline in local-only and offline mode; the app's files in Cache Storage, so the app opens offline; the pages opened, the app's and the site's, for up to 7 days, and the latest price answers for 24 hours, so they show offline, with the date each copy was saved, so expired copies are cleared; the display settings you set: theme, reduced motion, chart range, the Log's view, and the language once there is more than one; the dates of your last JSON backup and last change, for the backup reminder; the banners you dismissed or that showed once, so they stay hidden; the date of your last annual review, for the next one (from M2); a record of the entries deleted on this device, so a later import with "Add missing entries only" does not bring them back, and the plan and entries a "Replace everything" removed, in full and marked as deleted, for the same reason; in M1 these records stay until "Delete everything" or until the person clears the site's data, and from M3 on the purge of `docs/DOMAIN.md` §3.15 applies; a random device identifier in IndexedDB (`meta` `deviceId`), which orders writes and in M1 leaves the browser in no request and no backup; an outbox copy of each plan and entry row written, for M3's sync, which M1 does not do; stored rows that failed their check on read, set aside (`meta` `corrupt`) instead of deleted; form drafts in session storage, until the tab closes; the one-reload note `poc.preload-reload` in session storage, so a tab whose update failed to load reloads once, until the tab closes); how visits are counted (server-side aggregates, no identifiers); why there is no banner; references (ePrivacy art. 5(3); Lei 41/2004; § 25 TDDDG; PECR); date |
| Contact / Impressum | L (RAL and complaints-book block P at the latest) | name and legal form; establishment or seat address (a domiciliation or coworking address, never the home address); email (mandatory under DL 7/2004 art. 10 and DDG § 5); NIF/NIPC and VAT number; commercial register and number (Lda); manager (Lda); "no authorisation scheme applies; no supervisory authority" (the identification line the status-claim ban of §6 keeps); DSA point of contact (languages PT, EN, DE); security contact and `security.txt`; privacy contact; consumer disputes: RAL entities with websites, Livro de Reclamações Eletrónico link, no ODR reference (the platform was discontinued on 2025-07-20, so there is nothing to link and nothing to say); a German note that § 36 VSBG does not apply (unsourced; `docs/BENCHMARK.md` §4) |
| `/.well-known/security.txt` | L | `Contact`, `Expires` (≤ 12 months), `Preferred-Languages: en, pt, de`, `Canonical`, `Policy`; CI fails 30 days before expiry |
| Not-available page (UK) | L | a plain sentence, the legal pages, no persuasion (ADR-0029) |

The site line: "Data and tools, not advice. Crypto-assets can lose all their value." with a link to
the Risk page, on every site page (the landing page and the legal pages) and in Settings → About.
The app shell has no footer, so the line is not in the app's screens, the Learn index included
(ADR-0047).

Retention: account and plan for the life of the account plus 30 days after deletion (undo), inactive
accounts warned at 24 months and deleted at 27; auth and security logs 90 days; error events 30 days;
mail logs per the provider (30 days); backups 35 days; support correspondence 24 months; aggregate
counters 24 months (no personal data); invoices 10 years (Portuguese tax law).

Age: 18+ by policy, stated at sign-up, no verification (the lawful basis is contract; the digital-consent ages, 13 in Portugal, are irrelevant).

Records of processing: one page, kept in this repository's private documentation, because the
processing is not occasional. No DPO; no EU representative (established in the EU); a UK
representative only if UK users are ever served.

## 6. Copy review (the legal half; voice in `docs/CONTENT-STYLE.md`)

Banned or restricted, in EN, DE and PT: recommend/recommended/recommendation (empfehlen, Empfehlung /
recomendar, recomendação); should buy, you should, must buy (sollten kaufen / deve comprar); safe,
secure investment (sicher, sichere Anlage / seguro); guaranteed (garantiert / garantido); wealth, build
wealth, get rich (Vermögen aufbauen, reich werden / riqueza, enriquecer); best coin, top coins,
winners; will rise, will go up, bound to recover; expected return, target price, projected; passive
income, yield, earn; we suggest, our pick, tip; opportunity, don't miss, now is the time, buy the dip,
stack sats; inflation hedge, digital gold, store of value stated as fact; cheap, undervalued,
discount; profit, gains, returns as promises; outperform, beat the market, beat inflation; comparisons
with savings accounts or pensions; any second-person imperative about buying or holding; any claim of
regulatory status or compliance: regulated, licensed, authorised, authorized, MiCA-compliant,
approved by (reguliert, lizenziert, zugelassen / regulado, licenciado, autorizado), because telling
people that crypto-assets are "regulated" raises demand and false confidence (FCA research note,
`docs/BENCHMARK.md` §3); the only statement on status is the Risk page's (§5). The ban keeps the
Impressum's identification line, "no authorisation scheme applies; no supervisory authority" (§5;
DL 7/2004 art. 10, DDG § 5): it carries no status word, so the lint passes it without an allow-list
entry (`packages/content/src/style/banned.test.ts` holds the case).

Allowed: template, starting point, a rule some people follow, the plan you set, your rule, data not
advice, historically / in the 2013–2022 cycles (dated), what happened, drawdown, volatility, you
decide, you can change this, learn how DCA works, record, log, schedule, the asset you chose.

Also restricted: a blanket claim about where data lives ("data stays in the EU", "never leaves the
EU"); a sentence may say where one kind of data is stored when that is true (ADR-0044).

The lint runs over UI messages, content, templates, the landing page and site pages
(`apps/web/messages`), and, from M3, emails; the list is
`packages/content/style/banned.json` (EN, DE and PT patterns, the filler words, and the allow-list
with a reason per phrase: proper names of taxes, "API key", the Risk page's register sentence). It
also flags any sentence with an asset name and an imperative verb and any percentage next to
return, gain, profit or yield. Template names need a human sign-off.

The counsel checklist, answered for every change to messages, content, Learn, emails, site pages or
exports (their headers, columns and cells) (the role: `.claude/agents/counsel.md`; the evidence:
`docs/BENCHMARK.md`):

1. Does any sentence name a specific asset together with an imperative or a "should"?
2. Is anything presented as suitable for this user, or chosen from data about the user's
   circumstances?
3. Does the screen rank, score or pick coins, templates or providers?
4. Does it link to or name an exchange, wallet or provider, other than the Risk page's register
   link (§3.4)? Naming a figure's publisher as its source, unlinked and with no word on what the
   publisher offers or how it compares, is not naming a provider (§4's `[Source]`,
   `docs/EDUCATION.md` §9). Naming a provider as the subject of a dated, sourced event its customers
   suffered (a halt, an insolvency, a theft), unlinked, with no word on what it offers now and no
   comparison, is not naming a provider (`docs/EDUCATION.md` §9 rows `d.mt-gox` and `d.ftx`).
   Naming Kraken or Trade Republic as the format of a file the import reads and as the default venue of the entries
   it brings (ADR-0056), or showing back a venue the person logged, which is their own data
   (decided 2026-11-13), listed alphabetically, unlinked, with no logo, status word, comparison or reason to use it, beside
   `Choose a file`, in the not-recognised alert and in the import's own lines, nowhere else, is not
   naming a provider (`docs/CONTENT-STYLE.md` §3 rows `Import a file`, `Import not recognised` and
   `Import an exchange's file`).
5. Does it state or imply regulatory status, protection or compliance (regulated, licensed,
   authorised, MiCA-compliant, approved by)?
6. Is every historic figure dated, sourced and carrying the past-performance line (§3), with no
   projection and no hindsight figure without its label?
7. Does the change add a checkbox, banner, modal or email sentence that repeats a warning already
   shown on this path?
8. Does the copy pass the banned-words lint in all three languages, and is the screen within the
   word budgets of §4?
9. Is this a decision point (plan creation, a template, the first historic view, an export,
   checkout)? If yes, is there exactly one disclosure within §4's sentence limits, with a link, in
   the content style (§4); if no, is there none?
10. Does it store or read anything in the browser beyond what the user asked for, and is that named
    in the cookie-free statement (§5)?
11. If money is involved: are the Consumer Rights Directive art. 6 items, the "order with obligation
    to pay" button and the start-now consent present (§7)?
12. Would a UK visitor reach this screen (ADR-0029)?
13. Does every holding date shown come from the user's own entries and the rule, and does every
    country rule shown carry its source and last-reviewed date (`docs/JURISDICTIONS.md` §1)?
14. Does any sentence, line, cell or figure compute a tax result from the person's own figures, or
    say that Proof of Calm computes one (`docs/JURISDICTIONS.md` §1)? A tax result is a taxable gain
    or loss; a cost a tax method sets (a fraction of total cost, a net cost, a pool's or an average
    cost under a lot rule); a test against an allowance or a money threshold; a tax rate applied to
    the person's figures; a deemed return; or tax due, saved or refunded. These are not tax results
    and may stand:
    - a holding-status date, whether it has passed, and the units past it (question 13);
    - amounts, fees and units as logged, their sums and counts, and a logged amount shared over the
      units a sale took under the Log's matching (`docs/DOMAIN.md` §3.7);
    - a price or a value at a dated close or at the sale's own price, with its source, named as an
      estimate where it is one;
    - Portfolio's value, invested, average cost and P/L (`docs/DOMAIN.md` §3.6), one formula in every
      country, beside no word that calls them taxable;
    - a country's rate, allowance or threshold as its card or a dated fact states it, never applied to
      a figure of the person's or set beside one.

A finding on 1 to 5, 12 or 14 is a perimeter breach and blocks the merge (reported as judgment with
the rule); the others are findings the PR fixes.

## 7. Before charging money (M5)

1. Legal entity: open activity as an ENI (sole trader, simplified regime) if first-year revenue stays
   small, or incorporate a sociedade unipessoal por quotas if revenue is expected to pass roughly
   EUR 30–40k a year, if liability separation matters, or if the merchant of record asks for a company;
   both with a contabilista certificado; VAT status (art. 53 CIVA exemption or the normal regime) decided.
2. Payment path decided and approved in writing by the provider (ADR-0038) with the product
   description on file.
3. Invoicing path: one B2B invoice per payout to the merchant of record through the AT's free app, or
   certified invoicing software if selling direct (DL 28/2019; ATCUD, QR code, monthly SAF-T).
4. Terms updated with the Plus section; pre-contract information (Consumer Rights Directive art. 6)
   mapped to the checkout; confirmation email with it; the 14-day withdrawal right handled (a
   no-questions refund within 14 days of the first purchase exceeds the statutory position); the
   "start now" request recorded at checkout; the change process per the Digital Content Directive
   art. 19 (changelog, notice, right to terminate).
5. Livro de Reclamações Eletrónico registered and linked; RAL entities listed (Lei 144/2015 art. 18);
   consumer arbitration is mandatory at the consumer's option up to EUR 5,000.
6. Privacy notice and records of processing updated with the payment provider; invoice retention 10 years.
7. Copy review of all paid-tier text against §6.
8. UK and US VAT or sales tax are the merchant of record's problem; if selling direct, UK VAT
   registration from the first UK sale (moot while the UK is blocked).

## 8. Other regimes checked

- **NIS2**: does not apply (size cap; no size-independent category).
- **Cyber Resilience Act**: does not apply to the web app delivered through the browser; very
  probably applies to the store-wrapped app from 11 December 2027 (essential requirements,
  vulnerability handling, SBOM, conformity self-assessment, CE marking, reporting duties from
  11 September 2026). Plan the M3 store release with it in mind; `security.txt` and the disclosure
  policy already cover two of its requirements.
- **EU consumer law for the paid tier**: Consumer Rights Directive (pre-contract information,
  withdrawal), Digital Content Directive (conformity, updates, modification rules), DSA points of contact.
- **Impressum**: DDG § 5 does not formally bind a Portugal-established provider (country of origin),
  but DL 7/2004 art. 10 requires the same items; publish one identification block that satisfies both.
- **Data residency facts for the privacy notice**: Supabase's contracting entity is in Singapore
  (SCCs; metadata and support outside the region); Vercel's primary processing is in the US with
  functions pinned to Frankfurt and a global CDN; Sentry's EU region keeps events in Frankfurt and
  account metadata in the US; the mail provider per ADR-0026.

## 9. Open questions for the owner

Settled on 2026-10-17, on the owner's delegation:

- The name: Proof of Calm (§1, ADR-0040).
- The country of establishment: Portugal, where the owner is based, as this document assumed
  throughout; the legal form is chosen before charging (§7).
- "Data stays in the EU": not a promise; the privacy notice says where each kind of data is
  (ADR-0044).

Settled on 2026-11-08, by the owner:

- Repository visibility: public, from fresh history, with the earlier history kept private
  (ADR-0051).

None is open.
