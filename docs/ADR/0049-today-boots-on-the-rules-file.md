# ADR-0049: Today boots on a generated rules file, not the country profile

Status: Accepted · Date: 2026-11-05 · Deciders: the build session, on the owner's delegation

## Context

The shell cannot render Today before the plan's country's rules arrive (`docs/ARCHITECTURE.md`,
`packages/app/src/lib/services/create.ts`): the `rules` option of Services answers them, and the
browser's services answered with the whole country profile, `loadProfile(code)` mapped through
`countryRules` (`packages/content/src/loaders/countries.ts`). A profile is 1.3 to 4.0 kB brotli of card
text, sources and review status (`packages/content/README.md`), of which the core's `CountryRules` needs
a fraction: Portugal's rules chunk measures 817 bytes brotli as served on 2026-11-05 (the chunk of this
branch's web build, compressed as `node tools/size/today.ts` compresses it; Germany's 533, the generic
432), against 4,766 bytes for Portugal's profile chunk. Today paid for Portugal's card on every cold load and
never showed it.

`node tools/size/today.ts` (`docs/ENGINEERING.md` §4) counts that chunk, the largest profile, in Today's
budget of 46,080 bytes. Main after the country library (#329) measured 46,030 bytes in 12 chunks on
2026-11-05, 50 bytes under. Each country adds about 40 bytes to Today's path through the loaders'
registry (`COUNTRY_CODES`, `FILES`), and M2 adds up to nine countries (`docs/JURISDICTIONS.md` §7).
The second of the three open profile pull requests waited on this decision (#268 §6).

Two components read the profile synchronously through `loadedProfile(code)`, non-null only because
the shell had booted on the full file: the holding conditions' date line
(`packages/app/src/features/learn/components/holding-conditions.tsx`) and Settings' holding-rule card
(`packages/app/src/features/settings/components/use-holding-country.ts`). Whatever the shell boots on,
these two need a load of their own.

## Options considered

1. **A lazily imported map module.** `countries.ts` keeps `loadProfile`; the per-country map moves to a
   module imported on first use, off the counted static graph. The map's bytes move into a chunk Today
   still loads, and Rolldown's glue for one more chunk cost about 430 bytes when #329's Learn chunk split
   the loaders out (46,156 bytes in 13 chunks against 45,729 in 12, #268 §6). The 4 kB card stays on
   Today's path. No gain; not built on this branch.
2. **A shave of the picker helpers on Today's path.** Small, unmeasured, and it leaves the transfer
   that costs the most.
3. **Raising the figure in `docs/ENGINEERING.md` §4.** Owner-only, and it would hide a transfer every
   cold load pays.
4. **A generated rules file per country.** `countryRules(profile)` serialised at development time to
   `packages/content/rules/<code>.json`, one lazy chunk each; the shell boots on it; the profile loads
   only where a card, a source link or the picker shows it.

## Decision

Option 4.

- `packages/content/scripts/rules.ts`, run by `pnpm --filter @proofofcalm/content rules`, writes
  `packages/content/rules/<code>.json` from every `jurisdictions/<code>.json` and deletes a rules file
  whose profile is gone. The files are generated and committed, never edited by hand (`CLAUDE.md`);
  `packages/content/src/loaders/rules.test.ts` fails while one is stale, missing or orphaned, naming the
  command.
- `loadRules(code)` in `packages/content/src/loaders/rules.ts` imports the file dynamically, `null` for
  a code without one; the browser's services boot on it, the generic country's rules standing in.
- `useProfile(code)` in `packages/app/src/lib/services/use-profile.ts` gives a component the profile:
  what a load has already read, at once, else `null` until `loadProfile(code)` resolves, dropping an
  answer for a code that has moved on. The holding conditions and the holding-rule card read it there;
  until it answers, the date line shows in its plain form (`docs/LEGAL.md` §6 question 13).
- `loadedProfile(code)` answers after any load, not at boot.
- The `FILES` and `RULES` maps stay in the entry: about 40 bytes a country, inside the budget.
- `tools/size/today.ts` counts the largest rules file in place of the largest profile; a profile the
  entry reaches statically counts, so a regression shows in the measurement.

## Consequences

- Today's application code on this branch: 42,149 bytes brotli in 12 chunks, `pt.json` the largest of
  3 country rules files, on 2026-11-05; 3,881 bytes under main's 46,030, room for M2's countries.
- A profile change needs the command before the test is green; the test says which.
- The card text and sources load on the Log and the Plan when a date under the country's rule shows,
  and in Settings; a first paint of those screens can show the date line without its Sources link for
  one load. The tests of both components cover the two renders.
- `packages/core/test/golden/*.json` are unchanged: the rules a file holds are `countryRules`' output.

## Disagreement

None.
