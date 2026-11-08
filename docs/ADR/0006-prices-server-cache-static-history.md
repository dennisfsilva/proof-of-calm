# ADR-0006: Prices through a server-side cache; historical closes bundled as static data

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); source of the history changed by the planning session after research

## Context

The prototype called CoinGecko from the browser, hit rate limits, and showed "prices cannot load" states. The product needs live prices for the Today number and the one-tap estimate, recent charts, and long daily history for the simulator and the portfolio value series, without depending on an API quota at request time and without exposing a key. The owner decided: a thin server-side cache (route handler, key server-side only) and historical daily closes bundled as static data refreshed by a scheduled job.

The research of 2026-10-16 (`docs/research/market-data-competitors.md`, CoinGecko API Terms "Latest Version: 5 Sept 2025", live checks the same day) found:

- Caching live prices server-side for minutes and serving them inside the app is permitted on every CoinGecko plan (§6.1 of the terms allows caching refreshed at least every 24 hours; §4.1.6 allows charging for a product that integrates the API). The Demo plan carries no commercial licence ("a free plan to try out the CoinGecko API"), so it fits the pre-revenue phase only; Basic ($35/month) is needed before a paid tier exists. Attribution ("Powered by CoinGecko" or "Price data by CoinGecko" with a link, at least font size 10) is mandatory next to the data.
- Bundling CoinGecko's daily closes in the repository is **not permitted on any plan**: Demo is limited to 365 days of history (verified live: HTTP 401, error 10012), Basic to 2 years, and §6.2 forbids copying, storing or deriving from the data beyond the 24-hour cache; redistribution is Enterprise-only. Derived weekly or monthly series do not cure this.
- Long history exists from exchanges whose public data can be used: Kraken's official bulk OHLCVT download (EUR pairs: BTC from 2013-09, ETH 2015-08, LINK 2019-09, SOL 2021-06), Bitstamp (BTC/USD from 2011-08-18; the only exchange with a published commercial redistribution route through a signed Data License Agreement), Coinbase Exchange candles for cross-checks; ECB euro reference rates (free with attribution) for USD, GBP and CHF conversion. Kraken's terms contain no written market-data licence (a grey area, mitigated below). CoinCap, CryptoCompare/CoinDesk Data, Binance, Coin Metrics Community, Blockchain.com and Yahoo are excluded by their licences.

## Options considered

1. **CoinGecko for everything, history fetched live** (Analyst plan, $129/month). Quota dependence at request time; still no right to store or ship files.
2. **CoinGecko live + CoinGecko history bundled** (the decision as first phrased). Not permitted.
3. **CoinGecko live (cached server-side) + a "Proof of Calm reference close" dataset built from exchange data** (Kraken bulk as the base, Bitstamp under a DLA, Coinbase as cross-check, ECB rates for FX), published as a derived dataset of our own (median of available exchange closes, daily), never raw exchange files, in a separate package with a `DATA-LICENSE.md`.

## Decision

Option 3. The shape of the original decision stands: one route handler with server-side caching and the key server-side; history served as static, content-hashed files refreshed by a scheduled job. The source of the history changes from CoinGecko to the exchange-derived reference dataset (ADR-0036 for the provider details and ADR-0037 for the jobs):

- `GET /api/prices`: one upstream `/simple/price` call per 10 minutes for the whole coin × currency matrix regardless of user count (≈ 4,300 calls/month, inside Demo's 10,000), `s-maxage=600, stale-while-revalidate`, a "last good" copy served with its timestamp when upstream fails, `x-proof-of-calm-stale: true` and "prices as of HH:MM" in the UI.
- Recent per-coin charts (≤ 365 days) from CoinGecko `market_chart`, cached server-side daily, never persisted beyond the cache.
- Long history and the simulator from `packages/data` (reference closes in EUR, converted to USD/GBP/CHF with ECB rates, conversion stated), start dates shown plainly: BTC 2013-09 (EUR; 2011-08 in USD if the Bitstamp licence is signed), ETH 2015-08, LINK 2019-09, SOL 2021-06.
- Attribution per source, never mixed: "Price data by CoinGecko" under live prices; "Reference closes derived from Kraken, Bitstamp and Coinbase public data; FX: ECB reference rates" under history charts and the simulator.

## Consequences

- The simulator cannot start BTC in 2010, LINK in 2017 or SOL in 2020 as the brief assumed; the simulator says "from the first liquid EUR market" with the date. This fits "honesty is a feature".
- Data costs are not zero once there is a paid tier: CoinGecko Basic $35/month (Analyst $129 only if 10-second freshness or deeper recent history is wanted). Recorded in the cost table of `docs/research/stack-backend-security.md`.
- Two letters go out before M2: to Kraken asking written confirmation that publishing derived daily closes with attribution is acceptable, and to Bitstamp for the Data License Agreement and its price. Until an answer, the dataset is published as derived medians with sources named, which is the lowest-risk form.
- Non-USD CoinGecko quotes are conversions, not traded prices; the UI says "reference price" and the history uses traded EUR closes.
- The nightly refresh job appends yesterday's close from Kraken's public OHLC endpoint (free, no key), validates (monotonic dates, positive prices, no gaps) and commits or opens a PR.
- The core never depends on live prices for plan maths; live prices are decoration and estimates, as the prototype already treated them.

## Disagreement

The planning session kept the decision's shape and changed its source. Shipping CoinGecko history in the repository would breach the API terms on every plan, and a public repository would make the breach visible; the owner's intent (no quota dependence, honest long-run charts) is served better by data we are allowed to publish.
