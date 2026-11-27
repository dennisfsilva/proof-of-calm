# tools/data

The private reference-close pipeline (ADR-0036, Reading of 2026-11-27): it reads each exchange's
daily closes, keeps them in a private store and computes the reference closes from them. The store
lives in the private repository dennisfsilva/proof-of-calm-closes, never in this one; ADR-0058
owns how the pipeline reaches it. Nothing here writes into `packages/data` while its
publish switch is off (`packages/data/README.md`), and no exchange's close enters this repository:
the tests use synthetic values.

## Running

A `tools/data` entry runs under plain Node with the resolve hook loaded first, from the repository
root: `node --import ./tools/data/hooks.ts tools/data/<entry>.ts`. `packages/core` and
`packages/data` import their own files without an extension (`./constants`), which Node's type
stripping does not resolve; `hooks.ts` maps such a specifier, from an importer under `packages/` or
`tools/data/`, to its `.ts` file or a folder's `index.ts` when that file exists there, and leaves
every other specifier to Node. It uses Node's `module.registerHooks` (synchronous, in-thread,
release candidate since Node 24.13.1), so no dependency is added. `hooks.test.ts` runs
`hooks.fixture.ts` through it.

## The store

`store.ts` reads and writes one CSV per exchange and pair under the store's folder,
`closes/<exchange>/<COIN>-<QUOTE>.csv`: the header `date,close`, then one row per UTC day, dates
ascending and each once, closes plain decimal strings above zero. A file is checked by
`StoreRowsSchema` (`packages/data/src/schema.ts`) when it is read and before it is written; a pair
with no file starts empty, and a write goes through a temporary file renamed over the old one.

The merge rule (`mergeAppend`): a new date is added; a new row for a stored date with another close
is a revision, so the stored close stays and the revision is only counted; the same close written
another way (`1.5` and `1.50`) is neither. The counts of added and revised rows are what a run
reports.

## The pairs

`pairs.json` names, per coin of `packages/content/coins.json`, each exchange's symbol of its EUR and
USD spot pairs, one line per coin (Biome wraps the one that passes 120 characters); `pairs.ts` loads
it through a zod schema. Read on 2026-11-27 from the exchanges' public listings, which hold no
prices:

| Exchange | Listing | Symbol | Pairs |
|---|---|---|---|
| Kraken | `https://api.kraken.com/0/public/AssetPairs` | `altname` (`XBTEUR`) | EUR and USD for all 26 coins, status online |
| Bitstamp | `https://www.bitstamp.net/api/v2/trading-pairs-info/` | `url_symbol` (`btceur`) | EUR and USD for 25 coins, none for TON, trading enabled |
| Coinbase | none | none | none |

Coinbase stays off until it consents in writing (ADR-0036, the Reading of Coinbase's terms): no
agent reads its endpoints, `pairs.json` has no Coinbase entry, and its reader stays `null`.

`sources/source.ts` holds the `Source` type of a reader that takes `fetch`, `sleep`, `now` and
`timeout` from its caller, and `sources/index.ts` holds `SOURCES`, one reader per exchange. Each reader sends a plain GET with no header of its own:

| Reader | Endpoint | What it returns |
|---|---|---|
| `sources/kraken.ts` | `https://api.kraken.com/0/public/OHLC`, `interval=1440`, `since` the day before `from` | every complete day from `from` to `to` among the endpoint's latest 720 candles, the last (running) candle dropped and nothing dated today (UTC) |
| `sources/bitstamp.ts` | `https://www.bitstamp.net/api/v2/ohlc/<url_symbol>/`, `step=86400`, `limit=1`, `start` yesterday, `exclude_current_candle=true` | yesterday's close (UTC) only, when yesterday lies from `from` to `to`, with no catch-up (ADR-0036, Reading of 2026-11-23) |

A close is kept as the exact decimal string the exchange sent; exponent notation is converted by
moving its digits, and a JSON number, which has already become a float, is refused. `pace.ts` wraps
one exchange's io for a whole run: at least `minMs` between two requests (1,000 ms: Kraken asks for
one a second per address), and on HTTP 429 or Kraken's `EAPI:Rate limit exceeded` it waits 2, 4 and
8 times `minMs` before the next try, giving up with `RateLimited` after the fourth. Each try carries
its own 30-second timeout (`REQUEST_TIMEOUT_MS`), made from the io's `timeout` when the try is sent,
so waiting for a slot or backing off never counts against it. The readers set no timeout of their
own, so every source's io goes through `pace()`, and the real io's `timeout` is `AbortSignal.timeout`.

## Output

Every line a `tools/data` command prints, on stdout and stderr and on every error path, comes from a
closed set holding names, dates, statuses and whole-number counts only: never a close, a price or an
exchange's response. The store's errors name the store-relative file and, when the file system
fails, its error code, and nothing else: "refused: closes/kraken/BTC-EUR.csv is malformed",
"refused: closes/kraken/BTC-EUR.csv cannot be written (ENOTDIR)". A reader throws an `Error` whose
message is printable as it is, with no cause attached: "refused: kraken XBTEUR <status>", the status
one of `rate limited`, `unreachable`, `http <code>`, `error` (the exchange answered an error) or
`malformed` (a body that is not JSON, has another shape or holds a bad candle), and "refused: kraken
unknown pair" for a symbol outside the listings' shape, sent before any request.

## Daily job

- `tools/data/daily.ts` and `tools/data/daily.md` (planned: M2)

## Backfill

- `tools/data/backfill.ts` and `tools/data/backfill.md` (planned: M2)

## Reference

- `tools/data/report.ts` (planned: M2)
