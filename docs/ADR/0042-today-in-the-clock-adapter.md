# ADR-0042: `todayIn` lives in the shell's Clock adapter

Status: Accepted · Date: 2026-10-17 · Deciders: build session · Supersedes: the location of `todayIn` in ADR-0018

## Context

ADR-0018 put `todayIn(instantMs, timeZone)` in the core's date module. The rest of the specification
says the opposite: `docs/DOMAIN.md` §1 ("the core never derives a calendar date from an instant; the
shell does, with the user's IANA timezone, and passes `today` in"), §8 and `docs/ARCHITECTURE.md` ("the
`Clock` port yields `today` from the device clock and the user's timezone"). The core's lint forbids
`Date` there, and `todayIn` depends on the runtime's time-zone database, which differs between browsers
and their versions: it is the environment, not the domain.

## Options

1. Keep `todayIn` in the core as ADR-0018 wrote it, and relax DOMAIN §1.
2. Move it to the shell's Clock adapter, behind the `Clock` port, and keep the core free of time zones.

## Decision

Option 2. `todayIn` lives in `packages/app/src/lib/adapters/clock.ts`, assembled from
`Intl.DateTimeFormat('en-CA', { timeZone }).formatToParts` exactly as ADR-0018 describes, never from a
formatted string; `systemClock(timeZone)` implements the `Clock` port with it. Everything else in
ADR-0018 stands: calendar dates as `YYYY-MM-DD` strings, the integer day arithmetic in the core, the
formatting rule. The core gains `instantFromEpochMs` (integer arithmetic, no `Date`) for the
prototype importer's timestamps.

## Consequences

- The core keeps no clock, no `Date` and no time-zone database; the shell owns time, as ADR-0016 says.
- ADR-0018's tests of `todayIn` (the DST days of 29 March and 25 October 2026 in Lisbon and Berlin,
  the instant either side of midnight in Berlin, São Paulo and Kiritimati, a property against the UTC
  day) run in `packages/app`.

## Disagreement

None.

## Readings recorded by the build session

The decision stands; this is a choice its text left open, made on 2026-10-20
(`packages/app/src/lib/adapters/clock.ts`).

- **`now()` never repeats.** Each clock answers at least 1 ms after its previous answer:
  `max(currentMs(), last + 1)`. A write queued behind the export's read can run in the same
  millisecond, and `backupNeeded` compares `changedAt > lastBackupAt` strictly (`docs/DOMAIN.md`
  §3.11), so equal stamps would hide the banner for a backup that lacks that write. A burst of calls
  runs ahead of the device clock by at most one millisecond per call; `today()` reads the device
  clock as before.
