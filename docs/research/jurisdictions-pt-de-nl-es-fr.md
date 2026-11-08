# Jurisdiction research: Portugal, Germany, Netherlands, Spain, France

Private-individual crypto tax rules for tax year 2026, with 2025 differences and 2027 proposals.
Research date (all sources accessed): **2026-10-16**. Status words used: *in force* / *enacted, not yet applicable* / *proposed*.

This is general information gathered for product design. It is not advice. Every card below is meant to be
turned into a versioned, dated data file and reviewed by a human before it ships.

Method note: primary sources first (law text, tax-authority pages and rulings), then Big Four / reputable firm
summaries, then press. Confidence is per claim: **high** = read in a primary source today; **medium** = reputable
secondary source(s) or a primary source quoted by one; **low** = press, blogs or a single secondary source.
The WebSearch budget ran out near the end; the remaining gaps are listed in section D.

---

## Portugal (PT)

### 1. Identity

| Field | Value | Confidence |
|---|---|---|
| ISO | PT | high |
| Currency | EUR | high |
| Main locale(s) | pt-PT | high |
| Date format | 16/10/2026 (dd/mm/yyyy; long form "16 de outubro de 2026") | high |
| Number format | 1 234 567,89 (official: space thousands, comma decimal; "1.234.567,89" is also common in finance apps and bank statements) | high |
| Timezones | Europe/Lisbon (mainland), Atlantic/Madeira, Atlantic/Azores | high |
| Tax authority | Autoridade Tributária e Aduaneira (AT), Portal das Finanças, https://www.portaldasfinancas.gov.pt (law text and rulings at https://info.portaldasfinancas.gov.pt) | high |
| Tax year | Calendar year (1 Jan–31 Dec) | high |
| Filing window | Modelo 3 (IRS): 1 April–30 June of the following year (art. 60 CIRS). Tax year 2026 is filed April–June 2027. | high |

### 2. Classification of crypto held privately

- **Category G (mais-valias)**, art. 10(1)(k) CIRS: "alienação onerosa de criptoativos que não constituam valores mobiliários". [S1, S5] high
- **Category E (capital income)** for any remuneration from crypto operations (staking, lending rewards) paid in fiat, art. 5(2)(u); when paid in crypto it is taxed later as a capital gain on disposal, art. 5(11). [S5, S8] high
- **Category B (business income)** when activity is habitual/professional, and always for issuance, mining and validation (art. 4(1)(o)); simplified-regime coefficients 0.15 (trading) and 0.95 (mining). [S5, S8] high
- NFTs ("criptoativos únicos e não fungíveis") are outside the crypto definition. [S1] high
- Gratuitous transfers: **Imposto do Selo** (stamp duty), not IRS. [S16] medium

### 3. Taxable events

| Event | Taxable? | One line |
|---|---|---|
| Sale to fiat | **yes** | Gain = realisation value – acquisition value – necessary costs; excluded if held ≥ 365 days (see 6), but still declared (Anexo G1 Q7). [S1, S5, S6] high |
| Crypto-to-crypto swap | **no** (deferred) | Art. 10 n.º 23 (ex-n.º 20): "não há lugar a tributação", the received crypto takes the acquisition value of the crypto given. Exception: no deferral when either party is resident outside EU/EEA/treaty jurisdiction (n.º 24). [S1, S5, S7] high |
| Spending crypto on goods/services | **yes** | Consideration "em dinheiro ou em espécie (exceto criptoativos)" triggers taxation (AT leaflet). [S5] high |
| Transfers between own wallets | **no** | No disposal, nothing to declare. [S5, S17] high |
| Gifts and inheritance | **depends** | No IRS; stamp duty 10% on gratuitous transfers of crypto held with institutions seated/established in Portugal; spouse, partners, descendants, ascendants exempt (receiver's acquisition value = stamp-duty value). [S16] medium |
| Staking / airdrop / lending income | **yes (warn)** | Category E at 28% when received in fiat; if received in crypto, taxed as a gain when sold (holding period of those units starts at receipt). [S5, S8] high |

### 4. Rates

| Year | Rule | Confidence |
|---|---|---|
| 2026 | **28% autonomous rate** on the positive balance of category-G crypto gains (art. 72(1)(c)); option to aggregate (englobamento) at the general scale (art. 72(13)): 2026 scale 12.5%–48% across nine brackets plus the solidarity surcharge (2.5% on taxable income 80,000–250,000; 5% above 250,000). Category E crypto income: 28% special rate. | high (28%); medium (scale details) |
| 2025 | Same 28%. The general-scale rates for brackets 2–5 were 0.3 pp higher than 2026. | high |
| 35% rate | Art. 72(18) applies 35% to certain securities/capital income linked to blacklisted jurisdictions; the published text does not list art. 10(1)(k). For crypto the anti-haven mechanism is instead the loss of the 365-day exclusion and of the swap deferral (n.º 24) and the disregard of losses (art. 43 n.º 7). | medium |
| Mandatory aggregation | Art. 72(14) forces aggregation for **securities** held < 365 days when taxable income reaches the top bracket; the AT leaflet confines it to "criptoativos que constituam valores mobiliários", so it does not apply to ordinary coins. | high |

### 5. Allowances, thresholds, exemptions

- No de-minimis amount, no annual allowance for crypto gains. The only relief is the 365-day exclusion. [S1, S5] high
- Pre-2023 acquisitions count toward the 365 days (art. 220 Lei 24-D/2022). [S5, S8] high
- Expenses "necessárias e efetivamente suportadas" (fees) are deductible from the gain. [S5] high

### 6. Holding-period rule

| Item | Value | Confidence |
|---|---|---|
| Exists | **Yes.** Art. 10 n.º 22 (numbered n.º 19 in 2023–2025 documents): gains **and losses** on crypto (not securities) "detidos por um período igual ou superior a 365 dias" are excluded from taxation. | high |
| Length | 365 days, inclusive ("igual ou superior"). A unit bought on 2026-03-01 reaches 365 days on 2027-03-01. | high (text); the day-count convention itself is not spelled out in law — medium |
| What it exempts | The gain on that disposal (and disregards the loss). It does not remove the duty to declare (Anexo G1 Q7). | high |
| Counting | Acquisition date to disposal date, per unit; pre-2023 purchases count. | high |
| Lot identification | **FIFO** ("os alienados são os adquiridos há mais tempo", art. 43 n.º 8(g), ex-n.º 6(g)), applied **separately per custodian/platform** when held at more than one (art. 43 n.º 9, ex-n.º 7). | high |
| Swaps and the clock | Law gives the received crypto the *acquisition value* of the crypto given (n.º 23) but is silent on its *acquisition date*. AT ruling PIV 28969 (31 Oct 2025) treats an immediate "conversão técnica" into a stablecoin to reach a EUR pair as a non-event, so the exemption of the original asset is preserved; Cuatrecasas reads the law as the received asset being a new asset whose own 365 days start at the swap. **Unsettled; the app should not claim that holding periods carry across swaps.** | medium |
| Exceptions | (a) Counterparty rule, n.º 24: exclusion and swap deferral do not apply when the taxpayer or the payer is not tax-resident in an EU/EEA state or a jurisdiction with a DTT or an information-exchange agreement with Portugal (declared in Anexo G Q18B). (b) Losses with counterparties under a "regime fiscal claramente mais favorável" (Portaria blacklist) are disregarded (art. 43 n.º 7). (c) Loss of Portuguese tax residence = deemed disposal (n.º 25). | high |

### 7. Losses

- Netted against crypto gains of the same year inside category G; losses on units held ≥ 365 days are excluded along with the gains. [S1] high
- Net loss carried forward **5 years**, but **only if the taxpayer opts for (or is obliged to) englobamento** for those years (art. 55(1)(d)). Under the 28% flat route there is no carry-forward. [S3, S5] high
- Losses against blacklisted-regime counterparties never count (art. 43 n.º 7). [S2] high

### 8. Reporting

| Item | Detail | Confidence |
|---|---|---|
| Form | Modelo 3 (IRS), filed online. | high |
| Anexo G, Quadro 18A | Disposals of non-security crypto held < 365 days, and deemed disposals on loss of residence: per operation, acquisition date/value, realisation date/value, expenses, country of counterparty. | high [S6] |
| Anexo G, Quadro 18B | Same, when one party is resident outside EU/EEA with no applicable treaty. | high [S6] |
| Anexo G1, Quadro 7 | **Mandatory declaration of exempt (≥ 365-day) disposals**: entidade gestora, dates and values of acquisition and realisation, expenses, país da contraparte. No tax, but the line must exist. | high [S6] |
| Anexo J | Quadro 9.4 "Alienação onerosa de criptoativos que não constituam valores mobiliários" for income treated as foreign-sourced; codes E25 (cat. E) and G34 (security tokens). Whether a sale on a foreign exchange belongs in G 18A or J 9.4 is a recurring practitioner question. | high (fields exist) / medium (which to use) [S6, S17, S18] |
| Anexo E / B | E: code E21 for crypto remuneration; B: fields 419 (trading) and 422 (mining), Quadro 13G on loss of residence. | high [S6] |
| DAC8 | Lei n.º 26/2026, de 3 de junho (DR n.º 107/2026, Série I), effects from 1 Jan 2026: crypto-asset service providers report users resident in Portugal to the AT **by 31 May** of the following year (art. 124.º-A CIRS, regulated by this law; annex art. 2); first report for calendar 2026, due 31 May 2027. | high [S9] |
| Penalties | RGIT regime for missing/late/incorrect declarations (fines from the low hundreds to tens of thousands of euros depending on the infraction) plus interest; not quantified here. | medium |

### 9. Known or scheduled changes

| Change | Status | Dates / detail | Confidence |
|---|---|---|---|
| OE2026 — Lei n.º 73-A/2025, de 30 de dezembro | in force | No crypto-specific change. IRS brackets +3.51%; rates of brackets 2–5 cut by 0.3 pp; mínimo de existência €12,880. | medium (law number high; content from Montepio/press) |
| Extra 2026 IRS cut (Proposta de Lei n.º 108/XVII/2.ª) | approved 9 Oct 2026, retroactive to 1 Jan 2026 | Further 0.3–0.5 pp cut in the first six brackets. No crypto effect unless aggregating. | medium [S11] |
| OE2027 proposal | proposed (delivered 8 Oct 2026; general debate from 27 Oct; final vote expected late Nov 2026) | No crypto measure found. Brackets +3.88%; solidarity surcharge base realigned; 28% flat rate untouched. | medium [S11, S12, S13] |
| Lei n.º 26/2026 (DAC8/DAC9) | in force (effects 1 Jan 2026) | CASP reporting; first data in 2027. | high [S9] |
| AT rulings | published | PIV 28969 (31 Oct 2025): technical stablecoin conversion not a taxable moment. PIV 29052 (4 Dec 2025): 2019 purchases qualify; exclusion limited to EU/EEA/treaty counterparties; habituality test for category B. | high [S7, S8] |
| Article renumbering | in force | The AT's consolidated art. 10 now shows the crypto rules at n.ºs 20–25 (definition 20, NFT 21, 365-day 22, swap 23, counterparty 24, exit 25); 2024–2025 documents cite 17–22. Cross-references inside n.º 24 still say "n.ºs 19 e 20". Data file should store both numberings. | high |

### 10. What the app can safely state (≈60 words) and what needs the caveat

> Portugal: gains on crypto you sell within 365 days of buying are taxed at a flat 28% (IRS, category G). Units held 365 days or more are exempt, but every sale must still be declared. Crypto-to-crypto swaps are not taxed at the time. First-in, first-out applies per platform. Tax year = calendar year; return filed April–June.

Caveat ("general information, confirm with an accountant") needed for: counterparties outside the EU/EEA; whether a holding period survives a swap; which annex (G 18A vs J 9.4) applies to foreign platforms; losses (only usable with aggregation); staking income; professional-activity risk; stamp duty on gifts.

### 11. Sources (Portugal)

1. CIRS art. 10 (consolidated), AT — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx — undated consolidation, accessed 2026-10-16 — high.
2. CIRS art. 43, AT — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs43.aspx — accessed 2026-10-16 — high.
3. CIRS art. 55, AT — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs55.aspx — accessed 2026-10-16 — high.
4. CIRS art. 72, AT — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs72.aspx — accessed 2026-10-16 — high.
5. AT leaflet "Criptoativos – Conceito fiscal e tributação" (March 2024) — https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/Criptoativos.pdf — accessed 2026-10-16 — high (uses 2024 article numbering).
6. Ofício Circulado n.º 20269/2024, AT, 2024-03-24 (Modelo 3 changes: Anexo G Q18A/18B, G1 Q7, J Q9.4, E21, B 419/422) — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Oficio_Circulado_20269_2024.pdf — accessed 2026-10-16 — high.
7. Informação Vinculativa, Processo 28969, despacho 2025-10-31 — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/cirs/Documents/PIV_28969.pdf — accessed 2026-10-16 — high.
8. Informação Vinculativa, Processo 29052, despacho 2025-12-04 — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/cirs/Documents/PIV_29052.pdf — accessed 2026-10-16 — high.
9. Lei n.º 26/2026, de 3 de junho, Diário da República n.º 107/2026, Série I — https://files.diariodarepublica.pt/1s/2026/06/10700/0001000066.pdf — accessed 2026-10-16 — high.
10. Lei n.º 73-A/2025, de 30 de dezembro (OE2026), AT copy — https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Lei-73-A-2025.pdf — located, not read — medium.
11. KPMG Portugal, "Proposta de lei do Orçamento do Estado 2027", Oct 2026 — https://kpmg.com/pt/pt/insights/2026/10/orcamento-estado-2027.html — accessed 2026-10-16 — medium.
12. MoneyLab, "Orçamento do Estado 2027: principais medidas", 2026-10-08 (mod. 2026-10-15) — https://moneylab.pt/2026/10/08/orcamento-do-estado-2027-conheca-as-principais-medidas — medium.
13. DECO Proteste, "Orçamento do Estado para 2027", 2026-10-09 — https://www.deco.proteste.pt/familia-consumo/orcamento-familiar/noticias/orcamento-estado-que-vai-mudar-2027 — medium.
14. Montepio, "Orçamento do Estado para 2026: o que precisa de saber", 2025-10-10 — https://www.montepio.org/ei/mais-recentes/orcamento-do-estado-para-2026-o-que-precisa-de-saber/ — medium.
15. Cuatrecasas, "IRS e Criptoativos: A 'Conversão Técnica'", 2025-12-10 — https://www.cuatrecasas.com/pt/latam/tributacao/art/irs-criptoativos-conversao-tecnica — medium.
16. ECIJA, "Orçamento do Estado para 2023" (crypto regime incl. stamp duty), 2023-01-05 — https://www.ecija.com/adcecija/orcamento-do-estado-para-2023/ — medium.
17. Doutor Finanças, "Tenho criptoativos mas não vendi…", 2026-04-13 — https://www.doutorfinancas.pt/impostos/irs/tenho-criptoativos-mas-nao-vendi-tenho-de-declarar-no-irs/ — low-medium.
18. Rankia PT, "Fiscalidade das criptomoedas", upd. 2025-02-10 — https://www.rankia.pt/fiscalidade/fiscalidade-das-criptomoedas-portugal — low.
19. Global VAT Compliance, "Portugal DAC8 DAC9 transposition", 2026-06-11 — https://www.globalvatcompliance.com/globalvatnews/portugal-dac8-dac9-transposition/ — medium.

---

## Germany (DE)

### 1. Identity

| Field | Value | Confidence |
|---|---|---|
| ISO | DE | high |
| Currency | EUR | high |
| Main locale(s) | de-DE | high |
| Date format | 16.10.2026 (dd.mm.yyyy) | high |
| Number format | 1.234.567,89 (dot thousands, comma decimal) | high |
| Timezones | Europe/Berlin (Europe/Busingen is an alias) | high |
| Tax authority | Bundesministerium der Finanzen (policy, BMF-Schreiben) https://www.bundesfinanzministerium.de; Bundeszentralamt für Steuern (DAC8 recipient) https://www.bzst.de; assessment by the local Finanzamt; filing via ELSTER https://www.elster.de | high |
| Tax year | Calendar year | high |
| Filing window | Return for 2026 due **31 July 2027** without an adviser; with an adviser end of February 2028 (29 Feb 2028). For 2025: 31 July 2026 / 1 March 2027. | medium-high |

### 2. Classification of crypto held privately

- **Private Veräußerungsgeschäft**, § 23(1) sentence 1 no. 2 EStG ("sonstige Einkünfte", § 22 no. 2), taxed at the personal progressive rate — not Abgeltungsteuer. [S1, S5] high
- Staking, lending and similar rewards: **§ 22 no. 3 EStG** (Einkünfte aus Leistungen). [S2, S5] high
- Administrative basis: BMF-Schreiben of **6 March 2025** (IV C 1 - S 2256/00042/064/043), "Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte", restating the 10 May 2022 letter. [S5, S6, S7] high
- Court confirmation: BFH, judgment of 14 Feb 2023, IX R 3/22 (crypto gains within one year are taxable; no structural enforcement deficit). [S15] medium (primary not fetched)
- **Reform pending**: a BMF draft would move "Tauschkryptowerte" acquired after 31 Dec 2026 to § 20 EStG (capital income, 25% flat). See 9.

### 3. Taxable events

| Event | Taxable? | One line |
|---|---|---|
| Sale to fiat | **yes** if ≤ 1 year between acquisition and sale; tax-free after more than one year. [S1] high |
| Crypto-to-crypto swap | **yes** | Each swap is a disposal of the coin given (at market value) and an acquisition of the coin received; the one-year clock restarts for the new coin. [S5, S7] high |
| Spending crypto on goods/services | **yes** | A disposal at the value of the goods/services. [S5] high |
| Transfers between own wallets | **no** | Not a disposal; keep records so the holding period can be traced wallet to wallet. [S6] high |
| Gifts and inheritance | **depends** | No income tax on the transfer; Schenkung-/Erbschaftsteuer may apply; the recipient steps into the donor's acquisition date and cost (§ 23(1) sentence 3). [S1] high |
| Staking / airdrop / lending income | **yes (warn)** | § 22 no. 3 income at receipt (Freigrenze €256/yr); BMF 2025: passive staking/lending does **not** extend the holding period to ten years. [S2, S5, S7] high |

### 4. Rates

| Year | Rule | Confidence |
|---|---|---|
| 2026 | Personal progressive scale, § 32a EStG: 0% to €12,348 (Grundfreibetrag); 14% rising to 42% at €69,879; 45% from €277,826. Plus **Solidaritätszuschlag** 5.5% of the income tax once assessed tax exceeds €20,350 (single) / €40,700 (joint) with a sliding zone above; plus church tax 8–9% of income tax where applicable. | high [S3, S4] |
| 2025 | Grundfreibetrag €12,096; 42% from €68,481; 45% from €277,826; Soli Freigrenze €19,950 / €39,900. | medium-high |
| Proposed from 2027 (new acquisitions only) | 25% Abgeltungsteuer + Soli (26.375%) + church tax; see 9. | medium (draft) |

### 5. Allowances, thresholds, exemptions

- **Freigrenze €1,000 per calendar year** for the total of all § 23 gains (crypto plus other private sales such as gold). It is a *Freigrenze*, not a *Freibetrag*: at €1,000 or more the entire amount is taxable. In force since assessment year 2024 (previously €600). [S1] high
- **Freigrenze €256 per calendar year** for § 22 no. 3 income (staking, lending). [S2] high
- Sparer-Pauschbetrag (€1,000 / €2,000) does **not** apply to § 23 gains today; it would under the draft reform for post-2026 acquisitions. [S11] medium

### 6. Holding-period rule

| Item | Value | Confidence |
|---|---|---|
| Exists | **Yes.** § 23(1) sentence 1 no. 2: taxable only when "der Zeitraum zwischen Anschaffung und Veräußerung nicht mehr als ein Jahr beträgt". | high |
| Length | One year. | high |
| What it exempts | The whole gain on units held longer than one year (and makes the loss irrelevant). No declaration duty for tax-free sales, but records must be kept. | high |
| Counting | Day of acquisition excluded, period ends with the corresponding calendar day one year later (§ 108 AO with §§ 187–188 BGB). Bought 15 Mar 2026 → a sale on 15 Mar 2027 is still inside the year; from 16 Mar 2027 it is tax-free. Many products display "365 days" which is wrong in leap years; use calendar-year arithmetic. | high (practice) |
| Lot identification | **FIFO per wallet** ("walletbezogene Betrachtung"); the BMF accepts FIFO or individual identification with an election per wallet and per crypto-asset, applied consistently; average cost is the fallback where FIFO is not possible. Wallet timestamps may be used for direct/decentralised trades. | medium-high [S6, S7] |
| Ten-year question | § 23(1) no. 2 sentence 4 extends the period to ten years for assets used as a source of income in at least one year; the BMF (2022 and 2025) states this extension does **not** apply to crypto used for staking or lending, so one year stands. | high (BMF position) [S7] |
| Exceptions | None by counterparty location. Swaps restart the clock. Gifts carry the clock. Draft reform: no holding period at all for assets acquired after 31 Dec 2026 (grandfathering for earlier purchases). | high / medium |

### 7. Losses

- Losses from private sales offset only gains from private sales (§ 23(3) sentences 7–8); not against salary or capital income. [S1] high
- Carry-back **one year**, carry-forward **unlimited** (§ 10d mechanics), within § 23 only. [S1] high
- § 22 no. 3 losses only against § 22 no. 3 income. [S2] high
- Draft reform: old holdings stay in the § 23 loss circle, new holdings in the § 20 circle, with no bridge in the draft. [S10] medium

### 8. Reporting

| Item | Detail | Confidence |
|---|---|---|
| Form | Einkommensteuererklärung, **Anlage SO** ("Veräußerung von Kryptowerten" section) for § 23 gains and for § 22 no. 3 income; a tax-free sale after one year needs no entry. | high (form) / medium (line numbers vary by year) |
| Records | BMF 2025 Rn. 87 ff.: taxpayer bears the burden of proof; extended duties for foreign platforms (§ 90(2) AO); software tax reports accepted if plausible and consistent (Rn. 29a/29b); missing records lead to estimates (§ 162 AO). | high [S6, S7] |
| DAC8 | **Kryptowerte-Steuertransparenzgesetz (KStTG)** inside the DAC8-Umsetzungsgesetz: Bundestag 6 Nov 2025, Bundesrat 19 Dec 2025, in force 1 Jan 2026; providers report to the BZSt; first report for 2026 due 31 July 2027. | high (dates) [S13]; medium (31 July 2027 deadline, § 11 KStTG via secondary) |
| Penalties | Late-filing surcharge § 152 AO (0.25% of assessed tax per month, min. €25); interest § 233a AO; undeclared gains can be Steuerhinterziehung (§ 370 AO) with voluntary disclosure option (§ 371 AO). | high |

### 9. Known or scheduled changes

| Change | Status | Dates / detail | Confidence |
|---|---|---|---|
| BMF Referentenentwurf "Gesetz zur (Reform der) Besteuerung bestimmter Kryptowerte im Privatvermögen" | **proposed** (Ressortabstimmung; not adopted by cabinet) | Draft dated **30 Sep 2026** (BMF PDF path 2026-09-30-Reform-Besteuerung-Kryptowerte-PV); Verbändeanhörung to 6 Oct 2026; cabinet slot 14 Oct 2026 **passed without a decision**, no new date. Content: "Tauschkryptowerte" (MiCA crypto-assets accepted as means of exchange, not issued by a central bank; BTC, ETH) acquired **after 31 Dec 2026** become § 20 EStG capital income: 25% + Soli regardless of holding period; staking/lending rewards as § 20(1) no. 12-E; Kapitalertragsteuer withholding by domestic providers from 1 Jan 2028; substitute base 50% of proceeds when acquisition cost unknown; e-money tokens (stablecoins), NFTs, security tokens and RWA tokens excluded; **grandfathering**: pre-2027 holdings stay under §§ 22/23 (one-year rule). Target entry into force 1 Jan 2027; Bundestag and Bundesrat still required. | medium-high [S8, S9, S10, S11, S12] |
| Bundestag vote on Greens' bill to abolish the holding period immediately | rejected 8 Oct 2026 (445–132) | Political signal only. | low-medium [S12] |
| Coalition position | ongoing | SPD sought abolition in the 2025 coalition talks and failed; CDU/CSU said in May 2026 it saw no reason to change; the BMF draft nonetheless appeared in September. | low-medium |
| BMF-Schreiben 6 Mar 2025 | in force | Replaced the 2022 letter; new terminology "Kryptowerte"; tax-report rules; record-keeping. | high |
| Tariff 2026 | in force | Grundfreibetrag €12,348; thresholds as in 4. | high |

### 10. What the app can safely state (≈60 words) and what needs the caveat

> Germany: crypto sold more than one year after purchase is tax-free for private investors. Sold within a year, the gain is taxed at your personal income-tax rate, and swaps and purchases with crypto count as sales. All such gains under €1,000 per year are tax-free. First-in, first-out per wallet. A draft law would end the one-year rule for coins bought from 2027.

Caveat needed for: the exact day-count; the Freigrenze cliff; staking/lending (separate €256 rule); the reform's cut-off date and grandfathering (draft, may change); loss treatment; church tax; records expected by the Finanzamt.

### 11. Sources (Germany)

1. § 23 EStG, gesetze-im-internet (BMJ) — https://www.gesetze-im-internet.de/estg/__23.html — current, accessed 2026-10-16 — high.
2. § 22 EStG — https://www.gesetze-im-internet.de/estg/__22.html — accessed 2026-10-16 — high.
3. § 32a EStG (tariff from VZ 2026) — https://www.gesetze-im-internet.de/estg/__32a.html — accessed 2026-10-16 — high.
4. § 3 SolZG 1995 — https://www.gesetze-im-internet.de/solzg_1995/__3.html — accessed 2026-10-16 — high (amounts), medium (year attribution).
5. BMF-Schreiben 2025-03-06, IV C 1 - S 2256/00042/064/043 — https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte.html — server returned 503 on 2026-10-16; content taken from S6/S7 — medium-high.
6. Forvis Mazars, Newsletter Steuern 2/2025, "BMF-Schreiben Einzelfragen … Kryptowerte" — https://www.forvismazars.com/de/en/who-we-are/news/press-media/newsletters/newsletter-steuern/newsletter-steuern-2-2025/ertragsteuerrechtliche-behandlung-von-kryptowerten — 2025, accessed 2026-10-16 — medium.
7. CMS Germany, "Update des BMF-Schreibens zu Kryptowerten", 2025-06-26 (mod. 2026-06-05) — https://cms.law/de/deu/legal-updates/Update-des-BMF-Schreibens-zu-Kryptowerten — medium.
8. PwC Germany blog, "BMF: Entwurf eines Gesetzes zur Reform der Besteuerung bestimmter Kryptowerte im Privatvermögen", 2026-10-05 (links BMF PDF) — https://blogs.pwc.de/de/steuern-und-recht/article/257144/ — medium-high.
9. Grant Thornton Germany, "BMF plant Reform der Krypto-Besteuerung", 2026-09-25 — https://www.grantthornton.de/themen/2026/bmf-plant-reform-der-krypto-besteuerung/ — medium.
10. GTK Steuerberater, "Krypto-Steuerreform 2027: Was im Referentenentwurf steht", 2026-09-15 — https://www.gtkp.de/aktuelles/2026-09-15-krypto-steuerreform-2027-was-im-referentenentwurf-steht-und-was-nicht-697.html — medium (note: predates the 30 Sep draft date; an earlier draft version circulated).
11. ETL, "Kryptobesteuerung soll sich ab 2027 grundlegend ändern", 2026-10-12 — https://www.etl.de/aktuelles/kryptobesteuerung-soll-sich-ab-2027-aendern/ — medium.
12. CryptoTicker, "Krypto-Haltefrist: Kabinettstermin ohne Beschluss", 2026-10-15 — https://cryptoticker.io/de/krypto-haltefrist-kabinettstermin-verstrichen/ — low-medium.
13. Haufe, "Bundesrat stimmt DAC8-Umsetzungsgesetz zu", 2025-12-19 — https://www.haufe.de/steuern/gesetzgebung-politik/dac8-umsetzungsgesetz_168_635554.html — medium-high.
14. Blockpit, "Krypto-Steuer 2026" guide, upd. 2026-10-09 — https://www.blockpit.io/de-de/steuer-guides/krypto-steuer-deutschland — low-medium.
15. BFH, Urteil v. 14.02.2023, IX R 3/22 — primary page not reachable today; cited from memory and S14 — medium.
16. BMF draft PDF (not reachable today, 503): https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_IV/21_Legislaturperiode/2026-09-30-Reform-Besteuerung-Kryptowerte-PV/1-Referentenentwurf.pdf — to be read by the reviewer.

---

## Netherlands (NL)

### 1. Identity

| Field | Value | Confidence |
|---|---|---|
| ISO | NL | high |
| Currency | EUR | high |
| Main locale(s) | nl-NL (fy-NL minor) | high |
| Date format | 16-10-2026 (dd-mm-yyyy) | high |
| Number format | 1.234.567,89 (dot thousands, comma decimal; currency written "€ 1.234,56") | high |
| Timezones | Europe/Amsterdam | high |
| Tax authority | Belastingdienst, https://www.belastingdienst.nl | high |
| Tax year | Calendar year | high |
| Filing window | Aangifte inkomstenbelasting: 1 March–1 May of the following year (extension to 1 September on request; longer via an adviser). | high |

### 2. Classification of crypto held privately

- **Box 3 (inkomen uit sparen en beleggen)**: crypto is a bezitting in the category "overige bezittingen / beleggingen"; a deemed (forfaitair) return on the value at 1 January is taxed, **not** the actual gain. [S1, S3] high
- Box 1 only if activity exceeds normal asset management (day-trading with special knowledge, mining as a business) → "resultaat uit overige werkzaamheden" or winst uit onderneming. [S1] medium-high
- Stablecoins are also "overige bezittingen", not banktegoeden. [secondary] medium

### 3. Taxable events

| Event | Taxable? | One line |
|---|---|---|
| Sale to fiat | **no** (not an event) | Nothing happens at sale; what matters is what you hold on 1 January. [S1] high |
| Crypto-to-crypto swap | **no** | Same. | high |
| Spending crypto on goods/services | **no** | Same. | high |
| Transfers between own wallets | **no** | Same. | high |
| Gifts and inheritance | **depends** | Schenk- or erfbelasting for the recipient (allowances apply); no box 3 event. | high |
| Staking / airdrop / lending income | **no separate tax (warn)** | Under the forfait the rewards simply raise next 1 January's value; under the tegenbewijsregeling they count as direct return. | high |
| Under the **tegenbewijsregeling** (optional, if actual return is lower) | — | Actual return = direct income (rewards, interest) **plus realised and unrealised** value changes over the year; no heffingsvrij vermogen; costs not deductible; a negative year counts as €0 and cannot be carried. [S2] high |

### 4. Rates

| Year | Rule | Confidence |
|---|---|---|
| 2026 | Box 3 rate **36%** on the deemed return. Forfait **6.00%** for overige bezittingen (final), 1.28% banktegoeden and 2.70% schulden (provisional). Effective burden on crypto ≈ **2.16%** of the 1 January value above the allowance. | high [S1, S3, S6] |
| 2025 | 36%; forfait overige bezittingen 5.88% (2024: 6.04%). | high [S1] |
| 2027 (Belastingplan 2027, pending) | 36%; forfait overige bezittingen **6.37%** (set); heffingsvrij vermogen €60,098 proposed on Prinsjesdag; a cabinet letter of 29 Sep 2026 proposed cutting it to **€30,846** and raising the forfait to **7.87%** as cover for the box 3 reform — no parliamentary majority reported as of mid-October. Tweede Kamer vote 12 Nov 2026, Eerste Kamer 15 Dec 2026. | medium [S10, S11, S12, S13] |

### 5. Allowances, thresholds, exemptions

- **Heffingsvrij vermogen 2026: €59,357** per person, €118,714 for fiscal partners (2025: €57,684). The Belastingplan 2026 bill had proposed €51,396 and a 7.78% forfait; both were removed by a Tweede Kamer amendment in November 2025, funded by faster phase-out of the Hillen deduction. [S3, S6, S7] high
- Debt threshold €3,800 / €7,600. Green investments exemption €26,715 (2026), falling to €200 in 2027 and abolished 2028. [S6] medium-high
- Under the tegenbewijsregeling there is **no** heffingsvrij vermogen. [S2] high
- Minors' crypto is attributed to parents. [S1] high

### 6. Holding-period rule

- **None.** There is no capital-gains tax on private crypto, so there is nothing a holding period could exempt. The app must say: "The Netherlands does not tax your sale; it taxes a deemed return on what you hold on 1 January (box 3)."
- Valuation: value in economic traffic at 1 January 00:00 using the rate of the exchange you use; inaccessible crypto can be valued at nil if proven (Kennisgroep KG:202:2026:5). [S1] high / medium
- Lot identification: irrelevant under the forfait; under the tegenbewijsregeling the year's purchases and sales totals plus 1 Jan and 31 Dec values are needed, not lots. [S1, S2] high
- Future system (bill): vermogensaanwasbelasting — annual tax on realised **and unrealised** gains — as the main rule, which would cover crypto; the September 2026 novelle moves "financial instruments" to a realisation-based vermogenswinstbelasting from 2028 and everything by 2030; whether crypto counts as a financial instrument is not yet published. [S8, S9, S10] medium

### 7. Losses

- Forfait: not applicable (no loss concept). Tegenbewijs: negative actual return → €0, no carry-forward or carry-back. [S2] high
- Bill for 2028: loss carry-forward with a €500 threshold (as adopted by the Tweede Kamer); may change in the novelle. [S8] medium

### 8. Reporting

| Item | Detail | Confidence |
|---|---|---|
| Form | Aangifte inkomstenbelasting, box 3: tick **"Cryptobezittingen"** (from tax year 2025; earlier "Overige bezittingen") and enter the 1 January value. | high [S1] |
| Actual return | From tax year 2025 the return itself asks whether you want to report werkelijk rendement; for 2017–2024 the form "Opgaaf werkelijk rendement". Needed: value 1 Jan and 31 Dec, totals of purchases and sales. | high [S1, S2] |
| DAC8 | Wet implementatie EU-richtlijn gegevensuitwisseling cryptoactiva (36.782): Tweede Kamer 27 Jan 2026, Eerste Kamer 31 Mar 2026, Stb. 2026, 79 (10 Apr 2026), effective retroactively from 1 Jan 2026; providers report user and transaction data to the Belastingdienst by **31 Jan 2027** for 2026; the Belastingdienst states no 1 January balances are delivered for box 3, so self-reporting stays. | high [S4, S5] |
| Penalties | Verzuimboete for late filing (€385 standard, higher on repetition); vergrijpboete up to 300% for concealed box 3 assets; 12-year recovery period for foreign assets. | medium |

### 9. Known or scheduled changes

| Change | Status | Dates / detail | Confidence |
|---|---|---|---|
| Hoge Raad box 3 rulings → Wet tegenbewijsregeling box 3 | in force (since 2025) | Taxpayers may prove a lower actual return for years from 2017 until the new system starts. | high |
| Belastingplan 2026 (box 3 2026) | in force | 6.00% / €59,357 after the Tweede Kamer amendment of Nov 2025. | high |
| **Wet werkelijk rendement box 3** | **enacted by Tweede Kamer, pending in Eerste Kamer** | TK adopted 12 Feb 2026; EK postponed its vote on 30 Jun 2026 pending a novelle; motions 7 Jul 2026; cabinet letters 15 Sep and 29 Sep 2026 ("scenario 4": vermogenswinstbelasting for financial instruments from 2028, all assets 2030; heffingsvrij inkomen €1,000 instead of €1,800; rate 36%); novelle sent to the Raad van State 2 Oct 2026; EK treatment January 2027 at the earliest; start date **1 Jan 2028 planned but uncertain**. Until then: forfait + tegenbewijs. | medium-high [S8, S9, S10, S11] |
| Belastingplan 2027 | proposed | See 4: 6.37% forfait; €60,098 vs €30,846 dispute; votes 12 Nov / 15 Dec 2026. | medium |
| DAC8 implementation | in force | See 8. | high |

### 10. What the app can safely state (≈60 words) and what needs the caveat

> Netherlands: selling, swapping or spending crypto is not taxed. Instead, the value of your crypto on 1 January counts toward box 3: in 2026 a deemed 6.00% return is taxed at 36% on wealth above €59,357 per person (double for partners). If your real return was lower, you can prove it. A new system based on actual returns is planned for 2028.

Caveat needed for: whether to use the tegenbewijsregeling (unrealised gains count); 2027 allowance and forfait (unsettled); the 2028 reform and crypto's treatment under it; box 1 risk for very active traders; valuation source at 1 January; DAC8 data matching.

### 11. Sources (Netherlands)

1. Belastingdienst, "Moet ik aangifte doen en belasting betalen over mijn crypto's?" — https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/aangifte-doen-en-belasting-betalen-met-cryptos — undated, lists 2026 figures, accessed 2026-10-16 — high.
2. Belastingdienst, "Wat is mijn werkelijk rendement?" — https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/wat-is-mijn-werkelijk-rendement — accessed 2026-10-16 — high.
3. Belastingdienst, "Box 3: uitleg en tarieven" — https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_3/box_3 — accessed 2026-10-16 — high.
4. Belastingdienst, "Europese richtlijn DAC8/CARF voor cryptodienstverleners" — https://www.belastingdienst.nl/wps/wcm/connect/nl/ondernemers/content/wet-implementatie-eu-richtlijn-gegevensuitwisseling-cryptoactiva — accessed 2026-10-16 — high.
5. Eerste Kamer, dossier 36.782 — https://www.eerstekamer.nl/wetsvoorstel/36782_wet_implementatie_eu — accessed 2026-10-16 — high.
6. SRA, "Box 3: percentages, vrijstellingen en bedragen 2026", 2026-01-08 — https://www.sra.nl/nieuws/000000/2026/01/box-3-percentages-vrijstellingen-en-bedragen-2026 — medium.
7. FiscAlert, "Box 3-verhoging geschrapt, huizenbezitter betaalt meer", 2025-11-27 — https://fiscalert.nl/belastingen/artikelen/box-3-verhoging-geschrapt-huizenbezitter-betaalt-meer/ — medium.
8. Rijksoverheid, "Tijdlijn Wet werkelijk rendement box 3" (latest entry 2026-06-19) — https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting/plannen-werkelijk-rendement-box-3/tijdlijn-werkelijk-rendement-box-3 — high.
9. Rijksoverheid, "Plannen kabinet voor heffing op werkelijk rendement in box 3" — https://www.rijksoverheid.nl/themas/werk/inkomstenbelasting/plannen-werkelijk-rendement-box-3 — high (older).
10. TaxLive (Wolters Kluwer), dossier "Nieuw box 3-stelsel o.b.v. werkelijk rendement vanaf 2028", upd. 2026-10-06 — https://www.taxlive.nl/nl/dossiers/dossier-box-3/dossier-box-3-nieuw-box-3-stelsel-obv-werkelijk-rendement-vanaf-2028/ — medium-high.
11. Van Lanschot Kempen, "Belastingplan 2027: wat verandert in box 2 en 3?", 2026-09-30 — https://www.vanlanschotkempen.com/nl-nl/private-banking/inspiratie/vermogensregie/belastingplan-2027-wijzigingen-box-2-en-box-3 — medium.
12. Belastinghelden, "Box 3 vanaf 2028: werkelijk rendement uitgesteld", checked Sep 2026 — https://belastinghelden.nl/vermogensbelasting/toekomstige-veranderingen — low-medium.
13. Rendement.nl, "Box 3-tarief blijft 36% in 2027", 2026-09-15 — https://www.rendement.nl/inkomen-uit-sparen-en-beleggen/nieuws/box-3-tarief-blijft-36-in-2027.html — medium.
14. SlimBelast, "Box 3-wet uitgesteld: Eerste Kamer stemt niet", 2026-07-09 — https://slimbelast.nl/nl/blog/box3-stemming-uitgesteld-2026 — low-medium.

---

## Spain (ES)

### 1. Identity

| Field | Value | Confidence |
|---|---|---|
| ISO | ES | high |
| Currency | EUR | high |
| Main locale(s) | es-ES (also ca-ES, gl-ES, eu-ES) | high |
| Date format | 16/10/2026 (dd/mm/yyyy) | high |
| Number format | 1.234.567,89 (dot thousands, comma decimal) | high |
| Timezones | Europe/Madrid, Atlantic/Canary (Africa/Ceuta for Ceuta) | high |
| Tax authority | Agencia Estatal de Administración Tributaria (AEAT), https://sede.agenciatributaria.gob.es (Basque and Navarre foral haciendas have their own IRPF) | high |
| Tax year | Calendar year | high |
| Filing window | Renta (Modelo 100): early April to **30 June** of the following year (Renta 2025: 8 Apr–30 Jun 2026). Modelo 721: 1 Jan–31 Mar. | high |

### 2. Classification of crypto held privately

- Sales and swaps: **ganancias y pérdidas patrimoniales** in the **base del ahorro** (art. 46(b) LIRPF); the AEAT manual treats virtual currencies as intangible assets, each type a distinct asset. [S1] high
- Staking/lending rewards: rendimientos del capital mobiliario (savings base) valued at receipt; airdrops/referral bonuses: gains not derived from a transfer → **base general**. [secondary] medium
- Professional trading/mining: actividad económica (general base). [S1] medium-high
- Also in scope: **Impuesto sobre el Patrimonio** (regional wealth tax; crypto declared at 31 Dec value) and the Impuesto Temporal de Solidaridad de las Grandes Fortunas (> €3 M). medium

### 3. Taxable events

| Event | Taxable? | One line |
|---|---|---|
| Sale to fiat | **yes** | Gain = transmission value – acquisition value, fees deductible; imputed when the coins are delivered. [S1] high |
| Crypto-to-crypto swap | **yes** | A permuta (art. 37.1.h LIRPF): gain = acquisition value of coin given vs the higher of the market value of the coin given or received; that value becomes the new acquisition value. [S1] high |
| Spending crypto on goods/services | **yes** | A transfer of the coin at market value. | high |
| Transfers between own wallets | **no** | Not a transmission. | high |
| Gifts and inheritance | **depends** | Gift: the **donor** realises a taxable gain (losses from gifts are not deductible, art. 33.5.c); the donee pays regional ISD. Inheritance: no IRPF gain for the deceased ("plusvalía del muerto"); heirs pay ISD. | medium-high |
| Staking / airdrop / lending income | **yes (warn)** | Taxed at receipt (savings or general base depending on type). | medium |

### 4. Rates

| Year | Rule | Confidence |
|---|---|---|
| 2026 | Savings scale (state + autonomic halves, identical): **19%** to €6,000; **21%** €6,000–50,000; **23%** €50,000–200,000; **27%** €200,000–300,000; **30%** above €300,000. Applied progressively to the whole savings base. | high [S2, S3] (2026 unchanged because no new law passed) |
| 2025 | Same scale; the 30% top bracket applies since 1 Jan 2025 (Ley 7/2024); 2024 top rate was 28%. | high [S2, S14] |
| General base (airdrops, professional) | 19%–47% state+regional, up to ~54% in some regions. | medium |

### 5. Allowances, thresholds, exemptions

- **No allowance or de-minimis** for crypto gains. [S1] high
- Filing-obligation thresholds exist for small total incomes, but crypto gains above €1,000 together with other income generally require a return. medium
- **Modelo 721** only when foreign-custodied crypto exceeds **€50,000** at 31 December (art. 42 quater RGAT); later filings only when the balance grows by more than €20,000 versus the last filed; self-custody wallets (you hold the keys) are excluded. [S5, S9] high
- Wealth tax: state allowance €700,000 plus €300,000 main home; regions vary (several bonify 100%); ITSGF from €3 M. medium

### 6. Holding-period rule

- **None.** Every sale, swap or payment in crypto is a taxable event regardless of holding time. The app must say: "Every sale or swap is a taxable event here."
- Lot identification: **FIFO** per type of coin (AEAT manual; DGT rulings V0975-22, V2005-22 and later). The TSJ del País Vasco (judgment of 9 Jan 2025, rec. 75/2024, a Bizkaia foral case) held that cryptocurrencies are not "valores homogéneos" and FIFO is not mandatory; the AEAT manual (updated 17 Mar 2026) still states FIFO. Treat FIFO as the working rule and flag the dispute. [S1, S13] high / medium

### 7. Losses

- Gains and losses from transfers are netted among themselves within the savings base; a remaining negative balance offsets positive capital income (interest, dividends, staking) **up to 25%** of it; the rest carries forward **four years** (art. 49 LIRPF). Symmetric rule for negative capital income. [S4] high
- Losses from platform insolvency or non-returned deposits: not automatic; recognised in the general base under art. 14.2.k conditions (one year unpaid after judicial claim, insolvency, etc.). [S1] medium-high
- Losses from gifts are not deductible. medium-high

### 8. Reporting

| Item | Detail | Confidence |
|---|---|---|
| Modelo 100 (Renta) | Specific section for transfers/exchanges of virtual currencies by individuals; losses pending carry-forward listed in annex C. | high [S1, S4] |
| Modelo 721 | Informative return on crypto held abroad with a custodian > €50,000 at 31 Dec; window 1 Jan–31 Mar; legal basis Orden HFP/886/2023 and art. 42 quater RGAT. | high [S5, S6, S7, S9] |
| Modelos 172 / 173 | Filed by **Spanish-resident providers/custodians** (balances at 31 Dec; operations), Orden HFP/887/2023, arts. 39 bis/ter RGAT; not by individuals. | high [S8] |
| Modelo 714 | Wealth tax where due. | medium |
| DAC8 | **Not transposed.** The LGT reform bill (121/000060, filed 5 Jun 2025) that transposed DAC8, added crypto to the embargo order and created the CASP due-diligence provision **lapsed** when the Cortes were dissolved (Real Decreto 806/2026, BOE 6 Oct 2026). The draft ministerial order for a new Modelo 175 (public hearing March 2026) depends on it. Spain received a letter of formal notice on 30 Jan 2026. Foreign CASPs still report Spanish residents to their own member state, which exchanges with the AEAT. | medium-high [S10, S11, S15] |
| Penalties | LGT arts. 191 ff.: 50%–150% of unpaid tax plus interest; informative returns under the ordinary LGT regime (the former Modelo 720 "super-penalties" were struck down by the CJEU in 2022). | medium |

### 9. Known or scheduled changes

| Change | Status | Dates / detail | Confidence |
|---|---|---|---|
| PGE 2026 | not enacted | The 2023 budget was prorogued for a third year (Council of Ministers 23 Dec 2025); no 2026 tax law changed the savings scale. | high [S12] |
| Dissolution and general election | in force | RD 806/2026 (BOE 6 Oct 2026); election **29 Nov 2026**; new Cortes 23 Dec 2026. All pending bills (DAC8/LGT reform) must be re-tabled. | high [S11, S16] |
| Ley 7/2024 | in force since 2025 | 30% top savings bracket. | high |
| FIFO litigation | open | TSJPV 9 Jan 2025 vs DGT/AEAT doctrine; watch for Supreme Court or DGT reaction. | medium [S13] |
| AEAT Renta 2025 manual | published 17 Mar 2026 | No change in crypto doctrine; MiCA terminology noted. | high |

### 10. What the app can safely state (≈60 words) and what needs the caveat

> Spain: every sale, crypto-to-crypto swap or payment with crypto is a taxable event, whatever the holding period. Net gains are taxed in the savings base at 19%–30% (30% above €300,000). First-in, first-out per coin. Losses offset gains and carry forward four years. Crypto held with a foreign custodian above €50,000 must be reported on Modelo 721 by 31 March.

Caveat needed for: FIFO dispute; staking/airdrop classification; the 25% cross-offset mechanics; gifts (donor pays); wealth tax by region; Basque/Navarre foral rules; the pending DAC8 law and Modelo 175; post-election changes.

### 11. Sources (Spain)

1. AEAT, Manual práctico de Renta 2025, "Compra y venta de monedas virtuales: tributación en el IRPF del inversor" (section updated 2026-03-17) — https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c11-ganancias-perdidas-patrimoniales/monedas-virtuales/compra-venta-monedas-virtuales-tributacion-inversor.html — accessed 2026-10-16 — high.
2. AEAT, Manual Renta 2025, "Gravamen estatal" (base liquidable del ahorro) — https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-ahorro/gravamen-estatal.html — high.
3. AEAT, Manual Renta 2025, "Gravamen autonómico" — https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-ahorro/gravamen-autonomico.html — high.
4. AEAT, Manual Renta 2025, "Integración y compensación de rentas en la base imponible del ahorro" — https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c12-integracion-compensacion-rentas/reglas-integracion-compensacion-rentas/integracion-compensacion-rentas-base-imponible-ahorro.html — high.
5. AEAT, "Preguntas frecuentes sobre el modelo 721" — https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-721-decla-sobre-monedas-extranjero/preguntas-frecuentes-sobre-modelo-721.html — high.
6. AEAT, Modelo 721 "Plazos de presentación" — https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-721-decla-sobre-monedas-extranjero/plazos-presentacion.html — high.
7. AEAT, Modelo 721 procedure page (Orden HFP/886/2023) — https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI55.shtml — high.
8. AEAT, FAQ Modelos 172/173 — https://www3.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-173-decla_____nformativa-sobre-operaciones-virtuales/preguntas-frecuentes/preguntas-frecuentes-comunes-modelo-172-173.html — high.
9. BOE, RD 1065/2007 (RGAT) consolidated, art. 42 quater — https://www.boe.es/buscar/act.php?id=BOE-A-2007-15984 — accessed 2026-10-16 — high.
10. Criptoinforme, "El adelanto electoral deja sin aprobar la ley DAC8…", 2026-10-10 — https://criptoinforme.com/legal/ley-dac8-embargo-criptomonedas-decae-elecciones-espana/ — low-medium.
11. La Moncloa, "Pedro Sánchez anuncia la convocatoria de elecciones generales para el 29 de noviembre", 2026-10-05 — https://www.lamoncloa.gob.es/presidente/actividades/Paginas/2026/051026-sanchez-convocatoria-elecciones.aspx — high.
12. Ministerio de Hacienda, "Acuerdo … prórroga para 2026 de los PGE vigentes en 2025", 2025-12-23 — https://www.hacienda.gob.es/en-GB/Prensa/Noticias/Paginas/2025/20251223-NP-CM-PRORROGA-PGE.aspx — high.
13. Cuatrecasas, "El TSJPV resuelve que el método FIFO no se aplica a criptomonedas", 2025 — https://www.cuatrecasas.com/es/spain/fiscalidad/art/criptomonedas-metodo-fifo-hacienda-foral — medium.
14. Fieldfisher, "Novedades fiscales para el año 2025" (Ley 7/2024 savings scale) — https://www.fieldfisher.com/es-es/locations/espana/actualidad/novedades-fiscales-para-el-ano-2025 — medium.
15. Ministerio de Hacienda, draft Orden DAC8 (Modelo 175), 2026-03-09 — https://www.hacienda.gob.es/sgt/normativadoctrina/proyectos/09032026-proyecto-om-dac8.pdf — located, not read — medium.
16. Newtral, "Fechas clave del calendario electoral… 29 de noviembre", 2026-10-05 (RD 806/2026) — https://www.newtral.es/calendario-electoral-elecciones/20261005/ — medium.

---

## France (FR)

### 1. Identity

| Field | Value | Confidence |
|---|---|---|
| ISO | FR | high |
| Currency | EUR | high |
| Main locale(s) | fr-FR | high |
| Date format | 16/10/2026 (dd/mm/yyyy) | high |
| Number format | 1 234 567,89 (narrow no-break space thousands, comma decimal; "1 234,56 €") | high |
| Timezones | Europe/Paris; overseas: America/Martinique, America/Guadeloupe, America/Cayenne, Indian/Reunion, Indian/Mayotte, etc. | high |
| Tax authority | Direction générale des Finances publiques (DGFiP), https://www.impots.gouv.fr; doctrine at https://bofip.impots.gouv.fr | high |
| Tax year | Calendar year | high |
| Filing window | Online declaration opens in April; deadlines late May to early June by département zone (paper ~20 May). Tax year 2026 is declared May–June 2027. | high |

### 2. Classification of crypto held privately

- **Plus-values de cession d'actifs numériques / crypto-actifs**, art. 150 VH bis CGI, for occasional disposals by individuals; since the "loi fraudes" (loi n° 2026-534 du 25 juin 2026, art. 91) the article covers only **MiCA crypto-assets** (fungible) for disposals from 1 Jan 2026; NFTs fall under new art. **150 VH ter** (regime of the underlying asset). [S1, S10] high
- Habitual/professional activity: BNC (bénéfices non commerciaux). medium-high
- Social levies: the gains are "revenus du patrimoine" (assessed with the income tax). high

### 3. Taxable events

| Event | Taxable? | One line |
|---|---|---|
| Sale to fiat | **yes** | Cession à titre onéreux against legal tender. [S2] high |
| Crypto-to-crypto swap (incl. into stablecoins) | **no** (sursis) | Exchanges without soulte are intermediate operations under tax deferral; an exchange with a cash balancing payment is taxable. **PLF 2027 amendment I-3898 (adopted in plenary 16 Oct 2026, not yet law) would tax swaps into e-money tokens from 1 Jan 2027.** [S2, S12] high / medium |
| Spending crypto on goods/services | **yes** | Exchange for a good or service is a taxable cession. [S2] high |
| Transfers between own wallets | **no** | Not a cession. | high |
| Gifts and inheritance | **depends** | Transfers à titre gratuit are not cessions à titre onéreux; droits de mutation à titre gratuit apply; the recipient's acquisition price is the value retained for gift/inheritance duty (art. 150 VH bis III). | medium-high |
| Staking / airdrop / lending income | **yes (warn)** | Airdropped tokens enter the portfolio at €0 cost and are taxed on disposal; staking/lending rewards may be BNC at receipt or taxed on disposal depending on facts — unsettled. | medium |

### 4. Rates

| Year | Rule | Confidence |
|---|---|---|
| 2026 | **PFU 31.4%** = 12.8% income tax + **18.6%** prélèvements sociaux (CSG 10.6% after LFSS 2026 art. 12, CRDS 0.5%, prélèvement de solidarité 7.5%). Irrevocable yearly option for the progressive scale (0–45%) instead of 12.8%, social levies unchanged (box 3CN). Plus CEHR 3%/4% on high reference income and the CDHR 20% floor (RFR > €250k single / €500k couple), prorogued by the LF 2026 until the deficit falls below 3% of GDP. | high (31.4%, impots.gouv) [S1]; medium (CDHR terms) [S7] |
| 2025 | Secondary sources state the CSG rise applies to revenus du patrimoine "dès les opérations effectuées en 2025", so 2025 crypto gains declared in 2026 were already at 31.4%; before: 30% (12.8 + 17.2). | medium [S8, S9] |

### 5. Allowances, thresholds, exemptions

- **€305 threshold**: if the household's total gross **disposal prices** (not gains) of taxable cessions in the year, excluding swaps under sursis, do not exceed €305, all gains are exempt; above it, everything is taxable from the first euro. Not indexed since 2019. [S1, S5] high
- No other allowance. PLF 2027 amendments to raise it to €1,000 or €5,000 were "not supported". [S12] medium

### 6. Holding-period rule

- **None.** Holding time changes nothing. The app must say: "Every sale to euros or purchase with crypto is a taxable event here; swaps are deferred."
- **Lot identification: none.** Gains are computed per cession on the **whole portfolio**: *plus-value = prix de cession − (prix total d'acquisition du portefeuille × prix de cession ÷ valeur globale du portefeuille)*, where the global value is the market value of all crypto held by the household (all wallets and platforms) immediately before the cession; fractions of initial capital used in earlier cessions reduce the total acquisition price; fees reduce the cession price but not the quotient. [S3, S5] high
- Consequence for a DCA planner: the app cannot flag "this lot is exempt"; it can only show that the portfolio-level formula requires the value of *all* holdings at each sale.
- PLF 2027 amendment I-3898 would replace this with an asset-by-asset **weighted average cost** method from 1 Jan 2027 (pending). [S12] medium

### 7. Losses

- A loss offsets only gains of the same nature realised **in the same year**; no carry-forward, no offset against other income. [S1, S4] high
- PLF 2027 amendment I-3653 (ten-year carry-forward) **rejected 16 Oct 2026**. [S12] medium

### 8. Reporting

| Item | Detail | Confidence |
|---|---|---|
| Forms | **2042 C** boxes 3AN (gain) / 3BN (loss) / 3CN (option barème); **annexe 2086** with every taxable cession (date, global portfolio value, cession price, fees, total acquisition price, fractions used); 2086 is attached even when total cessions are ≤ €305 if cessions are reported. | high [S1, S5] |
| Foreign accounts | **3916 / 3916-bis** for every account opened, held, used or closed abroad (foreign exchanges), each year; loi 2026-534 extended art. 1649 bis C to crypto wallet references and NFTs, the 80% surcharge (art. 1729-0 A) and a 10-year reassessment period. Penalty €750 per undeclared account per year (€1,500 when the account's value exceeds €50,000), art. 1736 X CGI. | high / medium [S1, S10, S12] |
| DAC8 | Transposed by loi n° 2025-127 du 14 février 2025 (art. 54 → CGI art. 1649 AC bis); PSCA report 2026 data in 2027 (deadline reported as 15 June 2027); loi 2026-534 narrowed the exemption for providers reporting elsewhere; PLF 2027 art. 30 proposes a €10,000 fine per obstructed request. | medium [S10, S12] |
| Penalties | 10% late-filing surcharge, 40% for deliberate omission, 80% for undeclared foreign assets; interest 0.20%/month. | high |

### 9. Known or scheduled changes

| Change | Status | Dates / detail | Confidence |
|---|---|---|---|
| LFSS 2026 (loi de financement de la sécurité sociale pour 2026, JO 31 Dec 2025; cited by secondary sources as loi n° 2025-1403 du 30 décembre 2025) | in force | CSG on capital income 9.2% → 10.6%; PFU 30% → **31.4%**; assurance-vie, revenus fonciers, plus-values immobilières stay at 17.2%. | high (effect) / medium (law number) [S8, S9] |
| Loi de finances pour 2026, **loi n° 2026-103 du 19 février 2026** (JO 20 Feb 2026; adopted by 49.3 on 2 Feb 2026; CC décision 2026-901 DC) | in force | No crypto change; CDHR prorogued; a wealth tax on "unproductive" assets that included crypto, adopted by the Assembly in 2025, was dropped from the final text. | high (law) / medium (content) [S6, S7, S12] |
| **Loi n° 2026-534 du 25 juin 2026** (lutte contre les fraudes sociales et fiscales; CC 2026-904 DC of 18 Jun 2026; JO 26 Jun 2026) | in force | Art. 91: 150 VH bis limited to MiCA crypto-assets, new 150 VH ter for NFTs (disposals from 1 Jan 2026); art. 90: seizure of crypto at PSAN, 10-year reassessment; wallet references in 1649 bis C; DAC8 exemption tightened. | high [S10, S11] |
| **PLF 2027** (n° 3210, filed 1 Oct 2026) | proposed; first-part solemn vote 20 Oct 2026, then Sénat, CMP/49.3, promulgation targeted end Dec 2026, application 1 Jan 2027 | Government text: art. 28 aligns the taxable scope with MiCA (no rate or method change); art. 30 platform fine and seizure extension. Amendments: **I-3898 adopted 16 Oct** (swaps into stablecoins taxable, per-asset weighted-average method, from 2027); exit tax on crypto (I-3904 / I-3432) pending; self-hosted wallet declaration above €100,000 (I-2701) or €5,000/€50,000 (I-3922/3923) pending; personal wealth tax replacing IFI incl. crypto (I-47) pending; €1,000/yr exemption for crypto payments (I-3664) pending; loss carry-forward (I-3653) rejected; €305 → €1,000/€5,000 not supported. | medium-high [S12, S13, S14] |
| BOFiP | partly dated | BOI-RPPM-PVBMC-30 series still shows the 2019 text (30% rate, "actifs numériques"); impots.gouv FAQ updated 17 Jul 2026 shows 31.4%. Expect a BOFiP update for MiCA scope and NFTs. | high |

### 10. What the app can safely state (≈60 words) and what needs the caveat

> France: selling crypto for euros or paying with crypto is taxable; swapping one crypto for another is not. Gains are taxed at a flat 31.4% (12.8% income tax + 18.6% social levies), or at your progressive rate on request. If all your sales in a year total €305 or less, nothing is due. Gains are computed on your whole portfolio, not per coin.

Caveat needed for: the portfolio-wide formula (needs the value of all holdings at each sale); the €305 cliff; losses (same year only); foreign-platform declarations (3916-bis, heavy penalties); staking/airdrop treatment; CEHR/CDHR for high incomes; the PLF 2027 stablecoin and exit-tax measures (not law yet).

### 11. Sources (France)

1. impots.gouv.fr, "Comment déclarer les plus ou moins-values sur cessions d'actifs numériques ?", published 2023-06-16, modified 2026-07-17 — https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques — accessed 2026-10-16 — high.
2. BOFiP, BOI-RPPM-PVBMC-30-10 (champ d'application), 2019-09-02 — https://bofip.impots.gouv.fr/doctrine/pgp/11967-PGP — high (dated).
3. BOFiP, BOI-RPPM-PVBMC-30-20 (base d'imposition), 2019-09-02 — https://bofip.impots.gouv.fr/bofip/11968-PGP.html/identifiant=BOI-RPPM-PVBMC-30-20-20190902 — high.
4. BOFiP, BOI-RPPM-PVBMC-30-30 (modalités d'imposition), versions 2019-09-02 and 2024-04-23 — https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20190902 — high.
5. DGFiP, formulaire 2086 (revenus 2024, cerfa 16043*06) and notice — https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2025/pdf_som/2086.pdf — high.
6. Légifrance, LOI n° 2026-103 du 19 février 2026 de finances pour 2026 — https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053508155 — located via search, Légifrance blocked the fetch — high (identity).
7. KPMG Avocats, "Promulgation de la loi de finances 2026", 2026-02-20 — https://kpmg.com/av/fr/avocats/eclairages/2026/02/promulgation-de-la-loi-de-finances-2026.html — medium.
8. DLA Piper, "Loi de financement de la sécurité sociale 2026 : hausse de la CSG…", Jan 2026 — https://www.dlapiper.com/fr-fr/insights/publications/2026/01/loi-de-finance-de-la-securite-sociale-2026 — medium.
9. LégiFiscal, "Hausse CSG 2026 sur certains placements financiers", 2025-12-29 — https://www.legifiscal.fr/actualites-fiscales/4369-janvier-2026-hausse-csg-appliquera-certains-placements-financiers.html — medium.
10. CMS Francis Lefebvre, "Loi fraudes : plusieurs mesures concernent les crypto-actifs", 2026-06-10 — https://cms.law/fr/fra/legal-updates/loi-fraudes-plusieurs-mesures-concernent-les-crypto-actifs — medium-high.
11. AFG copy of loi n° 2026-534 du 25 juin 2026 — https://www.afg.asso.fr/app/uploads/2026/06/Loi-2026-534-du-25-juin-2026-lutte-contre-les-fraudes-sociales-et-fiscales.pdf — medium (official text on Légifrance to be re-checked).
12. ORWL Avocats, "PLF 2027 et cryptos : ce que le budget pourrait changer pour vos impôts", 2026-10-16 — https://www.orwl.fr/plf-2027-et-cryptos-ce-que-le-budget-pourrait-changer-pour-vos-impots/ — medium-high.
13. Cryptoast, "Taxation crypto/stablecoin, exit tax, wallets : les amendements du PLF 2027", 2026-10-07 — https://cryptoast.fr/plf-2027-amendements-crypto-fiscalite-stablecoin-wallets/ — medium.
14. Assemblée nationale, PLF 2027 (n° 3210) amendments I-CF1822, I-CF821, I-1895, I-CF1826 — https://www.assemblee-nationale.fr/dyn/17/amendements/3210A/CION_FIN/CF1826 (and siblings) — high (existence).

---

## Cross-country

### A. Locale and timezone → country suggestion

The app always proposes, never decides. Timezone is the stronger signal for these five because each has a dedicated IANA zone that no other country shares; language is weaker (shared by Brazil, Austria, Switzerland, Belgium, Latin America).

| navigator.language | Intl timeZone | Suggest | Confidence shown | Note |
|---|---|---|---|---|
| pt-PT | Europe/Lisbon, Atlantic/Madeira, Atlantic/Azores | PT | high | |
| de-DE | Europe/Berlin, Europe/Busingen | DE | high | |
| nl-NL | Europe/Amsterdam | NL | high | |
| es-ES, ca-ES, gl-ES, eu-ES | Europe/Madrid, Atlantic/Canary, Africa/Ceuta | ES | high | Basque/Navarre foral regimes differ; ask region later, not at onboarding |
| fr-FR | Europe/Paris, DOM zones | FR | high | |
| pt-BR | Europe/Lisbon | PT | medium | Brazilian resident in Portugal is common; confirm |
| pt-BR | America/* | none of the five | — | Offer "Brazil not supported yet"; do not suggest PT |
| nl-BE, fr-BE, de-BE | Europe/Brussels | none (BE) | — | Belgium not covered; do not map to NL/FR |
| nl-BE | Europe/Amsterdam | NL | medium-low | Flemish speaker living in NL |
| fr-CH, de-CH, it-CH | Europe/Zurich | none (CH) | — | Do not map to FR/DE |
| fr-CH / fr-BE / fr-LU / fr-CA | Europe/Paris | FR | medium | Timezone wins over language |
| de-AT | Europe/Vienna | none (AT) | — | Do not map to DE |
| de-AT, de-CH, de-LU | Europe/Berlin | DE | medium | Timezone wins |
| es-MX, es-AR, es-CO, es-419, es-US | Europe/Madrid or Atlantic/Canary | ES | medium | Latin American resident in Spain |
| es-* | America/* | none of the five | — | Offer "not supported yet" |
| en-* (en-GB, en-US, en-IE…) | Europe/Lisbon | PT | medium-low | Expat; show PT first, with the full list visible |
| en-* | Europe/Berlin | DE | medium | |
| en-* | Europe/Amsterdam | NL | medium | Many English-speaking residents; still confirm |
| en-* | Europe/Madrid, Atlantic/Canary | ES | medium | |
| en-* | Europe/Paris | FR | medium | |
| en-GB | Europe/London | none (UK) | — | |
| any | Europe/Monaco, Europe/Andorra, Europe/Gibraltar, Europe/Luxembourg | none | — | Micro-states neighbouring covered countries; do not map |
| language and timezone disagree (e.g. de-DE + Europe/Madrid) | — | timezone country | medium-low | Residence, not language, decides tax; say so in one line |
| timezone unavailable or UTC | language country if one of the five | low | Ask directly |

Implementation notes: read `navigator.languages` (full list, not just the first) and `Intl.DateTimeFormat().resolvedOptions().timeZone`; never store the guess as the country until the user taps confirm; store the confirmed country with the date of confirmation and allow change at any time (people move; Portugal's exit rule and Germany's step-in rule make the date relevant).

### B. Summary table

| Country | Holding exemption | Headline rate 2026 | Allowance | Tax year / filing | Confidence |
|---|---|---|---|---|---|
| **PT** | **Yes, 365 days** (≥ 365 days exempt; declare anyway; not for non-EU/EEA counterparties; swaps deferred) | 28% flat (option: progressive 12.5–48% + surcharge) | none (exemption via holding) | Calendar; file 1 Apr–30 Jun | high |
| **DE** | **Yes, > 1 year** (draft law would remove it for coins bought after 31 Dec 2026) | personal rate 14–45% + 5.5% Soli (+ church tax) | €1,000 Freigrenze on all §23 gains (cliff); €256 for staking/lending | Calendar; file by 31 Jul (2026 → 31 Jul 2027) | high (2026) / medium (2027) |
| **NL** | **n/a — no gains tax**; wealth tax on 1 Jan value | 36% × 6.00% deemed return ≈ 2.16% of value | €59,357 heffingsvrij vermogen (€118,714 partners) | Calendar; file 1 Mar–1 May | high |
| **ES** | **None** — every sale/swap/payment taxable | 19 / 21 / 23 / 27 / 30% savings scale | none; Modelo 721 if foreign custody > €50,000 | Calendar; file Apr–30 Jun | high |
| **FR** | **None** — sales and payments taxable, swaps deferred | 31.4% PFU (12.8 + 18.6) or progressive option | €305 total disposals per year (cliff) | Calendar; file May–June | high |

### C. The five facts most likely to change within 12 months

1. **Germany — end of the one-year holding period for new purchases.** BMF draft of 30 Sep 2026 (25% flat under § 20 EStG for Tauschkryptowerte acquired after 31 Dec 2026, withholding from 2028, 50% substitute base, grandfathering). Cabinet did not adopt it on 14 Oct 2026; watch: cabinet decision, Bundestag/Bundesrat readings, the final cut-off date and whether grandfathering survives. If enacted, the app needs a per-lot "acquired before/after 2027" flag for German users.
2. **France — PLF 2027 crypto amendments.** I-3898 (stablecoin swaps taxable + per-asset weighted-average cost from 1 Jan 2027) adopted in plenary on 16 Oct 2026; solemn vote 20 Oct 2026, Senate in November, CMP or 49.3, promulgation targeted late December. Also pending: exit tax on crypto, self-hosted wallet declaration, wealth tax including crypto. Any of these changes the French card and the computation engine.
3. **Netherlands — 2027 parameters and the 2028 system.** Belastingplan 2027 (heffingsvrij vermogen €60,098 vs the cabinet's €30,846 counter-proposal; forfait 6.37% vs 7.87%) votes on 12 Nov and 15 Dec 2026; the werkelijk-rendement novelle (vermogenswinst for financial instruments; heffingsvrij inkomen €1,000) reaches the Eerste Kamer in January 2027 at the earliest; whether crypto is taxed on unrealised (aanwas) or realised (winst) gains from 2028 is still open.
4. **Spain — post-election legislation.** General election 29 Nov 2026; the lapsed LGT reform (DAC8 transposition, crypto embargo, Modelo 175) must be re-tabled; a 2027 budget could touch the savings scale; the FIFO dispute (TSJPV vs AEAT) may reach the Supreme Court or produce a DGT ruling.
5. **Portugal — OE2027 final text and AT doctrine.** OE2027 votes 27 Oct–late Nov 2026 (crypto untouched in the proposal, amendments possible); the AT's position on holding periods across swaps (PIV 28969) and possible new PIVs; first DAC8 reports by 31 May 2027 may trigger AT guidance on Anexo G vs J for foreign platforms.

Also worth a watch line in the review job: France's social-levy rate (LFSS 2027, autumn 2026), Germany's 2027 tariff values (Grundfreibetrag) and Soli thresholds, the Dutch 2027 banktegoeden/schulden percentages (set early 2028), and the EU's first DAC8 exchange (by 30 Sep 2027).

### D. Verification queue for the human reviewer (gaps left by the search budget)

- Read the BMF Referentenentwurf PDF directly (BMF site returned 503 today) and confirm: title, 31 Dec 2026 cut-off, § 20(1) no. 12-E, § 52 application rule.
- Read the BMF-Schreiben of 6 Mar 2025 directly for the FIFO/wallet Rn. numbers and the ten-year statement Rn.
- Confirm the LFSS 2026 law number on Légifrance and the exact wording of the entry into force for revenus du patrimoine (2025 income).
- Confirm the Dutch verzuimboete amount for 2026 and the Staatsblad citation of the Wet tegenbewijsregeling box 3.
- Confirm the Portuguese RGIT fine ranges to quote on the card, and the exact OE2027 vote dates after the conference of leaders publishes them.
- Spain: confirm the Renta 2026 campaign dates when AEAT publishes the 2027 calendar, and whether the new Cortes re-tables bill 121/000060.
- EU: cite Council Directive (EU) 2023/2226 of 17 Oct 2023 (OJ L, 24 Oct 2023) from EUR-Lex (page did not render today); application 1 Jan 2026, first exchange by 30 Sep 2027.
