# tools/data

The private reference-close pipeline (ADR-0036, Reading of 2026-11-27): it reads each exchange's
daily closes, keeps them in a private store and computes the reference closes from them. The store
lives in the private repository dennisfsilva/proof-of-calm-closes, never in this one; ADR-0058
(planned: M2) owns how the pipeline reaches it. Nothing here writes into `packages/data` while its
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

`sources/index.ts` holds the `Source` type, one reader per exchange that takes `fetch`, `sleep` and
`now` from its caller, and `SOURCES`; each reader in `sources/` is `null` until a later branch
builds it.

## Output

Every line a `tools/data` command prints, on stdout and stderr and on every error path, comes from a
closed set holding names, dates, statuses and whole-number counts only: never a close, a price or an
exchange's response. The store's errors name the store-relative file and, when the file system
fails, its error code, and nothing else: "refused: closes/kraken/BTC-EUR.csv is malformed",
"refused: closes/kraken/BTC-EUR.csv cannot be written (ENOTDIR)".

## Daily job

- `tools/data/daily.ts` and `tools/data/daily.md` (planned: M2)

## Backfill

- `tools/data/backfill.ts` and `tools/data/backfill.md` (planned: M2)

## Reference

- `tools/data/report.ts` (planned: M2)
