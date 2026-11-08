# Benchmark: how comparable products disclose risk, and the minimum the law asks of this one

A living document. §1 is what the competitors do (read on 2026-10-19), §2 the legal minimum for a
custody-free planner established in Portugal, §3 the patterns to copy and to avoid, §4 the open
questions with their state, §5 how the counsel and brand roles use the file. The decision it feeds is
ADR-0047; the placements and the word budgets are in `docs/LEGAL.md` §4; the review steps in
`docs/CONTENT-STYLE.md` §8. Every row carries its source and the date it was read. General
information gathered for product design, not legal advice.

## 1. The competitor benchmark (read 2026-10-19)

Word counts are the fetch tool's estimates. "Store" means the Apple App Store listing of the
country named; in-app onboarding screens were not seen for any product (store descriptions, one
third-party Relai walkthrough and one sponsored BISON post are the proxies).

| Product | Where the warning sits | Length | Tone | Education placement | Tax rules shown | "Not advice" register | Source |
|---|---|---|---|---|---|---|---|
| Relai (CH, Bitcoin-only) | None on the site; two sentences at the end of the store description | 2 sentences | fine print after the pitch | Off-flow: blog, "21 Bitcoin Basics", podcast, FAQ; the 2021 savings-plan guide has a hindsight example ("worth 21,775 euros") and no caveat | None; only which regulator covers which entity | None | https://relai.app/ · https://apps.apple.com/ch/app/id1513185997 · https://relai.app/blog/bitcoin-savings-plan/ · https://www.coinpro.ch/en/?p=39541 (walkthrough of 2023-02-09, updated 2025-08-08) |
| Pocket Bitcoin (CH) | None on the site or legal page; one sentence at the end of the store description | 1 sentence | "consider consulting a financial advisor" | None | None | None | https://apps.apple.com/ch/app/pocket-swiss-bitcoin-wallet/id6452839193?l=en-GB · https://pocketbitcoin.com/legal (reader proxy) |
| 21bitcoin (DE/AT) | Three-word hero link "Investments bergen Risiken" to the AGB; one footer sentence | 1 sentence plus a link | same voice as the site | FAQ | Tax FAQ only: AT KESt 27.5 % withheld; DE nothing withheld, a Haltefrist tracker and reports; its own one-line "keine Steuerberatung" | One footer sentence combining risk and no-advice | https://21bitcoin.app/ · https://apps.apple.com/at/app/21bitcoin-kaufe-bitcoin-24-7/id1579302952 |
| Bitpanda (AT, MiCA CASP) | Calm above the fold, then nine stacked risk and disclaimer sentences at the bottom of the savings-plan page | 9 sentences | legal block, marketing-communication label | Linked Academy lesson (about 1,000 words, candid: "no positive impact on returns", two product CTAs, no disclaimer) | "may apply" | Dense block: "does not constitute advice… consult an independent adviser" | https://www.bitpanda.com/en/savings-plan · https://www.bitpanda.com/academy/en/lessons/what-is-the-cost-average-effect/ · https://apps.apple.com/at/app/bitpanda-buy-bitcoin-crypto/id1449018960?l=en |
| BISON (DE, Börse Stuttgart) | One standard sentence on the homepage and the savings-plan page, pointing to a "Basic and Risk Information" page (about 50 words plus a PDF dated 2026-05-27) | 1 sentence plus a document | plain | In flow on the savings-plan page: two examples and "a one-time investment could also yield a better return"; Academy and blog in a menu | Haltefrist tracker inside the portfolio view (sponsored post of 2026-07-30: sorted by the one-year mark, gain or loss per holding, needs the tax ID, one disclaimer line) | None on the site; in the store's asterisked fine print | https://bisonapp.com/en/savings-plan/ · https://bisonapp.com/en/documents/risk-information/ · https://apps.apple.com/de/app/bison-bitcoin-krypto-kaufen/id1362518159 · https://www.btc-echo.de/news/bitcoin-laenger-als-ein-jahr-im-depot-diese-app-weiss-es-sofort-sponsored-234906/ |
| Blockpit (tax tool) | None on the tracker page | 0 | marketing ("tagesgenau") | None | Day-exact holding-period tracker showing which gains are tax-free or soon will be | None | https://www.blockpit.io/de-de/haltefrist-tracker |
| Trade Republic (DE) | None on the site; two risk sentences and one past-performance sentence at the end of the store description | 3 sentences | fine print after "build long term wealth" | Help centre: the crypto-tax article is about 170 words (§23 EStG one-year period, personal rate, EUR 1,000 exemption, no withholding); the savings-plan article is about 100 words with no warning | In the help article, with a soft "obtain tax advice if necessary" | Soft, in the help article | https://traderepublic.com/en-de/crypto · https://apps.apple.com/de/app/trade-republic/id1410703839?l=en · https://support.traderepublic.com/en-lv/432-How-is-crypto-taxed |
| Scalable Capital (DE) | Short specific sentences spread across the crypto page (volatility, total loss, lost keys, issuer insolvency, past performance); on the ETF page a three-word "Investing involves risks" link near the top and one sentence pair lower down | 1 to 2 sentences per place | same voice as the page | Pros-and-cons block in the page; "There is no right answer as to whether an ETF savings plan is superior to a one-time investment" | Two sentences: "does not provide tax advice. Tax treatment is individual and can change." | No "not investment advice" line at all | https://de.scalable.capital/en/crypto · https://de.scalable.capital/en/etf-savings-plan |
| Coinbase (Learn) | The UK FCA warning on the DE store listing; the formal educational-purposes disclaimer in the site footer | 2 sentences (store), 1 paragraph (footer) | legal | Learn article with a hindsight Bitcoin example, "restricts your potential upside", a "Create account" CTA mid-article | None | Footer paragraph plus one soft sentence in the article | https://www.coinbase.com/learn/tips-and-tutorials/dollar-cost-averaging (reader proxy) · https://apps.apple.com/de/app/coinbase-buy-bitcoin-ether/id886427730?l=en |
| Kraken (DCA page, PT locale) | A dense disclaimer block under the marketing copy | about 7 sentences | legal | Linked articles with read times (2 to 10 min), not inline | "taxes may apply… seek independent advice" | Dense block | https://www.kraken.com/features/dollar-cost-averaging/bitcoin · https://apps.apple.com/de/app/kraken-buy-crypto-bitcoin/id1481947260?l=en |
| Bitvavo (NL) | None in the Recurring Buy help article (800 to 900 words); the FCA pair plus a cybercrime warning on the BE store listing | 3 sentences (store) | blunt fine print against "Trade the Future" | None in the listing | None | None | https://support.bitvavo.com/hc/en-gb/articles/16872556484497-Recurring-Buy (reader proxy) · https://apps.apple.com/be/app/id1483903423 |
| Swan Bitcoin (US) | One footer sentence; a hindsight example on the homepage ("$130,500 into $248,682") with no disclaimer | 1 sentence | marketing | A separate universe: course, show, research, articles | None | One footer sentence | https://www.swanbitcoin.com/ |
| River (US) | A bank-style footer one-liner ("not insured by the FDIC") | 1 sentence | US bank register | Learn article listing real drawbacks (capital inefficiency, fees on small buys), an italic disclaimer before "Key Takeaways", zero-fee buys sold in several places | None | Italic paragraph at the end of articles | https://river.com/ · https://river.com/learn/what-is-dollar-cost-averaging/ |
| Strike (US, EEA) | None on the homepage; the legal index routes EEA users to "Risk Disclosures (EEA/UK)" documents (text not opened) | unknown | unknown | None | None | None seen | https://strike.me/ · https://strike.me/legal/ |
| dcaBTC.com (calculator) | None; 2018 hindsight examples, no price-source attribution (the calculator itself did not render) | 0 | article | The page is the article | None | None | https://dcabtc.com/ (reader proxy) |
| Bitcoin Well DCA calculator | Under the tool: "an educational simulation tool only… not predictions or guarantees", not reviewed by any regulator, the operator earns from transactions | 3 sentences | plain | The tool is the education; still funnels to a recurring-buy product | None | Plain, next to the figure | https://bitcoinwell.com/tools/bitcoin-dca-calculator |
| Moneybox (UK, non-crypto) | "T&Cs apply. Capital at risk." next to the first CTA; one plain sentence in an "It's important you know" section; footnotes where a rule bites (LISA penalty) | 5 words, then 1 sentence | same voice as the page | In place, where the rule bites | Footnotes | "Financial plans are guidance, not financial advice." | https://www.moneyboxapp.com/ |
| Trading 212 (UK, AutoInvest) | No banner in the captured text (footer not captured) | unknown | — | — | One line under the ISA section: "Tax treatment depends on your individual circumstances" | — | https://www.trading212.com/invest/autoinvest (reader proxy) |

The regulatory baseline behind the EU firms' wording: the joint EBA, ESMA and EIOPA warning of
2022-03-17 ("the very real possibility of losing all their invested money"),
https://www.esma.europa.eu/press-news/esma-news/eu-financial-regulators-warn-consumers-risks-crypto-assets,
read 2026-10-19.

What the table says: nobody warns before each purchase; the live pattern is one short sentence at
the commitment point and the long text in a linked document; custodial brokers under MiCA or BaFin
carry the most copy because they must; the calm products write the risk sentence in the same voice
as the rest (Moneybox, Scalable); the honest education is Bitpanda's Academy and Scalable's "no right
answer" line; the anti-patterns are hindsight examples without a label (Relai, Swan, dcaBTC), CTAs
inside articles (Coinbase) and stacked legal blocks (Bitpanda, Kraken). Country tax rules live in help
articles, FAQs or a tracker inside the portfolio view, never on marketing pages.

## 2. The regulatory minimum for this product (read 2026-10-19)

| Regime | What it asks of a custody-free planner established in Portugal | Source |
|---|---|---|
| MiCA scope, Regulation (EU) 2023/1114 Art. 2(1), 3(1)(16), 3(1)(24), 7, 59, 60 | Applies to issuers, offerors and the providers of the ten listed services; "advice" is a personalised recommendation; Art. 7 binds marketing of an offer to the public; authorisation is triggered by providing a service, not by publishing information. A planner that provides none of the ten services is outside Art. 2(1) | https://www.springlex.eu/en/packages/mica/mica-regulation/article-2/ (mirror of OJ L 150; EUR-Lex blocked the fetch), …/article-3/, …/article-7/, …/article-59/, …/article-60/ |
| ESMA Q&A 2882 (2026-06-18), the perimeter of advice | Broader than MiFID II: recommending a crypto-asset service or a CASP can be advice without naming a transaction. Five tests: a recommendation; about transactions or services; presented as suitable or based on the person's circumstances; issued otherwise than exclusively to the public; to a person as an investor. "Providing solely a reference to a CASP (without further indications) equally accessible to all potential investors should not constitute a recommendation" | https://www.esma.europa.eu/publications-data/questions-answers/2882 |
| ESMA Guidelines on reverse solicitation, ESMA35-1872330276-2030 (2025-02) | Solicitation is read broadly (sites, apps, banners, affiliates), but "educational materials, trainings, and industry events that are purely educational… should not be considered solicitation" unless the audience is directed to a firm's services | https://www.esma.europa.eu/sites/default/files/2025-02/ESMA35-1872330276-2030_Guidelines_on_reverse_solicitation_under_MiCA.pdf |
| BaFin Merkblatt Anlageberatung (2025-02-10), the four elements | A recommendation; a concretely named financial instrument; based on personal circumstances or presented as suitable; not given exclusively through information channels or to the public. "An einer Empfehlung fehlt es bei bloßen Informationen"; naming an asset class is not advice | https://www.bafin.de/SharedDocs/Veroeffentlichungen/DE/Merkblatt/mb_250210_anlageberatung.html |
| ESAs joint factsheet on crypto-assets and MiCA (2025-10-06; PT, DE, EN) | An official consumer explainer to link from the Risk page | https://www.esma.europa.eu/sites/default/files/2025-10/Updated_Joint_ESAs_Factsheet_on_crypto-assets_PT.pdf · https://www.bafin.de/SharedDocs/Veroeffentlichungen/DE/Meldung/2025/meldung_2025_10_06_kryptowerte_informationsblatt.html |
| Identification: ECD 2000/31 Art. 5(1), DL 7/2004 art. 4, 5 and 10; DDG § 5 | Name, geographic address, email, register and number, supervisory authority where an authorisation scheme applies, VAT number; easily, directly and permanently accessible. Portuguese law applies to a Portugal-established provider; one block satisfies DDG § 5 too when legal form and representative are added | https://www.legislation.gov.uk/eudr/2000/31/pdfs/eudr_20000031_adopted_en.pdf · https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=1399&tabela=leis · https://www.gesetze-im-internet.de/ddg/__5.html |
| ADR information: Directive 2013/11 Art. 13, Lei 144/2015 art. 18, Lei 24/96 art. 14 | Traders bound to an ADR entity by adhesion or by law name those entities and their websites on the site and in contracts; necessary arbitration at the consumer's option for low-value disputes is the binding in Portugal | https://www.legislation.gov.uk/eudr/2013/11/article/13 · https://pgdlisboa.pt/leis/lei_mostra_articulado.php?artigo_id=2425A0018&ficha=1&nid=2425&nversao=&pagina=1&so_miolo=S&tabela=leis · https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=726&tabela=leis |
| ODR: Regulation (EU) 2024/3228 | Complaint submission ended 2025-03-20; Regulation 524/2013 repealed 2025-07-20; no ODR link or sentence is needed | https://oeil.europarl.europa.eu/oeil/en/document-summary?id=1800145 |
| GDPR Art. 13 | Whenever data are collected (account, sync, reminders, error events): controller, purposes and bases, recipients, transfers, retention, rights, complaint, whether provision is contractual. A local-only mode that collects nothing needs no notice for that mode | https://gdpr-info.eu/art-13-gdpr/ |
| ePrivacy Art. 5(3), WP29 Opinion 04/2012, EDPB Guidelines 2/2023 v2.0 (2024-10) | No consent for storage strictly necessary for a service the user requested; UI preferences are exempt for a session, or persistently with a short notice at the control; persistent login tokens are not exempt (disclose them as requested); IP-only tracking can trigger Art. 5(3); applicability does not mean consent is needed | https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf · https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf |
| Paid tier: CRD 2011/83 Art. 6, 8(2), 8(7), 16(m); DCD 2019/770 Art. 19 | Pre-contract items, the "order with obligation to pay" button, confirmation on a durable medium, express consent plus acknowledgement before starting within 14 days; modifications with a reason, notice and a 30-day right to terminate | https://www.legislation.gov.uk/eudr/2011/83/article/6, …/article/8, …/article/16 · https://www.legislation.gov.uk/eudr/2019/770/article/19 |
| The UK reason: FCA PS23/6 (2023-10-08), COBS 4.12A, PS22/10 | The promotion regime reaches any firm marketing cryptoassets to UK consumers regardless of location; four lawful routes; illegal communication is a criminal offence. COBS 4.12A.11R prescribes the fixed-top warning, 4.12A.37R its placement, direct offers need a 24-hour cooling-off. Hence ADR-0029: GB requests are blocked at the edge (`docs/LEGAL.md` §2 owns the claim and its accepted leakage), and the FCA wording is not imported | https://www.fca.org.uk/publication/policy/ps23-6.pdf · https://www.handbook.fca.org.uk/handbook/COBS/4/12A.html · https://www.fca.org.uk/publications/policy-statements/ps22-10-strengthening-our-financial-promotion-rules-high-risk-investments-firms-approving-financial-promotions |

What this means: nothing in MiCA, BaFin's test or CMVM practice requires a risk warning from a
non-CASP; the warnings are a liability and positioning choice (ADR-0011). Not required: a cookie
banner, an ODR sentence, registration with a financial authority, a MiCA Art. 7 statement, the FCA
fixed-top warning or cooling-off, a DPO or EU representative, age verification, or a warning on every
page, module, email and export.

## 3. Patterns to copy and to avoid

Evidence on placement and wording (publication dates not recorded; read 2026-10-19): the FCA's
behaviourally informed risk
warnings raised comprehension by 6 to 10 points and perceived crypto risk by 13 to 17 points over
"Your capital is at risk", 48 % opened "Take 2 minutes to learn more", and the warnings lowered
the perceived risk of ordinary stocks shown alongside
(https://www.fca.org.uk/publication/research/behaviourally-informed-risk-warnings.pdf); short,
salient information at a decision point improved comprehension while checkboxes and typed
confirmations added nothing and were ticked mindlessly
(https://www.fca.org.uk/publication/research/decision-points-consumer-journeys.pdf); simplified
warnings helped only on product pages, not in short posts
(https://www.fca.org.uk/publication/occasional-papers/occasional-paper-47.pdf); telling consumers
that cryptoassets are "regulated" increased demand and overestimated protection
(https://www.fca.org.uk/publication/research-notes/regulation-consumer-decision-making-evidence-online-experiment.pdf);
users skip anything styled like a promotion, 33 times fewer fixations
(https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/) and read at most 28 % of
a page's words (https://www.nngroup.com/articles/how-little-do-users-read/); mandated disclosure
fails by overload within and clutter across disclosures, so the cure is fewer, not plainer
(https://www.theregreview.org/2015/06/15/ben-shahar-schneider-failed-disclosure/); the EU KID
testing of 2015 found more detail lowered objective comprehension
(https://service.betterregulation.com/sites/default/files/upload/2017-04/consumer-testing-study-executive-summary-2015_en_1.pdf).

Copy:

- One short sentence pair at the commitment point, in the product's own voice and typography
  (Moneybox, Scalable's ETF page, BISON's single sentence), with a link to the Risk page instead of
  more text in place.
- The long text in one linked document (BISON's 50-word page plus PDF, Strike's EEA documents).
- The holding rule as data beside the holding: a computed date and a state, one "computed from your
  dates, not tax advice" line per jurisdiction (BISON's tracker, Blockpit's day-exact view), the rule
  itself in about 170 words in Learn (Trade Republic's help article).
- Education that names the drawback (Bitpanda Academy: the effect does not raise returns; Scalable:
  no right answer between a plan and a lump sum).
- A label directly under any historical or simulated figure (Bitcoin Well: "educational simulation…
  not predictions or guarantees").
- Where a status must be stated, the negative fact only: not registered or supervised, no
  compensation scheme; a neutral link to the public register as scam protection.

Avoid:

- A warning before each purchase, on every screen, module, email or export; a coloured bar at the
  top or bottom of the screen; a checkbox, typed confirmation or cooling-off screen beyond the one
  acknowledgement at plan creation.
- Stacked legal blocks (Bitpanda's nine sentences, Kraken's block) and the pitch-versus-fine-print
  split of store listings (BISON, Trade Republic, Bitvavo, Kraken).
- Hindsight profit figures without a dated label (Relai, Swan, dcaBTC) and CTAs inside articles
  (Coinbase).
- Any claim of regulatory status or compliance ("regulated", "licensed", "authorised",
  "MiCA-compliant", "approved by"), and a "low risk" label next to a crypto template (the FCA's
  spillover finding).
- Imported deposit, bank, FDIC or custody language (River, Bitpanda, 21bitcoin's EUR balance note)
  and the UK FCA two-sentence warning (a UK-regime artefact while the UK is blocked).

## 4. Open questions and their state

| Question | What was found (date) | State | Consequence |
|---|---|---|---|
| Named-asset templates: may a non-personalised template name an asset (BTC, ETH) under ESMA Q&A 2882? | Read 2026-10-19: the Q&A does not address naming an asset. Its tests ask whether there is a recommendation at all, whether it is "presented as suitable or based on a consideration of the person's circumstances" and whether it is "issued otherwise than exclusively to the public". BaFin's Merkblatt (2025-02-10) adds that "bloße Informationen" are no recommendation. A template shown identically to everyone, chosen by the user with no questionnaire, with the risk label first and "you choose every setting", fails the suitability and the not-public tests, so by the published tests it is not advice; no regulator has said so about templates as such | Open: no source answers it directly | The template line in `docs/LEGAL.md` §4 stays unchanged; the perimeter rules of `docs/LEGAL.md` §3 (no questionnaire, no ranking, no provider) are what keeps the answer this way |
| The German holding-period line ("tax-free from <date>", § 23 EStG): is it "Hilfeleistung in Steuersachen" under StBerG §§ 2 to 6? | Read 2026-10-19: § 2(1) StBerG, as amended by the Neuntes Gesetz zur Änderung von Vorschriften im Steuerberatungsrecht of 2026-06-29 (BGBl. 2026 I Nr. 197, in force 2026-09-01), reserves geschäftsmäßige Hilfeleistung to authorised persons "ohne Unterschied für hauptberufliche, nebenberufliche, entgeltliche oder unentgeltliche Tätigkeiten"; § 2(2) defines it as any activity in others' affairs "sobald sie eine rechtliche Prüfung des Einzelfalls erfordert"; § 2(3) excludes scientific opinions and mechanical bookkeeping; § 6(1) no. 2 exempts help "die nicht im Zusammenhang mit einer entgeltlichen Tätigkeit steht", and § 6(2) then requires that unpaid help to non-relatives is given by or under the guidance of a qualified person (https://www.gesetze-im-internet.de/stberg/__2.html, https://www.gesetze-im-internet.de/stberg/__6.html; the amendment history from https://www.buzer.de/2_StBerG.htm and https://www.haufe.de/id/norm/steuerberatungsgesetz-2-geschaeftsmaessige-hilfeleistung-HI928673_p2.html; these sources were read outside the research set that fed §1 to §3). Neither the statute nor the two secondary pages say whether adding a fixed statutory period to a date the user entered is a "rechtliche Prüfung des Einzelfalls"; the question turns on that phrase. Market practice (BISON's tracker, Blockpit, 21bitcoin's FAQ) shows the line with a one-line "keine Steuerberatung" disclaimer, which is evidence of practice, not of law | Open: the statute's new test is unglossed; a commentary or a Steuerberaterkammer statement on software is still needed | The DE line in `docs/JURISDICTIONS.md` §7.7 and the holding-status copy in `docs/CONTENT-STYLE.md` §3 stay unchanged until answered; the line is computed from the user's own dates, states no rate and no amount, and sits beside "not tax advice" |
| The German § 36 VSBG sentence in the Impressum | Not researched (listed as not found on 2026-10-19). A Portugal-established provider follows Portuguese law under DL 7/2004 art. 4 | Open: unsourced | The sentence stays in `docs/LEGAL.md` §5 until sourced; it is one line and harms nothing |

An answered question moves its consequence into `docs/LEGAL.md`, `docs/JURISDICTIONS.md` or an ADR
in the same PR, and its row here records the answer, the source and the date.

## 5. How the roles use this file

- **Counsel** (`.claude/agents/counsel.md`): the checklist in `docs/LEGAL.md` §6 is answered against §2
  here; a change that adds a disclosure names the row of §3 it follows; a finding that depends on an
  open question of §4 is reported as judgment with the row.
- **Brand** (`.claude/agents/brand.md`): every new disclosure gets one competitor comparison from §1
  (which product does this best, and how many words it uses); the three recurring failures of
  `docs/CONTENT-STYLE.md` §8 are checked against the anti-patterns of §3.
- **The quarterly content review** (`docs/CONTENT-OPS.md`): re-read the §1 rows whose products
  changed their flow, and the §4 states; add the date to the row.
