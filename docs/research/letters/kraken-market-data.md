# Letter to Kraken's market data address: the same request, resent

Sent by the owner on 2026-11-26 to marketdata@kraken.com, the address Kraken's API documentation
names for market data licensing (https://docs.kraken.com/home/support/index, read on 2026-11-26).
It is the letter of 2026-11-09 (`docs/research/letters/kraken.md`), which went through Kraken
Institutional's contact form and had no answer after 17 days, updated with what the address asks
for: the app, the endpoints and how it is paid for. The answer is recorded in ADR-0036 (its Reading
of 2026-11-27).

The address first sent an automatic reply with three questions to answer before it passed the
request to Kraken's business development team: the company, why a partnership would work, and the
country. The owner answered the same day:

- Proof of Calm, not launched yet, an independent project the owner runs (there is no company; the
  legal form is chosen before charging, `docs/LEGAL.md` §7);
- a free planner and log for people who buy once a month and hold, which reads Kraken's Ledgers
  export. The owner asked for a market data licence to publish a derived daily reference close
  computed in part from Kraken's public spot data, with Kraken named under every chart that uses it;
- Portugal.

Kraken's support answered for its Market Data Team a few minutes later.

---

**To:** marketdata@kraken.com
**Subject:** Market data licensing: publishing derived daily closes from Kraken public data

Hello,

Your API documentation names this address for market data licensing. I first sent this request on
9 November 2026 through Kraken Institutional's contact form and have had no answer, so I am sending
it here.

I am building Proof of Calm, a planner and log for people who buy crypto assets once a month on a
fixed date. People log their own purchases, by hand or from their own exchange's export file
(Kraken's Ledgers export among them). It holds no funds, places no orders, connects to no exchange
account and asks for no API keys. It is run from Portugal, has not launched yet, and will be free; a
paid tier may follow.

**The data.** Spot only: Kraken's bulk OHLCVT downloads, read once, for the EUR and USD pairs of the
coins in our catalogue that Kraken lists; then the previous day's daily candle from the public REST
OHLC endpoint, read once a day per pair. No Futures data, no WebSocket feeds and no private endpoints.
The catalogue follows a published rule: the largest crypto-assets by market value, up to about 100,
that Kraken, Bitstamp or Coinbase lists, without stablecoins or wrapped and staked tokens, reviewed
every quarter.

**What we do with it.** For each day we compute one reference close: the median of the daily closes
available that day from Kraken, Bitstamp and Coinbase. Only that derived daily figure is published:
in the app's history charts, in an educational simulator of past monthly purchases, and in the data
package of our public source repository. A person may also download a CSV of their own holdings
valued at these closes on a few dates, for their own records or their accountant. Kraken's files,
candles, volumes and trades are never republished, and nothing is presented as Kraken data.

**Attribution.** Under every chart that uses the dataset: "Reference closes derived from Kraken,
Bitstamp and Coinbase public data; FX: ECB reference rates." We will use a different wording or add
a link if you prefer.

Could you confirm that this use is acceptable, or tell me which licence or conditions apply, and
their cost? Permission for non-commercial use, for as long as the app is free, would already let us
start, and we would come back to you before any paid tier launches.

Kind regards,
[owner name]
Proof of Calm
