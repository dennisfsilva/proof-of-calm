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

## Disagreement

None beyond the source change recorded in ADR-0006.
