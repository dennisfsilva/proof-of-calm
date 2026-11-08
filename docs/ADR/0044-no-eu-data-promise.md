# ADR-0044: No promise that data stays in the EU

Status: Accepted · Date: 2026-10-17 · Deciders: build session, on the owner's delegation

## Context

`docs/LEGAL.md` §9 left open whether "data stays in the EU" becomes a stated promise; it decides the
wording of the privacy notice and weighed on the mail provider (ADR-0026). The stack as decided
(LEGAL.md §8): Vercel's primary processing is in the US, with functions pinned to Frankfurt and a
global CDN; Supabase's contracting entity is in Singapore, with metadata and support outside the
region; Sentry keeps events in Frankfurt and account metadata in the US. Without an account, the plan
never leaves the device (ADR-0004, ADR-0019).

## Options considered

- Promise it on the current stack: untrue from the first request, with US processing at Vercel and a
  Singapore contracting entity at Supabase.
- Promise it and move hosting, database and monitoring to EU-owned providers: reopens ADR-0005 and the
  M3 decisions for a claim users cannot check, at the cost of the stack the plan stands on.
- Say, for each kind of data, where it is, and promise nothing broader.

## Decision

No promise that data stays in the EU: not in product copy, the landing page, store listings or the
privacy notice. The privacy notice says where each kind of data is: on the device only, without an
account; with an account (M3), in Supabase's Frankfurt region; and it names each processor with its
location and transfer mechanism (LEGAL.md §8). Copy may say where one kind of data is stored when that
is true ("your synced plan is stored in Frankfurt"), never a blanket claim ("data stays in the EU",
"never leaves the EU"); the copy review lists the blanket claim (LEGAL.md §6).

The mail provider stays as ADR-0026 decided: email content stored in the EU remains the better default
for an EU-first product (ADR-0008), without a promise to back.

No proofofcalm.eu: without the promise it signals nothing, and proofofcalm.com is the one address
(`docs/GROWTH.md` §2.6). Defensive registrations are weighed at launch, with the EU trademark
(LEGAL.md §1).

## Consequences

- The strongest true sentence stays available, and it is the better one: without an account, the plan
  never leaves the device.
- Moving to EU-only processors later would make the promise possible; that move gets its own ADR.
