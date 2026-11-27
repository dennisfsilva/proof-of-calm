# @proofofcalm/data

The "Proof of Calm reference close": a daily price history per coin derived from exchange public data
(Kraken and Bitstamp; Coinbase only with its written consent, ADR-0036), with ECB reference rates
for currency conversion. Decisions: ADR-0006, ADR-0036 (the Reading of 2026-11-27 governs what may be published), ADR-0037.

## What it holds today

The schemas and the publish switch, no data and no licence (`src/index.ts` exports them):

- `src/schema.ts`: the private store's rows (`StoreRowSchema`, `StoreRowsSchema`, `STORE_HEADER`),
  the exchanges and quotes (`ExchangeSchema`, `QuoteSchema`), a reference day (`ReferenceDaySchema`),
  the dataset file (`DatasetSchema`) and the ECB rates file (`FxFileSchema`, the shape only). Dates
  and decimals are the core's `CalendarDateSchema`, `PriceSchema` and `RatioSchema`, so the dataset's
  types are never written twice: this package imports `packages/core` and zod, nothing else
  (`data-imports-nothing` in `packages/config/dependency-cruiser.cjs`).
- `src/publish.ts`: the publish switch `PUBLISH`.

No value lives here yet. Kraken allowed collecting, storing and computing derived figures, and kept
publication for its own review (ADR-0036, Reading of 2026-11-27), so the reference closes stay in a
private store until the answers below; ADR-0006's interim rule of publishing derived medians ended
with that answer (ADR-0006, Readings). Tests use synthetic values only: no Kraken figure and no
exchange's close enters this repository, in code, fixtures, documents or logs.

## The publish switch

`PUBLISH` has four flags, one per question of the owner's reply to Kraken (ADR-0036, Reading of
2026-11-27, questions 1 to 4), and all are `false`:

| Flag | The use that waits for its yes |
|---|---|
| `display` | the reference closes shown to anyone: charts, the simulator, a holding's value over time, the history pages |
| `csv` | a person's CSV of their own holdings valued at the reference closes on a few dates |
| `repository` | the reference closes as a downloadable file in this repository, with `DATA-LICENSE.md` granting reuse (planned: M2) |
| `krakenOnly` | days or coins where Kraken's is the only close, so the reference close is Kraken's own |

A flag changes only by a pull request that cites the answer it rests on, and `src/publish.test.ts`
changes with it. While `repository` is `false`, nothing writes into this package.

## Collected and computed

- Each exchange's daily closes are collected in EUR and in USD where it lists the pair; the reference
  close is computed in EUR only, and USD is converted from it at the ECB rate.
- A reference day takes the closes the pipeline has for that day: on a day with Kraken's and
  Bitstamp's, the mean of the two, never one of them, and it records how many sources it used
  (`sources`). The schema also allows three sources, for the day Coinbase consents in writing
  (ADR-0036's Reading of Coinbase's terms); a day with three closes would take the middle one.

## The private store

Private in fact: never this repository, its Actions logs, artifacts or caches, nor the deployed site
(ADR-0036, Reading of 2026-11-27). Its layout:

- one file per exchange and pair, `closes/<exchange>/<COIN>-<QUOTE>.csv`, for example
  `closes/kraken/BTC-EUR.csv`;
- the header `date,close`, then one row per UTC day: dates ascending and each once, closes plain
  decimal strings above zero, never numbers (ADR-0017);
- a stored close is never overwritten: a revised close from a source leaves the stored row as it is.

## The dataset (planned: M2)

Once the switch allows it: `prices/<COIN>-EUR.json` per coin, `{ coin, currency: 'EUR', days }` with
each day `{ date, close, sources }`; `fx/` with the ECB reference rates; `DATA-LICENSE.md` naming
each source's period and saying the values are reference closes, neither any exchange's data nor
tradable prices. Never raw exchange files.
