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
`\\localhost\P$\`) and whichever checkout the job runs from, by comparing the device and inode of the
store's nearest existing folder and its ancestors with those of every working tree of the repository:
the checkout, the main working tree and each linked worktree, read from git's records under `.git`
(a listed worktree whose folder is gone is skipped; a checkout without readable records refuses). `--today` names the UTC day the windows count from; without
it the job reads the clock once, at its start, for the windows. The readers read the real clock only
to bound a window: Kraken's drops the running candle, and Bitstamp's refuses a window whose day is not
yesterday, or the day before yesterday in the first 8 minutes after 00:00 UTC (Windows). So a
`--today` in the past fails every Bitstamp pair, except a `--today` of yesterday in those 8 minutes.

## Where it runs

Every day at 01:17 UTC, and by a dispatch that takes no inputs, in the private repository
dennisfsilva/proof-of-calm-closes. Its workflow is a byte-for-byte copy of
`tools/data/closes-store.yml`. The job checks out its own repository into `store/` and this
repository's `main` into `app/` with no credential kept, fails at its first step while the two
copies differ (`cmp`), installs the tools package, runs the daily job with `--store ../store`, and
then commits the store's files, `closes/<exchange>/*.csv` and never the `.tmp` file a killed write
leaves (`store.ts`), as `github-actions[bot]`, in one commit per exchange that changed, Bitstamp's
first with the message `data: bitstamp closes of <UTC date>`, then Kraken's (`data: kraken closes of
<UTC date>`). An exchange with no such file, tracked or new (a fresh store, or a first run in which
every one of its pairs failed), gets no commit and does not stop the other exchange's. The daily step has its own 8-minute timeout inside the job's 15: a step timeout
fails that step without cancelling the job (GitHub's runner marks the step failed), so the commit
step, which runs unless the run was cancelled, keeps what a slow or failed run wrote. The commit step
runs after a failed pair too, so the other pairs' closes are kept. A push to the private repository
after the job's checkout (a backfill, `backfill.md`, or the copy of a changed workflow) makes the job's
push rejected; the commit step then pulls with rebase and pushes again, up to 3 times 10 seconds
apart, and fails after the last try, so the run is red for the owner and the day's closes, committed
only on the runner, are not lost unseen. A rebase that conflicts only on files under `closes/kraken/`
(a backfill that wrote the same Kraken day) skips Kraken's commit, whose day the next run's 720-day
window reads again, and goes on pushing, so Bitstamp's day, which cannot be read again (ADR-0036's
Reading of 2026-11-23), reaches the store; the step still fails at the end, so the owner sees that a
Kraken day was dropped. A conflict on any other file aborts the rebase and fails the step at once;
nothing with a conflict marker is ever committed. It keeps
no cache and uploads no artifact.

The copy rule: when a merged pull request changes `tools/data/closes-store.yml`, the session copies
it into the private repository the same day, with git from a clone under `P:\dev\sandbox` (ADR-0058,
Decision 2), since the job fails while the two differ and that day's closes become a gap.

## Windows

| Exchange | From | To | Why |
|---|---|---|---|
| Kraken | today minus 720 days | yesterday | every complete day of the endpoint's latest 720 candles, so the first run fills Kraken's last two years and a missed day heals on the next run |
| Bitstamp | yesterday | yesterday | yesterday's close only, with no catch-up (ADR-0036, Reading of 2026-11-23), so its store starts from the day before the job's first run, and nothing older is read (ADR-0036, Reading of 2026-11-27 on Bitstamp's first run); the reader reads the window's day only when the real clock puts it at yesterday, or at the day before yesterday while that clock is less than the daily step's 8-minute timeout past 00:00 UTC (`MIDNIGHT_ALLOWANCE_MINUTES` in `sources/bitstamp.ts`, pinned to the step by `workflow.test.ts`), the longest a step started before midnight can still be reading, and refuses any other window as a failure |
| Coinbase | none | none | off until it consents in writing (ADR-0036); no request |

The exchanges run in a fixed order, `ORDER` in `daily.ts`: Bitstamp first, since its day cannot be
read again, then Kraken, whose window heals a missed day, then Coinbase (off). For each exchange and
each quote, EUR then USD, the job reads each pair's stored rows, asks the reader for the window,
merges with `mergeAppend` and writes the file only when it gained rows, never under `--dry`. A store
file the job cannot use (malformed, say with a merge-conflict marker, or one that cannot be read or
written) fails that pair only: its refusal is printed, the pair counts as failed, unread when the read
failed, and the run goes on with the next pair and the next exchange, so one bad file never costs a
later pair's day, Bitstamp's above all. Any other error stops the run. Each
exchange's requests go through one pacer for the whole run (`pace.ts`): one request a second, each
with its own 30-second timeout; a try that times out is not retried (the pacer retries only a
rate-limited answer). Whether 3 pairs in a row refused as `unreachable` stop an exchange is `HEALS`
in `daily.ts`, beside the windows. Kraken heals: after its third, across both quotes, the job stops
it, its remaining pairs count as failed, unread, so an outage costs about 90 seconds instead of one
timeout per pair, and the missed day returns with the next run's window. Bitstamp does not: its day
cannot be read again, so each unreachable pair fails on its own and its remaining pairs are still
read, and a short network blip costs only the pairs it hit.

The worst case is a whole-day Bitstamp outage. A timed-out try takes its 30 seconds and the next
slot has already passed, so each pair costs about 30 seconds, and Bitstamp's 50 pairs (25 coins, EUR
and USD) take about 50 × 30 s = 25 minutes, more than the step's 8. The step then times out about
16 pairs in, before Kraken runs; the commit step still commits the files already finished, and
Kraken's missed day returns with the next run's 720-day window. A partial outage costs 30 seconds
for each unreachable pair instead of about one: with Kraken's 52 pairs, 13 unreachable Bitstamp
pairs still fit (13 × 30 s + 89 × 1 s ≈ 8 minutes); more cut Kraken short, and its day heals. The step and job timeouts stay at 8 and 15 minutes: a longer step would
only let a down Bitstamp finish failing before Kraken, whose day heals anyway, and it would widen
Bitstamp's midnight allowance, which is the step's timeout.

## Output

Every line, on stdout and stderr and on every error path, is one of these; nothing it prints is a
close, a price or an exchange's response:

| Line | Stream | When |
|---|---|---|
| `<exchange> <QUOTE>: <n> pairs, <a> added, <r> revised, <f> failed` | stdout | after each exchange and quote; ` (dry: nothing written)` follows under `--dry` |
| `coinbase: off` | stdout | the exchange with no reader |
| `refused: <exchange> <symbol> <status>` | stderr | a reader's refusal (`README.md`, Output), and the pair counts as failed |
| `refused: <exchange> <symbol> unexpected error` | stderr | any other error of a reader, and the pair counts as failed |
| `kraken: stopped after 3 unreachable` | stderr | after Kraken's third pair in a row refused as `unreachable`: its remaining pairs count as failed, unread; Bitstamp never stops |
| `refused: closes/<exchange>/<COIN>-<QUOTE>.csv <reason>` | stderr | a store file that is malformed or cannot be read or written: the pair counts as failed and the run goes on |
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
