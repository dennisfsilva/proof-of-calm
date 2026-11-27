# The daily job

The daily job appends each exchange's daily closes of every pair in `pairs.json`, EUR and USD, to
the private store, `closes/<exchange>/<COIN>-<QUOTE>.csv` (`README.md`, The store). ADR-0036's
Reading of 2026-11-27 covers what it reads and keeps; ADR-0058 covers where it runs and how it
reaches the store; ADR-0037 covers the schedule and the gaps a missed day leaves.

```
node --import ./tools/data/hooks.ts tools/data/daily.ts --store <dir> [--dry] [--today YYYY-MM-DD]
```

`--store` is a folder outside this repository: `guard.ts` refuses one inside it however the path
is written (as it is, through a junction or symlink, or through a loopback share such as
`\\localhost\P$\`), by comparing the device and inode of the store's nearest existing folder and its
ancestors with the repository root's. `--today` names the UTC day the windows count from; without
it the job reads the clock once, at its start.

## Where it runs

Every day at 01:17 UTC, and by a dispatch that takes no inputs, in the private repository
dennisfsilva/proof-of-calm-closes. Its workflow is a byte-for-byte copy of
`tools/data/closes-store.yml`. The job checks out its own repository into `store/` and this
repository's `main` into `app/` with no credential kept, fails at its first step while the two
copies differ (`cmp`), installs the tools package, runs the daily job with `--store ../store`, and
then commits `closes/` as `github-actions[bot]` with the message `data: closes of <UTC date>` when
anything changed. The commit step runs after a failed pair too, so the other pairs' closes are kept.
It keeps no cache and uploads no artifact.

The copy rule: when a merged pull request changes `tools/data/closes-store.yml`, the session copies
it into the private repository the same day, with git from a clone under `P:\dev\sandbox` (ADR-0058,
Decision 2), since the job fails while the two differ and that day's closes become a gap.

## Windows

| Exchange | From | To | Why |
|---|---|---|---|
| Kraken | today minus 720 days | yesterday | every complete day of the endpoint's latest 720 candles, so the first run fills Kraken's last two years and a missed day heals on the next run |
| Bitstamp | yesterday | yesterday | yesterday's close only, with no catch-up (ADR-0036, Reading of 2026-11-23), so its store starts from the job's first run |
| Coinbase | none | none | off until it consents in writing (ADR-0036); no request |

For each exchange in `SOURCES` order (`sources/index.ts`) and each quote, EUR then USD, the job reads
each pair's stored rows, asks the reader for the window, merges with `mergeAppend` and writes the file
only when it gained rows, never under `--dry`. Each exchange's requests go through one pacer for the
whole run (`pace.ts`): one request a second, each with its own 30-second timeout.

## Output

Every line, on stdout and stderr and on every error path, is one of these; nothing it prints is a
close, a price or an exchange's response:

| Line | Stream | When |
|---|---|---|
| `<exchange> <QUOTE>: <n> pairs, <a> added, <r> revised, <f> failed` | stdout | after each exchange and quote; ` (dry: nothing written)` follows under `--dry` |
| `coinbase: off` | stdout | the exchange with no reader |
| `refused: <exchange> <symbol> <status>` | stderr | a reader's refusal (`README.md`, Output), and the pair counts as failed |
| `refused: <exchange> <symbol> unexpected error` | stderr | any other error of a reader, and the pair counts as failed |
| `refused: closes/<exchange>/<COIN>-<QUOTE>.csv <reason>` | stderr | a store file that is malformed or cannot be read or written: the run stops |
| `daily refused: usage` | stderr | a missing `--store`, an unknown flag or argument, a `--today` that is not a date |
| `daily refused: --store is inside this repository` | stderr | the guard's refusal, before any request |
| `daily refused: --store is not a folder` | stderr | before any request |
| `daily refused: unexpected error` | stderr | anything else, a module that fails to load and an uncaught error among them |

The exit code is 0 when every pair was read and nothing was refused, and 1 otherwise.

## The dry run

`.github/workflows/data-dry.yml` is a branch's evidence for a change to `tools/data` (ADR-0058,
Decision 4): on a push to a branch other than `main` that changes `tools/data/**` or the workflow
itself, and by dispatch, it runs the job with `--dry` into a folder under the runner's temporary
folder, with `contents: read`, no secret, no cache and no artifact. Its log holds only lines of the
table above from the job. A workflow that is not on `main` cannot be dispatched, so a
branch proves itself by its push run, named by its run id in the pull request.
