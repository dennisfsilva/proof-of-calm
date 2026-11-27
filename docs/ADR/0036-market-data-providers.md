# ADR-0036: Market data providers and licensing

Status: Accepted; Next's Data Cache superseded by Vercel's Runtime Cache (ADR-0045); the credit's link superseded by ADR-0050; the four coins of the reference closes and the hand-picked allow-list superseded by ADR-0052 · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/market-data-competitors.md` §1–2, `docs/research/stack-backend-security.md` §14)

## Context

ADR-0006 fixed the shape (server-side cache, bundled history) and this record fixes the providers, plans, licences and fallbacks. The decisive facts, all accessed 2026-10-16, are quoted in the research file: CoinGecko's terms allow a cache refreshed at least every 24 hours and charging for an integrating product, forbid storing, deriving from or redistributing data beyond that, limit Demo history to 365 days (verified live) and Basic to 2 years, reserve redistribution to Enterprise, and require attribution next to the data; the Demo plan is described as for testing and exploration. Exchange public data: Kraken publishes full bulk OHLCVT files and public endpoints without a written market-data licence (its terms restrict scraping and commercial exploitation in general words); Bitstamp states that it "allows the incorporation and redistribution of our exchange data for commercial purposes" through a signed Data License Agreement; Coinbase's market-data terms could not be read (403) and reportedly route redistribution through partners; Binance's datasets are CC BY-NC-SA with commercial use "strictly excluded" and its EU service is impaired; CoinCap says its services are "not suitable for commercial use"; CryptoCompare/CoinDesk Data retired its free tier on 2026-05-21; Coin Metrics Community is CC BY-NC; Blockchain.com and Yahoo are non-commercial. The ECB's euro reference rates are free to use with attribution and a note when modified.

## Decision

| Need | Provider | Plan and terms | Fallback |
|---|---|---|---|
| Live prices (EUR, USD, GBP, CHF; 24 h change) | CoinGecko `/simple/price`, one call per 10 minutes for the whole matrix, server-side | Demo (free, 10k credits/month, attribution) until there is a paid tier; **Basic ($35/month) before Proof of Calm Plus launches** | Kraken public Ticker (EUR/USD pairs; GBP for BTC and ETH), then Coinbase Exchange public ticker; missing GBP/CHF derived from EUR with the ECB rate and labelled |
| Recent charts (≤ 365 days) | CoinGecko `market_chart` daily, cached server-side one day, never persisted | same | the bundled reference closes |
| Long history and the simulator | `packages/data`: the **Proof of Calm reference close**, the median of the daily closes available from Kraken (bulk OHLCVT), Bitstamp and Coinbase for each day, in EUR; USD, GBP, CHF by ECB reference rate (weekday rates carried over weekends, stated) | our own derived dataset with `DATA-LICENSE.md` naming sources and dates; Kraken asked for written confirmation; Bitstamp DLA requested | none needed; the dataset is in the repository |
| Nightly append | Kraken public OHLC (720 most recent daily entries, no key) validated against Bitstamp and Coinbase public candles | free | skip the day and flag a gap |
| FX for history | ECB `eurofxref-hist` static files | free with attribution and modification note | Frankfurter (ECB provider filter) only as a reader of the same data |

Rules:

- Attribute each series to its real source, never CoinGecko for exchange data or the reverse: "Price data by CoinGecko" (≥ 10 pt, linked) under live prices; "Reference closes derived from Kraken, Bitstamp and Coinbase public data; FX: ECB reference rates" under history and the simulator.
- Never commit raw exchange files; store daily closes only (not full OHLCV); keep the dataset in its own package so the app's licence is unaffected.
- State start dates in the UI: BTC 2013-09 in EUR (2011-08 in USD once the Bitstamp licence is signed), ETH 2015-08, LINK 2019-09, SOL 2021-06.
- Say which prices are traded (exchange closes) and which are conversions (CoinGecko non-USD quotes), and that closes are reference values, not tradable prices.
- The user agreement and privacy notice name CoinGecko and carry its data disclaimers, including on no-account pages (their terms §7).
- Handle CoinGecko error 10012 (HTTP 401) as a range error, not a key failure.

## Consequences

- Monthly data cost: $0 pre-revenue, $35 from the paid tier, $129 only if 10-second freshness is ever wanted.
- Two emails before M2 (Kraken confirmation, Bitstamp DLA); their answers are recorded here. If Kraken refuses, the base becomes Bitstamp (DLA) plus Coinbase, and the EUR start date for BTC moves to 2016-04 (Bitstamp BTC/EUR) unless converted from USD with ECB rates, which is then stated.
- The simulator benchmark to clear is costavg.com (Kraken data, ECB FX, fee presets, lump-sum comparison); our method is in `docs/EDUCATION.md` §8.
- The reference-close pipeline is tooling in the repository (`tools/data/`), tested, and run by GitHub Actions (ADR-0037).

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while implementing it on
2026-10-17.

- **One route, one currency parameter.** `GET /api/prices?currency=EUR` returns the core's
  `PriceSnapshot`: every allow-listed coin in EUR, USD, GBP and CHF and the 24-hour change in the
  asked currency. The upstream call always asks for the whole matrix (`precision=full`), so its
  cache key never depends on the caller.
- **Three caches.** The CDN (`s-maxage=600, stale-while-revalidate=1800`), Next's Data Cache for
  the upstream `fetch` across instances (`revalidate: 600`), and a copy per instance with the
  requests that arrive together sharing one call. The last good copy is the instance's, else the
  one in the optional Upstash store; it is served with `x-proof-of-calm-stale: true` and
  `s-maxage=60`, and the upstream is not tried again for a minute.
- **2026-10-29, the cache across instances.** Next's Data Cache in the bullet above left with
  ADR-0045. The layer across instances is the handler's `shared` dependency
  (`apps/web/lib/prices/handler.ts`): `runtimeCacheStore()` in `apps/web/lib/server/shared-cache.ts`,
  which returns `memoryStore()` until `@vercel/functions` is pinned (ADR-0045, deviations of
  2026-10-19 and 2026-10-26). One upstream call per ten minutes therefore holds per instance, not
  across instances.
- **The stale marker stays a header, exposed by CORS.** The Capacitor wrapper calls the hosted API
  cross-origin, where script sees only the safelisted response headers, so an allowed origin's
  answer carries `Access-Control-Expose-Headers: x-proof-of-calm-stale`, and the preflight allows
  `authorization` for the bearer token of M3 (`apps/web/lib/http/cors.ts`). The header was kept over
  a field in the body because the body is the core's `PriceSnapshot` and the marker is about the
  transport, not the prices.
- **The allow-list** is the prototype's catalogue of 26 coins, now the coin catalogue in
  `packages/content/coins.json` (ticker, name, CoinGecko id, decimals; listed by ticker), which the
  route and the coin picker both read; the move kept every ticker, every CoinGecko id and their order,
  so the upstream URL is the same (a test pins it). LINK shows 4 decimals per `docs/DESIGN.md` §5 rule
  7 where the prototype had 3; the route does not use decimals.

On 2026-10-20 (#83) the history route, `GET /api/history/:coin`, settled the choices the Decision
left open for recent charts:

- **Daily closes on UTC days.** `market_chart` with `days=365`, `interval=daily` and
  `precision=full`; a point at 00:00 UTC of day D is the close of D−1, and the last point (the price
  at call time) stands for today; at most 365 closes, rounded half-even to 10 decimals; null,
  non-finite or non-positive points are dropped, and an empty answer counts as an upstream failure.
- **One day from the fetch.** The shared cache keeps a copy one day (`history:<coin>:<currency>`),
  the CDN for what is left of it (`s-maxage` is 86,400 less the copy's age), and the device until 24
  hours after the server's `fetchedAt` by its own clock; ADR-0019's Readings own the device rule and
  its five-minute allowance for a clock behind the server, which can keep a copy that much longer in
  real time.
- **A failure is a 502 with no last good copy**, and each key waits 60 s after a failure before the
  next upstream try, as the price route does.
- **Canonical URLs only.** No query (EUR), or exactly `?currency=` and an upper-case code from the
  allow-list; anything else is a 400 with `no-store` before any upstream call. The key travels in
  the `x-cg-demo-api-key` header, never in a URL.

### Reading of 2026-11-08: no downloaded file holds values derived from CoinGecko data

The build session read the API Terms, the pricing page and the Crypto Data License page live on
2026-11-08, with archived copies of 2026-09-27 to 2026-10-25 where the site refuses automated reads
(confidence medium).

- The app uses the Demo plan (`x-cg-demo-api-key`). The pricing page shows Demo with an empty licence
  cell, "Attribution required", and "good for testing and exploration".
- API Terms 6.2 forbids to "duplicate, reproduce, copy, store, derive from or translate any Data …
  except as expressly permitted". The only storage 6.1 allows is a cache refreshed every 24 hours and
  deleted on termination; §7(b) binds users to terms "no less protective of CoinGecko".
- The Crypto Data License page (published 2026-11-05) puts "data access beyond on-screen display"
  under Data Redistribution, "Enterprise only". A downloaded file is a lasting copy beyond on-screen
  display, and a value next to its units gives the close back (value ÷ units).
- The attribution guide says "Do not remove or obscure the attribution". The quotes above this
  Reading still match the live terms word for word.

Decided: the tax-year files carry no value derived from CoinGecko closes, neither France's estimated
portfolio value before each sale nor the Netherlands' values on 1 January and 31 December. The core
keeps the value columns and computes them from the closes it is given; the shell gives none, so the
cells stay empty and each file's header says so in plain words (`docs/DOMAIN.md` §3.13). They fill
from the reference closes of `packages/data` (planned: M2), which carry their own credit. On-screen
values stay as the value chart shows them, credited and unlinked (ADR-0050). The plan the app uses at
launch is decided in #21: Demo is for testing, and Basic's licence covers commercial display but asks
for a linked credit.

### Reading of 2026-11-08: a close dated D is final from 00:10:30 UTC on D+1

On 2026-11-08 CoinGecko's `market_chart` reference (docs.coingecko.com/v3.0.1/reference/coins-id-market-chart)
settled when a close is final:

- **The close of day D is final from 00:10:30 UTC on D+1.** The 00:00 point of the last completed
  UTC day appears at 00:10 UTC, and the last point is cached 30 s; before then a copy holds either the
  price at the call dated D or no point dated D. A close dated D therefore counts as final only in a
  copy fetched at or after 00:10:30 UTC on D+1 (the Dutch 1 January line, `docs/JURISDICTIONS.md` §7.8).

### Reading of 2026-11-09: CoinGecko's answer leaves downloaded files open

The owner asked CoinGecko whether a user may download a CSV of their own holdings valued at its
closes, and whether a plain-text credit with a linked data-sources page meets the paid plans' rule.
Its support answered on 2026-11-09:

- Demo has no commercial rights ("treat Demo as suitable for development only"). Every paid plan,
  Basic included, covers "displaying data in customer-facing websites and apps with attribution".
- The licensing article "does not address a downloadable file of a user's own holdings valued at
  specific dates, so it doesn't settle this case either way". Such a file is "a downloadable, portable
  copy of CoinGecko-derived figures", and "If users can obtain reusable data from your product, you
  should contact CoinGecko to confirm the appropriate rights." Enterprise "is not clearly required".
- An export keeps to the valuations, never full price series. Display caches refresh at least every
  24 hours, and stored data is deleted when API access ends. The answer says nothing on the credit's link.

Decided: the Reading of 2026-11-08 stands. No downloaded file holds a value derived from CoinGecko
data, and the value cells wait for the reference closes of `packages/data` (planned: M2). The three
caches above already keep a copy one day from the fetch. The paid plan (Basic at least) and the
credit's link stay the owner's decision in #21.

### Reading of 2026-11-23: Bitstamp allows non-commercial use, without its history yet

The owner's letter (`docs/research/letters/bitstamp.md`, sent on 2026-11-09) asked for the Data
License Agreement and its price, for derived daily closes in an app that is free and may add a paid
tier, and whether publishing them needs the agreement at all. Bitstamp's answer, relayed by the
owner on 2026-11-23:

- "We will follow up with an attestation letter that allows you to use our data for non commercial
  purposes."
- "For now feel free to use our public APIs to get the data."
- "However, please note that historical data is not possible at this moment, we will try to get
  this sorted by end of year."

The answer names no agreement and no price. The public API already returns past daily candles (the
Learn facts cite such requests in `packages/content/facts/education.json`), so "historical data" is
read as the history the letter asked for, which the answer leaves for later, not as what the
endpoint can return.

Decided:

- Bitstamp's half of session 19's gate (#13) is answered. The session still waits for Kraken's
  answer, which carries the long history (Kraken's bulk files).
- The free app is read as the non-commercial use the answer allows, since the letter described it
  as free, with a paid tier that may follow. The attestation's words settle it once it arrives; the
  owner keeps the attestation outside the repository, and its date and scope are recorded here.
- Until Bitstamp says its history is possible, or that the public API's past candles may be read,
  the pipeline reads no Bitstamp candle dated before its first run. From that run on it reads the
  previous day's candle once a day per pair, as the letter described. The USD start of 2011-08 waits
  for that history.
- `DATA-LICENSE.md` states the condition for every close that includes Bitstamp's, in the
  attestation's words: non-commercial use, for the app and for anyone who reuses the dataset.
- Before a paid tier launches, the Data License Agreement is signed, or the reference closes are
  recomputed without Bitstamp's.
- The Learn facts that quote Bitstamp closes stay as they are: a few dated figures read from the
  public API, each with Bitstamp named as its source, in the free app's lessons.
- If Kraken refuses before Bitstamp's history is possible, the Consequences' fallback (Bitstamp plus
  Coinbase) has Bitstamp's closes only from the pipeline's first run.

### Reading of 2026-11-27: Kraken allows collection, storage and derived metrics, and reserves publication

The owner resent the letter, updated, on 2026-11-26 to the address Kraken's API documentation names
for market data licensing (`docs/research/letters/kraken-market-data.md`). It asked whether the
derived reference close may be shown in the app's charts and simulator, published in the public
repository's data package and used in a person's own CSV, and it said that the app is free and not
launched, with a paid tier that may follow. Kraken's support answered for its Market Data Team the
same day:

- "You may programmatically collect Kraken market data, store it, and perform analytics as long as
  you are not selling, redistributing, or providing downloads of the underlying data."
- "Displaying market data and using it internally would be permitted thus this would not require a
  license or written approval. Additionally, there are no data retention or deletion policies and
  derived metrics are yours to do with as you please"
- "Please ensure that the data and any access to it remain for your own benefit and are not sold,
  redistributed, sub-licensed, published as a data service, or otherwise made available to third
  parties." The use must also comply with Kraken's Terms of Service, its API documentation, its rate
  limits and the law.
- "If your plans change to include a customer-facing product, third-party access, publication or
  distribution of the data, or any commercial use outside the above mentioned, please contact us
  before proceeding so we can review the specific use case."

The answer names no licence and no price. Its sentence on changed plans treats as a future change what
the letter already described (an app anyone can open, a public data package, a paid tier), so it
neither approves nor refuses those uses. The EEA Terms of Service apply, since the owner lives in
Portugal (the EEA and Global Terms were both last updated on 2026-11-18). Their §11.1 counts "our
pricing data" as Kraken's content, permits it "only for approved purposes as permitted by us and for
your own benefit", sends any other purpose to the market data address, and adds "We can take away
this permission at any time for any reason". The answer is that approval for the uses it names, not
the signed agreement §16.7 keeps apart. Three independent readings of the answer and the Terms agreed
on most of what follows; where they differed (the CSV, the Ticker fallback), the Reading takes the
more careful choice (`docs/research/kraken-answer-reading.md`).

Decided:

- Kraken's half of session 19's gate (#13) is answered: the session builds now.
- Covered now: reading Kraken's bulk OHLCVT files and its public OHLC endpoint (spot pairs only, at
  most one request a second per address, backing off when limited, never spread over several
  addresses); keeping per-exchange daily closes in a private store; computing the reference closes
  and their ECB conversions; and figures computed from them on any day (per cent changes, drawdowns,
  time under water, with their dates). Until the fourth yes below, a figure over days where Kraken's
  is the only close is published without the closes behind it and never as a daily series or chart,
  which would give those closes back up to a factor.
- The private store is private in fact: never the public repository, its Actions logs, artifacts or
  caches, nor the deployed site. It keeps per-exchange daily closes only, as the Decision's "store
  daily closes only" says; the bulk files are downloaded again when needed. It lets the reference
  closes be recomputed without a source, if Kraken withdraws its approval or Bitstamp's agreement is
  not signed before a paid tier. A new private repository or bucket is a third-party resource, so it
  waits for the owner's yes.
- No Kraken figure enters the public repository: no Kraken candle, close, volume or trade in code,
  fixtures, stories, golden files, documents, logs or artifacts, and tests use synthetic values. The
  pipeline's per-exchange closes of Bitstamp and Coinbase stay in the private store too. The dated
  Bitstamp and Coinbase figures already in the Learn facts stay (Bitstamp's as the Reading of
  2026-11-23 decided), and session 19's reading of Coinbase's terms covers Coinbase's.
- A day with two closes takes their mean, the median's usual definition, never one of the two; the
  dataset records how many sources each day used.
- The owner's reply in the same thread asks four questions, each answerable yes or no, and each use
  waits for its own yes:
  1. the reference closes shown to anyone under the credit line, in the free app's charts, its
     simulator and the value of a person's holdings over time, and on the public history pages
     (`docs/GROWTH.md`), each coin's series loaded from the site as a file anyone can save: before the
     production domain serves real values, since anyone can reach it before launch;
  2. a person's CSV of their own holdings valued at them on a few dates, each row giving that day's
     close (the French file's `price` column shows it, and value ÷ units gives it in the others), with
     no price series: before the tax-year files fill their value cells from them;
  3. the reference closes as a downloadable file in the public repository, for non-commercial reuse
     that grants no right in any exchange's data: before `packages/data` holds a real value and before
     `DATA-LICENSE.md` grants reuse;
  4. days or coins where Kraken's is the only close the pipeline has, so that the reference close is
     Kraken's own close: before any such day is shown or published.
- The reply also says that on a day with two closes anyone holding the other exchange's public close
  can compute Kraken's close from the mean, and that the dataset records each day's source count.
- Until those answers, the pipeline and ADR-0037's daily append write to the private store behind a
  publish switch that is off, and real values appear only on protected Vercel previews, which is
  internal use; no workflow of the public repository runs against a preview that serves them, since
  its reports and screenshots become public artifacts. ADR-0006's "Until an answer, the dataset is
  published as derived medians" ended with this answer.
- Until the fourth yes, each coin's published series starts on its first day with two sources (EUR:
  BTC 2015-04-23, ETH 2017-05-23, LINK 2020-07-21, SOL 2021-06-17, from the research of 2026-10-16),
  or later where Coinbase's closes cannot be used; a coin whose EUR pair only Kraken lists has no
  published series. The start dates already come from the dataset (ADR-0052), and the simulator gives
  that first day and its reason, not "the first liquid EUR market" of ADR-0006.
- Coinbase's market-data terms are still unread (Context), and every two-source day before the
  pipeline's first run rests on Coinbase's closes, so session 19 reads them before relying on them; a
  letter they call for joins the owner's list.
- The credit line stands, since Kraken asked for no wording. `DATA-LICENSE.md` names each source's
  period (Bitstamp's from the pipeline's first run only) and says that the values are reference
  closes, neither any exchange's data nor tradable prices. If Kraken allows the days where its close
  is the only one, `DATA-LICENSE.md` lists them as Kraken's own closes and a chart that shows them
  credits Kraken for them, as the owner's reply offers.
- The Decision's Kraken Ticker fallback is not built: the answer does not cover live Kraken prices
  served to users, and the letter did not describe them. Until a separate yes, the last good copy
  stays the fallback.
- Before a paid tier launches, Kraken is written to again, beside Bitstamp's agreement (the Reading of
  2026-11-23), and the reference closes are not used in a paid tier until Kraken has reviewed that
  use, as the owner's reply promises.
- The owner keeps the whole thread, with its headers, outside the repository, although its footer
  asks for it to be deleted: it is the record of the approval.

## Disagreement

None beyond the source change recorded in ADR-0006.
