# Letter to Bitstamp: the Data License Agreement

Draft of 2026-10-17 for the owner to send before M2 (ADR-0006, ADR-0036). Fill in the bracketed
details. Bitstamp states that it "allows the incorporation and redistribution of our exchange data for
commercial purposes" through a signed Data License Agreement; this asks for it and its price. The
answer is recorded in ADR-0036. With the licence signed, bitcoin history in USD starts in August 2011.

---

**To:** Bitstamp, market data or business development team
**Subject:** Request for your Data License Agreement: derived daily closes

Hello,

I am building Proof of Calm, a planner and log for people who buy crypto assets once a month on a
fixed date. It holds no customer funds, places no orders and connects to no exchange account. It is
run from Portugal, by [owner name].

Your website says that Bitstamp allows the incorporation and redistribution of its exchange data for
commercial purposes under a signed Data License Agreement. I would like to request that agreement.

**The data.** Daily OHLC for BTC/USD from 18 August 2011, BTC/EUR, ETH/USD and ETH/EUR, and, where
listed, SOL and LINK against USD and EUR: the history once, then the previous day's daily candle from
your public API, once a day per pair.

**What we do with it.** For each day we compute one reference close: the median of the daily closes
available that day from Bitstamp, Kraken and Coinbase. Only that derived daily figure is published, in
the app's history charts and in an educational simulator of past monthly purchases, and in the data
package of our source repository. Raw candles, volumes and trades are never republished.

**Attribution.** Under every chart that uses the dataset: "Reference closes derived from Kraken,
Bitstamp and Coinbase public data; FX: ECB reference rates." We will follow the wording the agreement
asks for.

**Commercial use.** The app is free. A paid tier may follow; the data would be used in the same way in
both.

Could you send the agreement and its price for this use? It would also help to know whether
publishing derived daily closes, as described, needs the agreement at all.

Kind regards,
[owner name]
Proof of Calm
[contact email]
