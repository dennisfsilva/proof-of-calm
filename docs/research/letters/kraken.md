# Letter to Kraken: written confirmation for derived daily closes

Draft of 2026-10-17, revised 2026-11-09 to the catalogue rule (ADR-0052), for the owner to send
before M2 (ADR-0006, ADR-0036). Fill in the bracketed details.
Kraken's terms contain no written market-data licence, so the question is whether the use
below is acceptable as described; the answer is recorded in ADR-0036.

---

**To:** Kraken, legal or market data team (via the support form, asking to route it to legal)
**Subject:** Written confirmation: publishing derived daily closes from Kraken public data

Hello,

I am building Proof of Calm, a planner and log for people who buy crypto assets once a month on a
fixed date. It holds no customer funds, places no orders and connects to no exchange account. It is
run from Portugal, by [owner name].

I would like your written confirmation that the use of Kraken's public market data described below
is acceptable, or to learn which licence or conditions apply.

**The data.** Kraken's bulk OHLCVT downloads, read once, for the EUR and USD pairs of the coins in
our catalogue that Kraken lists; then the previous day's daily candle from the public OHLC endpoint,
read once a day per pair. The catalogue follows a published rule: the largest crypto-assets by market
value, up to about 100, that Kraken, Bitstamp or Coinbase lists, without stablecoins or wrapped and
staked tokens, reviewed every quarter.

**What we do with it.** For each day we compute one reference close: the median of the daily closes
available that day from Kraken, Bitstamp and Coinbase. Only that derived daily figure is published,
in the app's history charts and in an educational simulator of past monthly purchases, and in the
data package of our source repository. Kraken's files, candles, volumes and trades are never
republished, and nothing is presented as Kraken data. A person may also download a CSV of their own
holdings with values at these closes on a few dates (for example on 1 January, or just before a
sale), to keep for their own records or give to their accountant.

**Attribution.** Under every chart that uses the dataset: "Reference closes derived from Kraken,
Bitstamp and Coinbase public data; FX: ECB reference rates." We will use a different wording or add
a link if you prefer.

**Commercial use.** The app is free. A paid tier may follow; the dataset would be used in the same
way in both.

Could you confirm that this is acceptable? If it needs a licence or other conditions, I would be
grateful to know which, and their cost.

Kind regards,
[owner name]
Proof of Calm
[contact email]
