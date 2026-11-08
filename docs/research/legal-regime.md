# Proof of Calm — legal regime research

Research date: 2026-10-16 (all sources accessed on this date unless stated). Product assumptions as briefed: web-first PWA later wrapped for app stores; custody-free; no exchange or affiliate links; generic templates with risk labels; education modules with risk warnings; minimal account (magic link / passkey) storing one plan and its log; local-only mode; free core forever, later "Proof of Calm Plus"; optional tips; no payments at launch. Stack: Next.js on Vercel, Supabase (EU region), Resend, Sentry, CoinGecko via a server-side cache, privacy-first or no analytics, no third-party scripts. Owner: solo builder, assumed established in Portugal (this assumption drives sections 2, 4 and 6; it is flagged where it matters). Launch markets EU (PT, DE), worldwide-ready, UK/US visitors expected.

This document is general information for product design, not legal advice. Where a point should be confirmed by a Portuguese contabilista certificado or a lawyer before money changes hands, it says so.

Method note: primary sources were fetched directly (legislation.gov.uk, FCA Handbook/PDFs, gesetze-im-internet.de, EDPB PDF, provider DPAs and policy pages). EUR-Lex refused the fetcher, so MiCA/CRD/DCD/DSA article text is given from the regulation as published, cross-checked against ESMA's own quotation where available, and marked accordingly. Web-search quota ran out mid-way; a few secondary items (BaFin page text, Lei 144/2015 article text, AT invoicing-software page, Paddle payout mechanics) could not be re-fetched and are marked "knowledge, verify". Each citation `[S#]` is listed in section 10 with publisher, date, URL and a confidence grade (H/M/L).

---

## 0. Decisions in one screen

| Topic | Position | Confidence |
|---|---|---|
| UK at launch | Geo-block UK sign-ups and show a plain explanatory page (option i). Move to option ii (neutral UK mode) only after a copy-review process exists, a UK GDPR representative is appointed, and a short UK legal opinion on the template copy is obtained. | M-H |
| MiCA | Proof of Calm as described is not a CASP and provides neither "advice on crypto-assets" nor "portfolio management". Stays so only if it never personalises a template, never ranks coins, never recommends a CASP/exchange, and the user builds the plan. | H |
| GDPR roles | Proof of Calm is controller; Supabase, Vercel, Resend, Sentry are processors; CoinGecko receives no personal data. DPO: no. EU representative: no. UK representative: yes in principle if UK users are served (contradicts brief). ROPA: yes, one page. | H / M for UK rep |
| "Cookie-free" | True for storage (auth session, IndexedDB plan, theme/locale are strictly necessary). It does not by itself make script-based analytics consent-free in DE or PT. Server-side aggregate counting is consent-free in all four countries; Plausible/Umami/Vercel Web Analytics need consent in DE and PT, are exempt in FR only under CNIL conditions, and are exempt in the UK under the new "statistical purposes" exception with an opt-out. | M-H |
| Age | State 18+ in Terms (investing context), no verification; GDPR Art. 8 digital-consent ages are 13 (PT, UK), 15 (FR), 16 (DE) but irrelevant because the lawful basis is contract. | H |
| Impressum | Publish a full identification block on a Contact/Impressum page that satisfies DL 7/2004 art. 10 (PT) and mirrors DDG § 5 (DE). Avoid the home address by using a company seat / registered business address at a domiciliation or coworking provider. Do not link the EU ODR platform (shut down 20 July 2025). | H |
| Payments | Lemon Squeezy: prohibited. Polar: prohibited. Paddle: not expressly banned but "investment or financial advice, including trading signals and strategies" makes it restricted in practice; get written pre-approval. Stripe Payments: allowed (not listed) with discretionary risk. Stripe Managed Payments (merchant of record, 3.5% on top of card fees): Portugal eligible; apply. Recommendation: Stripe Managed Payments as primary if approved, Paddle (pre-approved) as fallback, Stripe Payments + Stripe Tax + OSS + certified invoicing as the always-available fallback. | M |
| security.txt / NIS2 / CRA | Publish `/.well-known/security.txt` per RFC 9116 with Contact and Expires. NIS2 does not reach a micro SaaS. CRA does not reach the web PWA, but the app-store wrapper from 11 Dec 2027 very probably does (contradicts "likely not"). | H / M |

---

## 1. UK: FCA cryptoasset financial promotions regime

### 1.1 The regime in force since 8 October 2023

**Statutory base.** FSMA 2000 s21(1): a person must not, in the course of business, communicate an invitation or inducement to engage in investment activity unless authorised or the content is approved by an authorised person (s21(2)). s21(3): a communication originating outside the UK is caught only if it is "capable of having an effect in the United Kingdom". s21(13): "communicate" includes causing a communication to be made. s21(14) "investment" was extended in 2023 to cover cryptoassets expressly. Breach is a criminal offence (up to 2 years' imprisonment and/or an unlimited fine). `[S1]`

**The 2023 amendment order (SI 2023/612).** `[S2]`
- Inserts the definition of "qualifying cryptoasset" into FPO Schedule 1 para 26F: a cryptoasset that is (a) fungible and (b) transferable, excluding e-money, fiat, digitally issued fiat, other controlled investments and some limited-use tokens. Bitcoin, ether, major stablecoins and most fungible tokens qualify; NFTs do not.
- Adds qualifying cryptoassets to the controlled activities in FPO Schedule 1: para 3 (dealing), para 4 (arranging), para 5 (managing), para 7 (advising). This matters for the perimeter test: "engaging in investment activity" (s21(8)) means entering into an agreement whose making or performance is a controlled activity by one party, or exercising rights to acquire/dispose of a controlled investment. A UK consumer buying bitcoin on an exchange is engaging in investment activity; an inducement to do that is a financial promotion.
- Creates FPO art. 73ZA: an exemption for communications made by (or prepared by) a cryptoasset business registered with the FCA under the MLRs, relating only to qualifying cryptoassets.
- Removes two exemptions for crypto communications: art. 51 (HNW/sophisticated investor associations) and art. 61(3) (sale of goods and services). Articles 12 (overseas recipients), 48-50A and 72 were not amended. `[S2]`
- In force for all purposes 7/8 October 2023 (made 7 June 2023, four months later).

**The four lawful routes (FCA).** "1. The promotion is communicated by an FCA authorised person. 2. The promotion is made by an unauthorised person but approved by an FCA authorised person. 3. The promotion is communicated by a cryptoasset business registered with the FCA under the MLRs. 4. The promotion otherwise complies with the conditions of an exemption in the Financial Promotion Order." Promotions outside these routes breach s21, "a criminal offence punishable by up to 2 years imprisonment, an unlimited fine, or both." The FCA's definition of a financial promotion for this purpose expressly includes a firm's "website, mobile apps, social media posts and online advertising." `[S3]`

**FCA rules (PS23/6, COBS 4.12A), binding on routes 1-3.** `[S4][S5]`
- Risk warning (COBS 4.12A.11R): "Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment and you should not expect to be protected if something goes wrong. Take 2 mins to learn more." with a linked risk summary (durable medium if non-digital).
- 24-hour cooling-off before a direct-offer promotion to a first-time investor with the firm (COBS 4.12A.18R).
- Ban on monetary and non-monetary incentives, including refer-a-friend bonuses (COBS 4.12A.7R-9B).
- Client categorisation (restricted/HNW/sophisticated, COBS 4.12A.21R-22R) and appropriateness assessment before processing orders from a direct-offer promotion (COBS 4.12A.28R).
- Cryptoassets are "Restricted Mass Market Investments". `[S4]`

**Overseas firms and technology neutrality.** PS23/6 §1.1: "The financial promotions regime will apply to all firms marketing cryptoassets to UK consumers regardless of whether the firm is based overseas or what technology is used to make the promotion." §1.36: "All firms marketing cryptoassets to UK consumers, including those based overseas, must get ready for this regime." `[S4]` FG24/1 (March 2024) §2.47: "The territorial scope of the financial promotion regime is deliberately broad. ... Financial promotions do not need to be expressly targeted towards UK consumers to be capable of having an effect in the UK ... if UK consumers can view the promotion and potentially engage in the investment activity that is being promoted, the communication is likely to be capable of having an effect in the UK." §2.52: statements that a promotion is "directed only at persons outside the UK" are not enough unless real steps limit UK consumers' ability to engage; the FCA's consultation response adds: "operating a separate UK social media profile and using geo-location tools to redirect consumers automatically are strategies that firms should consider." `[S6]`

### 1.2 Enforcement 2023-2026, including apps and websites

- Day one (9 Oct 2023): "We issued 146 alerts about cryptoasset promotions on the first day of the new regime." The FCA expects "social media platforms, app stores, search engines", domain registrars and payments firms to act on alerts. `[S7]`
- First year: an FT report (Jan 2025) put alerts at 1,702 between Oct 2023 and Oct 2024 with about 54% ending in take-down of the ad, app or website. Secondary, not independently verified. `[S8]`
- HTX (formerly Huobi): High Court proceedings issued 21 Oct 2025 and announced 10 Feb 2026, the first court action against an offshore exchange under the regime. The FCA says HTX "continued to publish financial promotions in breach of these rules" on its website and "TikTok, X, Facebook, Instagram and YouTube"; the FCA "asked Google Play and Apple to remove HTX apps from their UK stores" and asked social platforms to block HTX accounts for UK consumers; restricting new UK registrations was treated as insufficient while existing UK users could still log in and see promotions. The press release repeats: "From October 2023, all cryptoasset firms marketing to UK consumers, including firms based overseas, must comply with the regime." `[S9][S10]`
- Pattern: the FCA's tools against overseas websites/apps are warning-list entries, take-down requests to app stores, platforms, registrars and payment firms, and (rarely) court action. The FCA treats an app in a UK store and a website viewable from the UK identically.

### 1.3 The 2025-2026 regulated-activities regime (CP25/xx and PS26/xx)

- **Legislation.** The Financial Services and Markets Act 2000 (Cryptoassets) Regulations 2026 (SI 2026/102) amend the RAO to create regulated activities for: issuing qualifying stablecoin; safeguarding of qualifying cryptoassets and relevant specified investment cryptoassets (RAO art. 9N); operating a qualifying cryptoasset trading platform (art. 9S); dealing in qualifying cryptoassets as principal (art. 9T) and as agent (art. 9W); arranging deals in qualifying cryptoassets (art. 9Y); qualifying cryptoasset staking (art. 9Z6). They also create designated activities for public offers/admissions and market abuse. A text search of the SI shows no "advising on" or "managing" qualifying cryptoassets activity; the only "advis" hits are "advisers" in the insider-list provision. `[S11][S12]`
- **Financial promotions after go-live.** Reg. 42 of SI 2026/102 amends the FPO: it re-defines "qualifying cryptoasset" by reference to RAO art. 88F, adds the cryptoasset disclosure document to art. 70, and **omits art. 73ZA** (the MLR-registered-firm exemption) at full commencement, i.e. route 3 disappears; crypto promotions will then need an authorised communicator, s21 approval or another FPO exemption. It also inserts safeguarding and staking as controlled activities in FPO Schedule 1 (after para 7 "advising on investments"). `[S11]`
- **Dates.** Regime applies to firms authorised "on or after 25 October 2027". FCA consultations CP25/14, CP25/15, CP25/25, CP25/40 (16 Dec 2025 - 12 Feb 2026), CP25/41, CP25/42, CP26/4; final rules PS26/11 (regulated cryptoasset activities), PS26/12 (prudential) and PS26/13 (Handbook application) published 30 June 2026. `[S13][S14]`
- **Could a planner ever be "advising" or "arranging"?** Advising on qualifying cryptoassets is a controlled activity for promotions (FPO) but is **not** a regulated activity under SI 2026/102 (only advising on "specified investment cryptoassets", i.e. tokenised securities, is caught via the existing RAO art. 53). So a UK user receiving generic plan templates does not make Proof of Calm an unauthorised adviser; the exposure is the promotions regime and, if templates were personalised, the general "advice" characterisation that regulators use in perimeter reasoning. Arranging (art. 9Y) needs arrangements for another person to buy/sell: a planner with no exchange links, no order routing, no API trading and no referral flow does not arrange. Design rules that keep this true: no deep links to exchanges, no "buy now" hand-offs, no affiliate codes, no trading API keys, reminders that say "your plan says today is a buy day" and nothing about where or how to buy. Confidence M.

### 1.4 Does Proof of Calm make a financial promotion when a UK person uses it?

**The test (PERG 8.4).** Objective test: would a reasonable observer consider the communication intended to persuade or incite someone to engage in investment activity? "A communication which does not have any element of persuasion or incitement will not be an invitation or inducement." Relevant FCA examples: trading methods, training courses and "software-based or manual trading tools" are often too remote to be inducements but become inducements if sold as near-certain to produce profits; electronic decision trees that take user input and return recommendations are inducements, decision trees that only identify generic options are not; "historic prices alone are never invitations or inducements"; performance tables and factual comparison tables are not inducements unless presented as recommendations to buy or sell; purely educational material is not an inducement; a statement that a communication is not an invitation "may be regarded as evidence" of that unless the content says otherwise. `[S15]`

Applied to the brief:

| Feature | Analysis | Residual risk |
|---|---|---|
| (a) Free planner and education, no exchange links | Not a promotion if the content explains how DCA works, lets the user set a plan, and never urges buying. The main exposure is Proof of Calm's **own marketing** ("start stacking bitcoin", "build wealth slowly"): that would be an inducement to engage in investment activity (buying a controlled investment) communicated in the course of business, by an unauthorised, unregistered overseas person, capable of having an effect in the UK. | Low for product; Medium for landing-page copy |
| (b) Templates "Bitcoin only, never sell", "Cycle plan" | A pre-named template that selects an asset and a cadence reads closer to a recommendation than a generic option; under PERG 8.4 a decision tree that identifies generic options is fine, one that outputs "buy X on schedule Y" is an inducement. Risk labels help but naming is persuasive. For UK users: rename to neutral structures ("single-asset plan", "fixed-interval plan", "cycle-aware plan"), make the user pick the asset, show the risk label first, and never show "expected" results. | Medium |
| (c) Paid tier for software features | Selling sync/reminders/CSV import is not promoting investment activity. The paid-tier copy must still avoid gain language. If a UK user pays, UK consumer law (CCRs 2013, CRA 2015) applies, and UK VAT on digital services applies from the first sale unless a merchant of record sells. | Low |
| (d) "Red day" page: plan drawdown next to past cycle drawdowns | Historic data is expressly "never" an inducement on its own. It becomes one if framed as "buy the dip now" or "this is where fortunes were made". Keep it descriptive, show the date range, add a past-performance line. | Low |

**Options for launch.**

| Option | Consequences |
|---|---|
| (i) Block UK sign-ups; plain explanatory page | Removes s21 exposure (FG24/1 endorses geo-location tools as a legitimate control), removes the UK GDPR art. 27 representative duty, PECR and UK consumer-law work. Costs: lost UK audience; needs reliable geo-IP (Vercel request geo headers), a "not available in the UK yet" page with no persuasive content, and consistent treatment in app stores later (do not list in the UK storefront). VPN leakage is acceptable: the point is that the service is not directed at the UK. |
| (ii) Allow UK users with templates and promotional framing hidden; neutral tools + education + FCA-style risk summary | Defensible on PERG 8.4, but Proof of Calm would be an unauthorised, unregistered overseas communicator; one persuasive sentence in a module, email or changelog is a strict-liability criminal offence with the FCA's app-store take-down lever behind it. Requires: a UK GDPR representative, a copy-lint gate on every release, the risk summary, and ideally a short UK legal opinion on the template copy. |
| (iii) Allow everything | Not advisable: named asset templates plus marketing copy is where the inducement argument is strongest. |

**Recommendation:** option (i) at launch, option (ii) as the planned second step. Confidence M-H. **Re-evaluation triggers:** UK waitlist demand that justifies a UK legal opinion (set a number, e.g. 500 UK sign-up attempts); publication of FCA guidance on educational/planning tools under the 2027 regime; or Proof of Calm deciding to add any UK-specific content. Also re-check in Q3 2027 when route 3 ends (25 Oct 2027), because the FCA will be reshaping the promotions landscape then. `[S11][S13]`

---

## 2. EU: MiCA (Regulation (EU) 2023/1114) and EU consumer law

### 2.1 Crypto-asset services and the advice definition

Article 3(1)(16) lists the crypto-asset services: (a) providing custody and administration of crypto-assets on behalf of clients; (b) operation of a trading platform for crypto-assets; (c) exchange of crypto-assets for funds; (d) exchange of crypto-assets for other crypto-assets; (e) execution of orders for crypto-assets on behalf of clients; (f) placing of crypto-assets; (g) reception and transmission of orders for crypto-assets on behalf of clients; (h) providing advice on crypto-assets; (i) providing portfolio management on crypto-assets; (j) providing transfer services for crypto-assets on behalf of clients. Article 3(1)(15): a CASP is a legal person or other undertaking whose occupation or business is the provision of one or more crypto-asset services to clients on a professional basis. Article 3(1)(24): "providing advice on crypto-assets" means offering, giving or agreeing to give personalised recommendations to a client, either at the client's request or on the initiative of the CASP, in respect of one or more transactions relating to crypto-assets, or the use of crypto-asset services. Article 3(1)(23): portfolio management means managing portfolios in accordance with mandates given by clients on a discretionary client-by-client basis where such portfolios include one or more crypto-assets. Authorisation: Article 59. Conduct for advice/portfolio management (suitability): Article 81. `[S16]` (EUR-Lex text; article wording confirmed against ESMA's quotation in `[S17]`; confidence H.)

**ESMA Q&A 2882 (18 June 2026).** ESMA's four questions for advice: is it a recommendation; does it relate to crypto-asset transactions or to the use of crypto-asset services; is it presented as suitable or based on the person's circumstances and made other than exclusively to the public; is it made to the person as an investor or agent. ESMA states the MiCA advice perimeter "should be regarded as broader than the perimeter of advice under MiFID II" because it also covers recommendations on the **use of crypto-asset services** (e.g. recommending a particular CASP to an investor can be advice), whereas "providing solely a reference to a CASP (without further indications)" that is equally accessible to all potential investors is not a recommendation. `[S17]`

### 2.2 Information/education versus advice: where the line is

- MiFID "personal recommendation" (Delegated Regulation (EU) 2017/565 art. 9): a recommendation to a person in their capacity as investor, presented as suitable for that person or based on a consideration of their circumstances, to buy/sell/hold a specific instrument; "a recommendation is not a personal recommendation if it is issued exclusively to the public". CESR's 2010 Q&A on advice adds that generic advice and information are not advice, but a filtering tool that takes personal inputs and returns a specific product can be. `[S18]` (knowledge of the text; H)
- BaFin (Anlageberatung guidance, MiFID): advice requires a recommendation to a specific person that is based on an examination of personal circumstances or presented as suitable; general recommendations issued to the public or via information channels, pure product information, advertising and financial analysis are not advice; model portfolios presented as suitable for "people like you" can tip into advice. Under MiCA/KMAG (Kryptomärkteaufsichtsgesetz, in force 27 Dec 2024) BaFin is the German NCA and "Beratung zu Kryptowerten" needs CASP authorisation; the BaFin page could not be fetched in this session (404) so this is stated from knowledge. `[S19]` (M)
- AMF (France) updated its doctrine in 2026 on crypto advice for FIAs; it reads art. 3(1)(24) the same way (personalised recommendation). `[S20]`

**Verdict.** A non-custodial planner/educator that offers generic templates labelled as starting points, never adapts them to a user's circumstances, never ranks coins, never names an exchange to use, and lets the user build and own the plan is on the information side. It provides none of services (a)-(j). Confidence H, conditional on the behaviours below.

### 2.3 Wording and product behaviour that keep Proof of Calm on the information side

- The user chooses the asset(s), amount, cadence and rules. Templates pre-fill structure only; if they pre-fill an asset, show that as an editable default with the risk label above it.
- No questionnaire about income, goals, risk tolerance or age that then selects or ranks templates. (That is the single most common way a tool becomes "advice".)
- No ranking, scoring or "top coins". Asset lists alphabetical or by the user's choice; prices are data, not signals.
- No CASP/exchange recommendations, comparisons or links. ESMA treats introducing a CASP as potentially advice. A neutral sentence ("any regulated exchange or broker") is fine.
- Second person only for the user's own plan ("the plan you set", "your rule"), never for the market ("you should buy").
- Historic illustrations are descriptive, dated, and carry the past-performance line; no "expected return" or projections. Drawdown pages show what happened, not what to do.
- Reminders are mechanical: "Today is a plan day. Your rule: 50 EUR into the asset you chose." No "good time to buy".
- Education states facts and documented practices ("a rule some people follow"), with the risk warning in each module.
- Terms say the service is software for recording and visualising a plan the user designs; no recommendation; no suitability assessment.

### 2.4 National points

- **Portugal.** Lei n.º 69/2025 of 22 December 2025 implements MiCA. Banco de Portugal authorises CASPs, handles acquisitions of CASPs, significant CASPs, ART/EMT matters and prudential/governance requirements; CMVM supervises public offers and admissions of crypto-assets (other than ARTs/EMTs), market abuse, and CASPs' conduct and service-specific obligations (custody, trading platforms, etc.). Authorisation starts with a notification/request to Banco de Portugal, which informs CMVM. The law extended the transitional period for VASPs registered with Banco de Portugal on 30 December 2024 (MiCA art. 143(3) caps grandfathering at 1 July 2026; verify the exact national date in the law). The law also amends the Livro de Reclamações regime. `[S21][S22]` None of this touches Proof of Calm unless it starts performing a service in 2.1.
- **Germany.** KMAG + BaFin as NCA; the German concept of "Anlageberatung" (WpHG/KWG) applies to financial instruments, so bitcoin-type tokens are now governed by MiCA's definition. Keep German copy free of "empfehlen/empfohlen", "sollten Sie kaufen", "geeignet für Sie". `[S19]` (M)

### 2.5 EU consumer-law basics for the paid tier (later)

- **Consumer Rights Directive 2011/83/EU as amended by 2019/2161** (PT: DL 24/2014; DE: BGB §§ 312 ff.): pre-contract information (art. 6(1): identity and address, main characteristics, total price and recurring charges, duration and termination, withdrawal right and model form, functionality and interoperability of digital content/services, complaint handling, ADR); confirmation on a durable medium (art. 8(7)); 14-day withdrawal (art. 9). Proof of Calm Plus is a continuing **digital service** (sync, reminders), so the service rules apply: the consumer may ask for performance to start during the 14 days and, if they withdraw, pays a proportionate amount (art. 14(3)); if the trader did not obtain that express request, nothing is owed (art. 14(4)(a)). The digital-content exception (art. 16(m): express consent to start + acknowledgment of loss of withdrawal + confirmation) applies to one-off downloads such as a paid report. Simplest compliant handling for a solo builder: offer a no-questions full refund within 14 days of first purchase (which exceeds the statutory position), state the statutory right and the model withdrawal form anyway, and record the "start now" request at checkout. `[S23]` (H)
- **Digital Content and Services Directive 2019/770** (PT: DL 84/2021; DE: BGB §§ 327 ff.): conformity with subjective and objective requirements (arts. 7-8), duty to supply updates including security updates for as long as the consumer can reasonably expect (art. 8(2)), remedies (bring into conformity, price reduction, termination, art. 14), one-year reversal of burden of proof for one-off supply and for the whole period of continuous supply (art. 12), and rules on modifying the service (art. 19: valid reason in the contract, no extra cost, clear notice, right to terminate if the change negatively impacts access or use). Practical: a versioned changelog, a "what Plus includes" page that is accurate, and a notice-plus-cancel flow for feature removals. `[S24]` (H)
- **Digital Services Act 2022/2065.** Proof of Calm stores the user's plan at the user's request, which is technically "hosting" (art. 3(g)(iii)); nothing is disseminated to the public, so it is not an online platform. Obligations that would apply: a single point of contact for authorities (art. 11) and for users (art. 12), a statement in the Terms of any content restrictions (art. 14), and a notice-and-action channel (art. 16) that an email address satisfies. Art. 13 (legal representative) is only for non-EU providers. Micro and small enterprises are exempt from transparency reporting (art. 15(2)). Net: one email address and one paragraph in the Terms. Confidence M (whether private, non-disseminated storage is "hosting" is debated; the burden is trivial either way). `[S25]`
- **UK equivalents for later:** Consumer Contracts Regulations 2013 (regs 36-37: services and digital content in the cancellation period) and Consumer Rights Act 2015 Part 1 Chapter 3 (digital content quality). `[S26]` (H)

---

## 3. GDPR and ePrivacy for this exact stack

### 3.1 Roles and lawful bases

Proof of Calm (the owner, as controller) processes: email address (account), passkey public key/credential ID, plan parameters and log (amounts, dates, asset names, optional notes), reminder preferences, device tokens if push is added, server and error logs, support emails, later billing identity. Processors: Supabase (database, auth, storage), Vercel (hosting, functions, logs), Resend (magic-link and reminder email), Sentry (error monitoring). CoinGecko receives only server-to-server price requests from Proof of Calm's cache; it must never see end-user IPs (do not proxy per-user requests; fetch on a schedule). `[S27]`

| Processing activity | Lawful basis (GDPR art. 6) | Notes |
|---|---|---|
| Account creation, login (magic link / passkey) | 6(1)(b) contract | Auth session cookie/token is strictly necessary under ePrivacy (3.6). |
| Storing and syncing one plan and its log | 6(1)(b) contract | Core service. Local-only mode: no server processing at all. |
| Reminders the user switches on | 6(1)(b) contract | Service email, not marketing. Product news or tips emails need 6(1)(a) consent plus ePrivacy art. 13 rules; keep a separate toggle, off by default. |
| Error logs (Sentry) | 6(1)(f) legitimate interest | Scrub emails/IPs client- and server-side, EU region, 30-day retention, documented LIA. |
| Security and request logs (Vercel, Supabase) | 6(1)(f) legitimate interest | Short retention; access controlled. |
| Price cache (CoinGecko) | None needed | No personal data if fetched server-side on a schedule. |
| Server-side aggregate usage counting | 6(1)(f) legitimate interest | See 3.6 for the ePrivacy layer. |
| Support emails | 6(1)(b)/(f) | Retain 24 months then delete. |
| Billing (later) | 6(1)(b) and 6(1)(c) legal obligation | Tax records: 10 years in Portugal. |

### 3.2 The processors as of October 2026 (verified against their own pages)

| Processor | Entity and DPA | Region facts | Transfer mechanism | Points to act on |
|---|---|---|---|---|
| **Supabase** | Contracting entity **Supabase Pte. Ltd., Singapore**; Supabase, Inc. (US) provides support/operations. DPA Version 1, 1 Aug 2026. `[S28][S29]` | EU regions: Frankfurt eu-central-1, Ireland eu-west-1, Paris eu-west-3, Stockholm eu-north-1 (London and Zurich are "Europe" but not EU). Database, Auth, Storage and backups stay in the chosen region; logs "ingested and stored at EU-based data centers"; account/billing data, telemetry and service metadata processed centrally outside the region; support staff worldwide may access on request; Storage content may be served via a global CDN. `[S29][S30]` | SCCs Modules 2 and 3 with Irish law, UK Addendum, Swiss addendum; no Data Privacy Framework claim. Sub-processor changes: 30 days' notice if subscribed, 5 days to object. Data returned on request within 30 days of termination, then deleted. `[S28]` | Pick a specific EU region (Frankfurt), subscribe to sub-processor notices, note that the processor is Singaporean (SCCs cover it). Sub-processor list of 1 June 2026 includes AWS, Cloudflare, Google, Fly.io, Vercel, Upstash, Sentry, OpenAI, Postmark, HubSpot, Slack, GitHub and others. `[S31]` |
| **Vercel** | Vercel Inc., Delaware. DPA last updated 17 Mar 2026, effective 31 Mar 2026. `[S32]` | "Vercel's primary processing facilities are in the United States." Functions default to iad1 (Washington DC) for all new projects; set fra1/cdg1/dub1/arn1 in project settings or vercel.json (Hobby: one region; Pro: up to 5). CDN/PoPs are global (126 PoPs). `[S32][S33][S34]` | SCCs Modules 1-3, UK IDTA, Swiss; Vercel states it is certified under the EU-U.S. DPF (KB page, updated 8 Sep 2026; the DPA itself does not mention DPF). Sub-processor list at security.vercel.com; 5-day objection window. `[S32][S35]` | Pin Functions to an EU region; accept that edge/CDN logs and request metadata are global; do not use Vercel Blob/Postgres/KV without checking their sub-processors (Neon/Cloudflare, US entities). |
| **Resend** | **Plus Five Five, Inc.** DPA updated 31 Dec 2025. `[S36]` | "Resend stores customer data in the United States." The EU region (eu-west-1) controls routing/sending only: "It does not control where data is stored" and "there is no setting today that moves stored data to the EU." Email and log data retained 30 days on Free/Pro/Scale; customer data deleted within 90 days of termination. Sub-processors (27 Aug 2026) are all US: AWS, Cloudflare, Datadog, PlanetScale, Supabase Inc., Vercel, Anthropic, Google, Stripe and others. `[S37][S38]` | SCCs Modules 1-3; DPA §11.1: "The Company complies with the EU-U.S. Data Privacy Framework (EU-U.S. DPF) and the UK Extension". `[S36][S37]` | **Contradicts the "EU region" assumption**: recipient addresses, subjects and magic-link bodies are stored in the US (DPF/SCCs make this lawful, not EU-resident). If EU residency matters, use an EU-based transactional provider for auth mail (not evaluated here) or accept and disclose. Keep magic-link emails content-minimal. |
| **Sentry** | Functional Software, Inc. d/b/a Sentry. DPA 5.1.0, 29 May 2024. `[S39]` | EU data region = Frankfurt (API domain de.sentry.io). Event data, transactions, logs, replays and their backups stay in the region; user accounts, org settings, audit logs, DSN keys, integration metadata and usage data may be stored in the US regardless; support-ticket content is US; region cannot be changed after creation. Event retention 90 days by default. `[S40]` | "Sentry complies with the Data Privacy Framework" (EU-U.S., Swiss-U.S., UK Extension), SCCs as fallback, UK Addendum; 30-day sub-processor notice; data destroyed at term end. Sub-processors: AWS, GCP, Cloudflare (EU/US), Mailgun (EU), SendGrid (US), Anthropic and OpenAI (US, AI features), Intercom. `[S39][S41]` | Create the org in the EU region from day one; disable AI features; set `sendDefaultPii: false`, scrub IPs and emails; set retention to 30 days. |
| **CoinGecko** | No DPA needed if no personal data flows. | Server-side cache only. | n/a | Document the "no end-user data" design in the ROPA. |

### 3.3 What the Privacy notice must contain (arts. 13/14)

Identity and contact details of the controller (name, address, email); purposes and lawful bases for each activity in 3.1 and the legitimate interests relied on; recipients by category and name (Supabase, Vercel, Resend, Sentry; later the payment provider) and the international transfers with their safeguards (US under DPF/SCCs for Vercel, Resend, Sentry; Singapore under SCCs for Supabase) and how to obtain a copy; retention periods (3.5); the rights of access, rectification, erasure, restriction, portability, objection, withdrawal of consent, and the right to complain to the CNPD (and to the user's local authority); whether providing data is a contractual requirement (email: yes; everything else: optional); that there is no automated decision-making or profiling; the age statement (3.7); and the local-only mode explanation. Art. 14 does not apply (all data comes from the user). If a UK representative is appointed, name them. The DSA single point of contact can live on the same page.

### 3.4 Data-subject requests as a solo builder

One inbox (privacy@proofofcalm.com) and a one-line "Your data" page. Identity check: the request must come from the account email, or the user triggers it while logged in; never ask for ID documents for a service this small. Deadline: one month, extendable by two for complex cases (art. 12(3)); keep a plain log (date received, type, date closed). Access/portability: export the plan and log as JSON/CSV from the app itself (build a self-service export; it answers most requests). Erasure: in-app "Delete account" that cascades in Supabase, removes the user from Sentry via a scrub rule, and relies on Resend's 30-day log expiry; document that backups roll off within the backup window. Objection to legitimate-interest processing: stop analytics counting for that user is impossible if data is aggregated; say so. Breach handling: 72 hours to the CNPD (art. 33); keep a one-page breach runbook.

### 3.5 Retention periods to set

| Data | Retention |
|---|---|
| Account and plan | Life of the account; 30 days after a deletion request to allow undo; inactive accounts: warn at 24 months, delete at 27 months. |
| Auth and security logs | 90 days. |
| Error events (Sentry) | 30 days (default is 90). |
| Email delivery logs (Resend) | 30 days (provider default). |
| Request/edge logs (Vercel) | Shortest available plan setting. |
| Backups | Rolling, 7-30 days; document the window. |
| Support correspondence | 24 months after closure. |
| Aggregate usage statistics | Indefinite (no personal data). |
| Billing and invoices (later) | 10 years (Portuguese tax law). |

### 3.6 DPO, representatives, ROPA

- **DPO:** not required (art. 37: no public authority, no large-scale regular and systematic monitoring, no large-scale special categories). Portugal's Lei 58/2019 does not add a requirement for a small private service. (H)
- **EU representative (art. 27 GDPR):** not required, Proof of Calm is established in Portugal. (H)
- **UK representative (art. 27 UK GDPR):** still in force (text revised to 30 Sep 2026 on legislation.gov.uk; the Data (Use and Access) Act 2025 only substituted a word in para 4). It applies when a non-UK controller offers services to UK data subjects, unless processing is "occasional", excludes large-scale special-category data, and is unlikely to result in a risk. Continuous service to UK sign-ups is not "occasional", so a UK representative is required in principle if option (ii) or (iii) in section 1 is chosen; blocking the UK (option i) removes the question. Cost is modest (commercial representatives). **Contradicts the brief's "representative: no".** `[S42]` (M-H)
- **Records of processing (art. 30):** the under-250 exemption does not apply because the processing is not occasional, so keep a lightweight ROPA: one table per activity (purpose, categories, recipients, transfers, retention, security). (H)

### 3.7 Minimum age

GDPR art. 8 (consent for information-society services): default 16; Portugal 13 (Lei 58/2019 art. 16: processing "only ... once the child has reached 13 years"; below that, consent of the holders of parental responsibility) `[S43]`; UK 13 (DPA 2018 s9); France 15; Germany 16. These ages only govern consent-based processing; Proof of Calm relies on contract, and minors' capacity to contract is a civil-law matter (18 in Portugal). The product concerns investing, so set **18+** in the Terms and at sign-up ("I confirm I am 18 or older"), say the service is not directed at children, and delete accounts found to belong to minors. No verification is needed or proportionate. (H)

### 3.8 "Cookie-free": ePrivacy art. 5(3) and what is strictly necessary

**Law.** ePrivacy Directive art. 5(3), transposed as: Portugal Lei 41/2004 art. 5 (as amended by Lei 46/2012): storage of information or access to information stored in terminal equipment only with prior consent, except technical storage/access for transmission or "strictly necessary" for a service the user expressly requested; no audience-measurement exemption; no CNPD cookie guidance identified (DLA Piper, updated 12 Feb 2026) `[S44]`. Germany § 25 TDDDG (formerly TTDSG): consent required (Abs. 1) unless the sole purpose is transmission (Abs. 2 Nr. 1) or storage/access "unbedingt erforderlich ist, damit der Anbieter eines digitalen Dienstes einen vom Nutzer ausdrücklich gewünschten digitalen Dienst zur Verfügung stellen kann" (Abs. 2 Nr. 2) `[S45]`. France art. 82 Loi Informatique et Libertés with the CNIL audience-measurement exemption `[S46]`. UK PECR reg. 6 with the new Schedule A1 exceptions inserted by the Data (Use and Access) Act 2025 Sch. 12 `[S47]`.

**EDPB Guidelines 2/2023 v2.0 (7 Oct 2024) on technical scope.** Para 32-33: art. 5(3) applies whenever an entity takes steps to gain access to information in the terminal, which "usually entails the accessing entity to proactively send specific instructions to the terminal equipment", including "JavaScript code, where the accessing entity instructs the browser of the user to send asynchronous requests with the targeted information". Para 52-53 (local processing): if locally produced information is sent back to a server at the instruction of distributed client-side code, that is gaining access. Para 54-55 (IP-only): accessing IP addresses triggers art. 5(3) only where the IP "originates from the terminal equipment" (static IPv4 from the user's router, IPv6), and "unless the entity can ensure that the IP address does not originate from the terminal equipment ... it has to take all the steps pursuant to the Article 5(3)". Para 4 and 56: the guidelines do not analyse the exemptions; applicability "does not systematically mean that consent needs to be collected". `[S48]`

**DSK Orientierungshilfe Telemedien (20 Dec 2021).** Processing of browser or header information that is transmitted anyway when a service is called (public IP address, URL, User-Agent string, language setting) is **not** "access to information already stored in the terminal equipment"; actively reading device properties, e.g. via JavaScript, and sending them for fingerprinting **is** access. On reach measurement the DSK declines a blanket answer and states that "even the simple measurement of visitor numbers is therefore not per se to be classified as part of the basic service" (translation), i.e. not automatically strictly necessary. `[S49]`

**Storage classification for Proof of Calm:**

| Mechanism | Classification | Basis |
|---|---|---|
| Supabase auth session cookie / tokens in localStorage | Strictly necessary (the user asked to log in) | All four regimes; ICO lists authentication as a strictly-necessary example `[S50]` |
| The user's own plan in IndexedDB (local-only mode and offline cache) | Strictly necessary: it is the requested service's data on the user's device | H |
| Service-worker/PWA cache of app shell | Strictly necessary / technical | H |
| Theme and locale preference | Strictly necessary in PT/DE when the user sets it (DSK and CNIL accept user-chosen UI preferences such as language); in the UK it falls under the "appearance or functionality" exception, which requires clear information and a free means to object (Sch. A1 para 6) `[S47][S50]` | M-H |
| CSRF/anti-abuse tokens, load-balancing cookies | Strictly necessary / transmission | H |
| Any analytics identifier, A/B flags, marketing pixels | Not strictly necessary | H |

So "cookie-free" is defensible if phrased as "no cookies or local storage for tracking, advertising or analytics; only what the service you asked for needs". Do not claim "we store nothing on your device".

**Analytics without consent, by country:**

| Approach | Portugal (CNPD) | Germany (DSK, § 25 TDDDG) | France (CNIL) | UK (PECR as amended 2026) |
|---|---|---|---|---|
| **Pure server-side counting** from request logs (page hits, daily uniques from a daily-salted hash of IP+UA, raw IP discarded, no script, no cookie) | No storage/access in the terminal; Lei 41/2004 art. 5 not engaged on the DSK/EDPB reading of passively transmitted headers; GDPR 6(1)(f) with notice. Low risk. (M) | Not "Zugriff" per DSK (p. 9); § 25 not engaged; GDPR 6(1)(f). (M-H) `[S49]` | No tracker, art. 82 not engaged; GDPR applies. (H) | No storage or access; reg. 6 not engaged. (H) |
| **Cookieless script analytics** (Plausible EU-hosted, Umami self-hosted, Vercel Web Analytics) | Consent required: script-instructed sending is "access" (EDPB para 33) and PT law has only the strictly-necessary exemption. (M-H) | Consent required: DSK treats active read-out via JavaScript as access and reach measurement as not per se necessary; consent unless the script reads only what the browser sends anyway (screen width, for example, is read actively). (M-H) `[S49]` | Exempt **only** if the CNIL conditions are met: strictly limited to audience measurement for the publisher's exclusive account, anonymous statistics only, no cross-referencing with other processing, no transfer of non-anonymous data to third parties, no cross-site tracking; recommended 13-month tracker life and 25-month data retention; user information required (CNIL page dated 4 Jul 2025). Plausible and self-hosted Umami can be configured to meet this; Vercel Web Analytics processes on Vercel's US infrastructure and is harder to evidence. (M) `[S46]` | Allowed without consent under the "statistical purposes" exception (PECR Sch. A1 para 5, in force 5 Feb 2026 per secondary sources; ICO guidance finalised 29 Apr 2026): sole purpose statistics to improve the service, not shared except with a processor helping to improve it, clear information, and "a simple means of objecting, free of charge" (ICO suggests an on-by-default toggle the user can switch off). (H for the rule, M for the commencement date) `[S47][S50][S51]` |

Vercel Web Analytics specifics: no cookies, visitors identified by "a hash created from the incoming request", session discarded after 24 hours; data points per event: timestamp, URL, dynamic path, referrer, filtered query params, geolocation from IP, OS, browser, device type (docs updated 26 Jun 2026). It still loads a script that sends events, so it falls in the second row. `[S52]` Plausible: no cookies or local storage, daily-salted hash of IP+UA+domain, no raw IP or UA stored, data in the EU (page updated Sep 2026). `[S53]`

**Recommendation:** ship with server-side counting only (a Next.js middleware or Vercel log drain into a daily aggregate) and no script; describe it in the privacy notice. If richer analytics are wanted later, run Plausible/Umami behind an in-app opt-in toggle (consent by action), which keeps the "no banner" design. (M-H)

---

## 4. Provider identification (Impressum / identificação do prestador)

### 4.1 Germany: DDG § 5 and whether it binds a Portuguese operator

§ 5 DDG (Digitale-Dienste-Gesetz, in force 14 May 2024, successor to TMG § 5) requires providers of "geschäftsmäßige, in der Regel gegen Entgelt angebotene digitale Dienste" to keep "leicht erkennbar, unmittelbar erreichbar und ständig verfügbar": (1) name and address of establishment, legal form and authorised representatives for legal persons; (2) details enabling fast electronic contact including an e-mail address; (3) the supervisory authority where the activity needs official authorisation; (4) commercial or similar register and number; (5) regulated-profession details; (6) VAT identification number or Wirtschafts-Identifikationsnummer where held; (7) liquidation status; (8) audiovisual media service details. § 5(2): further duties under other laws remain unaffected. `[S54]`

Country-of-origin: § 3(2) DDG states that the free movement of digital services offered in Germany by providers established in another EU Member State "wird ... nicht eingeschränkt", subject to narrow exceptions (public order, consumer and investor interests, proportionate measures, § 3(5)); consumer-contract law and data-protection law are carved out (§ 3(3)). `[S55]` So § 5 DDG does not formally bind a provider established in Portugal; the equivalent duty comes from Portuguese law (4.2), which implements the same e-Commerce Directive art. 5 list. Practically, publish a German-language "Impressum/Anbieterkennzeichnung" that satisfies § 5 DDG anyway: German users and competitors expect it, the content is identical, and it closes the door to UWG letters. (M-H)

### 4.2 Portugal: Decreto-Lei 7/2004 art. 10

Art. 10 "Disponibilização permanente de informações": service providers must keep permanently available online, in a way that allows easy and direct access, complete identification elements including, among others: (a) name or company name; (b) geographic address of establishment and electronic address allowing direct communication; (c) entries in public registers and registration numbers; (d) tax identification number. Paras 2-4 add the authorising entity where the activity needs prior authorisation, regulated-profession details, and clear price information (including taxes) before use. Supervisory authority for the e-commerce law: ANACOM; breaches are contra-ordenações. `[S56]` (text confirmed for para 1 items (a) and (d) and the opening sentence from the WIPO Lex copy; remaining items from the law as published; M-H)

### 4.3 What a solo builder must publish, and how to avoid the home address

- **ENI (sole trader):** full name, "empresário em nome individual", establishment address, e-mail, NIF (also the VAT number: PT + NIF), no commercial-register entry unless registered. **Unipessoal Lda:** firm name with legal form, seat address, e-mail, NIPC, Conservatória do Registo Comercial and number, share capital if stated, manager's name. Add: supervisory authority line "not applicable (not a regulated activity)" and, for German readers, a "Verantwortlich für den Inhalt" line (MStV § 18 is aimed at journalistic-editorial content; education modules are not journalism, so this is optional).
- **Address without the home address:** incorporate a unipessoal Lda with its seat at a domiciliation/virtual-office or accountant's address (domiciliação de sede is lawful and common in Portugal), or as an ENI register the activity at a coworking/business address and publish that establishment address. German case law expects a "ladungsfähige Anschrift" (an address where documents can be served); a staffed virtual office that receives mail meets that; a PO box or a bare contact form does not. (M)
- **E-mail is mandatory** under both laws; a contact form alone is not enough.

### 4.4 ODR platform and ADR information duties

- The EU ODR platform is gone: Regulation (EU) 2024/3228 repealed Regulation 524/2013; complaint submission ended 20 March 2025 and the platform and its data were deleted by 20 July 2025. Remove any ODR link and the standard "Platform of the EU Commission for online dispute resolution" paragraph; keeping it is now misleading. `[S57]` (H)
- **Portugal:** Lei 144/2015 art. 18 obliges suppliers established in Portugal to inform consumers of the RAL (ADR) entities available or to which they are bound, including their websites, on the trader's website and in written/adhesion contracts; coimas apply. Consumer arbitration is mandatory at the consumer's option for disputes up to EUR 5,000 (Lei 63/2019). The **Livro de Reclamações Eletrónico** (DL 156/2005 as amended by DL 74/2017 and Portaria 201-A/2017) applies to suppliers of goods and services to consumers including those operating by digital means; the website must show the platform logo/link in a visible place and complaints must be answered within 15 working days. A free app arguably has no "consumer transaction"; from the first paid plan both duties clearly apply, and the sensible course is to publish the RAL list and the Livro de Reclamações link from launch. `[S58][S59]` (article text not re-fetched; knowledge; M-H)
- **Germany:** VSBG § 36 (statement whether the trader is willing/obliged to take part in consumer arbitration, plus the body's address) applies to traders with a website or standard terms, except that "ein Unternehmer, der am 31. Dezember des vorangegangenen Jahres zehn oder weniger Personen beschäftigt hat" is exempt from the willingness statement (§ 36(3)); § 37 (information after a dispute arises) applies to all. Because Proof of Calm is Portuguese-established, § 36 is not directly applicable anyway. `[S60]` (H)
- **UK:** no general ADR information duty for this sector beyond the ADR Regulations 2015 (inform after an unresolved complaint if an ADR body exists). (M)

---

## 5. Disclaimers and copy review

### 5.1 What is customary and defensible

In all three markets a "not advice" label does not change what a communication is; regulators apply an objective test to the substance (PERG 8.4; ESMA; BaFin). Disclaimers help in two ways: as evidence of intent when the content is genuinely neutral (PERG 8.4.5), and as consumer information. They fail when they contradict the content (FG24/1 §3.4: a "for professional investors only" disclaimer does not restrict a mass-market promotion). So: short, specific, repeated where decisions are made, and matched by behaviour. `[S6][S15]`

### 5.2 Where to place what

| Place | Text (adapt) |
|---|---|
| Onboarding (one screen, acknowledge once) | "Proof of Calm is software for a plan you design. It gives no financial, investment or tax advice and never recommends what, when or where to buy. Crypto-assets are highly volatile; you could lose all the money you put in. Only use money you can afford to lose." |
| Footer (one line + link to Risk page) | "Data and tools, not advice. Crypto-assets can lose all their value." |
| Each education module (top) | "Educational content. Not a recommendation. Past market behaviour does not predict future results." |
| Templates (above each) | Risk label first ("High risk - single asset, no exit rule"), then "A starting point some people use. You choose every setting. Not a recommendation." |
| Jurisdiction card | UK: the FCA-style warning text and the note that Proof of Calm is not FCA-authorised or registered and that UK consumers have no FOS/FSCS protection in relation to it; US: "not registered with the SEC or any state regulator; no investment advice"; EU: "not a MiCA crypto-asset service provider". |
| "Red day" page | "Historic drawdowns for the asset you chose, [date range], from [source]. Past performance is not a reliable indicator of future results. Nothing here tells you to buy or sell." |
| Exports (PDF/CSV header) | "Generated by Proof of Calm from your own entries. Not advice. Check figures before any tax or financial use." |
| Reminder emails (footer) | "You asked for this reminder. It reflects the plan you set, not market conditions or a recommendation." |

### 5.3 Standard regulator phrasings to adapt

- FCA COBS 4.12A.11R: "Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment and you should not expect to be protected if something goes wrong." `[S5]`
- MiFID II Delegated Regulation 2017/565 art. 44(4)(d): "past performance is not a reliable indicator of future results"; art. 44(5) for simulated performance. `[S18]`
- MiCA white-paper statements (art. 6(5)): the crypto-asset "may lose its value in part or in full", "may not always be transferable", "may not be liquid", and is not covered by investor-compensation or deposit-guarantee schemes. `[S16]` (M-H)
- ESAs' joint warning on crypto-assets (17 March 2022): consumers "face the very real possibility of losing all their invested money". (M)

### 5.4 Copy-review checklist (ban list, patterns, alternatives)

Banned or restricted words (EN / DE / PT): recommend, recommended, recommendation (empfehlen, empfohlen, Empfehlung / recomendar, recomendado, recomendação); should buy, you should, must buy (sollten kaufen / deve comprar); safe, safely, secure investment (sicher, sichere Anlage / seguro, investimento seguro); guaranteed, guarantee (garantiert / garantido); wealth, build wealth, get rich (Vermögen aufbauen, reich werden / riqueza, enriquecer); best coin, top coins, winners (beste Coin / melhor moeda); will rise, will go up, bound to recover (wird steigen / vai subir); expected return, target price, projected (erwartete Rendite / retorno esperado); passive income, yield, earn (passives Einkommen, verdienen / rendimento passivo, ganhar); we suggest, our pick, tip (wir schlagen vor / sugerimos); opportunity, don't miss, now is the time, buy the dip, stack sats, accumulate (urgency and imperatives about buying); inflation hedge, digital gold, store of value stated as fact; cheap, undervalued, discount; profit, gains, returns as promises; outperform, beat the market, beat inflation; comparisons with savings accounts or pensions; any second-person imperative about buying or holding ("hold through the dip", "never sell" as instruction rather than as the name of a user-chosen rule).

Allowed alternatives: template, starting point, a rule some people follow, the plan you set, your rule, data not advice, historically / in the 2013-2022 cycles (dated), what happened, drawdown, volatility, you decide, you can change this, learn how DCA works, record, log, schedule, "the asset you chose".

Patterns to lint automatically (regex in CI over copy, emails and templates): `\b(recommend|should (buy|hold|sell)|guarantee|safe|wealth|best coin|will (rise|go up|recover)|expected return|passive income|we suggest|buy the dip|stack sats|don'?t miss|inflation hedge|digital gold|undervalued|outperform)\b`, plus the DE/PT lists; flag any sentence containing an asset name and an imperative verb; flag any number with "%" next to "return|gain|profit|yield". Require a human sign-off on template names.

---

## 6. Before charging money

### 6.1 Company form in Portugal (owner assumed resident in Portugal)

| | ENI (empresário em nome individual), regime simplificado | Sociedade unipessoal por quotas |
|---|---|---|
| Set-up | Open activity at the AT (free); CAE/CIRS code choice matters | "Empresa na Hora" (~EUR 360), minimum capital EUR 1, mandatory contabilista certificado (~EUR 100-200/month) |
| Income tax | IRS on a coefficient of gross income (0.75 for table-of-art.-151 services; 0.35 for other services such as CAE-coded software subscriptions; the classification is contested and worth an accountant's written view), simplified regime up to EUR 200,000 gross | IRC: headline 20% (2025) with a reduced rate on the first EUR 50,000 for SMEs; further cuts scheduled; verify current year |
| Social security | 21.4% on 70% of service income, quarterly declarations, 12-month exemption for first registration | Manager (gerente) contributions as MOE |
| VAT | Art. 53 CIVA exemption up to EUR 15,000 turnover (2025/2026 figure per secondary sources; lost above the threshold, with the +25% rule for mid-year crossing); exemption is domestic | Same VAT rules; usually registers for VAT from day one |
| Liability | Personal and unlimited | Limited to the company (subject to the usual exceptions) |
| MoR/payment onboarding | Works, but some providers prefer companies | Smoother KYB |

Recommendation: no action while free. Before the first charge, open activity as ENI if first-year revenue is expected to stay small and the simplified regime fits; incorporate a unipessoal Lda if revenue is expected to pass roughly EUR 30-40k/year, if liability separation matters (a crypto-adjacent product invites complaints), or if a merchant of record asks for a company. Both decisions need a contabilista certificado; figures above are indicative (M) `[S61]`.

### 6.2 Invoicing software certification and VAT (OSS) versus a merchant of record

- **Certified invoicing software ("software de faturação certificado").** DL 28/2019 and Portaria 363/2010 (as amended) require invoices to be issued through AT-certified software by taxable persons with turnover above EUR 50,000 in the previous year, by anyone using computerised invoicing, and by those with organised accounting; small taxpayers may use the AT's free invoicing application on the Portal das Finanças; invoices carry ATCUD and a QR code (since 2023) and are reported monthly via SAF-T(PT) by the 5th of the following month. (AT page not reachable in this session; knowledge; M)
- **Selling direct (Stripe Payments):** Proof of Calm is the seller to each consumer, so every sale needs a Portuguese-compliant invoice (certified software or AT app), Portuguese VAT at 23% on B2C digital services up to the EU-wide EUR 10,000 cross-border threshold, then destination-country VAT via the OSS quarterly return; UK VAT registration from the first UK B2C sale (no threshold for non-established sellers); US state sales tax by nexus. Stripe Tax calculates; it does not file (Tax Complete partners do, at a cost).
- **Merchant of record (Paddle or Stripe Managed Payments):** the MoR is the seller to the consumer, issues the consumer invoice, collects and remits VAT/GST/sales tax in 80+ countries, handles refunds, withdrawal periods and disputes. Proof of Calm issues **one B2B invoice per payout** to the MoR entity (reverse charge; recapitulative statement if the MoR entity is in another EU state), which the AT's free app can handle. This removes the OSS, UK VAT and certified-software burdens almost entirely. `[S62][S63]`

### 6.3 Provider verdicts (each from the provider's own current policy, accessed 2026-10-16)

| Provider | Decisive clause (verbatim) | Verdict for a non-custodial planner/educator selling software features |
|---|---|---|
| **Lemon Squeezy** (Sold through Link, LLC, f/k/a Lemon Squeezy LLC; acquired by Stripe 26 Jul 2024) | Prohibited Products page: "NFT & Crypto related products." followed by "The entire crypto market is extremely volatile and Lemon Squeezy is not designed to support these types of products". Also prohibited: "Services of any kind", "get-rich-quick schemes", "Any products restricted by our payment processing partners". Page undated (© 2026). `[S64][S65]` | **Prohibited.** A crypto DCA planner is a "crypto related product" on the plain words. Do not build on it. |
| **Paddle** (AUP "Last Updated 13 April 2026") | Prohibited: "Investment or financial advice, including trading signals and strategies"; "Any product or service that is considered a regulated financial product or service in any jurisdiction"; "Business or investment opportunities"; "Exchanges, dealers, or trading platforms that enable transactions in financial instruments, currencies, or cryptocurrencies"; "Virtual currency or stored value"; plus "Paddle reserves the right to exercise judgment in ascertaining whether any of these factors are likely to be present." Scope statement: "Paddle is built to serve software companies (including B2B SaaS, Consumer Software, and Games)." `[S66]` | **Restricted in practice (needs written approval).** Not an exchange, not virtual currency, not regulated, not advice; but "trading signals and strategies" is one risk-analyst's reading away from "DCA templates and a Cycle plan". Get a written yes from Paddle's risk team before building, describing the product exactly (no custody, no execution, no advice, no signals, generic templates). |
| **Stripe Payments** (Prohibited and Restricted Businesses, "Last updated: 2026-09-22") | Prohibited ("Non-fiat currency"): "Cryptocurrency mining and staking", "Initial coin offerings (ICOs)", "Secondary NFT sales". Restricted (additional due diligence): "Cryptocurrency exchanges and wallets", "Investment and brokerage services, including real estate-based investments", "Other financial services", "First-party non-fungible tokens (NFTs) minting and sales, including marketplaces and SaaS platforms". Prohibited under unfair practices: "'Get rich quick' schemes, including investment opportunities or other services that promise high rewards to mislead consumers". Japan-only prohibition: "Consultation or advisory services providing guidance, information or tools on how to profit through trading or investments in financial products or cryptocurrency". `[S67]` | **Allowed (not listed), subject to Stripe's discretion.** A planner that holds no crypto, executes nothing and promises nothing is in none of the listed categories; the Japan clause shows how Stripe thinks about "tools on how to profit", so the product description must be "planning and record-keeping software", never a profit tool. |
| **Stripe Managed Payments** (MoR; "Sold through Link, LLC" appears as the seller) | Eligibility: "Stripe determines access to Managed Payments based on an eligibility review that considers factors such as business type and geography"; Portugal is a supported business location; supported categories include "Software"; unsupported are physical goods, professional services and live events; fee: "3.5%" "per successful Managed Payments transaction in addition to Payments fees"; disputes handled by Stripe but "Received disputes incur a dispute received fee"; Stripe "might issue a refund without your approval" if the seller does not respond within 48 hours; EU/UK/US VAT and sales tax handled; the acquiring entity for EU sellers is a Stripe affiliate (Stripe Technology Europe, Limited among those named). `[S62][S63][S68][S69]` | **Apply; likely allowed.** The Stripe restricted list applies; the eligibility review is the gate. Because the MoR brand is the former Lemon Squeezy, expect the review to ask about crypto; answer with the same description. |
| **Polar** (MoR; AUP effective 25 Mar 2026) | Not accepted: "financial trading, trading bots, brokerage, or investment advisory services (including insights platforms)"; "financial advice content or services related to tax guidance, wealth management, trading signals," and investment strategies; "NFTs and Crypto assets". `[S70]` | **Prohibited.** |

**Fees and mechanics (Portugal-based seller).** Stripe PT: 1.5% + EUR 0.25 standard EEA cards, 2.8% + EUR 0.25 premium EEA, 2.5% + EUR 0.25 UK cards, 3.15% + EUR 0.25 international plus 2% conversion; Stripe Tax 0.5% per transaction where registered (Basic); Billing 0.7%; dispute received EUR 20 and dispute countered EUR 20 (refunded if won); standard payouts to a Portuguese bank account free on a rolling/weekly/monthly schedule; Managed Payments adds 3.5%. `[S68]` Paddle: 5% + USD 0.50 per transaction including tax handling, fraud protection, chargebacks and buyer support; bespoke pricing under USD 10; payout methods/currencies not verified in this session (Paddle help pages returned 404). `[S71]` Chargebacks: on Stripe Payments Proof of Calm is the merchant, pays the EUR 20 fee and writes the evidence; with an MoR the MoR is the merchant and handles disputes (Managed Payments still passes the received fee).

**Recommendation.** Primary: **Stripe Managed Payments**, if the eligibility review passes, because it combines a crypto-tolerant policy list with MoR tax, invoicing, refund/withdrawal and dispute handling. Fallback 1: **Paddle** with written pre-approval. Fallback 2 (always available): **Stripe Payments + Stripe Tax + OSS + certified invoicing**, accepting the compliance workload. Confidence M.

**Tips.** Optional tips are "donations where no product exists" at Lemon Squeezy (prohibited) and are outside Managed Payments' digital-product scope; on Stripe Payments they are allowed. Tax treatment (income; VAT depends on whether the tip is consideration) needs the accountant. Keep tips out of the launch.

### 6.4 What must be true before the first charge

1. Legal entity chosen and active (ENI activity opened or Lda incorporated), bank account, NIF/NIPC, VAT status decided (art. 53 or normal regime), accountant engaged.
2. Payment path decided and approved in writing by the provider; product description on file.
3. Invoicing path working (AT app or certified software; or B2B invoice template for MoR payouts); SAF-T reporting set up.
4. Terms updated with the paid-features section: price incl. VAT, billing cycle, renewal, cancellation at any time, what Plus includes, change process (DCD art. 19), refund policy, statutory withdrawal right and model form, "start now" request at checkout.
5. Pre-contract information checklist (CRD art. 6) mapped to the checkout page; confirmation email contains it.
6. 14-day withdrawal handled: either MoR tooling or an in-house no-questions refund within 14 days of first purchase.
7. Livro de Reclamações Eletrónico registered and linked; RAL entities listed in Terms and on the Contact page.
8. Privacy notice updated with the payment provider as recipient; ROPA updated; invoice retention set to 10 years.
9. Copy review of all paid-tier marketing against section 5.4.

---

## 7. security.txt, disclosure policy, NIS2 and CRA

### 7.1 security.txt (RFC 9116)

Location: "organizations MUST place the 'security.txt' file under the '/.well-known/' path"; served over HTTPS as "text/plain" with charset "utf-8". Required: `Contact` ("MUST always be present") and `Expires` ("MUST always be present and MUST NOT appear more than once"; "RECOMMENDED that the value ... be less than a year into the future"). Optional: `Encryption`, `Acknowledgments`, `Preferred-Languages` (once), `Canonical`, `Policy`, `Hiring`. OpenPGP cleartext signature is recommended, with `Canonical` included so the signature also binds the location. `[S72]`

```
Contact: mailto:security@proofofcalm.com
Expires: 2027-10-01T00:00:00.000Z
Preferred-Languages: en, pt, de
Canonical: https://proofofcalm.com/.well-known/security.txt
Policy: https://proofofcalm.com/security
Encryption: https://proofofcalm.com/.well-known/pgp-key.txt
```

Vulnerability disclosure policy outline (the `/security` page): scope (proofofcalm.com, api, the apps); out of scope (third-party services, social engineering, DoS, automated scanning that degrades service); how to report (email, PGP key, what to include); what we promise (acknowledge within 3 business days, status within 14 days, fix target 90 days, credit if wanted); safe harbour (good-faith research within scope will not be pursued; do not access other users' data, stop at proof of concept, no public disclosure before the fix or 90 days); no bounty (optional thanks page); data handling of reports.

### 7.2 NIS2

Directive (EU) 2022/2555 applies to entities in Annex I/II sectors that are medium-sized or larger (50+ staff or > EUR 10m turnover/balance sheet, art. 2(1)), with size-independent exceptions in art. 2(2) for specific providers (DNS, TLD registries, trust services, public electronic communications, sole national providers, critical entities). A solo SaaS is below the size cap and in none of the exceptions, so NIS2 does not apply, even though "cloud computing service providers" are an Annex I digital-infrastructure category. Transposition: Germany's NIS2UmsuCG in force 6 December 2025; Portugal's Lei 59/2025 (authorisation, 22 Oct 2025) and Decreto-Lei 125/2025 of 4 December 2025 (Regime Jurídico da Cibersegurança; operative date reported as 2026, verify). It would become relevant only if Proof of Calm grew past the size cap. `[S73]` (H for scope; M for national dates)

### 7.3 Cyber Resilience Act

Regulation (EU) 2024/2847 entered into force 10 December 2024; reporting obligations for actively exploited vulnerabilities and severe incidents (art. 14, via ENISA's single reporting platform: early warning 24 h, notification 72 h, final report 14 days) apply from **11 September 2026**; the full obligations apply from **11 December 2027**. The web PWA is a service delivered through the browser and is outside scope (recital 12 excludes SaaS unless it is "remote data processing" integral to an in-scope product). The **app-store wrapper** is a software product with digital elements made available on the market in the course of a commercial activity, so from 11 December 2027 it very probably is in scope as a "default" category product: essential requirements (secure by default, no known exploitable vulnerabilities at release, updates), vulnerability handling (SBOM, coordinated disclosure, security updates for the support period), self-assessment conformity, CE marking and EU declaration of conformity, and the art. 14 reporting duty; the backend then counts as remote data processing. The Commission's application guidance (C(2026) 5252, 27 July 2026) exists but was not readable through the fetcher; secondary commentary agrees that "a pure SaaS used in a browser generally is not [a manufacturer]" while "a mobile application backed by your own backend ... very probably is". This contradicts the brief's "likely not" for the wrapped phase; plan the store release with CRA in mind (security.txt and the VDP above are already two of its requirements). `[S74][S75]` (M)

---

## 8. Draft outlines (plain words; **L** = must exist at launch, **P** = before charging)

### 8.1 Terms of use (L, with a placeholder section P)

1. Who we are and how to reach us (links to Contact/Impressum). **L**
2. What Proof of Calm is: software to design, record and visualise a plan you set; education about how DCA works. What it is not: not an exchange, wallet, broker, adviser, signal service or tax tool; it never holds money or keys; it never recommends what, when or where to buy; nothing in it is financial, investment, legal or tax advice; templates are generic starting points. **L**
3. Eligibility: 18+, not directed at children, you are responsible for checking that using the service is lawful where you live; the service is not offered to persons in [blocked jurisdictions, e.g. UK at launch] and we may block or close accounts from there. **L**
4. Your account: one plan and its log; magic link or passkey; keep your email secure; local-only mode means we hold nothing and cannot recover it. **L**
5. Acceptable use: no automated scraping, no abuse, no attempt to access others' data; no content restrictions beyond that (DSA art. 14 line) and how to notify us. **L**
6. Your data: pointer to the Privacy notice; export and delete at any time. **L**
7. Prices and market data: from third-party sources via our cache, may be delayed or wrong; do not rely on it for trading or tax; past data does not predict the future. **L**
8. Risk acknowledgement: crypto-assets are highly volatile; you can lose everything you put in; you decide; no warranty of outcome. **L**
9. Availability and changes: we may change or stop features; free core stays free; notice for material changes; your right to stop using the service. **L**
10. Liability: provided "as is" within the limits the law allows; no liability for investment decisions or losses; mandatory consumer rights unaffected. **L**
11. Governing law and venue: Portuguese law; EU consumers keep their home-country protections; ADR information (RAL entities; Livro de Reclamações link). **L** (text), RAL/Livro details **P** at the latest
12. **Proof of Calm Plus (placeholder)**: what it includes, price incl. VAT, billing cycle, auto-renewal and cancellation, trial rules, how changes to Plus are notified (DCD art. 19), refunds and the 14-day withdrawal right with model form, who the seller is (Proof of Calm or the merchant of record), invoices, what happens to your data if Plus lapses. **P**
13. Tips (if any): voluntary, no product, no refund, no benefits attached. **P**
14. Contact, complaints and changes to these Terms; version and date. **L**

### 8.2 Privacy notice (L; update P)

1. Controller identity and contact; UK representative if any. 2. What we collect, by feature (account, plan, reminders, logs, support, later billing), and that local-only mode collects nothing. 3. Why and on what legal basis (table from 3.1), including the legitimate interests. 4. Who receives it: Supabase (Singapore entity; EU region), Vercel (US; EU functions), Resend (US), Sentry (US entity; EU region), later the payment provider; no advertising, no data sales, no third-party scripts. 5. International transfers and safeguards (DPF, SCCs) and how to get copies. 6. Retention (table from 3.5). 7. Your rights and how to use them (self-service export/delete; privacy@ address; one-month timeline); complaint to the CNPD or your local authority. 8. Security measures in one paragraph. 9. Children and age (18+). 10. Cookies and storage (link to the Cookie-free statement). 11. Changes and date.

### 8.3 Risk disclosure page (L)

1. The one-paragraph warning (FCA-style wording adapted; "you could lose all the money you invest"). 2. What DCA does and does not do (reduces timing risk of entries; does not reduce asset risk; a falling asset bought regularly still loses). 3. Volatility and drawdowns with dated historic ranges and the past-performance line. 4. Custody, exchange and counterparty risks (not Proof of Calm's, but real); loss of keys. 5. Regulatory status: Proof of Calm is not authorised, registered or supervised by the CMVM, Banco de Portugal, BaFin, the FCA, the SEC or any other authority; no compensation scheme covers it; jurisdiction notes (UK/US/EU). 6. Tax: crypto transactions can be taxable; Proof of Calm is not a tax tool; keep your own records. 7. Scams: Proof of Calm never contacts you to invest, never asks for keys or money; how to verify emails. 8. What to do if you are unsure: speak to a regulated adviser; links to official consumer warnings (CMVM, BaFin, FCA, ESAs).

### 8.4 "Cookie-free" statement (L)

1. What we do not do: no advertising or analytics cookies, no third-party scripts, no fingerprinting, no cross-site tracking. 2. What your browser stores and why: login session (strictly necessary), your plan in your browser in local-only/offline mode (your data, stays with you), app files for offline use, your theme and language choices (set by you; how to clear them). 3. How we count visits: server-side, aggregated, no identifiers kept (describe the salted-hash method and that no cookie or script is involved); if an opt-in analytics toggle exists later, describe it and how to turn it off. 4. No consent banner because nothing we store needs one; link to the Privacy notice; legal references (ePrivacy art. 5(3); Lei 41/2004; § 25 TDDDG; PECR). 5. Date.

### 8.5 Contact / Impressum page (L; add Livro de Reclamações and RAL block P at the latest)

Provider name and legal form; establishment/seat address; e-mail (and optional phone); NIF/NIPC and VAT number; commercial register and number (Lda); managing director (Lda); content responsibility line (optional, German readers); "not a regulated activity; no supervisory authority" line; DSA single point of contact (same e-mail; languages: PT, EN, DE); security contact (security@ and security.txt); privacy contact; consumer dispute block: RAL entities with websites, Livro de Reclamações Eletrónico logo/link, note that the EU ODR platform no longer exists; Germany note that § 36 VSBG does not apply (fewer than 10 employees / established in Portugal) and that we are not willing or obliged to take part in German consumer arbitration unless stated otherwise.

---

## 9. Where the research contradicts the product assumptions

1. **Resend has no EU data residency.** The EU region only changes the sending location; stored email data (addresses, subjects, bodies, logs for 30 days) lives in the US. Lawful under DPF/SCCs, but not "EU".
2. **Supabase's contracting entity is in Singapore**, not the EU or US; transfers rest on SCCs; some metadata, telemetry and support access leave the EU region.
3. **Vercel runs functions in Washington DC unless told otherwise** and its CDN and logs are global; EU residency requires explicit region pinning and still is not complete.
4. **Sentry's EU region keeps event data in Frankfurt but account, settings, audit and key metadata in the US.**
5. **A UK GDPR representative is required** if UK users are allowed (brief said "no"). Blocking the UK removes it.
6. **"Cookie-free" does not mean "consent-free analytics."** Script-based cookieless analytics need consent in Germany and Portugal; only server-side counting is consent-free everywhere.
7. **Lemon Squeezy and Polar prohibit the product outright; Paddle is borderline.** Stripe (Payments or Managed Payments) is the realistic path.
8. **The CRA will probably apply to the app-store wrapper from 11 December 2027** even though it does not apply to the web PWA.
9. **Portugal adds duties the brief did not list:** RAL information (Lei 144/2015 art. 18) and the Livro de Reclamações Eletrónico once there is a consumer transaction, and a 10-year invoice retention.
10. **Age should be 18 by policy**, not the 13/16 digital-consent ages.
11. **Do not include an ODR link**; the platform was discontinued in 2025.
12. **UK route 3 (MLR-registered firms) disappears on 25 October 2027**; irrelevant to Proof of Calm's own status but a sign that the UK regime is tightening, and the HTX case shows app-store removal is a standard FCA request.
13. **MiCA's advice concept is broader than MiFID's**: recommending an exchange or CASP can itself be "advice". The "no exchange links" rule must be permanent, not a launch choice.

---

## 10. Sources

Accessed 2026-10-16 unless noted. Confidence: H = primary source read directly; M = primary source partially read or reliable secondary; L = unverified/secondary.

- [S1] FSMA 2000 s21 (revised to 25 Feb 2026) — legislation.gov.uk — https://www.legislation.gov.uk/ukpga/2000/8/section/21 — H
- [S2] Financial Services and Markets Act 2000 (Financial Promotion) (Amendment) Order 2023, SI 2023/612 (made 7 Jun 2023) — legislation.gov.uk — https://www.legislation.gov.uk/uksi/2023/612/made — H
- [S3] "Cryptoasset firms marketing to UK consumers" (first published 8 Jun 2023, last updated 6 Feb 2026) — FCA — https://www.fca.org.uk/firms/cryptoassets/marketing-uk-consumers — H
- [S4] PS23/6 Financial promotion rules for cryptoassets (8 Jun 2023; PDF) — FCA — https://www.fca.org.uk/publication/policy/ps23-6.pdf and https://www.fca.org.uk/publications/policy-statements/ps23-6-financial-promotion-rules-cryptoassets — H
- [S5] FCA Handbook COBS 4.12A — FCA — https://www.handbook.fca.org.uk/handbook/COBS/4/12A.html — H
- [S6] FG24/1 Finalised guidance on financial promotions on social media (26 Mar 2024; PDF) — FCA — https://www.fca.org.uk/publication/finalised-guidance/fg24-1.pdf — H
- [S7] "FCA issues 146 alerts in first 24 hours of new crypto marketing regime" (9 Oct 2023) — FCA — https://www.fca.org.uk/news/statements/fca-issues-146-alerts-first-24-hours-new-crypto-marketing-regime — H
- [S8] FT report on first-year alerts/take-downs (Jan 2025) as summarised by secondary sources (e.g. Freeths, Feb 2026) — https://www.freeths.co.uk/insights-events/legal-articles/2026/crypto-promotions-under-fire-fca-takes-high-court-action-against-htx-as-uk-clampdown-intensifies/ — L
- [S9] "FCA takes action against HTX to stop illegal financial promotions" (10 Feb 2026) — FCA — https://www.fca.org.uk/news/press-releases/fca-action-against-htx-illegal-financial-promotions — H
- [S10] Burges Salmon analysis via IFA Magazine (18 Mar 2026) — https://ifamagazine.com/fca-takes-action-against-offshore-cryptoasset-firm-for-illegal-financial-promotions-analysis-from-burgess-salmon-llp/ — M
- [S11] Financial Services and Markets Act 2000 (Cryptoassets) Regulations 2026, SI 2026/102 (PDF, text searched) — legislation.gov.uk — https://www.legislation.gov.uk/uksi/2026/102/pdfs/uksi_20260102_en.pdf — H
- [S12] Explanatory Memorandum to SI 2026/102 (PDF) — HM Treasury — https://www.legislation.gov.uk/uksi/2026/102/pdfs/uksiem_20260102_en_001.pdf — H
- [S13] CP25/40 Regulating cryptoasset activities (16 Dec 2025; final rules 30 Jun 2026; application 25 Oct 2027) — FCA — https://www.fca.org.uk/publications/consultation-papers/cp25-40-regulating-cryptoasset-activities — H
- [S14] PS26/11, PS26/12, PS26/13 (30 Jun 2026) — FCA — https://www.fca.org.uk/publication/policy/ps26-11.pdf ; https://www.fca.org.uk/publication/policy/ps26-12.pdf ; https://www.fca.org.uk/publication/policy/ps26-13.pdf — M (titles and dates verified; bodies not read)
- [S15] PERG 8.4 Invitation or inducement — FCA Handbook — https://www.handbook.fca.org.uk/handbook/PERG/8/4.html — H
- [S16] Regulation (EU) 2023/1114 (MiCA), arts. 3(1)(15),(16),(23),(24), 6(5), 7, 59, 81 — EUR-Lex CELEX:32023R1114 — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114 — M (EUR-Lex not fetchable in session; wording from the regulation, advice definition confirmed by [S17])
- [S17] ESMA Q&A 2882, perimeter of advice under MiCA (18 Jun 2026) — ESMA — https://www.esma.europa.eu/publications-data/questions-answers/2882 — H
- [S18] Commission Delegated Regulation (EU) 2017/565 arts. 9 and 44 — EUR-Lex CELEX:32017R0565 — M (knowledge of text)
- [S19] BaFin, Merkblatt "Hinweise zum Tatbestand der Anlageberatung" and BaFin MiCAR/KMAG pages — bafin.de — pages returned 404 in session — L/M (knowledge)
- [S20] AMF, "Advice on crypto-assets: the AMF updates its doctrine in relation to FIAs" (2026) — https://www.amf-france.org/en/news-publications/news/advice-crypto-assets-amf-updates-its-doctrine-relation-fias — M
- [S21] Lei n.º 69/2025 de 22 de dezembro (MiCA implementing law) — Diário da República — https://diariodarepublica.pt/dr/detalhe/lei/69-2025-992098939 — M (via [S22])
- [S22] Abreu Advogados, "MiCA em Portugal: Destaques da Nova Lei de Execução" (Dec 2025; PDF read) — https://abreuadvogados.com/wp-content/uploads/2025/12/MiCA-em-Portugal-Destaques-da-Nova-Lei-de-Execucao-PDF-PT.pdf — M
- [S23] Directive 2011/83/EU (CRD) as amended by Directive (EU) 2019/2161 — EUR-Lex — M (knowledge of text)
- [S24] Directive (EU) 2019/770 (Digital Content and Services) — EUR-Lex — M (knowledge of text)
- [S25] Regulation (EU) 2022/2065 (DSA) arts. 3, 11-16 — EUR-Lex — M (knowledge of text)
- [S26] Consumer Contracts Regulations 2013; Consumer Rights Act 2015 — legislation.gov.uk — M (knowledge)
- [S27] CoinGecko API terms (attribution; no personal data) — coingecko.com — L (not fetched)
- [S28] Supabase Data Processing Addendum, Version 1, 1 Aug 2026 (PDF) — Supabase — https://supabase.com/downloads/docs/Supabase+DPA+260601.pdf and https://supabase.com/legal/customer-resources/data-processing-addendum — H
- [S29] Supabase "Data Residency and Transfers FAQ" (Version 1, 6 Oct 2026) — https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq — H
- [S30] Supabase regions documentation — https://supabase.com/docs/guides/platform/regions — H
- [S31] Supabase Subprocessors list, 1 Jun 2026 (PDF read) — https://supabase.com/legal/subprocessor-list/June-1-2026.pdf — H
- [S32] Vercel Data Processing Addendum (last updated 17 Mar 2026, effective 31 Mar 2026) — https://vercel.com/legal/dpa — H
- [S33] Vercel, "Configuring regions for Vercel Functions" (updated 11 Aug 2026) — https://vercel.com/docs/functions/configuring-functions/region — H
- [S34] Vercel, "Global network and regions" (updated 11 Aug 2026) — https://vercel.com/docs/regions — H
- [S35] Vercel KB, "Is Vercel certified under DPF?" (updated 8 Sep 2026) — https://vercel.com/kb/guide/is-vercel-certified-under-dpf — H
- [S36] Resend Data Processing Addendum (updated 31 Dec 2025; PDF read; Plus Five Five, Inc.) — https://resend.com/static/documents/resend-dpa-signed.pdf — H
- [S37] Resend, "GDPR" security page (updated 12 Oct 2026) and regions docs — https://resend.com/security/gdpr ; https://resend.com/docs/dashboard/domains/regions — H
- [S38] Resend Subprocessors (last updated 27 Aug 2026) — https://resend.com/legal/subprocessors — H
- [S39] Sentry Data Processing Addendum 5.1.0 (29 May 2024) — https://sentry.io/legal/dpa/5.1.0/in-app/ — H
- [S40] Sentry, "Data Storage Location (US or EU)" — https://docs.sentry.io/organization/data-storage-location/ — H
- [S41] Sentry Subprocessors — https://sentry.io/legal/subprocessors/ — H
- [S42] UK GDPR Article 27 (revised, latest change 30 Sep 2026) — legislation.gov.uk — https://www.legislation.gov.uk/eur/2016/679/article/27 — H
- [S43] Lei n.º 58/2019 de 8 de agosto, art. 16 (consolidated text) — PGDL — https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=3118&tabela=leis — H
- [S44] DLA Piper Data Protection Laws of the World, Portugal: cookies (updated 12 Feb 2026) — https://www.dlapiperdataprotection.com/index.html?t=cookies&c=PT — M
- [S45] § 25 TDDDG — gesetze-im-internet.de — https://www.gesetze-im-internet.de/ttdsg/__25.html — H
- [S46] CNIL, "Cookies : solutions pour les outils de mesure d'audience" (4 Jul 2025) — https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience — H
- [S47] Data (Use and Access) Act 2025, Schedule 12 (PECR Schedule A1 exceptions) — legislation.gov.uk — https://www.legislation.gov.uk/ukpga/2025/18/schedule/12 — H
- [S48] EDPB Guidelines 2/2023 on the technical scope of Art. 5(3) ePrivacy Directive, Version 2.0 (7 Oct 2024; PDF read) — https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf — H
- [S49] DSK, Orientierungshilfe für Anbieter:innen von Telemedien (20 Dec 2021; PDF read) — https://www.datenschutzkonferenz-online.de/media/oh/20211220_oh_telemedien.pdf — H
- [S50] ICO, Guidance on the use of storage and access technologies, "What are the exceptions?" (published 20 Dec 2024; finalised 29 Apr 2026) — https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/ — H
- [S51] Commencement of the PECR exceptions on 5 Feb 2026 (Commencement No. 6 Regulations 2026) — secondary summaries (Policy Pros; Measured Collective) — M
- [S52] Vercel Web Analytics, "Privacy and Compliance" (updated 26 Jun 2026) — https://vercel.com/docs/analytics/privacy-policy — H
- [S53] Plausible data policy (updated Sep 2026) — https://plausible.io/data-policy — H
- [S54] § 5 DDG — gesetze-im-internet.de — https://www.gesetze-im-internet.de/ddg/__5.html — H
- [S55] § 3 DDG — gesetze-im-internet.de — https://www.gesetze-im-internet.de/ddg/__3.html — H
- [S56] Decreto-Lei n.º 7/2004 de 7 de janeiro, art. 10 — WIPO Lex copy (original text) — https://www.wipo.int/wipolex/edocs/lexdocs/laws/pt/pt/pt064pt.pdf ; consolidated: https://data.dre.pt/eli/dec-lei/7/2004/p/cons/20230530/pt/html — M-H
- [S57] Regulation (EU) 2024/3228 discontinuing the ODR platform — EUR-Lex — https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng — H (dates confirmed via the regulation text in search summaries)
- [S58] Lei n.º 144/2015 (RAL), art. 18; Lei n.º 63/2019 — Diário da República — text not re-fetched — M (knowledge)
- [S59] Livro de Reclamações Eletrónico: DL 156/2005, DL 74/2017, Portaria 201-A/2017 — secondary summaries (APCMC 2018; Garrigues) — M
- [S60] § 36 VSBG — gesetze-im-internet.de — https://www.gesetze-im-internet.de/vsbg/__36.html — H
- [S61] Portuguese tax figures (art. 53 CIVA EUR 15,000; regime simplificado; IRC rates) — secondary (InvoiceXpress, Montepio, simula.pt, Zunapro, 2025-2026) — M/L; confirm with accountant
- [S62] Stripe Docs, "How Managed Payments works" — https://docs.stripe.com/payments/managed-payments/how-it-works.md — H
- [S63] Stripe Docs, "Tax compliance with Managed Payments" — https://docs.stripe.com/payments/managed-payments/tax-compliance.md — H
- [S64] Lemon Squeezy, "Prohibited Products" (© 2026) — https://docs.lemonsqueezy.com/help/getting-started/prohibited-products — H
- [S65] Lemon Squeezy, "Stripe acquires Lemon Squeezy" (26 Jul 2024) — https://www.lemonsqueezy.com/blog/stripe-acquires-lemon-squeezy — H
- [S66] Paddle Acceptable Use Policy (last updated 13 Apr 2026) — https://paddle.com/support/aup — H
- [S67] Stripe, Prohibited and Restricted Businesses (last updated 22 Sep 2026) — https://stripe.com/en-pt/legal/restricted-businesses — H
- [S68] Stripe pricing, Portugal — https://stripe.com/en-pt/pricing — H
- [S69] Stripe Docs, "Managed Payments eligibility" — https://docs.stripe.com/payments/managed-payments/eligibility.md — H
- [S70] Polar Acceptable Use Policy (effective 25 Mar 2026) — https://polar.sh/docs/merchant-of-record/acceptable-use — H
- [S71] Paddle pricing — https://www.paddle.com/pricing — H (payout details not verified)
- [S72] RFC 9116, A File Format to Aid in Security Vulnerability Disclosure (Apr 2022) — IETF — https://www.rfc-editor.org/rfc/rfc9116.html — H
- [S73] Directive (EU) 2022/2555 (NIS2) art. 2 and Annexes; national transposition status (Bird & Bird on Portugal 2025; Commission NIS transposition page) — https://digital-strategy.ec.europa.eu/en/policies/nis-transposition ; https://cm.twobirds.com/en/insights/2025/nis2-directive-transposition-in-portugal-status-and-brief-overview — M
- [S74] Regulation (EU) 2024/2847 (Cyber Resilience Act), recital 12, arts. 3, 14, 71 — EUR-Lex — M (knowledge of text; dates confirmed by [S75])
- [S75] CRA commentary: Kirkland (Sep 2026), Heuking (Aug 2026), cyberresilienceact.eu (Commission guidance C(2026) 5252, 27 Jul 2026) — https://www.kirkland.com/publications/kirkland-alert/2026/09/the-eu-cyber-resilience-act ; https://www.cyberresilienceact.eu/news/commission-cra-application-guidance-published-27-july-2026.html — M
