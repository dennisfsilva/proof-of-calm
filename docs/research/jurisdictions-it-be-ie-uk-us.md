# Private-individual crypto tax rules: IT, BE, IE, UK, US (tax year 2026)

Research note for the Proof of Calm jurisdiction data files. General information for product design, not advice. All sources accessed 2026-10-16. Confidence: high = primary source read; medium = reputable secondary or primary not fully readable; low = single or weak source.

Research limits in this session: the shared WebSearch budget ran out midway, so some pages were reached by direct URL only. Items that could not be verified are listed under "Open items" at the end rather than guessed.

Conventions used below: "yes/no/depends" on taxable events is the position for a private individual holding crypto as an investment (not trading). "App card" = the 60-word jurisdiction card.

---

## 1. Italy (IT)

### 1.1 Identity

| Field | Value |
|---|---|
| ISO / currency / locale | IT / EUR / it-IT |
| Date, number example | 16/10/2026; 1.234,56 € |
| Timezone | Europe/Rome |
| Tax authority | Agenzia delle Entrate, https://www.agenziaentrate.gov.it |
| Tax year | Calendar year |
| Filing | Modello Redditi PF by 31 October of the following year (Modello 730 by 30 September; crypto gains can be declared there since 730/2024 via quadri T and W). Medium confidence on exact dates; the 2026 instructions confirm the payment calendar [IT-3]. |
| Payment | Balance + first advance by 30 June (or 30 July with 0.40% surcharge); second advance by 30 November [IT-3]. Imposta sostitutiva and the 2 per mille wealth tax follow the income-tax calendar. |

### 1.2 Classification

Cripto-attività (art. 67 c. 1 lett. c-sexies TUIR, introduced by L. 197/2022): "a digital representation of value or rights that can be transferred and stored electronically using distributed ledger technology or similar". Gains and "other proceeds" from redemption, sale for consideration, exchange or holding are redditi diversi di natura finanziaria taxed by a flat substitute tax [IT-2][IT-3]. Crypto is not foreign currency. Crypto held in wallets/exchanges is a foreign financial asset for monitoring purposes (Quadro RW) [IT-2].

### 1.3 Taxable events

| Event | Taxable? | Note |
|---|---|---|
| Sale to fiat | Yes | Cessione a titolo oneroso / rimborso [IT-2]. |
| Crypto-to-crypto swap | Depends | Swaps between crypto-assets "aventi eguali caratteristiche e funzioni" (e.g. BTC to ETH) are not taxable; the acquired asset inherits the euro cost of the asset given up (Circ. 30/E example: 10 ETH bought with 5 of 20 BTC costing EUR 2,000 take a cost of EUR 500) [IT-2]. Swapping into a euro e-money token (MiCA stablecoin) is a realisation, taxed at 33% from 2026; euro <-> euro-EMT conversions are not [IT-1]. NFTs and tokens with a different function: taxable. |
| Spending crypto | Yes | Use for goods/services is a realisation [IT-2]. |
| Transfers between own wallets | No | No change of ownership. |
| Gifts / inheritance | Giving is not a realisation for the donor (no consideration). Donee takes the donor's cost; heir takes the value declared for inheritance tax [IT-2][IT-3]. |
| Staking / airdrops / lending | Yes | "Proventi derivanti dalla detenzione" are taxed gross, without deductions, at the substitute rate (33% from 2026 per secondary sources) [IT-2][IT-11]. Circ. 30/E also treats staking paid by an Italian platform as redditi di capitale with a 26% advance withholding, so classification can differ by set-up (medium). |

### 1.4 Rates

| Year | Rate | Basis |
|---|---|---|
| 2025 | 26% substitute tax, from the first euro | L. 207/2024 art. 1 c. 25 removed the EUR 2,000 threshold for gains and losses realised from 1 Jan 2025 [IT-3][IT-5]. |
| 2026 | 33% substitute tax on gains and other proceeds realised from 1 January 2026 | L. 207/2024 art. 1 c. 24 [IT-1][IT-5][IT-8]. Exception: 26% for proceeds from euro-denominated e-money tokens (L. 199/2025, Legge di Bilancio 2026, art. 1 c. 28) [IT-1]. One source extends the 26% to crypto ETPs/ETNs; these are financial instruments rather than crypto-assets anyway (low). |
| Affrancamento | 18% substitute tax to step the cost basis up to the normal value at 1 January 2025 | L. 207/2024 art. 1 c. 26-27: payment by 30 November 2025, single sum or 3 annual instalments with 3% interest; must cover all units of each chosen crypto-asset; revalued assets cannot later produce usable losses [IT-3][IT-5]. The window is closed; no 2026 edition found. |

Timing point: disposals completed by 31 December 2025 stay at 26% even if proceeds arrive in 2026 (practitioner reading of Circ. 30/E par. 3.2; medium) [IT-5].

### 1.5 Allowances

None since 1 January 2025. The former EUR 2,000 franchigia is gone for gains and for the loss carry-forward test [IT-3].

### 1.6 Holding-period rule

- No holding exemption. The app must say: every taxable disposal is a taxable event here, whatever the holding time.
- Lot identification: LIFO. "Si considerano cedute per prime le [cripto-attività] acquisite in data più recente" (art. 67 c. 1-bis TUIR as applied by Circ. 30/E) [IT-2]. Cost must be proven "con elementi certi e precisi"; otherwise cost = zero [IT-3].

### 1.7 Losses

Minusvalenze offset plusvalenze of the same category (c-sexies) in the year; the excess carries forward up to the fourth following year, only if shown in the return for the year realised [IT-2][IT-3]. No offset against gains on shares, bonds or funds; no carry-back. (The 2027 draft would open cross-asset offset, see 1.9.)

### 1.8 Reporting

- Quadro RT, Sezione V (crypto gains; separate sub-sections by year of disposal; 2025 disposals at 26%, 2026 disposals will be at 33% in Redditi PF 2027) [IT-3].
- Quadro RW: monitoring of crypto held in wallets or on exchanges (asset code 21), plus the imposta sul valore delle cripto-attività of 2 per mille per year on the 31 December value taken from the exchange where the asset was bought (or a comparable platform / price site), pro rata by days held, tax code 1727; due only where an Italian intermediary has not already applied the equivalent imposta di bollo [IT-3].
- DAC8: Italian and EU crypto service providers report balances and transactions to the Agenzia from 1 January 2026 (D.Lgs. 194/2025; first exchange 2027) (medium) [IT-11].
- Penalties (one line): omitted RW 3% to 15% of the undeclared value (double for black-list countries); unfaithful return 70% of the extra tax under the 2024 sanctions reform; late RT/RW with ravvedimento reduces these (medium).

### 1.9 Known or scheduled changes 2025-2027

| Date | Change | Status |
|---|---|---|
| 1 Jan 2025 | Threshold removed; affrancamento option (closed 30 Nov 2025) | In force [IT-3][IT-5] |
| 1 Jan 2026 | 33% rate (L. 207/2024 c. 24); 26% carve-out for euro EMT (L. 199/2025 c. 28); Tobin tax on shares doubled to 0.4% (not crypto) | In force [IT-1] |
| 1 Jan 2026 | DAC8 reporting by exchanges | In force (medium) [IT-11] |
| Feb 2026 | Doctrinal challenge to the 33% rate on constitutional grounds | Commentary only [IT-10] |
| 24 Sep 2026 | Technical draft from the parliamentary Intergruppo "Asset Digitali, Blockchain e Bitcoin": back to 26% from 2027, crypto losses offsettable against other financial instruments, cost deductibility, annual step-up option. "Non è una legge approvata né una proposta depositata." | Proposal only; watch the DDL Bilancio 2027 (expected late Oct 2026, approval by 31 Dec 2026) [IT-9] |

### 1.10 App card (60 words) and caveats

Safe to state: "Italy taxes crypto gains at a flat 33% from 1 January 2026 (26% in 2025), with no tax-free threshold and no holding-period exemption. Swapping one crypto for a similar one is not taxed; selling for euro or stablecoins is. Lots are matched LIFO. Losses carry forward four years. Holdings are reported yearly (Quadro RW, 0.2% wealth tax)."

Needs the accountant caveat: which swaps count as "same characteristics and functions" (especially stablecoins and NFTs); staking classification; whether 2025 disposals paid in 2026 stay at 26%; RW details and the 2 per mille where an Italian exchange already applies stamp duty; any 2027 rate change.

### 1.11 Sources

| # | Source | Publisher | Date | Conf. |
|---|---|---|---|---|
| IT-1 | https://www.fiscooggi.it/portale/-/bilancio-2026-aliquota-pi%C3%B9-leggera-per-le-criptoattivit%C3%A0-in-euro | Fisco Oggi (Agenzia delle Entrate magazine) | 2026-02-12 | High |
| IT-2 | https://www.dirittobancario.it/wp-content/uploads/2023/10/Circolare-Agenzia-delle-Entrate-27-ottobre-2023-n.-30-E.pdf | Agenzia delle Entrate, Circolare 30/E (mirror) | 2023-10-27 | High |
| IT-3 | https://www.agenziaentrate.gov.it/portale/documents/d/guest/pf2_istruzioni_2026_agg-13-05-2026 | Agenzia delle Entrate, Istruzioni Redditi PF 2026 fasc. 2 | 2026-05-13 | High |
| IT-4 | https://www.gazzettaufficiale.it/eli/id/2024/12/31/24G00229/sg | Gazzetta Ufficiale, L. 207/2024 (entry into force 1 Jan 2025; article text not retrievable in session) | 2024-12-31 | High (metadata) |
| IT-5 | https://studioalcor.it/novita-sul-regime-di-tassazione-delle-cripto-attivita-art-1-co-24-29-della-l-207-2024/ | Studio Alcor | 2025-01-27 | Medium |
| IT-6 | https://www.fondazionenazionalecommercialisti.it/node/1816 | Fondazione Nazionale dei Commercialisti | 2025-03-21 | Medium (seen via search summary) |
| IT-7 | https://fiscomania.com/cripto-attivita-in-dichiarazione-dei-redditi/ | Fiscomania | 2026 | Medium |
| IT-8 | https://www.fiscoetasse.com/new-rassegna-stampa/2991-criptoattivita-2026-cosa-contiene-la-legge-di-bilancio.html | FiscoeTasse | 2025/26 | Medium |
| IT-9 | https://www.spaziocrypto.com/regolamentazione/crypto-tax-italia-bozza-26-percento-camera-intergruppo-2027/ | SpazioCrypto | 2026-09-24 | Medium |
| IT-10 | https://www.ipsoa.it/documents/quotidiano/2026/02/14/legittima-tassazione-33-criptovalute | Ipsoa | 2026-02-14 | Medium |
| IT-11 | https://blog.moneyviz.it/tasse-crypto-2026-33-legge-bilancio/1841/ | MoneyViz blog | 2026 | Low-medium |
| IT-12 | https://www.agendadigitale.eu/documenti/tassazione-cripto-attivita-2026-cosa-cambia-su-plusvalenze-permute-e-isee/ | Agenda Digitale | 2026 | Medium |

---

## 2. Belgium (BE)

### 2.1 Identity

| Field | Value |
|---|---|
| ISO / currency / locales | BE / EUR / nl-BE, fr-BE, de-BE |
| Date, number examples | nl-BE 16/10/2026, 1.234,56 €; fr-BE 16/10/2026, 1 234,56 €; de-BE 16.10.2026, 1.234,56 € |
| Timezone | Europe/Brussels |
| Tax authority | SPF Finances / FOD Financiën, https://finances.belgium.be and https://financien.belgium.be; Ruling Commission (SDA/DVB), https://www.ruling.be |
| Tax year | Income year = calendar year; assessed in the following "aanslagjaar / exercice d'imposition" (income 2026 = AY 2027). |
| Filing | Return for income 2026 due in 2027: paper around end June, MyMinfin/Tax-on-web around mid-July, longer deadline (mid-October) for complex returns or via a mandatary. Medium confidence: the SPF pages were captcha-blocked this session; verify the 2027 dates when published (spring 2027). |
| Payment | Within 2 months of the assessment notice (notice sent up to 30 June of the second year after the income year). For bank-held financial instruments the new tax is withheld at source from 1 June 2026; crypto gains are never withheld and are paid via the assessment [BE-1][BE-10]. |

### 2.2 Classification

No crypto-specific statute before 2026; qualification by facts and circumstances into three regimes [BE-7][BE-8]:

1. Normal management of private assets (art. 90, 1° CIR 92): exempt up to 31 December 2025; from 1 January 2026 inside the new capital gains tax on financial assets.
2. Speculative or "abnormal" management: miscellaneous income at 33% plus communal surcharge (art. 90, 1° and 171, 1° CIR).
3. Professional activity: progressive rates (up to 50%) plus communal surcharge and social contributions.

New law: "Wet tot invoering van een belasting op meerwaarden op financiële activa", approved by the Chamber on 3 April 2026 (one source says 2 April), published in the Belgisch Staatsblad on 21 April 2026, applicable to gains realised from 1 January 2026 [BE-3][BE-4][BE-5][BE-6]. Crypto-assets (defined in line with MiCA/DAC8, including stablecoins and NFTs used for payment or investment) are "financial assets" in the residual 10% category [BE-1][BE-2][BE-3].

### 2.3 Taxable events (10% regime, normal management)

| Event | Taxable? | Note |
|---|---|---|
| Sale to fiat | Yes | Transfer for consideration [BE-1]. |
| Crypto-to-crypto swap | Yes | "Taxable when exchanged for other tokens, for fiat, or used to acquire goods or services" [BE-1]; secondary sources call crypto-to-crypto and conversion to stablecoins a novelty of the reform [BE-12]. |
| Spending crypto | Yes | [BE-1] |
| Transfers between own wallets | No | No transfer of ownership (inferred from the law's "transfer for consideration" trigger; medium). |
| Gifts / inheritance | Not a taxable transfer (no consideration); the recipient keeps the original acquisition value and date [BE-2]. Regional gift/inheritance taxes apply separately. |
| Staking / lending / airdrops | Yes | Ruling of March 2025 treats staking rewards as income from movable property (interest-like, art. 17 §1 / 19, 1° CIR), reported separately from gains [BE-7]; practitioners apply 30% [BE-8]. Not fully settled: one guide shows 30% and 33% in different places [BE-12]. |

### 2.4 Rates

| Regime | 2025 | 2026 |
|---|---|---|
| Normal management | 0% | 10% on gains above the exemption, measured from the 31 Dec 2025 value [BE-1][BE-10] |
| Speculative (miscellaneous income) | 33% + communal surcharge | Unchanged; no 31 Dec 2025 reset; the EUR 10,000 exemption does not apply (secondary) [BE-7][BE-14] |
| Professional | Progressive | Unchanged [BE-8] |
| Internal gains (sale of shares to own company) | n/a | 33%, no exemption [BE-1] |

Baseline mechanics [BE-1][BE-3][BE-4][BE-10]:
- Acquisition value for pre-2026 assets = fair market value on 31 December 2025 ("foto"), or the real historical acquisition cost if higher and evidenced, usable for transfers up to 31 December 2030 (gains only; losses are measured from the 31 Dec 2025 value).
- Listed assets: last closing price of 2025. Unlisted: statutory hierarchy or a certified-accountant valuation finalised by 31 December 2027. Crypto: no specific method in the law; sources point to the market value on 31 Dec 2025 with evidence (exchange statements, timestamps); circular 2026/C/74 of 22 July 2026 covers crypto and the burden of proof [BE-6].
- Missing proof of acquisition value: value deemed zero, so the full sale price is taxed ("ultimum remedium") [BE-3][BE-6].
- Fungible assets: FIFO for historical gains; average price for the 31/12/2025 value (EY wording; medium) [BE-1].
- Circular 2026/C/74: crypto gains are "not automatically" speculative; three factors (share of crypto in financial assets, borrowing to buy, trading bots); only a combination triggers 33% [BE-6].

### 2.5 Allowances

EUR 10,000 per taxpayer per year (indexed; EUR 10,000 is the AY 2027 figure), unused part carried forward by up to EUR 1,000 per year for at most 5 years, so at most EUR 15,000 (EUR 30,000 for a couple, each their own) [BE-3][BE-4][BE-10][BE-11]. Only within the 10% category; intermediaries do not apply it at source, so it is claimed in the return [BE-4][BE-11]. Not applicable to speculative income (secondary; medium) [BE-14].

### 2.6 Holding-period rule

- No statutory holding period. Holding time is one factor in the facts-and-circumstances test (buy-and-hold, long portfolio age, own funds, limited share of wealth lean to "normal management") [BE-7].
- Under the 10% regime every transfer for consideration is taxable from the first euro above the exemption. The app must say: every sale (and swap) is a taxable event here from 2026; the holding period only matters for the speculative-vs-normal qualification.

### 2.7 Losses

- 10% regime: losses offset gains of the same year and the same category only; no carry-forward of losses (only the exemption carries forward) [BE-3][BE-4][BE-10][BE-11]. Sources disagree on whether crypto losses can offset share gains: BFS says no [BE-3]; Jubel says within the residual category "the type of asset does not matter" [BE-11]. The law groups crypto and listed shares in the same residual category, which supports Jubel, but treat as unsettled (medium-low) and check circular 2026/C/74.
- Speculative regime: losses deductible from miscellaneous income of the same kind in the year and the five following years (art. 103 CIR; secondary, medium) [BE-13].

### 2.8 Reporting

- Withholding: Belgian intermediaries withhold 10% on financial instruments and insurance from 1 June 2026 unless the client opted out (opt-out for all of 2026 by 30 June 2026; gains of 1 Jan-31 May 2026 presumed opted out unless retroactive withholding is requested by 31 August 2026) [BE-4][BE-10][BE-11]. Crypto gains: no withholding; the taxpayer declares them in the return for income year 2026 (AY 2027). The new codes will appear in the 2027 return form (spring 2027) [BE-1][BE-4][BE-11].
- Speculative gains: Part 2, box XV, codes 1440/2440 [BE-9]. Movable income such as staking: box VII, code 1444/2444 (low) [BE-13].
- Foreign accounts, including accounts at foreign exchanges: declare in the return (box XIII) and to the Central Point of Contact (PCC/CAP) of the National Bank; a draft law of 14 October 2025 extends PCC reporting to crypto-platform accounts with semi-annual balances, window opening around December 2026 (medium) [BE-8][BE-12].
- DAC8: EU crypto service providers collect data from 1 January 2026; first exchange between administrations by 30 September 2027 for 2026 transactions [BE-7][BE-12].
- Penalties (one line): tax increases of 10% to 200% for incomplete or late returns and administrative fines of EUR 50 to 1,250 per infringement (arts. 444-445 CIR; medium).

### 2.9 Known or scheduled changes 2025-2027

| Date | Change | Status |
|---|---|---|
| 1 Jan 2026 | 10% tax applies to gains realised from this date; 31 Dec 2025 baseline | In force (law of 3 Apr 2026, BS 21 Apr 2026) [BE-4][BE-5] |
| 1 Jan 2026 | DAC8 data collection by CASPs | In force [BE-7] |
| 1 Jun 2026 | Withholding by Belgian intermediaries starts; opt-out by 30 Jun 2026; retroactive opt-in by 31 Aug 2026 | In force [BE-10][BE-11] |
| 22 Jul 2026 | Circular 2026/C/74 (crypto, holding companies, burden of proof) | Published [BE-6] |
| Dec 2026 | PCC reporting of crypto-platform accounts (draft law 14 Oct 2025) | Pending (medium) [BE-8] |
| Spring 2027 | AY 2027 return form with the new capital-gains codes; first crypto declarations under the 10% regime | Expected |
| 30 Sep 2027 | First DAC8 exchange covering 2026 | Scheduled [BE-12] |
| 31 Dec 2027 | Deadline for certified valuation reports of 31 Dec 2025 values | Scheduled [BE-1][BE-2] |
| 31 Dec 2030 | End of the option to use a higher historical acquisition price | Scheduled [BE-3][BE-4] |

### 2.10 App card (60 words) and caveats

Safe to state: "Belgium taxes gains on crypto and other financial assets at 10% from 1 January 2026, on growth since 31 December 2025 and above EUR 10,000 a year (unused allowance rolls forward to EUR 15,000). Swaps and spending count as sales. No holding-period exemption. Losses only offset same-year gains. Gains on foreign platforms must be declared; frequent or leveraged trading can be taxed at 33%."

Needs the accountant caveat: normal vs speculative vs professional qualification; crypto valuation at 31 Dec 2025 and proof of cost; whether crypto losses offset share gains; staking classification; the declaration codes for AY 2027; PCC/foreign-account reporting.

### 2.11 Sources

| # | Source | Publisher | Date | Conf. |
|---|---|---|---|---|
| BE-1 | https://www.ey.com/en_be/insights/tax/the-new-belgian-capital-gains-tax-what-changes-in-2026 | EY Belgium | 2026-03-27 | High |
| BE-2 | https://kpmg.com/be/en/home/insights/2025/12/ctx-belgium-new-capital-gains-tax-on-financial-assets.html | KPMG Belgium (draft-law stage) | 2025-12 | Medium-high |
| BE-3 | https://www.bfs.be/en/news/taxation-of-capital-gains-on-financial-investments-understanding-the-reform-and-protecting-your-historical-gains | BFS | 2026-04-30 | Medium |
| BE-4 | https://deknudtnelis.be/meerwaardebelasting-op-financiele-activa-eindelijk-een-definitief-kader/ | Deknudt Nelis | 2026 (post 21 Apr) | Medium |
| BE-5 | https://www.acs.be/nieuws/meerwaardebelasting-eindelijk-gestemd | ACS | 2026-04-27 | Medium |
| BE-6 | https://www.vandelanotte.be/nl/nieuws/meerwaardebelasting-dit-verduidelijkt-de-nieuwe-circulaire | Vandelanotte (on circular 2026/C/74 of 22 Jul 2026) | 2026-07-31 | Medium-high |
| BE-7 | https://be.andersen.com/en/news/tax-challenges-for-cryptocurrency-investors | Andersen in Belgium | 2025-10-29 | Medium-high |
| BE-8 | https://bakertilly.be/fr/news/traitement-fiscal-des-crypto-monnaies-taxe-sur-les-plus-values-et-partage-de-donnees-en-vue/ | Baker Tilly Belgium | 2025-10-30 | Medium |
| BE-9 | https://www.test-achats.be/argent/impots/news/cryptomonnaies | Test-Achats | 2026-04-09 | Medium |
| BE-10 | https://www.argenta.be/nl/argenta-informeert/meerwaardebelasting.html | Argenta (bank) | 2026-04-23 | Medium-high |
| BE-11 | https://www.jubel.be/de-nieuwe-meerwaardebelasting-vanaf-1-januari-2026/ | Jubel | 2026-03-17 | Medium |
| BE-12 | https://www.cryptomonnaie.be/article/fiscalite-crypto-belgique-2026-guide-complet-particuliers | cryptomonnaie.be | 2026-03-23 | Low-medium |
| BE-13 | https://divly.com/fr/guides/guide-fiscal-crypto-belgique | Divly | 2026 | Low |
| BE-14 | https://plisio.net/tax/belgium-crypto-tax | Plisio | 2026 | Low |
| BE-15 | https://news.belgium.be/nl/invoering-meerwaardebelasting-op-financiele-activa | Belgian federal government press release | 2025 | Not retrievable (403); follow up |

---

## 3. Ireland (IE)

### 3.1 Identity

| Field | Value |
|---|---|
| ISO / currency / locale | IE / EUR / en-IE (ga-IE) |
| Date, number example | 16/10/2026; €1,234.56 |
| Timezone | Europe/Dublin |
| Tax authority | Revenue Commissioners, https://www.revenue.ie |
| Tax year | Calendar year |
| CGT payment | Disposals 1 Jan-30 Nov: pay by 15 December of the same year; disposals 1-31 Dec: pay by 31 January of the next year [IE-1][IE-2][IE-7] |
| CGT return | By 31 October of the following year (ROS extension to mid-November for Form 11 filers; 18 Nov 2026 for 2025 returns per a third-party calendar, low) [IE-2][IE-7][IE-17] |
| Forms | Form CG1 (people not otherwise filing; paper, uploadable via ROS/myAccount), Form 12 (PAYE; paper only, the eForm 12 cannot take CGT), Form 11 (chargeable persons, via ROS) [IE-2] |

### 3.2 Classification

Crypto-assets are chargeable assets for CGT; "the sale, transfer, or redemption of crypto-assets is most likely to be a disposal for CGT purposes unless... there is a trade of dealing in crypto-assets" (TDM Part 02-01-03, reviewed January 2026) [IE-1]. Not treated as currency for direct taxes (Bitcoin is a currency for VAT only, Hedqvist). Each disposal is computed separately. Valuation: no single exchange rate; "a reasonable effort should be made to use an appropriate valuation" [IE-1].

### 3.3 Taxable events

| Event | Taxable? | Note |
|---|---|---|
| Sale to fiat | Yes | [IE-1] |
| Crypto-to-crypto swap | Yes | Exchange of an asset is a disposal under general CGT rules; TDM "sale, transfer, or redemption" [IE-1] (high on principle; the TDM does not use the word swap). |
| Spending crypto | Yes | TDM Example 3: paying in a café is a disposal [IE-1]. |
| Transfers between own wallets | No | No change of beneficial ownership (general CGT principle; medium-high). |
| Gifts / inheritance | Gift = disposal at market value for the donor (CGT) and a CAT event for the recipient (Group A/B/C thresholds EUR 420,000 / 44,000 / 22,000 from 7 Oct 2026); spouse transfers no gain/no loss; death: no CGT, heir's cost = market value at death [IE-1][IE-6][IE-10]. |
| Staking / mining / airdrops | Yes (income) | Income tax at marginal rates (20%/40% plus USC and PRSI) as trading or miscellaneous income; TDM covers mining under income tax, staking by analogy (medium) [IE-1]. |

### 3.4 Rates

| Period | Standard CGT rate | Source |
|---|---|---|
| 2025 and 1 Jan-6 Oct 2026 | 33% | [IE-3] |
| Disposals on or after 7 Oct 2026 | 31% (Budget 2027, announced 6 Oct 2026; Revenue pages updated 7 Oct 2026) | [IE-3][IE-6][IE-9][IE-10][IE-11] |
| Development land | 33% unchanged | [IE-3][IE-9] |

Legal status: Budget resolution and Revenue guidance already apply 31%; Finance Bill 2026 was expected on 15 October 2026 and normally becomes a Finance Act in late December. Not verified in this session that the Bill was published. Tax year 2026 is therefore split-rate: the app needs a disposal-date rule, not a year rule.

### 3.5 Allowances

EUR 1,270 personal exemption per individual per year; applied after losses; not transferable between spouses; cannot be carried forward [IE-1][IE-3][IE-7]. Unchanged in Budget 2026 and Budget 2027 [IE-9][IE-12].

### 3.6 Holding-period rule

- None. Every disposal is a taxable event. The app must say so.
- Lot identification (Revenue guidance for shares, s. 580-581 TCA 1997) [IE-4]: FIFO; disposals within four weeks of an acquisition are matched to that acquisition (LIFO within the window); a loss on a disposal followed by re-acquisition within four weeks is only usable against gains on the re-acquired assets (fraction rule applies). Whether s. 581 applies to crypto is disputed: Revenue's crypto TDM is silent, and a third-party post claims written Revenue confirmation that no four-week rule applies to crypto [IE-15] (low). Design default: FIFO, with the four-week rules flagged as "may apply".

### 3.7 Losses

Allowable losses offset gains of the same year first; unused losses carry forward without time limit; no carry-back except losses in the year of death (3 years back); no offset against income; a return is due even for a loss or no gain [IE-1][IE-5][IE-7].

### 3.8 Reporting

- Forms and dates: see 3.1. Attach a computation to the CG1 [IE-7].
- Late filing surcharge: 5% of the tax (max EUR 12,695) if filed within two months after 31 October; 10% (max EUR 63,485) later; daily interest on late payment [IE-7][IE-2].
- CARF/DAC8: s. 891HA TCA (inserted by s. 92 Finance Act 2025) and S.I. No. 584 of 2025; applies from 1 January 2026; RCASPs report by 31 May for the previous calendar year (31 May 2027 for 2026), with exchange to other jurisdictions by 30 September 2027; users receive a copy of their data by 31 May [IE-8]. A registration deadline for RCASPs is reported by secondary sources as 31 December 2026 (unverified; Revenue registration page returned 404 this session).

### 3.9 Known or scheduled changes 2025-2027

| Date | Change | Status |
|---|---|---|
| 7 Oct 2025 | Budget 2026: no CGT rate or exemption change; Entrepreneur Relief lifetime limit to EUR 1.5m from 1 Jan 2026 | Enacted (Finance Act 2025) [IE-12][IE-13] |
| 1 Jan 2026 | CARF/DAC8 in force; Revenue crypto TDM reviewed Jan 2026 | In force [IE-1][IE-8] |
| 6-7 Oct 2026 | Budget 2027: CGT 33% to 31% for disposals from 7 Oct 2026; CAT thresholds up; Irish Investment Account from 1 Jul 2027 with 1% annual tax above EUR 50,000 (crypto excluded per CoinDesk) | Announced, Finance Bill 2026 pending [IE-9][IE-10][IE-11][IE-14] |
| 31 May 2027 | First CARF reports to Revenue | Scheduled [IE-8] |
| Oct 2027 | Budget 2028 | Watch for further CGT moves (the 2026 cut was framed as a first step) |

### 3.10 App card (60 words) and caveats

Safe to state: "Ireland charges Capital Gains Tax on every crypto disposal: selling, swapping, spending or gifting. Rate 33% up to 6 October 2026 and 31% from 7 October 2026, after a EUR 1,270 yearly exemption. No holding-period exemption. Pay by 15 December (January-November sales) or 31 January; file by 31 October next year. Losses carry forward."

Needs the accountant caveat: the four-week rule for crypto; staking/airdrop income; trading vs investing; CAT on gifts; Finance Act 2026 enactment of the 31% rate.

### 3.11 Sources

| # | Source | Publisher | Date | Conf. |
|---|---|---|---|---|
| IE-1 | https://www.revenue.ie/en/tax-professionals/tdm/income-tax-capital-gains-tax-corporation-tax/part-02/02-01-03.pdf | Revenue, TDM Part 02-01-03 | reviewed 2026-01 | High |
| IE-2 | https://revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/when-and-how-do-you-pay-and-file-cgt.aspx | Revenue | 2026-10-02 | High |
| IE-3 | https://www.revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/how-to-calculate-cgt.aspx | Revenue | 2026-10-07 | High |
| IE-4 | https://www.revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/selling-or-disposing-of-shares.aspx | Revenue | 2026-07-24 | High (shares) |
| IE-5 | https://www.revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/if-you-make-a-loss.aspx | Revenue | 2025-05-02 | High |
| IE-6 | https://www.revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/index.aspx | Revenue | 2026-10 | High |
| IE-7 | https://www.revenue.ie/en/gains-gifts-and-inheritance/documents/form-cg1-helpsheet.pdf | Revenue, CG1 helpsheet (2025 returns) | 2026 | High |
| IE-8 | https://www.revenue.ie/en/companies-and-charities/international-tax/aeoi/dac8/index.aspx | Revenue | 2026-03-30 | High |
| IE-9 | https://assets.gov.ie/static/documents/c6792805/Budget_2027_-_Tax_Policy_Changes_-_Publication_Version.pdf | Department of Finance | 2026-10-06 | High (via search summary; 403 on fetch) |
| IE-10 | https://kpmg.com/ie/en/insights/tax/budget-2027/headlines.html | KPMG Ireland | 2026-10-06 | Medium-high |
| IE-11 | https://taxnews.ey.com/news/2026-2138-ireland-budget-2027-an-overview-for-international-investors | EY | 2026-10-08 | Medium-high |
| IE-12 | https://www.saffery.com/ie/insights/articles/budget-2026-at-a-glance/ | Saffery | 2025-10 | Medium |
| IE-13 | https://www.mooreireland.ie/insights/budget-2026/ | Moore Ireland | 2025-10 | Medium |
| IE-14 | https://www.coindesk.com/business/2026/08/31/ireland-bars-crypto-from-new-tax-advantaged-investment-accounts | CoinDesk | 2026-08-31 | Medium |
| IE-15 | https://feedback.koinly.io/feature-requests/p/ireland-fifo-method-incorrectly-restricts-crypto-losses-revenue-confirmed-no-was | Koinly user forum | n.d. | Low |
| IE-16 | https://www.citizensinformation.ie/en/money-and-tax/budgets/budget-2027/ | Citizens Information | 2026-10 | Medium (403 on fetch) |
| IE-17 | https://www.learnsignal.com/blog/irish-tax-compliance-calendar-deadlines/ | Learnsignal | 2026 | Low |

---

## 4. United Kingdom (GB)

### 4.1 Identity

| Field | Value |
|---|---|
| ISO / currency / locale | GB / GBP / en-GB (cy-GB) |
| Date, number example | 16/10/2026; £1,234.56 |
| Timezone | Europe/London |
| Tax authority | HM Revenue & Customs, https://www.gov.uk/government/organisations/hm-revenue-customs |
| Tax year | 6 April to 5 April (2026/27 = 6 Apr 2026-5 Apr 2027) |
| Filing | Register for Self Assessment by 5 October after the tax year; paper return 31 October; online return 31 January; "real time" CGT service: report by 31 December after the tax year [UK-9][UK-10] |
| Payment | 31 January after the tax year (payments on account 31 January and 31 July where applicable) [UK-10] |

### 4.2 Classification

Cryptoassets are not money or currency; tokens are chargeable assets and individuals are normally within CGT on disposal, with income tax only for trading or for income-type receipts (staking, airdrops for services, employment) [UK-2][UK-4][UK-5][UK-7].

### 4.3 Taxable events

| Event | Taxable? | Note |
|---|---|---|
| Sale to fiat | Yes | [UK-2] |
| Crypto-to-crypto swap | Yes | "Swapping one token for a different token" is a disposal [UK-2]. |
| Spending crypto | Yes | [UK-2] |
| Transfers between own wallets | No | Beneficial ownership retained; a mixer that returns the same token type is also not a disposal [UK-2]. |
| Gifts / inheritance | Gift to anyone except spouse/civil partner/charity = disposal at sterling market value [UK-2][UK-7]; death: no CGT, estate within IHT, beneficiary acquires at probate value (general rule). |
| Staking / airdrops | Depends | Staking rewards not amounting to a trade: miscellaneous income on the sterling value at receipt, expenses deductible; CGT on later disposal [UK-4]. Airdrops received for nothing and outside a trade: no income tax, CGT later; airdrops for a service: miscellaneous or trading income [UK-5]. The £1,000 trading/miscellaneous income allowance can cover small amounts (general rule; not on the manual pages read). |

### 4.4 Rates

| Period | Basic-rate band | Above the band | AEA |
|---|---|---|---|
| 6 Apr-29 Oct 2024 | 10% | 20% | £3,000 |
| 30 Oct 2024-5 Apr 2025 | 18% | 24% | £3,000 |
| 2025/26 | 18% | 24% | £3,000 |
| 2026/27 | 18% within the £37,700 basic-rate band after income; 24% above; trustees/PRs 24%; BADR 18% | £3,000 [UK-1] |

Autumn Budget 2025 (26 Nov 2025) left CGT rates unchanged and kept the AEA at £3,000 for 2026/27; income tax thresholds are frozen to April 2031, which pushes more gains into the 24% band over time [UK-13][UK-14][UK-12]. Dividend (+2pp from Apr 2026) and savings/property (+2pp from Apr 2027) rate rises do not touch crypto CGT [UK-13].

### 4.5 Allowances

Annual exempt amount £3,000 per tax year, not carried forward; applied to the gains taxed at the highest rate first [UK-1]. Reporting is required when gains exceed the AEA or, for Self Assessment filers, when total proceeds exceed £50,000 (general rule; medium-high).

### 4.6 Holding-period rule

- None. The app must say every disposal is a taxable event.
- Identification (CRYPTO22200) [UK-3][UK-7]: (1) same-day rule (TCGA92 s. 105): acquisitions and disposals of the same token on the same day are matched; (2) 30-day rule (s. 106A): tokens acquired within 30 days after a disposal are matched to that disposal, earliest disposal first; (3) remaining tokens go to the section 104 pool with a pooled average allowable cost per token type. NFTs are not pooled. For a DCA plan this matters: any purchase within 30 days after a sale is matched to that sale instead of entering the pool.

### 4.7 Losses

Losses must be reported/claimed (within four years after the tax year, general rule); set against same-year gains before the AEA; unused losses carry forward indefinitely and are used after the AEA. Negligible value claims cover the whole pool for worthless tokens; a lost private key is not a disposal but can support a negligible value claim; the real-time service also accepts loss figures [UK-6][UK-8].

### 4.8 Reporting

- SA108 Capital gains summary: dedicated "Cryptoassets" section from tax year 2024/25, boxes 13.1 to 13.8 (13.1 number of disposals, 13.2 proceeds, 13.3 allowable costs, 13.4 gains before losses, 13.5 losses in the year, 13.7 gains/losses already reported through the real time service, 13.8 tax already paid); report in sterling and attach computations [UK-7][UK-8].
- Real time CGT service for gains in 2025/26 and 2026/27: report by 31 December after the tax year, pay by 31 January; UK residents only; Self Assessment filers must still include the gains on the return [UK-9].
- CARF: UK reporting cryptoasset service providers collect user and transaction data from 1 January 2026 and file the first reports between 1 January and 31 May 2027 for calendar 2026; penalties up to £300 per user for missing, late or inaccurate reports (The Reporting Cryptoasset Service Providers (Due Diligence and Reporting Requirements) Regulations 2025) [UK-11][UK-16].
- Penalties (one line): late return £100, then £10/day after 3 months (max £900), then 5% or £300 at 6 and 12 months; late payment 5% at 30 days, 6 and 12 months plus interest [UK-10].

### 4.9 Known or scheduled changes 2025-2027

| Date | Change | Status |
|---|---|---|
| 30 Oct 2024 | CGT 18%/24% (Autumn Budget 2024) | In force [UK-1] |
| 6 Apr 2025 | Cryptoassets section on SA108 for 2024/25 returns | In force [UK-7][UK-8] |
| 28 Nov 2025 | HMRC Cryptoassets Manual CGT and income pages updated | Published [UK-2]-[UK-6] |
| 26 Nov 2025 | Autumn Budget 2025: CGT unchanged; AEA £3,000 for 2026/27; EOT relief 100% to 50%; DeFi lending/staking no-gain/no-loss regime for individuals announced, draft legislation expected 2026, start date not set; thresholds frozen to 2030/31 | Announced / in Finance Bill 2025-26 [UK-12][UK-13][UK-14] |
| 1 Jan 2026 | CARF collection starts | In force [UK-11] |
| 6 Apr 2026 | BADR 18%; 2026/27 rates per GOV.UK | In force [UK-1] |
| 31 Dec 2026 | Real-time service deadline for 2025/26 gains | Scheduled [UK-9] |
| 31 May 2027 | First CARF reports to HMRC | Scheduled [UK-11] |
| Autumn 2026 | Next Budget (date not verified this session); CGT is a recurring speculation target | Watch |

### 4.10 App card (60 words) and caveats

Safe to state: "The UK taxes crypto gains at 18% or 24% depending on your income band, after a £3,000 yearly allowance. Selling, swapping, spending and gifting (except to a spouse) are disposals; moving between your own wallets is not. No holding-period exemption. Costs are pooled per token with same-day and 30-day matching. Report by 31 January (or 31 December via the real-time service)."

Needs the accountant caveat: which band your gains fall in; the 30-day rule around any sale; staking/airdrop income; DeFi lending/collateral treatment pending the no-gain/no-loss regime; negligible value claims.

### 4.11 Sources

| # | Source | Publisher | Date | Conf. |
|---|---|---|---|---|
| UK-1 | https://www.gov.uk/capital-gains-tax/rates | GOV.UK | 2026/27 figures | High |
| UK-2 | https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22100 | HMRC Cryptoassets Manual | updated 2025-11-28 | High |
| UK-3 | https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22200 | HMRC | updated 2025-11-28 | High |
| UK-4 | https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto21200 | HMRC | updated 2025-11-28 | High |
| UK-5 | https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto21250 | HMRC | updated 2025-11-28 | High |
| UK-6 | https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22400 and .../crypto22500 | HMRC | updated 2025-11-28 | High |
| UK-7 | https://www.gov.uk/guidance/check-if-you-need-to-pay-tax-when-you-sell-cryptoassets | GOV.UK | updated 2026-10-05 | High |
| UK-8 | https://assets.publishing.service.gov.uk/media/67e160d5d8e313b503358cc8/sa108-2025.pdf and https://assets.publishing.service.gov.uk/media/67e1612564220b68ed6a7009/SA108-Notes-2025.pdf | HMRC SA108 2025 form and notes | 2025 | High |
| UK-9 | https://www.gov.uk/report-and-pay-your-capital-gains-tax/if-you-have-other-capital-gains-to-report | GOV.UK | 2026 | High |
| UK-10 | https://www.gov.uk/self-assessment-tax-returns/deadlines and https://www.gov.uk/self-assessment-tax-returns/penalties | GOV.UK | 2026 | High |
| UK-11 | https://www.gov.uk/guidance/reporting-cryptoasset-user-and-transaction-data | GOV.UK (CARF) | updated 2026-06-03 | High |
| UK-12 | https://www.freshfields.com/en/our-thinking/blogs/risk-and-compliance/autumn-budget-2025-defining-the-uk-rules-for-cryptoasset-taxation-102ly6s | Freshfields | 2025-12-18 | Medium-high |
| UK-13 | https://shackletonadvisers.co.uk/budget-summary/ | Shackleton | 2025-11 | Medium |
| UK-14 | https://www.essexabel.co.uk/autumn-budget-2025-capital-taxes/ | Essex Abel | 2025-11 | Medium |
| UK-15 | https://www.icaew.com/insights/tax-news/2025/oct-2025/cgt-tips-for-202425-tax-returns | ICAEW | 2025-10 | Medium-high |
| UK-16 | https://kpmg.com/kpmg-us/content/dam/kpmg/taxnewsflash/pdf/2025/11/uk-carf1-nov25-2025.pdf | KPMG | 2025-11 | Medium |

---

## 5. United States (US), federal only

### 5.1 Identity

| Field | Value |
|---|---|
| ISO / currency / locale | US / USD / en-US (es-US) |
| Date, number example | 10/16/2026; $1,234.56 |
| Timezones | America/New_York, America/Chicago, America/Denver, America/Phoenix, America/Los_Angeles, America/Anchorage, Pacific/Honolulu (plus territories) |
| Tax authority | Internal Revenue Service, https://www.irs.gov (state revenue departments separately) |
| Tax year | Calendar year |
| Filing | Form 1040 due April 15 of the following year (15 Apr 2027 for 2026); automatic extension to October 15 (payment still due April 15); estimated payments 15 Apr, 15 Jun, 15 Sep, 15 Jan where needed |
| Information returns | Form 1099-DA to recipients by about February 17 (17 Feb 2026 for 2025 sales), to the IRS by March 31 electronically via IRIS [US-12] |

### 5.2 Classification

"Digital assets are considered property, not currency" (Notice 2014-21; IRS digital assets page reviewed 2 Sep 2026). Held for investment they are capital assets; gains are capital; receipts for services, mining, staking or hard-fork airdrops are ordinary income at fair market value when the taxpayer has dominion and control [US-1][US-7].

### 5.3 Taxable events

| Event | Taxable? | Note |
|---|---|---|
| Sale to fiat | Yes | [US-1] |
| Crypto-to-crypto swap | Yes | Exchange of property; no like-kind deferral since 2018 [US-1][US-7]. |
| Spending crypto | Yes | Gain = value received minus adjusted basis [US-7]; paying a transfer fee in crypto is also a disposal of the fee units [US-1]. |
| Transfers between own wallets | No | Not taxable even if a platform issues an information return [US-1][US-7]. |
| Gifts / inheritance | Giving is not a capital-gains event (gift tax rules; $19,000 annual exclusion in 2026, Form 709 above) [US-3]; recipient takes carryover basis (dual basis for losses) and tacks the donor's holding period [US-7]; inherited assets take a stepped-up basis and are automatically long-term; estate exclusion $15,000,000 in 2026 [US-3]. |
| Staking / mining / airdrops / lending interest | Yes (ordinary income) | Rev. Rul. 2019-24 (airdrops after a hard fork), Rev. Rul. 2023-14 (staking); later disposal is a capital gain with basis = income recognised [US-1][US-7]. |

### 5.4 Rates

Short-term (held one year or less): ordinary rates (OBBBA made the TCJA brackets permanent). 2026 thresholds of taxable income [US-2][US-3]:

| Rate | Single | Married filing jointly |
|---|---|---|
| 10% | up to $12,400 | up to $24,800 |
| 12% | to $50,400 | to $100,800 |
| 22% | to $105,700 | to $211,400 |
| 24% | to $201,775 | to $403,550 |
| 32% | to $256,225 | to $512,450 |
| 35% | to $640,600 | to $768,700 |
| 37% | above | above |

Long-term (held more than one year), 2026 vs 2025 (Rev. Proc. 2025-32 sec. 4.03; Rev. Proc. 2024-40 sec. 3.03) [US-2][US-4][US-5]:

| Filing status | 0% up to (2026) | 15% up to (2026) | 0% up to (2025) | 15% up to (2025) |
|---|---|---|---|---|
| Single | $49,450 | $545,500 | $48,350 | $533,400 |
| Married filing jointly | $98,900 | $613,700 | $96,700 | $600,050 |
| Head of household | $66,200 | $579,600 | $64,750 | $566,700 |
| Married filing separately | $49,450 | $306,850 | $48,350 | $300,000 |

20% above the 15% ceiling. Net Investment Income Tax 3.8% on the lesser of net investment income or MAGI above $200,000 (single/HoH), $250,000 (MFJ), $125,000 (MFS); thresholds not indexed [US-6]. Collectibles 28% (NFTs may be collectibles under the look-through analysis of Notice 2023-27). Standard deduction 2026: $16,100 single, $32,200 MFJ, $24,150 HoH [US-3].

### 5.5 Allowances

None specific to crypto: no de minimis exemption for personal transactions (bills pending, see 5.9). Net capital losses offset up to $3,000 ($1,500 MFS) of ordinary income per year [US-5].

### 5.6 Holding-period rule

- Yes: more than one year held = long-term rates. Count from the day after acquisition to the day of disposal [US-7]. Gifts tack the donor's period; inherited units are long-term.
- Lot identification [US-7][US-8][US-9][US-15]: specific identification if units are adequately identified by unique identifier or by records within a single account/wallet/address showing dates, times, basis and value; otherwise FIFO. Since 1 January 2025 identification is per wallet or account (Treas. Reg. 1.1012-1(j)); the "universal"/multi-wallet method ended. Rev. Proc. 2024-28 gave a one-time safe harbor to allocate unused basis to wallets as of 1 January 2025 (irrevocable; records of remaining units and original basis required). For broker-held units, Notice 2025-7 allowed taxpayers in 2025 to identify units by their own records or a standing instruction (FIFO, LIFO, HIFO) where the broker could not; Notice 2026-20 (18 Mar 2026) extends this relief through 31 December 2026.
- Wash-sale rule (IRC 1091) does not currently apply to digital assets (they are property, not securities); both pending bills would extend it (see 5.9).

### 5.7 Losses

Short- and long-term gains and losses are netted; net losses offset $3,000 of ordinary income per year and carry forward indefinitely [US-5]. Losses on personal-use property are not deductible; theft/scam losses are limited under the 2018-2025 TCJA rules unless the transaction was entered into for profit (medium).

### 5.8 Reporting

- Form 1040 digital assets question (2025 form): "At any time during 2025, did you: (a) receive (as a reward, award, or payment for property or services); or (b) sell, exchange, or otherwise dispose of a digital asset (or a financial interest in a digital asset)?" Answer No if you only held, bought with cash, or moved assets between your own wallets [US-1][US-13].
- Form 8949 and Schedule D for gains and losses; Schedule 1 for staking/airdrop/other income; Schedule C for business income; Form 709 for gifts [US-1][US-5].
- Form 1099-DA: custodial brokers (trading platforms, hosted wallet providers, kiosks, some payment processors) report gross proceeds for sales from 1 January 2025 (first forms issued February 2026) and adjusted basis plus gain character for "covered" digital assets acquired on or after 1 January 2026 and held in a custodial account (first basis reporting in early 2027). Non-custodial/DeFi brokers are excluded (the DeFi broker rule was repealed in 2025). Optional non-reporting for designated stablecoin sales up to $10,000 a year and specified NFTs up to $600; good-faith penalty relief for 2025 (Notices 2024-56, 2024-57, 2025-33). Form 1099-DA must be e-filed through IRIS [US-1][US-10][US-11][US-12].
- Penalties (one line): failure to file 5% of unpaid tax per month up to 25% (minimum $525 if more than 60 days late for 2026 returns); failure to pay 0.5% per month; accuracy-related 20% [US-14].

### 5.9 Known or scheduled changes 2025-2027

| Date | Change | Status |
|---|---|---|
| 1 Jan 2025 | Wallet-by-wallet basis (Rev. Proc. 2024-28 safe harbor); 1099-DA gross-proceeds reporting begins | In force [US-8][US-1] |
| 4 Jul 2025 | OBBBA: TCJA brackets permanent; estate exclusion $15m from 2026 | Enacted [US-3] |
| Jul 2025 | S.2207 (Sen. Lummis): $300 per-transaction de minimis with $5,000 annual cap, wash-sale rules extended to digital assets, deferral of staking/mining income to sale; JCT net revenue about $600m over 2025-34 | Referred to Senate Finance; no further verified action [US-17][US-18] |
| 9 Oct 2025 | Rev. Proc. 2025-32: 2026 brackets and capital-gains thresholds | Published [US-2][US-3] |
| 1 Jan 2026 | 1099-DA basis reporting for covered assets acquired from this date | In force [US-1][US-10] |
| 18 Mar 2026 | Notice 2026-20 extends specific-identification relief for broker-held units to 31 Dec 2026 | In force [US-9] |
| 16 Sep 2026 | House Ways and Means markup of H.R. 10357 "Digital Asset Tax Certainty Act" (Chairman Jason Smith): $10 de minimis for network/transaction fees only, wash-sale rules for digital assets, staking/mining as ordinary income, stablecoin basis at redemption value, crypto loans not sales, amnesty programme | Markup scheduled; outcome and floor action not verified this session [US-16] |
| Oct-Nov 2026 | Rev. Proc. for 2027 inflation adjustments | Expected |
| 2027 filing season | First 1099-DA forms with basis; Notice 2026-20 relief ends 31 Dec 2026 unless extended | Scheduled |

### 5.10 App card (60 words) and caveats

Safe to state: "The US taxes crypto as property. Selling, swapping or spending is a taxable event; moving between your own wallets is not. Held more than one year, gains use the long-term rates (0%, 15% or 20%, plus 3.8% for high incomes); one year or less, ordinary rates up to 37%. Lots are tracked per wallet. Losses offset gains, then $3,000 of income a year."

Needs the accountant caveat: state and local tax; which identification method and standing orders apply with each broker; staking/airdrop income; NIIT; 1099-DA reconciliation; any de minimis or wash-sale legislation; NFT collectibles rate.

### 5.11 Sources

| # | Source | Publisher | Date | Conf. |
|---|---|---|---|---|
| US-1 | https://www.irs.gov/filing/digital-assets | IRS | reviewed 2026-09-02 | High |
| US-2 | https://www.irs.gov/pub/irs-drop/rp-25-32.pdf | IRS, Rev. Proc. 2025-32 | 2025-10-09 | High |
| US-3 | https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill | IRS, IR-2025-103 | 2025-10-09 | High |
| US-4 | https://www.irs.gov/pub/irs-drop/rp-24-40.pdf | IRS, Rev. Proc. 2024-40 | 2024-10-22 | High |
| US-5 | https://www.irs.gov/taxtopics/tc409 | IRS Topic 409 | reviewed 2026-09-24 | High |
| US-6 | https://www.irs.gov/taxtopics/tc559 | IRS Topic 559 | reviewed 2026-09-24 | High |
| US-7 | https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions | IRS FAQ (transactions before 1 Jan 2025 for identification rules) | reviewed 2026-06-30 | High |
| US-8 | https://www.irs.gov/pub/irs-drop/rp-24-28.pdf | IRS, Rev. Proc. 2024-28 | 2024-07 | High |
| US-9 | https://www.irs.gov/pub/irs-drop/n-26-20.pdf | IRS, Notice 2026-20 | 2026-03-18 | High |
| US-10 | https://www.irs.gov/instructions/i1099da | IRS, Instructions for Form 1099-DA (2026) | reviewed 2026-04-30 | High |
| US-11 | https://www.irs.gov/forms-pubs/about-form-1099-da | IRS | reviewed 2026-06-27 | High |
| US-12 | https://www.irs.gov/instructions/i1099gi | IRS, General Instructions for Certain Information Returns (2025) | 2025 | High |
| US-13 | https://www.irs.gov/pub/irs-pdf/f1040.pdf | IRS, Form 1040 (2025) | 2025 | High |
| US-14 | https://www.irs.gov/payments/failure-to-file-penalty | IRS | reviewed 2026-10-05 | High |
| US-15 | https://kpmg.com/us/en/taxnewsflash/news/2024/12/tnf-notice-2025-7-temporary-relief-for-making-adequate-identification-of-units-of-digital-assets-held-in-brokers-custody.html | KPMG (Notice 2025-7) | 2024-12 | Medium-high |
| US-16 | https://finance.yahoo.com/markets/crypto/articles/cryptos-long-sought-minimis-tax-163435232.html | Decrypt via Yahoo Finance | 2026-09-15 | Medium |
| US-17 | https://cointracking.info/blog/crypto-de-minimis-tax-exemption | CoinTracking | 2026 | Low-medium |
| US-18 | https://www.ntu.org/foundation/detail/crypto-tax-bill-provides-certainty-for-taxpayers | NTU Foundation | 2025 | Medium |
| US-19 | https://taxfoundation.org/data/all/state/state-income-tax-rates/ | Tax Foundation | updated 2026-04-02 | Medium-high |
| US-20 | https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax | Washington Department of Revenue | 2025/26 | High |
| US-21 | https://www.kiplinger.com/taxes/state-capital-gains-tax-rates | Kiplinger | 2026 | Low (page not readable in session) |

---

## A. Locale and timezone to country suggestion

The app always confirms with one tap; these are only the default suggestion and its confidence.

| Signal | Suggest | Confidence | Note |
|---|---|---|---|
| it-IT (any timezone) | IT | High | it-CH exists but is a different country; it-CH -> no suggestion. |
| nl-BE / fr-BE / de-BE | BE | High | Region subtag is decisive. |
| nl-NL + Europe/Brussels, fr-FR + Europe/Brussels | BE | Medium | Language of a neighbour with a Belgian clock; ask. |
| en-IE | IE | High | |
| en-GB + Europe/Dublin | IE | Medium-high | Common on Irish devices. |
| en-GB + Europe/London | GB | High | |
| en-GB + other European timezone | Ask (GB default) | Low | Expats and travellers. |
| en-US + America/* or Pacific/Honolulu | US | High | America/Toronto, America/Vancouver, America/Mexico_City are not US: exclude Canadian and Mexican zones from the rule. |
| es-US | US | Medium-high | Spanish UI, US formats. |
| fr-CA, en-CA, America/Toronto | None of the five | High (negative) | Canada is out of scope; offer "other country" path. |
| en-US + European timezone | Ask | Low | Many Europeans keep en-US as device language; prefer the timezone (Europe/Rome -> IT, Europe/Brussels -> BE, Europe/Dublin -> IE, Europe/London -> GB) with medium confidence. |
| en-* + Europe/Rome or Europe/Brussels | IT or BE | Medium | Timezone wins over language for EU countries in scope. |
| Any locale + Asia/* or Australia/* | None | High (negative) | Out of scope; show "other country". |

Locale formatting defaults: it-IT 1.234,56 € and 16/10/2026; nl-BE 1.234,56 € and 16/10/2026; fr-BE 1 234,56 € and 16/10/2026; de-BE 1.234,56 € and 16.10.2026; en-IE €1,234.56 and 16/10/2026; en-GB £1,234.56 and 16/10/2026; en-US $1,234.56 and 10/16/2026 (Intl.NumberFormat/DateTimeFormat give these; de-BE date output varies by engine).

## B. Summary table

| Jurisdiction | Holding rule | Headline rate 2026 | Allowance | Tax year | Conf. |
|---|---|---|---|---|---|
| Italy | None; every taxable disposal taxed; like-for-like swaps untaxed; LIFO | 33% flat (26% in 2025; 26% for euro EMT) | None since 2025 | Calendar; file by 31 Oct next year | High |
| Belgium | None in law; facts-and-circumstances test decides 10% vs 33% | 10% on growth since 31 Dec 2025 (normal management); 33% + communal if speculative | EUR 10,000/yr, roll-forward to EUR 15,000 | Calendar (AY = next year); return mid-2027 | Medium-high (law new, circular July 2026) |
| Ireland | None; FIFO (+ possible 4-week rules) | 33% to 6 Oct 2026; 31% from 7 Oct 2026 | EUR 1,270/yr | Calendar; pay 15 Dec / 31 Jan; file 31 Oct | High (31% pending Finance Act) |
| United Kingdom | None; same-day, 30-day, then s.104 pool | 18% / 24% | £3,000/yr | 6 Apr-5 Apr; file/pay 31 Jan | High |
| United States (federal) | Yes: more than 1 year = long-term 0/15/20% (+3.8% NIIT); else ordinary 10-37%; per-wallet specific ID or FIFO | 0/15/20% long-term; up to 37% short-term | None (loss offset $3,000/yr) | Calendar; file 15 Apr | High (federal); state tax extra |

## C. Five facts most likely to change within 12 months

1. Italy's 33% rate and crypto-only loss ring-fence: the Intergruppo draft (24 Sep 2026) would return to 26% from 2027 and allow cross-asset loss offset; the DDL Bilancio 2027 lands in late October and is approved by 31 December 2026.
2. Ireland's rate: 31% needs the Finance Act 2026 (December 2026); the tax year 2026 split at 7 October must be modelled; Budget 2028 (October 2027) could move it again.
3. Belgium's 10% regime details: the indexed exemption for income year 2027, the AY 2027 return codes (spring 2027), any further circulars on crypto valuation and loss categories, and possible Constitutional Court challenges to the law of 3 April 2026.
4. US identification and reporting: Notice 2026-20 relief ends 31 December 2026; first basis-bearing 1099-DA forms arrive early 2027; H.R. 10357 and S.2207 (de minimis, wash-sale extension, staking as ordinary income) could pass in a year-end package; 2027 thresholds arrive in the autumn revenue procedure.
5. UK: Autumn 2026 Budget (CGT rates and the £3,000 AEA are perennial candidates), the DeFi no-gain/no-loss legislation, the SA108 2026/27 boxes, and the first CARF data reaching HMRC by 31 May 2027 (expect nudge letters).

## D. US: is "federal, general only" honest enough?

Mostly, with one mandatory sentence. Eight states have no individual income tax (Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Wyoming), so federal-only is complete there; Washington taxes only long-term capital gains, at 7% above an indexed deduction ($278,000 for 2025) with a further tier for very large gains, and the DOR page does not say whether crypto is in scope (it is a long-term capital asset, so presumably yes) [US-19][US-20]. Every other state taxes gains as ordinary income at its own rates, from low single digits to 13.3% in California (14.4% all-in), 11% in Hawaii, 10.9% in New York, 10.75% in New Jersey, and 9.9% in Oregon, usually without a long-term preference, so a Californian's true marginal rate on a long-term gain can be 20% + 3.8% + 13.3% while the card shows 20% [US-19]. The holding-period flag, the taxable-event list, the per-wallet lot rules and the 1099-DA facts are federal and apply everywhere, which is what the planner needs. The card must say: "Federal rules only. Most states also tax crypto gains as ordinary income at state rates (0% to 13.3%); some cities too. Confirm your state." Do not attempt a state profile until a state field exists in the data schema.

## Open items (not verified in this session because the search budget ran out)

- Ireland: publication of Finance Bill 2026 (expected 15 Oct 2026) and its CGT section; RCASP registration deadline.
- Belgium: the exact Staatsblad reference of the law of 3 April 2026; the SPF Finances FAQ and the text of circular 2026/C/74 on crypto valuation and loss categories; 2027 filing dates; declaration codes for AY 2027.
- Italy: the Gazzetta Ufficiale article text of L. 207/2024 commi 24-29 and L. 199/2025 comma 28 (both confirmed via the AdE instructions and the AdE magazine); confirmation that Redditi PF filing stays at 31 October.
- UK: the official Autumn Budget 2025 OOTLAR document (the 404'd GOV.UK URLs need the right slug); the date of the autumn 2026 Budget.
- US: outcome of the 16 Sep 2026 Ways and Means markup of H.R. 10357 and the Senate status of S.2207 (congress.gov, GovTrack and LegiScan blocked automated access).
- 5 Nov 2026: H.R. 10357 and S.2207 stay named here only beside the sources that reported them (Decrypt via Yahoo Finance, 15 Sep 2026 [US-16]; NTU Foundation, 2025 [US-18]; texts not fetched, congress.gov refused the fetch with HTTP 403 on 5 Nov 2026); the rule is `docs/CONTENT-OPS.md` §5, and no CI job fetches congress.gov.
