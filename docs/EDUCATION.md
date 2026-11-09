# Education: the Learn modules, the simulator and the Red day page

Seven modules at launch and no more. Each is one idea, under 400 words, one chart only where it earns
its place, one caveat, a reading time in whole minutes (the formula: `docs/CONTENT-STYLE.md` §5) and a
"last reviewed" date. Modules are MDX files in `packages/content/learn/` with front
matter validated by a schema; every statistic in them has a source and a date in §9 and is flagged by
the review job when older than a year (`docs/CONTENT-OPS.md`). A module carries no warning line at the top: the caveat box and the dated
figures do that work, and the disclosures sit at decision points (`docs/LEGAL.md` §4). The Learn
index is an app screen and carries no site line (`docs/LEGAL.md` §5). The index ends with the country
library: `/learn/countries` lists every shipped profile but the generic one, sorted by name, each with its
last-reviewed date, and `/learn/countries/<code>` (the code in lower case) shows that country's card; any
other code, the generic profile's included, lands on the list. Voice and the banned words:
`docs/CONTENT-STYLE.md`. Decision records: ADR-0011, ADR-0013, ADR-0047.

Education is contextual first, indexed second. A link ships with its module, so no link waits for its
text. Small "Why?" links beside the things people wonder about open the module in a sheet without
leaving the screen:

| Where the link sits | Opens |
|---|---|
| "Tax-free from <date>" on a log row or lot | Taxes where you live (the country section) |
| The sell window on Plan and the strip | Cycles → "the window is a discipline device" |
| The hold phase on Today | Start here → "why some people hold" |
| The three sell parts | Cycles → "three parts" |
| The figure on the fall page (`/learn/fall-under-way`) | When the market drops |
| The portfolio P/L | Risk honestly |
| The simulator's result | Simulator → "what this does not show" |

## 1. Start here

**Idea**: averaging takes away the timing decision, not the risk.
**Says**: what dollar-cost averaging is (the same amount on the same day, whatever the price), what
it does (removes timing decisions: the amount and the day are set in advance, so news and price
moves change neither) and what it does not do (it does not make crypto less risky; it does not
guarantee a profit; it can still lose money for years, and it can lose all of it). Why some people
hold (what the hold phase is, why some people follow the rule, and that it is a rule, not a
forecast). What Proof of Calm is: a planner, a log. What it is not: an exchange, a wallet, a signal,
a tax tool, advice; no news, no feed. Where the data lives (the browser or installed app it was
recorded in; the account joins this line when accounts ship), how to keep it (a JSON backup in
Settings, since the CSV log restores nothing) and what we never hold (keys, funds, exchange logins).
**Chart**: none.
**Caveat**: "Skipping a month because of the price, or moving a buy to wait for a lower one, brings the
timing decision back".
**Facts needed**: none beyond the product description.

## 2. Risk honestly

**Idea**: you can lose everything, and the order of operations matters.
**Says**: crypto assets have fallen by three quarters or more several times, and smaller coins by
more than ninety percent (dated figures from §9); an exchange can fail and take deposits with it
(dated examples); leverage turns a drawdown into a liquidation (one dated figure); scams follow the
same patterns every cycle (the six patterns, in plain words). The order that keeps people safe:
emergency fund first (three to six months of expenses, from a consumer authority), no borrowed money,
only money you can leave alone for years, small enough that a total loss changes nothing important.
Self-custody basics in five sentences: what a seed phrase is, never typed into a website, hardware
wallets, a test transaction first, nobody from support ever asks for it.
**Chart**: one bar chart of maximum drawdowns per asset and cycle (categorical by asset, with values
labelled, from `packages/content/cycles`). Directly under the chart sits the first-view sentence for
historic data of `docs/LEGAL.md` §4, "[Source] closes, [first date] to [last date]. Past performance is
not a reliable indicator of future results.", as §6 says for the Red day page. The publisher shows as
attribution text, never as a link to the exchange's domain (`docs/LEGAL.md` §3.4).
**Caveat**: "Past drawdowns are a floor for your imagination, not a ceiling for the market."
**Facts needed**: §9 a–f.

## 3. Cycles

**Idea**: Since 2013, bitcoin's highs have come about 4 years apart so far; 4 completed cycles are 4 data points, not a law.
**Says**: halving dates and what a halving is (one sentence of mechanics); each cycle's high, trough
and the months from halving to high; why some people build plans around it (the Cycle plan template
does); why it may not repeat (ETFs, miner economics, macro, the sample size). What the sell window is
for: it is a discipline device that decides *when* in advance so that nobody has to decide *now*; it
is not a forecast, though the Cycle plan's dates rest on one. Why three parts: over 3 months or more,
one bad week cannot decide the whole plan.
**Chart**: none. The cycles' figures are a Markdown list: a table needs `remark-gfm` and new elements,
and the line chart needs licensed data.
**Caveat**: "If the next cycle looks like the last 4, that will be luck as much as structure."
**Facts needed**: §9 a, g, h, i. Fact j stays out: a next-halving date beside the months from halving
to high would give the reader the sum for a date.

## 4. Taxes where you live

**Idea**: the rule where you live decides what "hold" means; rules change yearly.
**Says**: the user's country card first, then the library of the other countries. The card opens with
the summary, the classification, the taxable events, the rates, and the allowances. Then the holding rule,
with every one of the profile's conditions under it: the card never states an exemption without its
condition. Then the lot rule, losses, reporting, and the questions for an accountant. Each rule carries its
Sources link; the date line and the profile's sources close the card. What the app does
(flags holding status per purchase, exports a tax-year file for your accountant) and does not do
(compute tax). Why "tax-free from" disappears in some countries. Why the dated notice appears when a
rule changes. Examples of how fast rules change (five dated examples from §9).
**Chart**: none. The card is the content.
**Caveat**: "This is general information with a date on it, not advice; a local accountant knows your
situation."
**Facts needed**: `docs/JURISDICTIONS.md` §7; §9 k.

## 5. Noise

**Idea**: the news does not know your plan.
**Says**: why Proof of Calm shows no news feed, no sentiment index and no price notifications
(engagement machinery produces the behaviour DCA exists to remove); what sentiment indexes are (the
Fear & Greed index: when it started, what goes into it), why traders watch them, and why a monthly
buyer does not need one; what a plan needs from a headline (nothing: the next purchase falls on the
buy day); what the app shows instead: one line on Today, once per fall, from prices alone, linking to
the fall page.
**Chart**: none.
**Caveat**: "Leaving out noise is not leaving out risk; a fall can go deeper than any before it." (Risk
honestly is not built, so the caveat points to no module.)
**Facts needed**: §9 l.

## 6. When the market drops

**Idea**: this has happened before; your plan already assumed it would.
**Two surfaces.** The module, `/learn/when-the-market-drops`, is the resting text, in Learn's index
like any other; while the red-day port finds a fall under way, its route (never its sheet) holds one
line above the body linking to the fall page. The fall page, `/learn/fall-under-way`, is the other:
Learn's index opens with its row (`The fall under way and your plan`) only while the red-day port
(`docs/DOMAIN.md` §3.11) finds a fall of the held coins under way on the device, and the page's path
gives the module in its place when nothing is held, no held coin has a price history to read, or no
fall is under way, so a bookmark or the back button never shows old figures. The page holds, in order: the back link to Today and its heading; the figure with the
market as its subject, truncated to whole
percents and dated by the last complete close (the coins with no price history named under it); the
data line (currency, the closes' first and last dates, CoinGecko as the source; ADR-0050); the
past-performance sentence with its `Risk disclosure` link, once (`docs/LEGAL.md` §4); each held coin's
earlier falls from the cycles file (§9 a–c), oldest first, each with its publisher as unlinked text,
and a line for a coin that has none; the next buy day, left out when no buy is ahead; and the person's note with its date. The held
coins are the portfolio's with units above 0 (`docs/DOMAIN.md` §3.6): a plan coin at 0 units is not
one, and a coin that left the plan while its entries stay is, under its name. While the figures are
asked their place keeps its height and no coin is named; a history that cannot be loaded leaves one
failure line there, and the past-performance sentence moves under the earlier falls, shown only when
at least one earlier fall is: the sentence sits under historic data or not at all. The figure names
each held coin once, by its name, and ends with a Why? that opens this module in the sheet. No chart,
and no control but the figure's Why?; no red, no P/L or portfolio value; the words are in
`docs/CONTENT-STYLE.md` §3.
**Says** (the module, moved here from the page): how the trigger works (a seven-day fall of 10 % or
more, or a close 30 % or more below the 90-day high, computed from prices only, never from headlines);
how often it fired on bitcoin, with fact q's series and window (Bitstamp BTC/USD daily closes, 16 Oct
2021 to 16 Oct 2026: either condition on 15.1 % of days); the 118-plan figure with its start months
and Bitstamp named, and the BIS counterweight beside it (§9 r, `docs/CONTENT-STYLE.md` §5); and
counsel's sentence on the three things: "A monthly buyer can do nothing, log the buy on the buy day,
or re-read the plan." Nothing about buying the dip; nothing about selling. One past-performance
sentence directly under the first historic figure (`docs/LEGAL.md` §4); no other disclosure.
**Chart**: none. The drawdown-scale chart with a live marker is cut: ROADMAP M2 allows a module at
most one chart, the fall page already shows the live figure beside the earlier falls, and the red-day
model's fall from the 90-day high is not the cycle high-to-low fall a scale of past drawdowns holds.
The `drawdown-scale` value stays in §10's schema.
**Caveat**: "A drawdown can get deeper. This page is here to stop a decision, not to make one."
**Facts needed**: §9 q, o, r.

## 7. Simulator

**Idea**: what monthly buying would have done, including the years it hurt.
**Says**: pick a split, a monthly amount, a start and an end date; the simulator buys on the chosen
day of each month at that day's close from bundled daily closes and shows the full path of cost basis
and value, the maximum drawdown, the longest time under water, and the final multiple; a start-date
sensitivity view (the same plan started each month of a year) so the role of luck is visible. Fees
optional as a flat percentage. Nothing about the future.
**Chart**: one: value and cost basis over time with drawdown shading; a second small multiple only for
the sensitivity view.
**Caveat**: "Past prices are facts; a simulation of them is not a forecast. Taxes, fees, slippage and
your own behaviour are not in this chart."
**Facts needed**: data sources and licensing from ADR-0036; the method in §8.

## 8. Simulator method (implemented in `packages/core/src/simulate`)

- Inputs: `split`, `monthlyAmount`, `startDate`, `endDate`, `buyDay`, `feePercent` (default 0),
  `history` per coin from `packages/data` (the Proof of Calm reference close in EUR, converted to USD,
  GBP and CHF with ECB reference rates, conversion stated in the UI; ADR-0036). Available from the
  first liquid EUR market and said so on the page: BTC 2013-09 (2011-08 in USD once the Bitstamp
  licence is signed), ETH 2015-08, LINK 2019-09, SOL 2021-06. No day-of-month optimisation is
  offered: buy-day sensitivity is negligible in the data (§9 `p`).
- For each slot (same generator as the plan, `docs/DOMAIN.md` §3.1): buy `plannedParts` at the close
  of `due` (or the next available close if the market data has a gap; count and show gaps).
- Series: `invested(t)`, `value(t) = Σ units × close(t)`, `drawdown(t) = value(t) / max(value ≤ t) − 1`.
- Outputs: final multiple, max drawdown with its dates, longest underwater period (days from a peak
  to its recovery), months in loss, and the sensitivity table.
- Properties tested: constant price → multiple exactly `1 − feePercent / 100`; monotone invested;
  drawdown in `[−100 %, 0]`; splitting into N coins with identical histories equals one coin.
- Readings of the implementation (`simulate(input)` and `startDateSensitivity(input)` return results,
  never throw for a user's choice):
  - the closes come as `histories`, every coin in one currency (`PriceHistories`, `docs/DOMAIN.md`
    §3.11), and the monthly amount is in that currency;
  - the first buy is on `startDate` and later ones on `buyDay` (the plan's generator with
    `firstBuy = startDate` and `lastBuy = endDate`); the monthly amount is split by largest remainder
    at the currency's minor unit in the split's order, and a coin whose part rounds to zero does not buy;
  - the fee, `amount × feePercent / 100` exactly, comes out of each buy and `invested` counts the full
    amount; units keep 18 decimals (rounded down) and the value series ten, so the multiple
    (`value / invested` at six decimals) is exactly `1 − feePercent / 100` at a constant price;
  - a buy fills at the first close on or after its due date; a due date without a close is a gap,
    `{ coin, due, filled }`, with `filled: null` when no close comes before `endDate`;
  - the days simulated are the dates with a close of any coin from `startDate` to `endDate`; a coin
    without a close that day counts at its latest close;
  - drawdown is in percent at four decimals; the maximum drawdown is the deepest fall from a peak,
    compared exactly, with its peak, trough and recovery dates (`null` without a recovery before the
    end); the longest time under water runs from a peak to its recovery, or to the last day for a fall
    not recovered by then (`recovered: false`);
  - months in loss are calendar months whose last simulated day ended with the value, at the minor
    unit, below the amount invested;
  - the sensitivity table starts the same plan (amount, split, buy day, fee and length in months) in
    each of the twelve months up to and including the chosen start, oldest first, so every row ends
    within the data the chosen plan uses; a row the data cannot cover carries its error;
  - errors: `invalid-split`, `invalid-amount`, `invalid-fee` (negative, 100 % or more, or more than four
    decimals), `invalid-buy-day`, `invalid-dates`, `history-missing`, `history-starts-later` (with the
    coin's first date, for "data from …") and `history-ends-earlier`; a history out of date order or
    with a close that is not positive is a programmer error, because the data is ours.
- Honest presentation: the path first, the end value last; drawdown shaded; "start-date sensitivity"
  one tap away; no annualised return in the headline (a multiple and the dates instead).

## 9. Facts and sources

Every number a module cites, verified against primary data on 2026-10-16 (two independent pulls of
exchange and explorer data agreed to the dollar; full tables with every source URL in
`docs/research/brand-content-education.md` §6) and read again on 2026-11-02, every source opened and
every computed figure recomputed from the raw responses (`docs/content-review-log.md`).
`packages/content/facts/education.json` holds this table with `lastReviewed: 2026-11-02`: one fact per key, the Fact text as its value, row k one fact
per law (its closing sentence rests on the 6 k facts and has none of its own). Each fact carries one
source among those its row names, on the facts allow-list (`docs/CONTENT-OPS.md` §5), with its URL
from the research report, where the others stay beside those `docs/content-review-log.md` lists
(`k.pt-2023` cites Lei 24-D/2022 itself in the
Diário da República, `k.ie-2026` the Finance (No. 2) Bill 2026 in the Oireachtas); its `date` is that document's date, or 2026-10-16 for live data and undated
pages. Rows h, i and o to q are Proof of Calm's own computation: the value opens with "Proof of Calm's
own computation" and its series, so a module quoting it says who computed it, and the publisher is
the exchange whose daily candles it used, so the first-view line reads "Bitstamp closes, …"
(`docs/LEGAL.md` §4). An ETH figure is a fact of its own, sourced to the ETH candles it came from.
Prices are USD daily candles on UTC days; "intraday" means the candle extreme, "close" the UTC close.
Each fact's `confidence` field holds its rating, and a value never states one.

| Key | Fact | Source |
|---|---|---|
| `a.btc-drawdowns` | Bitcoin drawdowns from cycle highs: 2011, from $31.91 (Mt. Gox, 8 Jun 2011) to about $2 (CoinMarketCap composite, $1.92 on 22 Nov 2011), −93 to −94 %; 2013 to 2015, from $1,163 (Bitstamp intraday 30 Nov 2013; Mt. Gox traded at $1,242 a day earlier) to $152.40 (14 Jan 2015), −86.9 % (−85.2 % on the CoinMarketCap series); 2017 to 2018, from $19,666 (Bitstamp 17 Dec 2017; CMC $20,089) to $3,122 (15 Dec 2018), −84.1 %; 2021 to 2022, from $69,000 (Bitstamp 10 Nov 2021) to $15,479 (Bitstamp 21 Nov 2022), −77.6 %; current cycle, from $126,272 (Bitstamp 6 Oct 2025; CMC $126,198.07) to $57,735 (1 Jul 2026), −54.3 % so far. On closes the figures from 2013 on are 0.7 to 1.2 percentage points smaller, except Bitstamp's −86.9 %, which becomes −84.9 %. | Bitstamp OHLC API; Coinbase Exchange candles; CoinMarketCap historical; bitcoinity Mt. Gox export |
| `b.alt-drawdowns` | ETH 2018 (Coinbase): $1,420 (13 Jan 2018) to $80.60 (14 Dec 2018), −94.3 %. ETH 2022 (Coinbase): $4,868 (10 Nov 2021) to $880 (18 Jun 2022), −81.9 %. SOL (Coinbase): $260 (6 Nov 2021) to $8.00 (29 Dec 2022), −96.9 %. LINK 2018 (CoinMarketCap series only): $1.435 (8 Jan 2018) to $0.1621 (29 Jun 2018), −88.7 %. LINK 2021 to 2023 (Coinbase): $52.99 (10 May 2021) to $4.93 (10 Jun 2023), −90.7 %. On 16 Oct 2026 (Coinbase) LINK was still 77 % and SOL 60 % below their 2021 highs. | as above |
| `c.current-cycle` | High 6 Oct 2025 (Bitstamp $126,272; highest close $124,728). Lowest since: 1 Jul 2026 intraday $57,735, lowest close 30 Jun 2026 $58,526. Month-end closes 31 Oct 2025 to 30 Sept 2026: $109,554; $90,382; $87,496; $78,635; $66,985; $68,215; $76,310; $73,568; $58,526; $62,818; $78,571; $83,563. Close of $81,501 on 16 Oct 2026: 35.5 % below the high, 41 % above the low, 375 days after the high. Whether 6 Oct 2025 was the cycle's peak is unknown. | Bitstamp; CoinGecko; CMC |
| `d.exchange-failures` | Mt. Gox: bitcoin withdrawals halted 7 Feb 2014, closed 25 Feb 2014; about 850,000 BTC reported missing on 28 Feb 2014, 200,000 BTC reported found on 20 Mar 2014, about 650,000 BTC still missing. QuadrigaCX: founder's death announced 14 Jan 2019; more than 76,000 clients owed C$215m, C$46m recovered or identified; an Ontario Securities Commission staff report of 14 Apr 2020 said "Quadriga operated like a Ponzi scheme", staff's view and not a hearing panel's finding. Celsius: withdrawals halted 12 Jun 2022, Chapter 11 on 13 Jul 2022, about $4.7bn owed. Voyager: accounts frozen 1 Jul 2022, customers lost more than $1bn (FTC 12 Oct 2023). FTX: customer withdrawals paused 8 Nov 2022 (SEC complaint), all trading and withdrawals halted 10 Nov 2022, Chapter 11 on 11 Nov 2022, over $8bn of customer deposits missing (CFTC complaint 13 Dec 2022); founder sentenced to 25 years on 28 Mar 2024. Bybit: nearly $1.5bn stolen in February 2025, "the largest digital heist in crypto history" (Chainalysis 8 Jan 2026). | MtGox announcements 2014-02-28 and 2014-03-20; OSC; SEC 2023-133; FTC; CFTC; Chainalysis |
| `e.scams` | Chainalysis: on-chain scam revenue at least $14bn in 2025 (Chainalysis says the figure could exceed $17bn as it identifies more illicit wallet addresses) after about $12bn in 2024 (revised); total illicit volume 2024 revised to $57.2bn; impersonation scams grew more than 1,400 % in 2025; crypto sent to address-poisoning scams grew more than 15,000 % in 2024, largely from 1 attack in May 2024. US FTC: $15.9bn reported fraud losses in 2025, investment scams $7.9bn (about half), median investment-scam loss $9,196 in 2024. FCA 2025: UK adult crypto ownership fell from 12 % to 8 %; 7 % of UK crypto users say they have personally been a victim of crime, scams, or fraud involving crypto. Patterns with authoritative descriptions: fake investment websites and apps (FTC), unknown exchange platforms (ESAs), pig-butchering (FinCEN alert 8 Sept 2023), fake support and impersonation (ESAs factsheet, December 2025), seed-phrase phishing (ESAs), "guaranteed returns" (FTC: "Only scammers will guarantee profits or big returns"), address poisoning (ESAs; Chainalysis). | Chainalysis 2026-01-08, 2026-01-13, 2025-02-13; FTC testimony 2026-03-25 and Data Book 2024; FCA Wave 6 2025; ESAs factsheet 2025-12; FinCEN |
| `f.leverage` | CoinGlass on X, 10 Oct 2025 23:48 UTC: "1,618,240 traders were liquidated, with a total liquidation amount of $19.13 billion" in 24 hours, the largest in its dataset; exchanges under-report, so the real figure was likely higher. Liquidations in 2025 to 20 Nov 2025: about $150bn, roughly $400m to $500m a day; first half of 2026: $73.35bn, about $405m a day. ESMA 2018: 74 to 89 % of retail CFD accounts lose money (average losses €1,600 to €29,000); the FCA banned crypto derivatives for retail consumers from 6 Jan 2021. | CoinGlass post and annual and H1 2026 reports; ESMA71-98-128; FCA 2020-10-06 |
| `g.halvings` | Block 210,000 on 28 Nov 2012 15:24 UTC (50 → 25 BTC); 420,000 on 9 Jul 2016 16:46 UTC (25 → 12.5 BTC); 630,000 on 11 May 2020 19:23 UTC (12.5 → 6.25 BTC); 840,000 on 20 Apr 2024 00:09 UTC (6.25 → 3.125 BTC; that block carried 37.6 BTC of fees). | mempool.space and blockchain.com block data |
| `h.halving-to-high` | Proof of Calm's own computation (mempool.space block times; Bitstamp BTC/USD daily candles): months from halving to the cycle high, 12.1 (2013), 17.3 (2017), 18.0 (2021), 17.5 (2025, the high so far). | derived from g and a |
| `i.diminishing` | Proof of Calm's own computation (Bitstamp BTC/USD daily candles; the 2011 high is Mt. Gox's $31.91 on 8 Jun 2011; the 2011 low is CoinMarketCap's): drawdown sequence −94 % (2011), −87 % (2013 to 2015), −84 % (2017 to 2018), −78 % (2021 to 2022), −54 % so far (from the 2025 high). 4 completed cycles are 4 data points; the current one is not final; the series is measured on the asset that survived. | derived from a and research §6b (the high-to-high and trough-to-high multiples stay there: return figures that invite extrapolation, `docs/LEGAL.md` §3.6, so no module quotes them) |
| `j.next-halving` | Block 1,050,000; 78,267 blocks remained at height 971,733 on 16 Oct 2026; at 10-minute blocks 12 Apr 2028, at the average since the last halving 9 Apr 2028, at the last 2,016 blocks' average 13 Mar 2028. | mempool.space tip height |
| `k.pt-2023`, `k.de-2024`, `k.it-2026`, `k.be-2026`, `k.gb-2024`, `k.ie-2026` | Portugal taxed crypto gains from 1 Jan 2023 (28 %, 365-day exclusion; Lei 24-D/2022). Germany raised the private-sales Freigrenze from €600 to €1,000 from tax year 2024 (Wachstumschancengesetz, BGBl. 2024 I Nr. 108). Italy raised the substitute tax from 26 % to 33 % for gains from 1 Jan 2026 and removed the €2,000 threshold from 2025 (L. 207/2024); euro e-money tokens keep 26 % (L. 199/2025). Belgium introduced a 10 % tax on gains on financial assets including crypto from 1 Jan 2026 (law of 6 Apr 2026, Moniteur belge 21 Apr 2026). The UK cut the CGT annual exempt amount from £12,300 to £6,000 for 2023 to 2024 and to £3,000 for 2024 to 2025. From 30 Oct 2024 it raised individuals' main rates, which cover crypto disposals, from 10 % and 20 % to 18 % and 24 %. Ireland's Budget 2027 cut CGT from 33 % to 31 % for most gains, on disposals from 7 Oct 2026, by Financial Resolution No. 3 of 6 Oct 2026, a Dáil resolution with temporary statutory effect. Section 36 of the Finance (No. 2) Bill 2026 would enact the cut (not enacted on 2 Nov 2026). From 1 Jan 2023 to 7 Oct 2026, 5 of these jurisdictions changed rules that tax crypto gains (Portugal and Italy in crypto-specific provisions). Ireland cut its CGT rate by a Dáil resolution; the Finance (No. 2) Bill 2026 was not enacted on 2 Nov 2026. | `docs/JURISDICTIONS.md` §7 and its sources |
| `l.fear-greed` | alternative.me Crypto Fear & Greed Index: Bitcoin only, 0 to 100, daily data from 1 Feb 2018; 6 inputs as published: volatility 25 %, momentum and volume 25 %, social media 15 %, surveys 15 % (marked "currently paused", redistribution undisclosed), dominance 10 %, Google Trends 10 %. CoinMarketCap's index: launched 3 Aug 2023, 5 components, weights undisclosed ("a complex weighting system"). On 16 Oct 2026 they read 63 "Greed" and 50 "Neutral", 13 points apart on the same day. | alternative.me page and API; CMC chart page and API docs |
| `m.emergency-fund` | FCA InvestSmart (updated 16 May 2025): "Many experts recommend having an emergency fund that can cover your outgoings for between 3 and 6 months." BaFin: a rule of thumb of 3 months' income. The CFPB gives no number. | FCA; BaFin "Einmaleins der Geldanlage"; CFPB |
| `n.risk-phrasings` | ESAs joint warning 17 Mar 2022: "Consumers face the very real possibility of losing all their invested money"; revised warning 6 Oct 2025: "You may lose a lot, or even all, of the money invested", MiCA protections "not as extensive as those applicable to more traditional financial products (e.g. you will not benefit from compensation schemes)". MiCA Art. 6(5): the asset "may lose its value in part or in full", "may not be liquid", not covered by investor-compensation or deposit-guarantee schemes. FCA COBS 4.12A.11R: "Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment and you should not expect to be protected if something goes wrong." Central Bank of Ireland: "Consumers could face the possibility of losing all their money if they buy crypto". | ESMA; EUR-Lex; FCA Handbook; CBI |
| `o.dca-windows` | Proof of Calm's own computation (Bitstamp BTC/USD daily closes): $100 on the 1st of each month, no fee, valued 1 month after the last buy, start months Jan 2013 to the last feasible. 48-month windows: 118 of 118 above cost, minimum 1.37× (buys Jan 2019 to Dec 2022), median 4.04×, maximum 27.8×; 26 % of windows spent 12 or more consecutive month-ends below cost; with a 1 % fee per buy still 118 of 118. 36-month: 126 of 130 (minimum 0.90×). 24-month: 114 of 142. 12-month: 110 of 154 (minimum 0.45×). Lump sums (Bitstamp daily closes, no fee): no 4-year window negative (minimum +31.2 %, 8 Apr 2021 to 8 Apr 2025), but 5-year windows were negative on 7 days (15 Dec 2022 to 6 Jan 2023, worst −13.3 %) and 3-year windows on 33 days (worst −35.4 %). | `packages/data` once built; method in §8 |
| `o.dca-windows-eth` | Proof of Calm's own computation (Coinbase Exchange ETH-USD daily closes): $100 on the 1st of each month, no fee, valued 1 month after the last buy, start months from Jan 2017: 48-month windows 63 of 70 above cost. | Coinbase Exchange ETH-USD daily candles; method in §8 |
| `p.simulator-examples` | Proof of Calm's own computation (Bitstamp BTC/USD daily closes): BTC, $100 on the 1st, no fee, valued at the 16 Oct 2026 close of $81,501. Start Nov 2021 (the 2021 high): 60 buys, $6,000 cost, $11,348 value, 1.89×, worst fall of value −49 %, worst value-to-cost 0.44×, longest time below cost 486 days; start Nov 2022: 1.72×, longest time below cost 64 days; start Apr 2024: 1.04×, longest time below cost 101 days so far; start Oct 2025 (the 2025 high): 1.05×, longest time below cost 315 days so far. Buy-day sensitivity is negligible on 48-month BTC windows from Jan 2013 (median 3.82× to 4.04× for days 1, 8, 15, 22, and 28). | same |
| `p.simulator-examples-eth` | Proof of Calm's own computation (Coinbase Exchange ETH-USD daily closes): ETH, $100 on the 1st, no fee, from Nov 2021, valued at the 16 Oct 2026 close of $2,420: 1.09×, worst value-to-cost 0.32×, longest time below cost 488 days. | same as `o.dca-windows-eth` |
| `q.red-day-frequency` | Proof of Calm's own computation (Bitstamp BTC/USD daily closes, 16 Oct 2021 to 16 Oct 2026): a 7-day fall of 10 % or more on 5.7 % of days, about 6 episodes a year (9.3 % of days since 2013); 30 % or more below the trailing 90-day high on 11.8 % of days (19.2 % since 2013); either on 15.1 % of days. Being 20 % below a 90-day high was true on 32 % of days, a regime rather than an event. | same |
| `q.red-day-frequency-eth` | Proof of Calm's own computation (Bitstamp ETH/USD daily closes, 16 Oct 2021 to 16 Oct 2026): the same thresholds fire about 1.9 to 2.4 times as often as on BTC (a 7-day fall of 10 % or more on 10.7 % of days; 30 % or more below the trailing 90-day high on 28.0 %). | Bitstamp ETH/USD daily candles |
| `r.app-user-losses` | BIS Working Paper 1049 (Nov 2022, revised Jul 2023): crypto app downloads in 95 countries from Aug 2015 to Jun 2022; assuming each new user bought $100 of bitcoin in the month of download and every month after, at the time of writing 81 % of these users would have lost money, and the median investor would have lost 48 % of $900 invested. | BIS Working Paper 1049 |

Rules for use: every figure appears with its date and series; "the 2025 high", not "the peak";
"so far" after every current-cycle number; windows are quoted with their start months, length, price
source and fee assumption; the BIS counterweight sits beside any favourable statistic; nothing is
extrapolated. A fact's value holds only what a module quotes, and the instructions sit here: a
drawdown names its series and runs to the lowest low before the coin regains its high (a, b); a time
below cost is value under the money put in, while `under water` stays the simulator's measure, from a
peak to its recovery (§8), and neither stands for the other (o, p); the trailing 90-day high is the
date and the 89 before it, as `docs/DOMAIN.md` §3.11 reads it (q); the next-halving estimate is recomputed from the current height, with
the method shown (j); the emergency-fund figures are attributed, never stated as ours (m); the window
statistics cite only their own series, since no publisher offers a documented equivalent (o).

## 10. Front matter schema (`packages/content/src/schema/module.ts`)

```ts
{
  slug: 'start-here' | 'risk-honestly' | 'cycles' | 'taxes-where-you-live' | 'noise' | 'when-the-market-drops' | 'simulator',
  title: string, idea: string (≤ 120 chars), caveat: string (≤ 240 chars),
  chart: 'none' | 'drawdowns-bar' | 'halvings-line' | 'drawdown-scale' | 'simulator',
  facts: string[] (keys into §9 so the review job can flag staleness),
  lastReviewed: CalendarDate, nextReviewDue: CalendarDate, reviewedBy: 'owner' | 'agent-draft',
  words: number (computed at build), readingMinutes: number (computed at build)
}
```

An author types `facts` as one comma-separated line, empty when a module cites none (ADR-0048), and
never types `words` or `readingMinutes`: the parser computes them and refuses them in front matter. A
module over 400 words fails the content test. The banned-words lint runs on a module's title, idea,
caveat, and body. A body holds two elements. `<PastPerformance />` sets the past-performance sentence
and the link `Risk disclosure` as one, after the line's source and dates (`docs/LEGAL.md` §4). The content
test refuses those words anywhere in a module's own text. `<Chart />`, on a line of its own, draws the
chart the front matter names where it stands, followed by its source's publishers as unlinked text, the
span of its data and the past-performance line, all inside the element; a module holds it exactly once when
`chart` is not `none`, and never otherwise (`pnpm validate:content`). A module with a chart writes its
`N %` with an ordinary space, and the page sets it with the joiner of the chart's figures in each locale
(`docs/CONTENT-STYLE.md` §4); a module with `chart: none` renders as written. Only `drawdowns-bar` has a
renderer; another chart draws nothing until its own branch lands.
