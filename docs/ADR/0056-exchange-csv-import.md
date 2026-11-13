# ADR-0056: Exchange CSV import: Kraken's ledger first, then Trade Republic, on synthetic fixtures

Status: Accepted · Date: 2026-11-13 · Deciders: the owner, from the design check of the exchange import (a planner, three blind designers and counsel; #15, 2026-11-13) · Amends ADR-0007 (the fixtures, the candidates) and reads ADR-0039's "same buy day"

## Context

ROADMAP M2 asks for a free CSV import (ADR-0039) for the main exchanges of Portugal and Germany,
chosen from research and recorded in an ADR. ADR-0007 named Kraken, Coinbase, Binance and Bitvavo
and asked for fixtures from real anonymised exports; none is in the repository, which is public
(ADR-0051). ADR-0039 has an import replace the matching one-tap estimates ("same coin, same buy
day") and never delete or overwrite an entry the person typed or edited. The research of 2026-11-13
(`docs/research/csv-import-exchanges.md`) compared six formats: Kraken's is the only one its vendor
documents; Coinbase is 84th in Portugal's Finance chart, with five changes to its file since 2024-05.

## Options considered

1. **The default pair, Kraken and Coinbase.** Coinbase is weak in Portugal, its help pages refuse
   automated reading and its file keeps changing.
2. **Kraken, then Trade Republic.** Chosen. Trade Republic is near the top in both countries; its
   undocumented file mixes bank rows, names and IBANs, so it comes second, from a real export's shape.
3. **Coinbase first.** The preview, the de-duplication and the estimate replacement would rest on
   the least stable file.

## Decision

Kraken's Ledgers export first; Trade Republic second (#16); Bitpanda next (M4, or later in M2 with
room); Coinbase, Bitvavo and a history-only Binance reader stay M4 candidates; Revolut and BISON not
now. The six criteria: "An exchange is eligible when it has a MiCA authorisation passported to Portugal and Germany in ESMA's register, dated evidence of retail use in both, a full-history CSV the person downloads without keys (ADR-0039), a unique id per row (ADR-0007), columns documented by the vendor or reported by two independent sources, and personal columns that can be dropped before anything is stored."

"Fixtures are synthetic: built from Kraken's documented fields (K1, K6) and the reported December 2025 header (K7), one file per header variant, every id and figure invented, each file name carrying `synthetic`; no real export enters the public repository." This replaces ADR-0007's real anonymised exports.

The perimeter: "Nothing from the file leaves the device and no event counts the import (ADR-0028)." "The reader reads txid, refid, time, type, subtype, asset, amount and fee; it never reads aclass, subclass, wallet or balance, and no raw row, txid, refid or balance is stored." Later readers drop names, IBANs, addresses, user ids, counterparty and wallet columns before mapping.

The naming: "`Kraken` names a file format and the entries' default venue: listed alphabetically, unlinked, with no logo, status word, comparison or reason to use it." It shows beside `Choose a file`, in the not-recognised alert and in the import's own lines, nowhere else.

The rules, worded in `docs/DOMAIN.md` §2.2 and §3.13:

- The Log: ids already stored, then the first buy's 15 days, then one-tap monthly estimates, then
  hand-recorded entries, then `held` entries; only one-tap monthly estimates are ever tombstoned,
  and ADR-0039's "same buy day" reads as the same month's buy.
- The fee: an amount never includes its fee, for imports and both entry forms.
- Fills: one entry per refid, coin and direction; the id uses no date and no figure.
- Row types: purchases, sales and documented bonuses (`held` at amount 0); every other row is left
  out or counted, and named.
- Months: a purchase date takes the plan's month whose due date is nearest within 15 days; none
  makes it an extra buy.
- Ids: no new key and no version rise; `source: 'import-csv'`; an id is a version-8 UUID from the
  SHA-256 of the source, the refid, the coin and the direction.
- The ZIP: a ZIP is refused and the alert asks for the CSV inside; its reader comes with #16 if room.

## Consequences

- Rewards, deposits, withdrawals and the starting amount's choice wait for the second exchange's
  import (planned: M2); conversions between coins go to M4.
- A deletion wins until sync purges its tombstone after 90 days (M3).
- A Replace everything with a backup from before an import tombstones the imported rows, so the same
  file adds none of them until `Add them again`.
- The French file writes one block per sold fill.
- The derived ids are named in the Privacy notice before sync ships (M3).
- There is no request line for missing exchanges.
