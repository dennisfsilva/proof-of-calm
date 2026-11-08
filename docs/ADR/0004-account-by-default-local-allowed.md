# ADR-0004: Account by default, local allowed

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session

## Context

Browser storage is not durable for a monthly-use tool: iOS Safari evicts a site's script-writable
storage after seven days without interaction unless the site is installed to the home screen, and
people clear browsers, change phones and lose data. The prototype relied on `localStorage` and a
manual JSON backup. At the same time, the product promise is custody-free and minimal: no profile,
no password, nothing collected that the plan does not need.

## Options considered

1. **Local only, with export/import.** Simplest and most private; loses data for a predictable share
   of users; no reminders by email; no multi-device.
2. **Account required.** Durable; a wall before the first value; contradicts "usable without one".
3. **Account by default, local allowed.** The email is asked for at the end of onboarding as "Where
   should we send the monthly reminder?", not as "Create an account". Sign-in is a one-time email code
   or magic link, or a passkey; no password, no profile. The account stores one thing: the plan and its
   log. "Try without an account" works fully on IndexedDB with export/import; once entries exist, a
   quiet persistent line asks for an email to keep the data.

## Decision

Option 3. The sync schema is designed so plans can be encrypted client-side before upload in a later
version (ADR-0030); the owner's data migrates from the prototype's `dcaplan.v1` shape through an
importer (`docs/DOMAIN.md` §7). Auth mechanics are ADR-0035; sync is ADR-0021.

## Consequences

- M1 ships local-only with the durability line and the calendar reminder, because accounts need the
  M3 infrastructure; the onboarding reminder step in M1 offers "Add to calendar" and "Later", and the
  email option appears in M3 without changing the flow's shape.
- `navigator.storage.persist()` is requested after the first entry; installation to the home screen is
  explained as the way to keep data on iOS without an account.
- The quiet line is one sentence, never a modal, never stacked with other banners (banner priority in
  `docs/DOMAIN.md` §3.11), and disappears once an account exists or the user dismisses it for 90 days.
- Account deletion and server-side export exist from the first day accounts exist.
- Supabase in an EU region holds the account data; the privacy notice lists it (`docs/LEGAL.md`).

## Disagreement

None. The session adds one refinement: the local-only mode must be a first-class path with its own
tests (offline, export, import, persistence request), not a degraded fallback.

## Readings

- 2026-10-27: M1's local durability line has no dismiss and gives way to the Backup needed
  banner, so exactly one of the two shows once entries exist; the 90-day dismiss belongs to the
  account-era line (M3).
