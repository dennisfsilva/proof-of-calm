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
  `held` entry guards a purchase or receipt of at most its units on or before its date, a purchase only
  at a cost other than 0, narrowing the holding of 2026-11-13; the line names every such entry. A trade
  a Trade Republic cancellation pairs whose entry is live is named for deletion, with the estimate it
  replaced when that leaves its month none; a receipt stored with fewer units is named with both
  figures, and the file's date when it differs. The move check and that comparison round half-even at
  the shown places. A hand monthly buy takes its 3 days only when its month has no date of its coin.
  Nothing is tombstoned or edited: after the named changes the Log is one import's but for those estimates
  and for a receipt whose units grew only below the coin's shown places, which is not named (a line
  showing two equal figures would read as no change), so the Log keeps the earlier import's date and
  units for it.
- 2026-11-14, the starting-amount line: it names each purchase it leaves out and what the Log holds of
  the starting amount, per coin, and asks for no change, replacing "to record by hand"; an instruction
  shown only when the file planned again on the changed Log proves it follows (#204, #205). The rest
  stands.
- 2026-11-14, the left-out lines of a Trade Republic export: a trade and the cancellation that pairs
  with it go out together as `cancelled`, one left-out row holding both lines, and a cancellation with
  no trade to pair goes out alone as `unpaired`, or `unpaired-sale` for a sale's cancellation, so its line
  names the side it found no trade of (`docs/DOMAIN.md` §3.13), replacing the 2026-11-13
  entry's "both rows are left out as unpaired", so the preview names each cause in its own sentence.
  The rest stands.
- 2026-11-14, the starting-amount line again (#212): it asks for one change, `startingChange` or
  `startingRecord`, only when that change kept in the Log and the file chosen again count the starting
  amount once in both orders (`docs/DOMAIN.md` §3.13 step 3), replacing #204's "asks for no change".
  The rest stands.
- 2026-11-14, rule R (#214): a live one-tap `lump` claims in step 2, within 3 days of its date, as a
  hand one does, and is never replaced, so a starting amount tapped on the day it was bought, after
  `firstBuy` + 15 days, is no longer imported again as a monthly buy (2,200 against 1,200), and a tapped
  lump whose units equal the file's records its date. The rest stands.
- 2026-11-15, rule G (#223): a live `lump`, hand or one-tap, claims in step 2 after the hand monthly
  buys by walking its coin's purchase dates within 3 days of its date whose amount, stored purchases
  included, is as near its own as its coin's monthly part or nearer, as a ratio, nearest date first,
  while the sum gets nearer its amount; stored dates count in the order and sum but are never claimed
  (the rule's text is `docs/DOMAIN.md` §3.13 step 2's); a lump whose amount is its coin's monthly part
  claims as rule R did, its nearest unclaimed date within 3 days, since a walk there let an export cut
  inside a date store a date the whole file's lump claims (#227). Every hand monthly buy claims before any lump,
  one whose month has no date too, and a lump keeps its place among extra buys and sales (1,700 against
  1,600 in step 2's example). A starting amount tapped on a later buy day no
  longer takes that day's monthly buy, and one bought in pieces on days near it is recorded whole (W1:
  1,400 against 2,400), except by a lump at its coin's monthly part, which claims one date: its pieces on
  other days are imported beside it (105 against 70). Four prices stand, each with its figures in step
  2: a purchase between the square root of the lump's amount times the part and their mean, near the lump, counts as starting
  money (1,300 against 1,700); a starting amount below the part bought on a buy day is imported with
  that day's buy (500 against 450); a late starting purchase more than 3 days away is imported beside it (file L:
  2,400 on 128 of 135 tap days); claims are per date (1,300 against 1,400). One exception stands: an
  export that cuts inside a purchase date within 3 days of a live `lump` whose amount is not its coin's
  monthly part can count a date twice (W2: 1,700 against 1,400 above the part, where the doubled date
  is the cut date; 2,550 against 2,450 below, where it is a date stored while the shorter export's lump
  claimed the cut date's part or stopped its walk at that part, 91 against 87.50 in CI's world of
  2026-11-15), or leave a date out that a hand entry, or a live one-tap `lump`, falling back to its
  nearest date (an extra buy, a monthly buy whose month has no date, a lump at its coin's monthly part,
  hand or one-tap) claims in the second import (3,100 against 3,500; the condition is step 2's, checked by
  `packages/core/src/import/exchange/plan-lump-cut.property.test.ts`). Only a date at the file's edge
  shows a cut, and keeping a `lump` off such a date would undo #214's tap on the day of purchase, often
  an export's last date. This narrows rule R's entry. The rest stands.
- 2026-11-14, the starting line's totals (#224): when the instruction's date holds two or more
  purchases of a coin, the line states each coin's totals and the instruction names that date and those
  totals, since typing one purchase's figures left the rest out (1,100 against 1,500); d* counts a date of
  several purchases only when leaving out any one takes the rest farther from the target, so a date that
  also holds the month's buy asks for no change; and `Matching entries` marks a one-tap entry's units
  (estimated), as the starting line does. The rest stands.
- 2026-11-23, the costs that stand after the audit of the import: no `Add them again` control exists,
  so a deleted imported entry is never imported again, nor are the imported entries a Replace
  everything with an older backup tombstoned, replacing Consequences' "until `Add them again`". The
  cancelled buy an earlier import stored moves to M4 (the lone cancellation in `docs/ROADMAP.md` M4),
  replacing "(planned: M2)" in the entries of 2026-11-13 and 2026-11-14. Decision's "Bitpanda next"
  defers to the order of readers in `docs/ROADMAP.md` M4. In rule G's entry, "Only a date at the
  file's edge shows a cut" holds for the first import only, and its price (a) reads 1,300 against
  1,800; a lump at its coin's monthly part tapped within 3 days of a later buy date still takes that
  month's purchase (400 against 500), a late starting purchase dated more than 15 days after the
  first buy day is imported as a monthly buy with no line (2,400 against 1,400), and a tapped lump
  that claims its purchase keeps its estimated units (rule R; `docs/DOMAIN.md` §3.13 step 2 states
  each). The rest stands.
- 2026-11-23, the sales a guard reaches: the starting amount's and the Coins added entries' guards left
  out purchases while the file's sales went in, so a sale could be stored with nothing before it (0.6
  BTC sold of 1 BTC bought before the first buy day left the Log below zero). Now a sale either guard reaches is left out and named when the person's own entries
  (one-tap monthly estimates aside), the file's entries stored earlier and the file's purchases left
  hold less of its coin up to its date (`docs/DOMAIN.md` §3.13, step 4); ticking the box adds back the
  sales its purchases cover, and a line that asks for a change may add a sale it covers. The cost,
  stated: a guard that leaves out none of the purchases that covered a sale stores it (0.8 BTC against
  0.4). Choosing per purchase (M4) brings back the sales it covers. The rest stands.
- 2026-11-23, the cover across imports: the cover in the entry above counted no other import's
  entries, so a sale another exchange's export covers was left out whenever a Coins added entry or the
  starting amount reached it (0.01 BTC on 1 Sep 2026 against 0.02 bought elsewhere). Now the cover
  also counts the live entries other imports stored, dated before the coin's earliest purchase or
  receipt that steps 3 and 4 leave out of this file (step 4's only unticked), or all of them when they
  leave out none (`docs/DOMAIN.md` §3.13, step 4). This replaces the entry above's cover. The reasons: a sale takes the earliest units first (`docs/DOMAIN.md` §3.7), so one whose
  left-out history comes first goes with it; the whole Log as cover would store a sale silently when
  another exchange's buys, interleaved with that history, come first (0.5 BTC shown where 1.1 is held);
  and counting only what comes before the sale's own left-out history would break yearly exports (0.35
  against 0.23 BTC). The line now says `On {date}, the purchases this file imports and your own entries hold
  less {coin} than the sale. Monthly estimates from Bought as planned do not count.`, true under either
  cover. Two exchanges' files leave one Log in either order once each is chosen again after the
  other; before that, only sales the first import of their file left out differ. The costs, stated:
  each sale is still decided alone (a hand sale between two files leaves −0.0049 BTC); coins another
  import bought before the left-out history count, so they cover the sale and it is stored (0.5 BTC
  where 1.1 is held; bought on or after that history's first day, they do not count and the Log shows
  1.1 BTC); and a one-tap
  `lump` counts at its own units, so a sale of the file's units of a purchase it records stays out while
  the estimate is smaller (0.0125 BTC sold against 0.01219512 tapped). Set aside in this change: a
  one-tap `lump` that records purchases in step 2 counting at the larger of its units and theirs. A
  shorter export lets step 2 claim a different purchase for the lump, so a cover that follows the claim
  made two imports store a sale one import leaves out (fast-check seeds 13 and 14); it went to #424 with
  a design check of a lump's claim across cuts. The rest stands.
