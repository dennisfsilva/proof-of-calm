# Letter to Coinbase's market data address: consent for derived daily closes

Drafted on 2026-11-27 and not sent: it waits for the owner to send it from the owner's address to
marketdata@coinbase.com, the only address Coinbase's Market Data Terms of Use give
(https://www.coinbase.com/legal/market_data, "Last updated: August 7, 2026", read on 2026-11-27).
Those terms forbid, "Absent prior express written consent from Coinbase", showing Coinbase market
data or anything derived from it to third parties and creating "fixings", "generic or fair value
prices" or "valuations" from it, so the letter asks for that consent use by use. The reading is
ADR-0036's Reading of 2026-11-27 on Coinbase's terms, where the answer is recorded. Until the
answer, the pipeline reads no Coinbase data.

---

**To:** marketdata@coinbase.com
**Subject:** Written consent under the Market Data Terms: derived daily closes in a free app

Hello,

Your Market Data Terms of Use name this address for questions about Market Data. I am asking for
the written consent the terms require before the uses below, or for the licence and conditions that
would cover them, and their cost.

I am building Proof of Calm, a planner and log for people who buy crypto assets once a month on a
fixed date. People log their own purchases, by hand or from their own exchange's export file. It
holds no funds, places no orders, connects to no exchange account and asks for no API keys. It is
run from Portugal, has not launched yet, and will be free; a paid tier may follow.

**The data.** Spot only, from the Coinbase Exchange public REST candles endpoint at daily
granularity: the past daily candles of the EUR and USD pairs of the coins in our catalogue, read
once, then the previous day's candle, read once a day per pair, at most one request a second. No
WebSocket feeds, no private endpoints, no order book or trade data. The catalogue follows a
published rule: the largest crypto-assets by market value, up to about 100, that Kraken, Bitstamp or
Coinbase lists, without stablecoins or wrapped and staked tokens, reviewed every quarter.

**What we would do with it.** For each day we compute one reference close: the median of the daily
closes available that day from Kraken, Bitstamp and Coinbase. We keep each exchange's daily close in
a private store and never republish candles, volumes or trades. The uses we ask about, each of which
we would start only with your consent:

1. Keeping Coinbase's daily closes in the private store and computing the reference close from them.
2. Showing the reference close in the app's history charts, in an educational simulator of past
   monthly purchases, and as the value of a person's own holdings over time.
3. A CSV a person downloads of their own holdings valued at the reference close on a few dates, for
   their own records or their accountant.
4. The reference closes as a file in the data package of our public source repository, for
   non-commercial reuse that grants no right in any exchange's data.
5. A few dated figures in the app's lessons, computed from Coinbase Exchange daily candles, with
   Coinbase Exchange named as their source: past drawdowns of ETH, SOL and LINK from their highs,
   and the results of past monthly purchases of ETH.

Nothing is presented as Coinbase data, used as a benchmark for any financial product or contract,
or used to train or improve any AI model.

**Attribution.** Under every chart that uses the dataset: "Reference closes derived from Kraken,
Bitstamp and Coinbase public data; FX: ECB reference rates." We will use a different wording, or
leave your name out, if you prefer.

Could you tell me which of these uses you allow, on what conditions and at what cost? Consent for
non-commercial use, for as long as the app is free, would already let us start, and we would come
back to you before any paid tier launches.

Kind regards,
[owner name]
Proof of Calm
