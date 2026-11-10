# ADR-0055: A move's fee that nothing outside its destination covers comes from the destination

Status: Accepted · Date: 2026-11-10 · Deciders: the owner, from the design check of stored moves left uncovered (three blind designers, a walk judge over nine personas, an audit judge of every reason; #92, 2026-11-10) · Supersedes in part ADR-0054 ("never from `to`", for the fee)

## Context

ADR-0054 takes a move's units sent from its source, then from the other venues, "never from `to`".
A move can be left short outside its destination after it is saved: a purchase's venue edited to the
move's `to`, a venue renamed, a new move dated before a stored one on the same route, data imported
short. The core then counted the move's fee as units with no purchase: Portfolio said units were
"sold without a purchase", the per-lot file wrote a fee row with no acquired date, and its year end
fell below Portfolio's units by the fee. The units were there, at the destination.

The move step's research decided that no write is refused for a venue reason
(`docs/research/move-step-2026-11-09.md` §2, Q10), so the reading of a short move has to change, not
the writes that leave one.

## Options considered

1. **Refuse every write that leaves a stored move short outside its destination.** Breaks Q10; a
   venue edit, a rename or an earlier move would be refused for units the person holds.
2. **Leave the fee unmatched.** Keeps the false notice and the undated row.
3. **Take the whole move, units received included, from the destination.** Units received would
   come from where they arrive and count twice there.
4. **Take only the part of the fee no piece outside covers from the destination's pieces, by the lot
   rule.** Chosen.

## Decision

A move takes its units sent as ADR-0054 says. The part of its fee the pieces outside `to` cannot pay
comes from `to`'s open pieces by the country's lot rule (the earliest first, the latest under LIFO),
leaves the coin and is never added to `to`. Units received never come from `to`: those no piece
outside covers stay where they are, never counted as sold. "Never from `to`" now holds for a move's
units received only.

A fee that no piece of the coin covers, `to`'s included, stays unmatched. A write from this device
that leaves one is refused as the move's (`fee-exceeds-held`), never as a sale (`sell-exceeds-held`),
through the same "no worse than before" gate (`docs/DOMAIN.md` §6).

## Consequences

- Portfolio names units sold and a move's fee no purchase covers on two lines; a fee taken at the
  destination shows neither (`docs/DOMAIN.md` §3.7).
- The per-lot file writes a fee taken at the destination as a fee piece of the lot there, with its
  acquired date and cost share, and its header counts those rows (`feeAtDestination`). Its year end
  equals Portfolio's units except where no lot covers a fee (`docs/DOMAIN.md` §3.13).
- Units, value, invested and the average cost do not change. P/L can: the fee now leaves the lot the
  lot rule takes at `to` on the move's date, so a later sale can reach a lot with no cost. Holding
  dates can shift by the fee's units.
- The raw listing, the French and the Dutch files are unchanged; a file exported before this change
  keeps its undated fee row.
- The lines that name a short move before Save and in the Log are later work.
