# CSV import: which exchanges first

Research date: **2026-11-13**. Scope: the first two exchanges or brokers of M2's free CSV import
(`docs/ROADMAP.md`), tested against the roadmap's default of Kraken and Coinbase. Marks: **D**
documented by the vendor, **R** reported by a third party (parser code, tax tool, forum, press),
**U** unknown or not confirmed by a public source. Keys point to section 7.

## 1. Recommendation

- **First: Kraken.** The only candidate whose columns the vendor documents in readable pages (help
  updated 2026-10-06, API export docs). MiCA-authorised in Ireland on 2025-06-25, passported to
  Portugal and Germany. The top crypto-native app in both countries' free Finance charts on
  2026-11-13 (39th in Portugal, 65th in Germany); 6 % of German first mentions. Ledger rows carry a
  unique id, UTC time, point decimals and no personal data. The first build also makes the preview,
  the de-duplication and the replacement of one-tap estimates, which should rest on the
  best-specified file.
- **Second: Trade Republic.** The only venue near the top in both countries: first in Germany
  (17 %), third in both Finance charts, 200,000 Portuguese customers (July 2026), crypto savings
  plans from €1. Its CSV exists since April 2026 with an id per row, but the vendor documents
  nothing, the file mixes bank and card rows with names and IBANs, and savings-plan buys show only in
  a description (R). Second, so that a real export with crypto savings-plan rows is in hand and a
  seven-month-old format can show its changes first.
- **Next: Bitpanda.** Third in Germany (11 %), over 1 million German customers (self-reported,
  2024-06-04), a header with ids and one known change since 2022 (R); weak in Portugal.
- **The default.** Kraken holds; Coinbase does not: fourth in Germany (10 %) but 84th in Portugal's
  chart, help pages closed to automated reading (HTTP 403), and five changes to its file from 2024-05
  to 2026-02 (R). It stays an M4 candidate.
- **Not now.** Binance: no MiCA authorisation; since 2026-07-01 affected EU users may only reduce
  positions and withdraw; a history-only importer later. Revolut: first among Portugal's Finance
  apps (2.3 million Portuguese customers) but 2 % in Germany; its crypto statement has no row id and
  comes as Excel (R). Bitvavo: 3 % in Germany, outside both top-100 charts, and its help pages closed to
  automated reading. BISON: no Portuguese presence found.
- **Fixtures.** ADR-0007's Consequences ask for fixtures from real anonymised exports. None is in
  the repository for any candidate, so a build rests on the vendor's documented columns (Kraken's are
  D) and synthetic files until a real export can be anonymised.

## 2. Who buys where (question 1)

| Venue | MiCA entity, authority, date [E1] | Germany, first mentions [B1, B2] | Apple free Finance rank PT / DE, 2026-11-13 [A1, A2] | Other dated evidence |
|---|---|---|---|---|
| Trade Republic | Trade Republic Bank GmbH, BaFin, notice 2025-04-28 | 17 % (1st) | 3 / 3 | 200,000 PT customers, 2026-07-16 [C2]; 5 million in DE, 2026-10-08 (`docs/research/market-data-competitors.md` §6.3); about 50 coins, €1 per order, wallet transfers since late 2025 [T1] |
| Binance | not in the register | 16 % (2nd) | 47 / 90 | Greek application withdrawn 2026-06-24 [D1]; from 2026-07-01 only reducing positions and withdrawals [D2]; accounts close 2026-12-31 in FR, ES, IT, PL, Portugal not contacted [D3] |
| Bitpanda | Bitpanda GmbH, FMA, 2025-04-09 | 11 % (3rd) | >100 / 98 | over 1 million DE customers, 2024-06-04 [C3] |
| Coinbase | Coinbase Luxembourg S.A., CSSF, 2025-06-20 | 10 % (4th); custody 14 % (2nd) | 84 / 75 | none per country |
| BISON | EUWAX AG, BaFin, notice 2025-04-01; Boerse Stuttgart Digital Custody GmbH, BaFin, 2025-01-17 | 7 % (5th) | >100 / >100 | CSV by Account → Reports, bonuses shown as deposits [BI1]; none for PT |
| Kraken | Payward Europe Solutions Limited, CBI, 2025-06-25 | 6 % (6th) | 39 / 65 | none per country |
| Bitvavo | Bitvavo B.V., AFM, 2025-06-26 | 3 % (9th) | >100 / >100 | none per country |
| Revolut | Revolut Digital Assets (Europe) Ltd, CySEC, 2025-10-20 | 2 % (10th) | 1 / 7 (bank app); Revolut X 86 / >100 | 2.3 million PT customers, 2026-04-22 [C1] |
| N26, crypto by Bitpanda | N26 Bank SE, BaFin, notice 2025-05-14, order transmission | outside the top 10 | 59 / 22 (bank app) | none |
| Others | Bybit EU (FMA, 2025-05-28), Robinhood Europe (Bank of Lithuania, 2025-05-29), OKX Europe (MFSA, 2025-01-27) | eToro 5 % (7th), Crypto.com 4 % (8th) | PT: Bybit 52, Robinhood Crypto 57, OKX 62; with Kraken and Binance, Portugal's top five crypto-native apps | none |

Every entity listed is passported to Portugal and Germany (N26 to 7 states, both included). The
German shares are first mentions of the preferred platform in BearingPoint's YouGov survey: 166
answers from 2,031 respondents, 18 to 22 June 2026 [B2]; the press release says 4,149 respondents,
18 June to 30 July [B1]. No Portuguese survey names platforms (CMVM, Banco de Portugal, DECO
searched); a Católica barometer of 700 adults (13 to 23 July 2026) found that 6 % had used a crypto
exchange in the previous three months [P1]. The Apple chart ranks recent downloads, not holders.

## 3. The six formats compared (question 2)

Binance (no new buys) and BISON (no Portuguese presence) are left out.

| | Kraken ledger [K1–K9] | Trade Republic [TR1–TR6, T1] | Coinbase [CB1–CB6] | Bitpanda [BP1–BP4] | Bitvavo [BV2–BV4] | Revolut [RV1–RV4] |
|---|---|---|---|---|---|---|
| Full history | web: Documents → Create export → Ledgers, CSV; minutes to a week (D); a ZIP (R) | app: Statements → Transaction export (R) | web: Statements → Generate custom statement (R) | web: History → Export → Generate CSV, e-mailed (R) | Transaction history → Export → Full history; at most 30,000 lines (R) | app: Crypto → Documents → Account statement, Excel (R) |
| Buy, sell | two "trade" rows per refid; app: spend and receive (D) | TRADING, BUY or SELL, class CRYPTO; savings-plan, Saveback and round-up buys alike (R [TR-E7, TR-E8b]) | Buy, Sell, Advanced Trade Buy and Sell (R) | buy outgoing, sell incoming (R) | buy (U), sell (D) | Buy, Sell (R) |
| Fee; in the paid amount? | own column, in the row's asset; no (D) | own column, negative; no: amount is shares × price; −1.00 on a one-off crypto trade, empty on a plan's (R [TR-E5]) | Fees and/or Spread; in Total, not in Subtotal (R) | none shown for crypto; premium in the price (R) | Fee amount; U | Fees; U |
| Cash in, out | deposit, withdrawal (D) | CASH rows, card payments too; Saveback credits as BENEFITS_SAVEBACK (R [TR-E8c]) | Deposit, Withdrawal (R) | deposit, withdrawal, class Fiat (R) | U | absent (R) |
| Coins out, in | withdrawal, deposit; fee in the coin (D) | DELIVERY: FREE_DELIVERY out, FREE_RECEIPT in (R [TR-E8f]) | Send, Receive (R) | withdrawal, fee in the coin (R); in U | withdrawal, deposit (D) | Send, Receive (R) |
| Staking, earn | earn with subtypes, staking (D) | DELIVERY, FREE_RECEIPT, not told apart from coins sent in (R [TR-E8f]) | Staking Income, Rewards Income (R) | U | staking, fixed_staking (D) | Stake, Unstake, Staking reward (R) |
| Bonus | invite bonus; KFEE credits as deposit (D) | U | Learning Reward, Coinbase Earn (R) | transfer incoming at 0.00 (R) | affiliate, rebate (D); others U | Learn reward (R) |
| One row per | fill; the order id only in the trades file (D) | U | transaction (R); Advanced Trade U | order (R) | U | transaction (R) |
| Unique id | txid (D) | transaction_id, a UUID, unique per file and stable across exports (R [TR-E11]) | ID, since 2024-05 (R) | Transaction ID (R) | U | none (R) |
| Time | UTC; text form U (D) | ISO 8601 UTC with Z, 3 or 6 fraction digits; date the Berlin day (R [TR-E3]) | "UTC" suffix in 2021 (R); now U | ISO 8601 with offset (R) | U | local, no offset (R) |
| Numbers | point; no decimal comma (D) | point, no thousands separator; signs by side (R [TR-E4]) | currency symbol, thousands commas, brackets (R) | point; "-" for none (R) | U | "€1,000.00" (R) |
| Currency | asset code per row, legacy (ZGBP) or plain (D, R) | currency, original_currency (R) | Price Currency (R) | Fiat, Fee asset (R) | U | symbol in the value (R) |
| Personal data | none (D) | counterparty name and IBAN (R) | name and user id; destinations in Notes (R) | name, birth date, e-mail (R) | U | name, address (R) |
| Changed | formats of 2024-04, 2024-07, 2025-12 (R) | new 2026-04; unchanged to 2026-09 (R [TR-E1]) | 2024-05, 2024-07, 2025-10, 2025-11, 2026-02 (R) | Tax Fiat 2024-03 (R) | U | U |

## 4. Kraken's two files (question 3)

| File | A buy of BTC for EUR | Ids | Scope |
|---|---|---|---|
| Ledger | two "trade" rows with one refid: the EUR row negative, usually with the fee; the BTC row positive (D [K1, K6]; pairing R [K8]). App: spend and receive. Card: deposit of the charge, spend after the fee, receive (D [K1]) | txid is the row; refid the trade, deposit or withdrawal behind it (D [K6]) | every balance change: import this file |
| Trades | one row per fill: price, vol, cost = price × vol without the fee, fee, ledgers = its two ledger ids (D [K2]) | txid the fill, ordertxid the order (D) | trades only; app buys not documented (U) |

Coinbase's preamble and Advanced Trade rows, and Bitpanda's and Bitvavo's files, are in section 5.

## 5. Columns and traps per candidate

Row types are in section 3; headers below are copied as their sources print them.

**Kraken.** Ledger header of December 2025 (R [K7]):

"txid","refid","time","type","subtype","aclass","subclass","asset","wallet","amount","fee","balance"

Older files lack subclass, wallet or both (R [K8]); the help page lists only txid, time, type,
subtype, aclass, asset, amount, fee and balance (D [K1]). Trades header (D [K2]): txid, ordertxid,
pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers. Traps: balance = old
balance ± amount − fee (D); since a 2024-04 format, fees may be negative (R), so take the absolute
value; asset codes are legacy (XXBT, ZEUR) or plain, with suffixes such as .S, .M or .P for staked
balances (R); which row of an app buy carries the fee is not documented (U); earn allocations move
coins inside Kraken; fields can be left out at export (D [K4]), so refuse a file without txid,
refid, time, type, asset, amount and fee.

**Trade Republic.** Header from a third-party schema of 2026-06-08 (R [TR2]), and in every export #16 read
(R [TR-E1], 9 sources: unchanged April to September 2026, English whatever the app's language; comma-separated,
every field quoted, UTF-8 without BOM [TR-E2]):

datetime, date, account_type, category, type, asset_class, name, symbol, shares, price, amount, fee, tax, currency, original_amount, original_currency, fx_rate, description, transaction_id, counterparty_name, counterparty_iban, payment_reference, mcc_code

Traps, as #16's evidence (read 2026-11-13) confirms or corrects them: keep only asset_class CRYPTO and never
read the personal columns (confirmed: name, description and the counterparty columns hold names and IBANs);
savings-plan buys show only in the description (R [TR6], [TR-E8b]), and Saveback executions follow a CASH
BENEFITS_SAVEBACK credit as a plain plan buy (ETFs in 3 sources, crypto in none; TR-D1 says crypto Saveback is
reinvested into a running plan [TR-E8c]); the amount excludes the fee, −1.00 on a one-off crypto trade and
empty on a plan's (R [TR-E5]); BUY_CANCELLED cancels a buy, but no crypto cancellation row was seen, and other
cancellations reverse the signs under a new id with no link (R [TR-E8e]); FREE_RECEIPT holds staking and coins
sent in alike, FREE_DELIVERY coins sent out (R [TR-E8f]); MIGRATION rows come in pairs at one instant that cancel
out (R [TR-E9]); Render showed as XF0RENDER015 in one source (R [TR-E7]); `date` is the Berlin day on trades and a
booking date on cash rows, so only datetime is read (R); FX columns are empty on TRADING rows (R); accounts older
than April 2026 should check that their earliest rows are present (R [TR4]). Not confirmed: a crypto Saveback or
round-up row, a crypto cancellation's shape, CORRECTION, a crypto bonus, paying with crypto, non-EUR crypto rows,
and the zone of `date` outside Germany.

**Coinbase.** A "Transactions" line and a "User" line with the name and user id precede the header
(R [CB2]). Header since 2024-05 (R [CB1, CB3]); before, no ID and "Spot Price" in two names (R):

ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes

Traps: strip currency symbols, thousands commas and brackets (R); Advanced Trade and Convert figures
come from Notes, as in "Bought 10 LTC for 500 GBP on LTC-GBP at 50 GBP/LTC", worded differently
since 2025 (R [CB3]); never store the destinations that Send rows name in Notes; fiat may be
converted to the local currency before a trade (R [CB4]).

**Bitpanda.** In a published sample, six lines precede the header: a disclaimer, the holder's name
and birth date, the e-mail address, "Account opened at", "Venue: Bitpanda" and "Reported by Bitpanda
GmbH" (R [BP1]). Header (R [BP1]), with "Tax Fiat" appended since 2024-03 (R [BP2]):

"Transaction ID",Timestamp,"Transaction Type",In/Out,"Amount Fiat",Fiat,"Amount Asset",Asset,"Asset market price","Asset market price currency","Asset class","Product ID",Fee,"Fee asset",Spread,"Spread Currency"

Traps: keep Asset class Cryptocurrency (stocks, ETFs and metals share the file); "-" marks an empty
value; in the 2022 sample Amount Asset × Asset market price = Amount Fiat, so the fee sits in the
price; staking rows unseen (U).

**Bitvavo.** The export's header is not confirmed by a public source (U). The API's transaction
history documents its types (D [BV2]); the export may name others, so it would need its own list.

**Revolut.** Header (R [RV1], a parser since 2025-02): Symbol, Type, Quantity, Price, Value, Fees,
Date. Traps: no id, so de-duplication needs date, symbol, type and quantity together, outside
ADR-0007's id rule; whether Quantity is before or after fees is disputed (R [RV2]); Excel needs a
reader the app lacks, and only one tool reports a CSV (R [RV3]); the statement carries the holder's
name and address (R [RV4]).

## 6. Open risks

- **Thin Portuguese evidence.** One day's download chart and customer counts that are not crypto
  counts; Trade Republic's rank may come from its paid interest.
- **A small German sample.** With 166 answers, 6 % carries about ±3.6 points at 95 % confidence and
  17 % about ±5.7: places three to ten overlap.
- **Who the users are.** Many Trade Republic savers buy automatically and never withdraw, the person
  `docs/GROWTH.md` §2.4 says the app is not for; the import serves those with a wallet or a second
  venue.
- **Undocumented, changing formats.** The help pages of Coinbase, Bitpanda, Bitvavo, Revolut and BISON
  returned HTTP 403 to automated reading. Match columns by name, refuse an unknown header with its
  first line in the message, and keep one fixture per known variant.
- **Personal data.** Drop preambles and the name, birth date, e-mail, IBAN, counterparty and
  wallet-address columns before anything is stored (ADR-0039).
- **Decisions the formats force.** Staking and earn rewards; bonuses as coins held at 0
  (`docs/ROADMAP.md`); coins sent out as moves (ADR-0054), whose destination no export names; coins
  received, which are not purchases; converts, a sale and a buy; Kraken's ZIP.
- **Naming.** List the supported exchanges alphabetically, without links or comparisons
  (`docs/GROWTH.md` §2.8); a plain reference to a provider is not a recommendation
  (`docs/research/legal-regime.md` §2.1). A "Missing your exchange?" e-mail line, like ADR-0052's
  for coins, counts requests without tracking (ADR-0028).
- **Binance histories.** Accounts in four EU countries close on 2026-12-31; a file exported before
  then may be the only copy.

## 7. Sources

Kraken's help pages were served in pt-PT.

Question 1:

| Key | Source | URL | Read |
|---|---|---|---|
| E1 | ESMA interim MiCA register, CASPs (page updated 2026-11-11) | https://www.esma.europa.eu/sites/default/files/2024-12/CASPS.csv | 2026-11-13 |
| A1 | Apple top free Finance, Portugal (feed of 2026-11-12, 20:13 −07:00) | https://itunes.apple.com/pt/rss/topfreeapplications/limit=200/genre=6015/json | 2026-11-13 |
| A2 | The same, Germany | https://itunes.apple.com/de/rss/topfreeapplications/limit=200/genre=6015/json | 2026-11-13 |
| B1 | BearingPoint press release, 2026-08-10 | https://live.deutsche-boerse.com/nachrichten/OTS-BearingPoint-GmbH---Krypto-Boom-ohne-Banken-Neue-Anbieter-erobern-den--e5ad1a0b-5fe3-42cb-b05d-2c8c1f3f8283 | 2026-11-13 |
| B2 | BTC-Echo, top 10 platforms, 2026-08-23 | https://www.btc-echo.de/news/top-10-krypto-handelsplattformen-in-deutschland-banken-nicht-vertreten-236253/ | 2026-11-13 |
| C1 | Dinheiro Vivo, Revolut, 2026-04-22 | https://dinheirovivo.dn.pt/empresas/revolut-quer-alcanar-25-milhes-de-portugueses-em-2026-e-superar-a-cgd-nos-prximos-anos | 2026-11-13 |
| C2 | Dinheiro Vivo, Trade Republic, 2026-07-16 | https://dinheirovivo.dn.pt/economia/trade-republic-abre-sucursal-em-portugal-e-paga-juros-a-3-para-rivalizar-com-a-revolut | 2026-11-13 |
| C3 | BTC-Echo, Bitpanda, 2024-06-04 | https://www.btc-echo.de/schlagzeilen/bitpanda-verstaerkt-kooperation-mit-der-deutschen-bank-185826/ | 2026-11-13 |
| T1 | Rankia, Trade Republic crypto, 2025-12-04 | https://www.rankia.pt/corretoras/trade-republic-criptomoedas/ | 2026-11-13 |
| D1 | The Block, Binance, 2026-06-24 | https://www.theblock.co/post/406009/binance-ceo-remains-committed-securing-eu-license-exchange-withdraws-greece-bid | 2026-11-13 |
| D2 | ECO (Lusa), Binance, 2026-06-25 | https://eco.sapo.pt/2026/06/25/binance-vai-suspender-servicos-em-varios-paises-da-ue/ | 2026-11-13 |
| D3 | The Paypers, Binance, 2026-11-09 | https://thepaypers.com/crypto-web3-and-cbdc/news/binance-to-close-accounts-in-some-eu-countries-amid-mica-licence-gap | 2026-11-13 |
| P1 | Doutor Finanças and Católica, 2026-09-08 | https://www.doutorfinancas.pt/estudos-doutor-financas/um-terco-dos-portugueses-nao-se-sente-confiante-para-usar-servicos-financeiros-digitais/ | 2026-11-13 |
| BI1 | BISON help (HTTP 403; text from a search result) | https://support.bisonapp.com/hc/en-gb/articles/35998662174237-Your-Transaction-History-CSV-How-to-Use-It-Correctly | 2026-11-13 |

Questions 2 and 3:

| Key | Source | URL | Read |
|---|---|---|---|
| K1 | Kraken, ledger fields, updated 2026-10-06 | https://support.kraken.com/articles/360001169383-how-to-interpret-ledger-history-fields | 2026-11-13 |
| K2 | Kraken, trades history, updated 2026-10-06 | https://support.kraken.com/gb/articles/360001184886 | 2026-11-13 |
| K3 | Kraken, CSV files, point decimals, updated 2025-03-31 | https://support.kraken.com/articles/360001169543 | 2026-11-13 |
| K4 | Kraken, exporting history, updated 2026-05-29 | https://support.kraken.com/hc/en-us/articles/208267878-How-to-export-your-account-history | 2026-11-13 |
| K5 | Kraken API, export report fields | https://docs.kraken.com/api-reference/account-data/request-export-report.md | 2026-11-13 |
| K6 | Kraken API, ledger entries | https://docs.kraken.com/api-reference/account-data/get-ledgers-info.md | 2026-11-13 |
| K7 | BittyTax issue 469, 2025-12-22 | https://github.com/BittyTax/BittyTax/issues/469 | 2026-11-13 |
| K8 | BittyTax Kraken parser and history | https://github.com/BittyTax/BittyTax/blob/master/src/bittytax/conv/parsers/kraken.py | 2026-11-13 |
| K9 | CoinLedger, Kraken ledgers (ZIP), 2025-04-07 | https://help.coinledger.io/en/articles/5338231-kraken-ledgers-file-import-guide | 2026-11-13 |
| CB1 | BittyTax Coinbase parser and history | https://github.com/BittyTax/BittyTax/blob/master/src/bittytax/conv/parsers/coinbase.py | 2026-11-13 |
| CB2 | CryptoFiscaFacile issue 595, the preamble | https://gitlab.com/c1560/cryptofiscafacile/-/issues/595 | 2026-11-13 |
| CB3 | BittyTax issue 390, 2024-09-28 | https://github.com/BittyTax/BittyTax/issues/390 | 2026-11-13 |
| CB4 | BittyTax pull request 332, 2023-12-24 | https://github.com/BittyTax/BittyTax/pull/332 | 2026-11-13 |
| CB5 | CoinLedger, Coinbase, 2025-09-17 | https://help.coinledger.io/en/articles/2535264-coinbase-file-import-guide | 2026-11-13 |
| CB6 | Coinbase help, transaction history (HTTP 403) | https://help.coinbase.com/en/coinbase/taxes-reports-and-financial-services/specific-tax-questions/how-to-generate-a-transaction-history-report | 2026-11-13 |
| BP1 | bitpanda-csv test sample, 2023 | https://github.com/veeso/bitpanda-csv/blob/main/test/bitpanda.csv | 2026-11-13 |
| BP2 | BittyTax Bitpanda parser, format of 2024-03-18 | https://github.com/BittyTax/BittyTax/blob/master/src/bittytax/conv/parsers/bitpanda.py | 2026-11-13 |
| BP3 | CoinLedger, Bitpanda, 2024-08-05 | https://help.coinledger.io/en/articles/6803203-bitpanda-file-import-guide | 2026-11-13 |
| BP4 | Bitpanda help, history export (HTTP 403) | https://support.bitpanda.com/hc/en-us/articles/360000122759 | 2026-11-13 |
| BV2 | Bitvavo API, transaction history | https://docs.bitvavo.com/docs/rest-api/get-transaction-history/ | 2026-11-13 |
| BV3 | Bitvavo help, history issues (HTTP 403; the 30,000-line limit from a search result) | https://support.bitvavo.com/hc/en-us/articles/47546747934865-Transaction-history-issues-and-bugs | 2026-11-13 |
| BV4 | Blockpit, Bitvavo import | https://intercom.help/blockpit/en/articles/12136947-how-to-import-data-via-bitvavo-api-key-or-csv-file | 2026-11-13 |
| TR1 | Portfolio Performance forum, 2026-04-15 to 2026-06-22 | https://forum.portfolio-performance.info/t/import-trade-republic-csv-transaktionsexport/39126 | 2026-11-13 |
| TR2 | Third-party schema, 2026-06-08 | https://gitea.com/Jan-M/demo-evidence-traderepublic/src/ | 2026-11-13 |
| TR3 | mobiflip, the export's launch, 2026-04-17 | https://www.mobiflip.de/trade-republic-bekommt-neue-export-funktion-und-outbank-zieht-sofort-nach/ | 2026-11-13 |
| TR4 | CoinTracking, 2026-05-19 | https://www.cointracking.info/blog/cointracking-trade-republic-import | 2026-11-13 |
| TR5 | Waltio, app-only export, 2026-07-24 | https://help.waltio.com/en/articles/13744220-trade-republic-file | 2026-11-13 |
| TR6 | Portfolio Performance forum, savings plans, 2026-10-01 | https://forum.portfolio-performance.info/t/csv-import-aus-trade-republic-getatigte-sparplane-anlegen/39807 | 2026-11-13 |
| RV1 | BittyTax Revolut parser and history | https://github.com/BittyTax/BittyTax/blob/master/src/bittytax/conv/parsers/revolut.py | 2026-11-13 |
| RV2 | Blockpit, Revolut import | https://intercom.help/blockpit/en/articles/12136994-how-to-import-data-via-revolut-csv-file | 2026-11-13 |
| RV3 | CoinTracking, Revolut, June 2026 | https://cointracking.info/import/revolut/ | 2026-11-13 |
| RV4 | Revolut help, crypto statement (HTTP 403; text from a search result) | https://help.revolut.com/en-AU/help/profile-and-plan/managing-my-account/cryptocurrency-statement | 2026-11-13 |

Trade Republic's export (#16's evidence, for the reader of 2026-11-13). The keys carry TR- so they do not collide
with question 1's P1 and D1; TR-E1 to TR-E11 in §3 and §5 are the rows of #16's evidence table, its E keys
prefixed, and its MIGRATION row, which has no key there, is TR-E9.

| Key | Source | URL | Read |
|---|---|---|---|
| TR-R1–TR-R6 | Real exports of six people in public GitHub repositories, committed 2026-05-01 to 2026-09-23, URLs withheld because the files hold their owners' names and IBANs, only their shape read on 2026-11-13 | withheld | 2026-11-13 |
| TR-R7 | Portfolio Performance forum, the CSV transaction export, 2026-04-16 to 2026-06-18 | https://forum.portfolio-performance.info/t/import-trade-republic-csv-transaktionsexport/39126 | 2026-11-13 |
| TR-R8 | Portfolio Performance issue 5655, 2026-05-04 | https://github.com/portfolio-performance/portfolio/issues/5655 | 2026-11-13 |
| TR-P1 | Portfolio Performance, TradeRepublicCSVExtractor, 2026-04-11 to 2026-10-10 | https://github.com/portfolio-performance/portfolio/blob/master/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/traderepublic/TradeRepublicCSVExtractor.java | 2026-11-13 |
| TR-P2 | Portfolio Performance, anonymised fixtures, 2026-04-11 | https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio.tests/src/name/abuchen/portfolio/datatransfer/traderepublic | 2026-11-13 |
| TR-P3 | Pastory, export-officiel.md, 2026-10-01 to 2026-10-13 (only its claims checked on its own exports count) | https://github.com/TheoDuc/Pastory/blob/main/docs/export-officiel.md | 2026-11-13 |
| TR-P4 | GhostfolioSidekick, Trade Republic parser, 2026-04-17 to 2026-11-08 | https://github.com/VibeNL/GhostfolioSidekick/blob/master/Parsers/TradeRepublic/TradeRepublicCsvParser.cs | 2026-11-13 |
| TR-P5 | buddy-budget, Trade Republic import, 2026-10-08 | https://github.com/YonderUrik/buddy-budget/blob/main/docs/trade-republic-import.md | 2026-11-13 |
| TR-P6 | Third-party schema, 2026-06-08 (TR2) | https://gitea.com/Jan-M/demo-evidence-traderepublic/src/ | 2026-11-13 |
| TR-D1 | Trade Republic, press release on the crypto wallet, 2025-11-14 | https://www.gettex.de/en/news-overview/newsdetail/eqs-news-trade-republic-expands-its-crypto-offering-with-a-new-wallet-enabling-customers-to-transfer-pay-and-stake-crypto-with-a-regulated-bank/ | 2026-11-13 |
