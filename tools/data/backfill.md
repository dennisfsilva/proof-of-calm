# The backfill

The backfill fills the private store's Kraken closes, `closes/kraken/<COIN>-<QUOTE>.csv` (`README.md`,
The store), from Kraken's downloadable OHLCVT archive: every Kraken pair of `pairs.json`, EUR and USD,
from its first trade on. ADR-0036's Reading of 2026-11-27 covers reading the archive and keeping the
daily closes in a private store; it forbids any Kraken figure in this repository.

It runs by hand on the session's machine, never in CI, and never writes into this repository: the
store directory is a clone of the private repository dennisfsilva/proof-of-calm-closes kept in a
folder outside this one, and `backfill.ts` refuses a `--store` inside this repository through
`guard.ts`, the daily job's guard, which compares identities rather than path strings against every
working tree of the repository, so a path through a link or a loopback share, or into the main
checkout or a linked worktree, is refused too (the opening of `daily.md` says how). The archive and
its extracted files stay outside this repository too, and are deleted when the run is done: the store
keeps the daily closes only, and the archive is downloaded again when it is needed.

## Fetch and verify the archive

1. Read Kraken's support article 360047124832 (the downloadable OHLCVT data; last updated 2026-11-02)
   for the current links. The full archive comes as five part files of about 2 GB each from
   assets.kraken.com, covering each pair from its first trade to 2026-06-30; the quarterly updates
   (2026Q1 to 2026Q3) are one ZIP each.
2. Join the part files, in their order, into one ZIP (on Windows `copy /b` with the parts joined by
   `+`; elsewhere `cat` of the parts into one file).
3. Compare the joined ZIP's SHA-256 (`Get-FileHash -Algorithm SHA256` or `sha256sum`) with the one the
   article publishes; a different digest means a damaged or partial download, so fetch the parts
   again.

## Extract the daily files

The daily files are `<ALTNAME>_1440.csv` at the archive's root, ALTNAME being the pair's Kraken
symbol in `pairs.json` (`XBTEUR`). Extract only those of the pairs in `pairs.json`, with any tool (the
article's own steps or Python's `zipfile` both work), into a fresh folder per archive: one for the
full archive and one per quarterly update.

`kraken-bulk.ts` reads each file line by line: no header, seven comma-separated columns (unix seconds
of the day's 00:00 UTC, open, high, low, close, volume, trades), a day without trades left out, so a
file has gaps, which stay gaps. Only the close is kept, as a plain decimal string; a close in exponent
notation (`1.2e-05`, as PEPE's are) is written out digit by digit, never through a number. One
malformed row fails its file as a whole, and that file adds nothing; the reason words are `fields`
(not seven columns), `timestamp` (not whole seconds at 00:00 UTC), `close` (not a decimal above
zero), `order` (a day out of order or twice) and `unreadable` (the file cannot be read).

## Run it

From the repository root, the full archive first and each quarterly update after it:

`node --import ./tools/data/hooks.ts tools/data/backfill.ts --source kraken-bulk --dir <full> --dir <2026Q3> --store <clone> [--dry]`

- Each pair's rows merge into its store file through `mergeAppend` (`README.md`, The store): a new day
  is added, a stored day keeps its close and a different one is only counted as revised. Across the
  `--dir` folders the first close of a day wins, so the full archive comes first.
- `--dry` reads and counts and writes nothing.
- A later run with a new quarterly update adds its days; a run that adds nothing writes nothing.
- The exit code is 1 when a file failed or the run was refused, 0 otherwise; a missing file does not
  fail the run, since a quarterly update can lack a pair without trades.

Then commit and push the store's clone, which belongs to the private repository.

## Output

Every line, on stdout and stderr and on every error path, comes from this closed set (`README.md`,
Output); none holds a close:

- `kraken-bulk missing: BTC-EUR (XBTEUR) in --dir 2`: the pair has no daily file in that folder.
- `kraken-bulk failed: BTC-EUR (XBTEUR) in --dir 1: close`: the file failed, with its reason word.
- `kraken-bulk EUR: 26 pairs, <n> added, <n> revised, <n> failed, <n> missing`: one per quote; `missing`
  and `failed` count files, and a `--dry` run adds "(dry: nothing written)".
- `kraken-bulk refused:` followed by the usage, `--store is inside this repository`, `--store is not a
  folder`, `--dir 1 is not a folder`, the store's own refusal naming the store file, or
  `unexpected error` for anything else.
