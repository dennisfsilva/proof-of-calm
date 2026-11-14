# ADR-0056: Exchange CSV import: Kraken's ledger first, then Trade Republic, on synthetic fixtures

Status: Accepted · Date: 2026-11-13 · Deciders: taken without the owner under the owner's rule for the unattended M2 run (decide and record; the owner confirms it at the end of M2), from the design check of the exchange import (a planner, three blind designers, a walk of twelve people, an audit of every reason, counsel and a reconciler; #15, 2026-11-13) · Amends ADR-0007 (the fixtures, the candidates) and ADR-0051 (no real export becomes a fixture), and reads ADR-0039's "same buy day"

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

## Corrections recorded on 2026-11-13

- 2026-11-13: hand-recorded entries claim their purchases before one-tap estimates take theirs, so
  the Log's order reads ids already stored, the first buy's 15 days, hand-recorded entries, one-tap
  monthly estimates, then `held` entries (the plan's review on #15 found a hand entry's purchase
  imported twice). The order in Decision above is replaced by this one; the rest stands.
- 2026-11-13, after the design check of the order (#175): every step that leaves a purchase out runs
  before any step that stores one, so the Log's order reads ids already stored, hand-recorded entries,
  the first buy's 15 days, `held` entries, one-tap monthly estimates, then the months; this replaces
  the order of the line above. A month's one-tap estimates of a coin are replaced together and only by
  a date of that month, and a purchase date's month is the plan's month with the nearest anchor: its
  due date, 15 days either side, or one of its coin's one-tap estimates for it, live or tombstoned,
  from 3 days before its date to the day after. This replaces the late reach and Decision's months
  line, so a shorter export imported first leaves the Log as one import of the whole file. (The plan's
  second review found a purchase dated before a `held` entry stored without the person's answer when
  the file came in two parts.) Sync's purge of a tombstone (M3) also ends its estimate's reach. The
  rest stands.
- 2026-11-13, after the integration read of the reader found two receipts of one refid and coin keyed
  alike: "Fills: one entry per refid, coin and direction" now holds for receipts too. A refid's
  receipts of one coin fold into one, every line kept, at the earliest row's time, their units summed
  and then cut; the key stays `poc-csv-1|kraken|<refid>|<COIN>|in`, COIN the normalised code. A bonus
  under a trade's refid for the coin that trade bought is left out as unpaired, named by its line, and
  the purchase keeps the key. Neither shape is documented in the research note, K1 or K6; the import
  refused such a file as `invalid-entries`, and now writes it. Rewards (staking and earn), coin
  deposits as entries and coin withdrawals as moves move to M4, replacing Consequences' "(planned:
  M2)" for those three; the starting amount's choice stays as Consequences say. The rest stands.
- 2026-11-13, Trade Republic's reader, on the evidence of #16 (`docs/research/csv-import-exchanges.md`
  §5 and §7): the reader indexes only the 11 columns of `TR_READ` and never reads the personal ones
  (name, description, counterparty, IBAN, payment reference, card code). Saveback and round-up
  executions are purchases at their amount, since the export marks them only in the description; the
  Saveback credits on the cash account are left out as `benefit`, a new reason. A BUY_CANCELLED or
  SELL_CANCELLED pairs one-to-one with the latest earlier unpaired trade of its side, coin, |shares|
  and |amount|, and both rows are left out as unpaired. MIGRATION rows group by the instant they name
  and by coin: each coin summing to 0 there is within; exactly two coins left, one below 0 and one
  above, are a conversion; any other is unreadable. FREE_RECEIPT (staking and
  coins sent in, which the export does not tell apart) is one coin-deposit line and FREE_DELIVERY one
  coin-withdrawal line. The key is `poc-csv-1|trade-republic|<transaction_id>|<COIN>|<in|out>`. Not
  yet recognised by the file reader, and a cancelled buy an earlier import stored is not reached
  (planned: M2). The rest stands.
- 2026-11-14: The naming extends to Trade Republic: `Trade Republic` names a file format and the
  entries' default venue under the same rule as `Kraken`: listed alphabetically, unlinked, with no
  logo, status word, comparison or reason to use it; it shows beside `Choose a file`, in the
  not-recognised alert and in the import's own lines, nowhere else.
- 2026-11-14, the ZIP reader shipped (#190), replacing Decision's "a ZIP is refused and the alert
  asks for the CSV inside": a chosen ZIP opens its one CSV file under the limits
  `docs/ARCHITECTURE.md` states for the ZIP reader; only a pasted ZIP keeps the `zip` refusal. The
  rest stands.
- 2026-11-14: since #193 `readExchangeFile` recognises Trade Republic's export by its header
  (transaction_id, asset_class and category, every name in `TR_COLUMNS`), replacing the 2026-11-13
  entry's "Not yet recognised by the file reader" for recognition. A cancelled buy an earlier
  import stored is still not reached; it is carried to #192 (planned: M2). The rest stands.
- 2026-11-14, after the design check of the months: every purchase date of a coin whose month is S,
  left by the earlier steps, is a monthly buy for S when the coin's share is above 0 and S is neither
  skipped nor paused, or when the Log holds a one-tap estimate of the coin for S, live or tombstoned;
  no other stored entry decides a kind, so a month another coin, exchange or hand entry recorded
  takes the file's dates too. A date's month is still the 2026-11-13 entry's nearest anchor, and a
  date no month reaches stays an extra buy. A hand monthly buy claims its month's dates, nearest its
  own date first, while their sum comes nearer its amount, so `docs/DOMAIN.md` §3.13 reads an amount
  in step 2 alone. A purchase within the first month's reach before the first buy is that month's
  monthly buy and counts in Invested. The rest stands.
- 2026-11-14, the guards and gaps: with a starting amount above 0, or a live `lump` of the coin, every
  purchase step 2 left dated on or before `firstBuy` + 15 days is left out and named, to record by hand;
  the starting amount's choice moves to M4, replacing Consequences' "(planned: M2)" for it. A hand
  `held` entry guards a purchase or receipt of at most its units on or before its date, a purchase
  only when its cost is not 0, narrowing the holding of 2026-11-13. A trade a Trade Republic
  cancellation pairs whose entry is live is named for the person to delete, and a receipt stored with
  fewer units than the file now gives is named with both figures; the move check and that comparison
  round half-even at the places the preview shows. Nothing is tombstoned or edited. The rest stands.
