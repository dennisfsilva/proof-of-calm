# ADR-0003: The usage loop is reminder → one tap → done

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session

## Context

Nobody opens a planner for fun. The product is used once a month, for under a minute, on the buy day.
Everything else (Portfolio glance, Plan review, Settings) is rare. The prototype already put the one
primary action at the top of Today; it still required typing amounts and units.

## Options considered

1. **A general-purpose log form** opened from a button (the prototype). Four to eight inputs per month.
2. **Automatic logging from exchange APIs.** Removes the tap but adds custody-adjacent risk, API-key
   storage and a security budget the project does not have in v1 (ADR-0007).
3. **One tap with an estimate.** A reminder opens Today on a "Bought as planned" button that creates
   the planned entries with the day's price, editable afterwards; typing exact units stays available.

## Decision

Option 3. The Today page is designed around exactly one primary action (`docs/DOMAIN.md` §3.3–3.4):
coin chips, one button, the portfolio number, the progress strip. Reminders: a calendar file (`.ics`)
with the monthly recurrence in M1, email in M3, push when installed or wrapped. Confirmation happens
on Today (the done block with "Add to it" and the next due date); the user closes the app.

## Consequences

- The one-tap estimate must be honest: units are an estimate from the day's price in the pay
  currency, labelled as such until the user edits them; a missing price falls back to the form.
- The log form keeps the prototype's three-way fill (amount, units, price) and preselects the slot
  nearest to today; the fee defaults to the last fee; numeric keypads on phones.
- Skip, pause and end buying exist so the loop never nags about a month the user has consciously
  handled.
- Every screen is reachable in two taps from Today; every form can be abandoned without losing what
  was typed.
- Metrics, if any (ADR-0028), count completed loops, not time in app.

## Readings recorded by the build session

The decision stands; these are the choices its text left open for the calendar file, made while
implementing it on 2026-10-17 (`packages/app/src/lib/adapters/ics.ts`, RFC 5545).

- **What it holds.** Every open buy day from the next one (`nextBuyReminder`) to the last: one
  monthly series (`BYMONTHDAY` the buy day) whose start is on the buy day, as RFC 5545 needs for a
  well-defined set. The plan's first slot, due on the first buy rather than the buy day, is an event
  of its own. Days already recorded, skipped or paused inside the series are excluded (`EXDATE`), and
  it ends (`UNTIL`) on the last open buy day, which is the last buy unless the plan's end is paused.
  No buy day left: no file.
- **When.** 09:00 floating time, so the calendar shows 09:00 wherever the person is; 15 minutes,
  marked free (a reminder, not an appointment), with a display alarm at the start.
- **Words and identity.** Summary, description and link come in localised from the shell; the link is
  the event's URL and also ends the description, which every calendar shows. UID and DTSTAMP are
  injected; a UID per plan lets a calendar recognise the series when the file is added again.

## Disagreement

None.
