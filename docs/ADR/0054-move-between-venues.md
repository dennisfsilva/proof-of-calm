# ADR-0054: A move between venues is one entry of kind `move`; its coin fee is the units sent less the units received

Status: Accepted; "never from `to`" superseded in part by ADR-0055 for the fee · Date: 2026-11-09 · Deciders: the owner, from session 16's design check of the move (three blind designers, a walk along the app's defaults, an audit of every reason, a reconciler; #10, 2026-11-09)

## Context

People buy at an exchange and send the coins to a wallet of their own. Portugal matches sales per
platform, Germany and the US per wallet (`docs/JURISDICTIONS.md` §7), so where units sit decides
which purchase a sale takes. Until now the Log had no record of a move: a sale its venue could not
cover took the rest from any other venue (`docs/DOMAIN.md` §3.7), Ledger's own units included.

Moving coins also costs coins. The network fee is paid in the coin: 0.05 BTC sent from Kraken arrive
as 0.0498 BTC at Ledger. In the US paying such a fee is a disposal of the fee units
(`docs/JURISDICTIONS.md` §7, the US taxable events); in every country the units held drop by the fee.

The evidence, the decision table and the worked example: `docs/research/move-step-2026-11-09.md`.

## Options considered

1. **Edit the purchase's venue.** No new kind. It cannot split a lot: a purchase moved in part has
   one venue field (`packages/core/src/portfolio/lots.ts`), and the date of the move is lost.
2. **One `move` entry per coin** with the source in `venue`, the units sent in `units` and two keys
   that only a move carries, `to` and `received`. Chosen.
3. **A sale and a purchase in a pair.** The two halves are separate rows that sync apart
   (`packages/app/src/lib/adapters/idb/rows.ts`), the sale is taxed where nothing was sold, and the
   purchase restarts the holding date.
4. **A new store for moves.** The build a rollback returns to cannot open a database with a store it
   does not know (`docs/RELEASE.md`, the rollback item).
5. **Units only, no fee.** Loses the fee the network took, so the units held drift from the wallet's.
6. **Refuse a move when its source is short.** Data logged before the move step often lacks the venue
   of old purchases; a refusal would block the first moves anyone logs.
7. **Date a new move today.** A back-filled move dated today silently re-matches every past sale.
8. **Match same-day entries in typed order.** `createdAt` is arbitrary for back-filled moves.

## Decision

A move between venues is one entry of kind `move`: `venue` is the source (null when none was named),
`units` the units sent, `to` the destination, `received` the units that arrived. Its amount, fee and
slot are null; 0 < `received` ≤ `units`; `to` differs from `venue`. `to` and `received` are optional
keys present only on a move row, never `undefined` on another kind, so the previous build's strict
schema reads every other row this build writes.

Its coin fee is `units − received`. A move takes its units sent from its source by the country's lot
rule, the fee first, which leaves the coin; the rest stays in its lots at a place at `to`, dated the
move. A source that cannot cover the move takes the rest from the other venues, never from `to`.
Invested and the average cost do not change; units, value and P/L drop by the fee units.

On one date purchases come first, then moves, then sales (the matching order of `docs/DOMAIN.md`
§3.7). Every country records moves.

## Consequences

- Entries go to payload v4 and backups to v5, each written only when it holds a move; every other
  entry stays at v2 or v3 and every other file at v2 to v4 (`docs/DOMAIN.md` §2.2, §3.13).
- The reader ships one release before the writer (`docs/RELEASE.md`, Versioning): the release that
  reads moves records none, and the Log step that records one comes in the next release. A build at
  entries v3 leaves a move row unread, counts it as newer and never writes over it.
- A device rolled back while a move or its tombstone is stored shows the newer-version screen, and an
  import there refuses a v5 file (`newer-version`).
- The tax-year files gain columns: `held_at` and `moved_on` in the per-lot file, a fee piece dated on
  the move with no proceeds, `to_venue` and `units_received` in the raw listing, `fee_units` in the
  Dutch file; the log CSV gains `venue`, `to_venue` and `units_received`.
- A move's `to` names places of self-custody: a wallet maker, a hardware device. That is a list of
  who holds coins outside an exchange (ADR-0039, its Context), and adds weight to ADR-0039's open
  question on client-side encryption before M3 sync. M3 decides it; this ADR does not.
- Units per venue on Portfolio, the yearly review's link and suggested venues on a sale are later
  work; fees paid in another coin are out of scope.
