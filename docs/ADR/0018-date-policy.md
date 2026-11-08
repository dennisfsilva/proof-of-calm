# ADR-0018: One date policy

Status: Accepted; the location of `todayIn` superseded by ADR-0042 · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §11)

## Context

The prototype used `Date` objects in local time throughout and `new Date()` inside the maths; month arithmetic went through `new Date(y, m + i, day)` with clamping; "today" depended on the device clock at render time. Proof of Calm needs deterministic calendar maths (slots, holding periods counted in days or calendar years, tax years), a `today` that is passed in, and formatting per country. Native Temporal is not shippable: Chrome 144+ and Firefox 139+ have it, Safari has no released version through 27.2; the polyfill is 19 kB gzip. date-fns 4 with `@date-fns/tz` works but introduces `Date` instances into the domain.

## Decision

- **Calendar dates are `YYYY-MM-DD` strings** (branded `CalendarDate`) in the user's local calendar; **month keys are `YYYY-MM`**; **instants are ISO 8601 strings with offset** and appear only at the shell boundary (storage timestamps, sync, reminders).
- **One in-house module** `packages/core/dates` (about eighty lines, no dependency, no `Date` in the domain): `todayIn(instantMs, timeZone)` assembled from `Intl.DateTimeFormat('en-CA', { timeZone }).formatToParts`, never from a formatted string; `addDays`; `addMonthsClamped(date, n, anchorDay)` where the anchor day (the plan's buy day) is kept so that 31 January → 28 February → 31 March; `addYearsClamped`; `daysBetween` through epoch-day arithmetic with `Date.UTC` (DST-free); `compare` as string comparison; `isLeapYear`, `daysInMonth`, `weekday`, `startOfMonth`, `monthKey`.
- **The shell derives `today` once per render tick** from the device clock and the user's IANA timezone through the `Clock` port; the core never reads the clock.
- **Holding periods**: `days` rules count calendar days from the purchase date inclusive of the threshold (Portugal: eligible when `daysBetween >= 365`); `years` rules are eligible the day after the anniversary (`addDays(addYearsClamped(date, n), 1)`), which matches Germany's "more than one year" and the US long-term rule; 29 February anniversaries clamp to 28 February.
- **Output** goes through `Intl.DateTimeFormat(formattingLocale, { timeZone: 'UTC', … }).format(Date.UTC(y, m - 1, d))` so the rendered day never shifts with the device zone; the formatting locale comes from the country profile (ADR-0023).
- **Inputs**: `<input type="date">` values are already `YYYY-MM-DD`; never pass them through `new Date(value)`.
- date-fns 4.4.0 is allowed as a dev dependency only, as an oracle in property tests.

## Consequences

Tests (fixed vectors and fast-check): month ends (31 → 30/28/29 and back to 31 in the next long month); leap years (2024-02-29 + 1 year = 2025-02-28; 2028 is a leap year; 2100 is not; 2000 is); 29 February anniversaries in days and in years; DST transition days in `Europe/Lisbon` and `Europe/Berlin` (today derived from instants at 00:30 and 23:30 local); UTC-offset boundaries around midnight (2026-10-16T23:30Z is 2026-10-17 in `Europe/Berlin` and 2026-10-16 in `America/Sao_Paulo`); `daysBetween` symmetric and additive; `addMonthsClamped` keeps the anchor; sorting by string equals sorting by epoch day; formatting round-trips for en, pt-PT and de; the slot generator's 240-month cap.

## Disagreement

None.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Decision, second bullet: "`daysBetween` through epoch-day arithmetic with `Date.UTC`
  (DST-free)".** `daysBetween` subtracts epoch days computed with integer arithmetic (Howard
  Hinnant's `days_from_civil`) and builds no `Date`, which Biome denies in `packages/core/src`
  (`packages/core/src/dates/calendar.ts`, `biome.json`). A calendar date has no time, so DST cannot
  affect it; ADR-0042 calls this the integer day arithmetic in the core.

## Corrections recorded on 2026-10-20

- **Decision, fifth bullet: "the formatting locale comes from the country profile (ADR-0023)".**
  Dates in copy format in the UI locale and carry the month's name, so no date reads two ways across
  countries in one language (ADR-0023, corrections recorded on 2026-10-20). The
  `Intl.DateTimeFormat` call with `timeZone: 'UTC'` on `Date.UTC(y, m - 1, d)` stands. Numbers and
  clock times stay in the formatting locale of the country profile; the date options are
  `dateOptions` in `packages/app/src/lib/format/time.ts`.

## Corrections recorded on 2026-10-29

- **Decision, first bullet: "about eighty lines, no dependency" and "`compare` as string
  comparison".** The module is `packages/core/src/dates/calendar.ts`, about 250 lines with its
  `zod/mini` schemas for calendar dates, month keys and instants. The comparison is
  `compareDates`. It still builds no `Date`.
