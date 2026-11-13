# Proof of Calm domain model

This is the behavioural specification of `packages/core`. It was extracted from the working prototype
(`P:\dev\repos\dca-plan\DCA-Plan.html`, 1,908 lines, the file dated 2026-10-16) and extended with the
features decided for v1. Where this document and the prototype disagree, this document wins; the
differences are listed in §12. Where this document is silent, port the prototype's behaviour and add a
test that pins it.

The core is pure TypeScript: no framework, no I/O, no clock, no `Math.random`, no floats for money or
units. Every function takes its inputs (including `today`) and returns a value. See
`docs/ENGINEERING.md` for the rules and `docs/ARCHITECTURE.md` for where the shell ends and the core
begins.

---

## 1. Primitives

| Type | Representation | Notes |
|---|---|---|
| `CalendarDate` | `YYYY-MM-DD` string, user's local calendar | Never a `Date` object inside the core. Comparison is string comparison. |
| `MonthKey` | `YYYY-MM` string | Identifies a monthly slot. |
| `Instant` | ISO 8601 with offset, e.g. `2026-10-16T08:00:00+01:00` | Only at the shell boundary (storage timestamps, sync). The core never derives a calendar date from an instant; the shell does, with the user's IANA timezone, and passes `today: CalendarDate` in. |
| `Decimal` | the chosen exact decimal type (ADR-0017) | All money, units, percentages. Serialised as plain decimal strings (`"1234.56"`, `"0.01234567"`). Never `number` in storage or in the core's public API except for integers (counts, days, percent shares that are whole numbers are still `Decimal`). |
| `Money` | `Decimal` in the plan's pay currency | Stored unrounded as typed; displayed rounded to the currency's minor unit at the edge. |
| `Units` | `Decimal`, at most 10 decimal places | Rounded to the coin's `decimals` only for display and for the one-tap estimate. |
| `Percent` | `Decimal` in 0..100 | Split shares. |
| `CurrencyCode` | ISO 4217 | v1 set: `EUR`, `USD`, `GBP`, `CHF`. The country profile may add others later (e.g. `SEK`, `PLN`). |
| `CountryCode` | ISO 3166-1 alpha-2, plus `XX` | `XX` is the generic "no exemption" profile. |
| `CoinId` | `^[A-Z0-9.$-]{1,12}$` | The ticker as the stable key, as in the prototype. Display name and CoinGecko id live beside it. |
| `EntityId` | UUID string (lowercase) | Generated in the shell (`crypto.randomUUID()`), passed in. Entries migrated from the prototype keep ids matching `^p[a-z0-9]+$` (§7), so importing the same file twice adds nothing. |

Rounding modes are explicit in every division (ADR-0017). Default: half-even for display rounding,
toward zero for the units an amount buys at a price (`unitsFor`, the one-tap estimate). Where a sum of
rounded parts must equal a rounded whole (splitting a monthly amount across coins; splitting a fee
across entries), use the largest-remainder method and test that the parts sum exactly. Where a part must
not move when later parts are added (a lot's cost and fee over its takes in the tax-year file, §3.13), use the
cumulative split `cumulativeShares` instead, whose parts sum exactly too.

---

## 2. Stored entities (plans v3, entries v4)

All entities are validated by zod schemas in `packages/core/src/schema/`; types are inferred from the
schemas. Storage (IndexedDB), export files and sync payloads all use these shapes. A stored row of a
later schema or encryption version than the build reads is left as it is and counted, and the app
shows the newer-version screen in place of a newer plan (ADR-0019 readings).

### 2.1 Plan

```ts
type Plan = {
  id: EntityId;
  schemaVersion: 3;
  country: CountryCode;                 // drives defaults; confirmed by the user, never taken from IP
  countryRuleVersion: number;           // the country profile version the user last saw; a newer one shows the dated notice (§3.12)
  payCurrency: CurrencyCode;            // every logged amount is in this currency; never converted
  displayCurrency: CurrencyCode;        // coin prices shown in this currency; defaults to payCurrency (ADR-0012)
  coins: Coin[];                        // ordered; a coin with 0 % share stays for extras and sales
  split: Record<CoinId, Percent>;       // shares over `coins`; the shares > 0 must sum to exactly 100
  monthlyAmount: Money;                 // 0 allowed only if startingAmount > 0
  startingAmount: Money;                // one-off deposit at the first buy, same split; 0 = none
  firstBuy: CalendarDate;
  buyDay: 1..28;                        // day of month for every slot after the first
  lastBuy: CalendarDate;                // >= firstBuy; <= firstBuy + 20 years
  holdingRule: HoldingRule;             // from the country profile at setup; editable (see §6 "Edit the plan")
  sellWindow: SellWindow | null;        // null = "accumulate, no sell window"
  references: { peakFrom?: CalendarDate; peakTo?: CalendarDate; halving?: CalendarDate };
  expectations: { bear?: Decimal; base?: Decimal; bull?: Decimal };   // a person's own multiples of total invested, kept from their file; {} on a plan started from a template (§5); no screen shows them
  pauses: Pause[];                      // see §3.2 and §6
  skips: Skip[];                        // see §3.2 and §6
  endedBuyingOn: CalendarDate | null;   // set by "End buying today"; lastBuy is moved to that date
                                        // an edit that changes lastBuy clears it (see §6 "Edit the plan")
  sellChecks: { part1: boolean; part2: boolean; part3: boolean };
  why: string;                          // the user's one sentence, shown on the Red day page; may be ""
  templateId: string | null;            // which starting point it came from, for analytics-free honesty in copy
  riskAcknowledgedAt: Instant | null;   // when the plan-creation disclosure was acknowledged (docs/LEGAL.md §4, ADR-0047)
  riskWordingVersion: number;           // integer >= 0: the version of the disclosure text acknowledged; carried by the export
                                        // null with 0: nothing recorded (a v2 row, a v2 backup or the prototype); onboarding and the re-ask below write both, together
  createdAt: Instant;
  updatedAt: Instant;
};

type Coin = { id: CoinId; name: string; geckoId: string; decimals: 0..10; color?: string /* hex, optional override */ };

type HoldingRule =
  | { kind: 'none' }                                                    // no holding rule where the user lives
  | { kind: 'days'; days: number; effect: HoldingEffect }               // eligible when daysBetween(entry.date, at) >= days        (Portugal: 365, exempt)
  | { kind: 'years'; years: number; effect: HoldingEffect };            // eligible when at > addYearsClamped(entry.date, years)    (Germany: 1 year, exempt; US: 1 year, lower-rate)
type HoldingEffect = 'exempt' | 'lower-rate';   // what passing the period does: a tax exemption, or a lower (long-term) rate. The maths is identical; the label is not.

type SellWindow = { opens: CalendarDate; closes: CalendarDate; exitBy: CalendarDate; acceptedEarlyOpen?: true };
type Pause = { id: EntityId; from: CalendarDate; until: CalendarDate | null; note: string };
type Skip  = { id: EntityId; slot: MonthKey; note: string; createdAt: Instant };
```

Invariants (validated; each has a test):

- `split`: every key is in `coins`; every value is `>= 0`; the sum of all values is exactly `100`
  (decimal, not within 0.01 as the prototype did).
- Split shares have at most four decimals (ADR-0017).
- `monthlyAmount > 0 || startingAmount > 0`; neither is negative, and neither has more decimals than
  the pay currency's minor unit (two for the v1 set).
- `firstBuy <= lastBuy <= addYearsClamped(firstBuy, 20)`, and the plan has at most `MAX_SLOTS` (240)
  slots: a plan of exactly twenty years would have 241.
- If `sellWindow`: `opens <= closes <= exitBy`, and `opens >= eligibleFrom(lastBuy, holdingRule)` when the
  rule is not `none` (the prototype error "the sell window should open at least N days after the last
  buy" becomes: "the window opens before the last purchase passes the holding rule", shown as a
  warning the user can accept, not a hard error; the acceptance is recorded as `sellWindow.acceptedEarlyOpen = true`,
  and holds only for the dates it was given for: a later change of the last buy, the holding rule or the window
  drops it unless the person accepts again, and a window that no longer opens early is saved without it).
- If both `references.peakFrom` and `peakTo`: `peakFrom <= peakTo`.
- `pauses` do not overlap; `until` is `null` (open-ended) or `>= from`.
- `skips` have unique slots.
- `coins` have unique ids; every key of `split` is one of them.

One currency per plan (ADR-0053): no invariant ties `payCurrency` to the country's currency. A change of
country converts nothing, and relabels the logged amounts only on the person's answer to the currency
question, asked when the new country's currency differs from the pay currency and a live entry holds an
amount or a fee (§6 "Change country"); the answer moves the plan's own amounts with them. With no question
needed, the pay and display currencies follow the country, so the plan's own amounts (`monthlyAmount`,
`startingAmount`) take the new currency as typed, as the confirmation's summary rows show before the person
confirms, with a row for each of them that is not zero ("€300 becomes £300. Check it in Plan.").
Currency & data's "Change to GBP" (§6 "Change pay currency") relabels the plan to its country's currency
alone, and the display currency follows the pay currency when the two were equal, so the button stores the
same plan as the question's "Change to" answer; a display currency set apart from the pay currency (the
prototype import's quote currency) stays, since no screen can set it again. Where §6 differs from this
paragraph, this one wins. The prototype import already stores such
plans, so neither the schema nor a row version changes for them.

A plan is written at the lowest schema version that holds it (`writtenPlan` in
`packages/core/src/schema/upgrade.ts`), in a storage row and in a backup alike: with nothing recorded
(null and 0) it is the v2 plan exactly (`schemaVersion: 2`, without the two fields), which the previous
build's strict v2 schema reads; with anything recorded it is v3. Reading takes both, a v2 plan through
`upgradePlan` with null and 0. So v3 is first written by onboarding's acknowledgement, in a build that
follows one that reads v3, and a one-release rollback reads every plan (`docs/RELEASE.md`, Versioning).

The acknowledgement is asked again only when a recorded wording version (1 or more) is below the
disclosure text's current version (`acknowledgementDue`). That one comparison reads the plan as it
stands, so a new session, a device or an import triggers nothing new of its own, and a plan brought in
by "Replace everything" or the import with no plan (§3.13), with an older recorded version, is asked
once, on Today. A plan with nothing recorded (null and 0: a v2 row, a v2 backup or the prototype,
including the plan either of those imports takes whole from such a file, §3.13) is never asked again
because of that. The ask takes Today's place until it is answered, as a screen and never a modal, and
every other screen stays open; its button records the time and the current version together
(`acknowledge`). The current version is `RISK_WORDING_VERSION` in
`packages/app/src/lib/brand/index.ts`.

Each invariant is a coded issue (`planIssues`, `PLAN_ISSUE_CODES` in `packages/core/src/schema/plan.ts`):
the schema reports the codes as custom issues, and forms, storage reads and imports share them.

### 2.2 Entry

```ts
type Entry = {
  id: EntityId;
  kind: 'dca' | 'lump' | 'extra' | 'sell' | 'held' | 'move';
  date: CalendarDate;
  coin: CoinId;
  amount: Money | null;   // pay currency; > 0; for sells: what the units sold for, before the fee; for held: null (cost unknown) or >= 0 ('0': nothing paid); for move: null
  units: Units;           // > 0; for sells: units sold; for move: units sent
  fee: Money | null;      // pay currency; share of the transaction's fee attributed to this entry; null for held and move
  note: string;
  slot: MonthKey | null;  // required when kind === 'dca', null otherwise
  venue: string | null;   // optional free-text label ("Kraken", "Ledger"); used only to group lots where the country's lot scope is per venue (Portugal: per platform; Germany, US: per wallet). A label, never a checklist. For move: the venue the units were sent from (null: none named).
  to?: string;            // move only: the venue the units were sent to, VenueSchema, never equal to venue; absent (never undefined) on every other kind
  received?: Units;       // move only: the units that arrived at to, 0 < received <= units; units − received is the move's fee in the coin; absent on every other kind
  source: 'manual' | 'one-tap' | 'import-prototype' | 'import-json' | 'import-csv';
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;   // soft delete: undo window and sync tombstone
};
```

An entry is one coin. A "transaction" (what the Log shows as one row) is the group of entries with the
same `kind`, `date` and (for `dca`) `slot`; see §3.9. `amount` and `units` are stored exactly as the
user typed them; the implied price `amount / units` is derived, never stored.

An `amount` never includes `fee` (decided 2026-11-13, ADR-0056): a purchase's amount is what its units cost
before any fee, a sale's is what its units sold for before any fee, and `fee` is the transaction's fee on its
own, so a purchase paid out `amount + fee` and a sale brought in `amount − fee`. The one tap (§3.4) and the
form's fill (§6) store amounts so, and every figure reads them so: Invested, the average cost and the plan's
totals leave fees out, P/L leaves them out (§3.6), and the tax-year files keep the fee in its own column
(§3.13). Entries stored before this rule stay as typed, since nothing stored tells how each was typed. A fee an
exchange took in the coin is valued at the trade's own price (§3.13, the exchange import). `held` is the
exception: it carries no fee (`fee-not-allowed`). A fee paid in money for its coins is in its cost when the
cost is recorded, so Invested and the average cost count it; a fee taken in the coin is off its units, as in
an exchange import's receipts at amount `'0'` (§3.13).

`source` says where an entry came from. A `one-tap` entry is an estimate (`isEstimate`): its units come
from the day's price (§3.4), and the Log labels them as estimated until the person edits them (ADR-0003),
so no other field marks it and no version rises. Only a save that changes the units in value clears it:
`saveTransaction` gives such a row `manual` (`savedSource`, §6). An edit of only the amount (the edit
form derives the price from it and keeps the units, §6 "Fill a form row"), the fee, venue, note, date
or slot, a save with no change, units retyped equal in value, a JSON import and sync keep `one-tap`; a
delete removes the entry and its mark. The cautious error: an estimate that equals the exchange's
figure stays labelled. Entries edited before 2026-11-07 (#375) kept `one-tap` whatever their units: a row
whose units were corrected then stays labelled, and its edit form's line still says the tap filled them, until a
save changes the units; only data from before launch holds such rows. An entry still labelled may carry an edited note, fee or venue. An exchange's import
replaces the entries still labelled as estimates, a month's estimates of a coin together (ADR-0039, ADR-0056;
§3.13, "Meeting the Log"): "The write tombstones them all and adds that date's purchases as monthly buys for S,
with the note of the first of them in `compareEntries` order and the import's venue, whatever venue they
carried." The one tap copies the last venue, so its venue is a
default; the write is planned (M2).

`held` is coins the plan did not buy: held before it, or received as a gift. Its cost may be unknown
(`amount: null`) or nothing (`'0'`), and it carries no fee; only `held` may have either among the kinds
that carry a cost, and a purchase or sale keeps an amount above 0 (`entryIssues`: `amount-required` for
null on one, `amount-not-positive` for 0 or less on one, `fee-not-allowed` for a fee on `held`); a move
carries no amount at all (its paragraph below). Its rows are the
plan's coins: a coin outside the plan joins it at 0 % in Settings → Coins & split first (`unknown-coin`,
§6). The entries' payload is v3 since 2026-11-06 and v2 before: the same shape without `held`. An entry
is written at the lowest version that holds it (`writtenEntryVersion`: 3 for `held`, 2 for every other
kind), as plans are (§2.1), so the previous build, which reads entries at v2, reads every entry but a
`held` one and counts that one, its tombstone included, as newer (ADR-0019 Readings, "Row shape").
The Log's `Add coins you already have` writes `held` (`docs/CONTENT-STYLE.md` §3), with the units, a date,
an optional venue and note, a cost only when one is known (0 when nothing was paid) and no fee; v3 is read by
a release before one writes it (`docs/RELEASE.md`, Versioning).
The Dutch tax-year file lists `held` entries in their own columns, never as purchases, and its header names
those dated in the year (§3.13).

`move` is coins sent from one venue to another (ADR-0054): one entry per coin, `venue` the source, `units` the units
sent, `to` the destination and `received` the units that arrived; `units − received` is the network's fee, paid in the
coin. Its amount, fee and slot are null (`amount-not-allowed`, `fee-not-allowed`, `slot-not-allowed`), `to` and
`received` are required on a move (`move-required`) and absent on every other kind (`move-not-allowed`), `received` is
above 0 (`received-not-positive`) and at most `units` (`received-exceeds-units`) at no more than `MAX_UNIT_DECIMALS`
places (`units-precision`), and `to` differs from `venue` (`same-venue`). The two keys are optional, not nullable, so a
row of another kind has the v3 shape exactly: the previous build's strict schema reads it. The entries' payload is v4
since 2026-11-09: v3 with the `move` kind and its two keys. `writtenEntryVersion` gives 4 for a move, 3 for `held`, 2
for every other kind, so the previous build, which reads entries at v3, reads every entry but a move and counts that
one, its tombstone included, as newer. The release before the Log's move step read moves and recorded none, as
`docs/RELEASE.md` (Versioning) asks; the Log now records one ("Log coins you moved", `saveMove`), and a move row in
the Log offers Edit, which opens the move form on it, and Delete (§3.9).

### 2.3 Device-local preferences (not synced, not part of the plan)

`theme`, `chartRange` (`7d | 30d | 90d | 1y | all`), `lastBackupAt`, `changedAt`, `dismissedBanners`
(banner keys such as `red-day:<episode start>`, §3.11), `reviewedAt` (annual review, §3.12), `logShowAll`,
`motion` (`system | reduce`, the in-app reduced motion of `docs/DESIGN.md` §6; added on 2026-10-20 as an
additive field with the default `system`, no migration number: a record written before it reads as
`system`, and the build before it ignores the field on read and, since the fix of 2026-10-20, keeps it
on write; before that fix a rollback that changed a preference reset it, which no build before the
field could do because none wrote the prefs row).

---

## 3. Derived views

All functions are pure and take `today: CalendarDate` where time matters. Names are the contract for
`packages/core`; the build session may add helpers but keeps these.

### 3.1 Slots — `slots(plan): Slot[]`

Port of the prototype's `slots()`:

1. If `monthlyAmount <= 0` or `firstBuy`/`lastBuy` are missing, return `[]`.
2. For `i = 0, 1, 2, …`: let `monthStart = startOfMonth(addMonthsClamped(firstBuy, i))`. Stop when
   `monthStart > lastBuy`.
3. `due = i === 0 ? firstBuy : clampDay(monthStart, buyDay)` where `clampDay` picks
   `min(buyDay, daysInMonth)`. (`buyDay` is at most 28, so clamping only matters for data imported
   from elsewhere; keep it and test it with 29/30/31.)
4. Stop when `due > lastBuy`.
5. Push `{ key: monthKey(monthStart), due }`.

Hard cap: 240 slots (20 years), enforced by the plan invariant rather than a silent `break` as in the
prototype (which stopped at 72 without telling anyone).

Property tests: keys are strictly increasing and consecutive months; `due` is within its month;
the first due equals `firstBuy`; every due is `<= lastBuy`; changing `buyDay` never changes the number
of slots unless the clamp pushes a due past `lastBuy` in the final month.

### 3.2 Slot status — `slotStatuses(plan, entries, today): SlotStatus[]`

For each slot, in order:

| Status | Condition (first match wins) |
|---|---|
| `done` | at least one non-deleted entry with `kind === 'dca'` and `slot === key` |
| `skipped` | a `Skip` with this slot |
| `paused` | `due` falls inside a `Pause` (`from <= due && (until === null || due <= until)`) |
| `late` | `due < today` |
| `due` | `due === today` |
| `upcoming` | `due > today` |

`done` also carries `loggedAmount` (sum of the slot's entry amounts), `loggedOn` (earliest entry date)
and the entries. Nothing in the UI nags about `skipped` or `paused` slots; both appear in the Log and
the Plan progress as honest history ("Skipped · travelling").

### 3.3 Focus slot and the actions for today — `focusSlot`, `actionsNow`, `primaryAction`, `leadAction`

Port of `focusSlot()`, `nowActions()`, `nextAction()`:

- `focusSlot`: the slot whose key equals `monthKey(today)`; otherwise the first slot that is not
  `done`/`skipped`/`paused` with `due >= today`; otherwise `null`.
- `actionsNow`:
  1. If `startingAmount > 0` and no `lump` entry exists: a `lump` action due on `firstBuy`,
     `late` if `firstBuy < today`.
  2. Every `late` slot (excluding the focus slot) as a `dca` action.
  3. The focus slot as a `dca` action (even when `done`, so the Today page can show the month as
     handled; its copy: `docs/CONTENT-STYLE.md` §3, "Today, the month handled").
  4. Sorted by `due`.
- `primaryAction`: the first action that still asks for a buy (status `late`, `due` or `upcoming`, so
  not `done`, `skipped` or `paused`); `null` if none. A skipped or paused current month stays the focus
  slot and is shown as handled, never as the thing to do. The Log's action uses it in every phase.
- `leadAction(actions, phase)` (in `packages/core/src/plan/phase.ts`, beside §3.5): `primaryAction` while
  the phase is `before` or `buy`, otherwise `null`, as the prototype's `heroMain()` leads (decision 1 of
  26 Oct 2026). The Today page shows exactly the lead action with its coin chips and its buttons, the one
  tap on a due or late action and the Record link otherwise; the rest go into the quiet pending list below
  it. From the hold phase on, the phase leads Today (§3.5) and a month still late waits in that list. The
  copy of both: `docs/CONTENT-STYLE.md` §3.

Each action carries its `kind`, `slot`, `due`, `status`, `plannedAmount` (the monthly or starting
amount) and `loggedAmount`; `plannedParts(plan, action.plannedAmount)` gives its coin chips (§3.4).

### 3.4 Planned parts and the one-tap fill — `plannedParts(plan, total)`, `oneTapEntries(...)`

`plannedParts(plan, total)` returns, for each coin with share > 0, an amount such that the amounts sum
exactly to `total`:

1. `raw[i] = total × share[i] / 100`.
2. Round each down to the currency's minor unit; distribute the remaining cents one by one to the
   parts with the largest fractional remainder (ties: plan order). Test: `sum(parts) === total` for
   random totals and splits.

`oneTapEntries({ plan, action, prices, today, fee, ids, now, venue })` builds the entries for "Bought as planned":

- one entry per planned part with `amount = part`, `units = roundTo(part / price[coin], coin.decimals)`
  using the day's price in the pay currency, `source: 'one-tap'`, `date: today`, `slot` from the
  action (`dca`) or `null` (`lump`);
- if a price is missing for a coin, that entry gets `units = null` in the *draft* and the shell must
  ask for the units before saving (the core never saves an entry without units);
- `fee`, if given, is split across the entries by largest remainder proportional to `amount`
  (the prototype's `round2(feeAll × amount / total)` drifted by a cent);
- `venue` goes on every entry as given. Today passes `defaultFee` of the live entries (below) as the
  fee and, as the venue, that of the latest live entry that named one, a purchase or a sale, coins
  added (`held`) and moves left out, "latest" as for `defaultFee` (`lastVenue` in `packages/core/src/plan/parts.ts`,
  which the Log form's venue reads too; whether a kind adds or removes units is its role, `entryRole`, §3.7);
- a part that rounds to zero (a total too small to give every coin a cent) is left out: a zero buy
  cannot be recorded;
- the result is a draft the user can edit before saving; typing exact units stays available.

`defaultFee(entries)`: the whole fee of the most recent transaction (§3.9) that recorded one, its
entries' shares summed, else `null`. It is a transaction's fee, not one entry's share, because the
one-tap fill and the log form split it across the new entries again. "Most recent" is the latest date,
then the latest `createdAt`, compared as moments (`compareInstants`), not as strings. A move's fee is
null, so `defaultFee` never takes one: its fee is units, not money.

### 3.5 Phase — `phase(plan, today): Phase`

Port of `phase()`, extended for plans without a sell window and for pauses:

```
before   today < firstBuy
buy      today <= lastBuy
hold     sellWindow && today < sellWindow.opens        (or: no sellWindow → 'hold' forever, label "Holding")
sell     sellWindow && today <= sellWindow.closes
exit     sellWindow && today <= sellWindow.exitBy
done     otherwise (only reachable with a sell window)
```

`phase` returns `{ kind, openEnded, pause }`: `openEnded` is true for the hold of a plan without a sell
window; `pause` is the pause containing `today` during the buy phase (the phase is still `buy`; the
Today page shows the pause's status line, `docs/CONTENT-STYLE.md` §3, and offers "Resume"), otherwise `null`.
Once buying ended (`endedBuyingOn` set) `pause` is `null`, also on the end day under the pause it ended
in: the end wins over a pause, as on the Plan screen, and an ended plan can be neither resumed nor paused
(`buying-over`; §6, "Resume" and "Pause").

### 3.6 Portfolio — `portfolio(plan, entries, prices?, context?)`

Port of `portfolio()`, per coin over non-deleted entries, for the plan's coins in order and then any
other coin that has entries:

- `boughtUnits = Σ unitsIn` and `soldUnits = Σ unitsOut` over the coin's entries: the units of its purchases
  (`dca`, `lump`, `extra`, `held`) and of its sales, by the kind's role (§3.7); a move's `unitsOut` is its fee in
  the coin, so `units`, the value and P/L drop by the fee while `invested`, the average and `fees` stay as they were.
  A move with `received = units` changes no figure.
- `units = max(0, boughtUnits − soldUnits)`.
- The value counts every unit held. Invested and the average count only the purchases with a recorded
  cost, and P/L only the units with one: a `held` entry with no cost (§2.2) adds its units to `units`
  and `value` and nothing else; when a sale takes its units, the sale's proceeds for them are uncosted
  (§3.7), which can change P/L, as it does under LIFO. A `held` entry at cost 0 is a purchase like any other.
- `invested = Σ amount` of buys with a recorded cost; `proceeds = Σ amount` of sells; `fees = Σ fee`.
- `unrecordedUnits`: the remaining units of the lots with no cost, after the sales are matched by the
  profile's lot scope and rule (`matchLots`, §3.7, the `HoldingContext` the Log's holding dates and the
  sale warning use; `DEFAULT_HOLDING_CONTEXT` when none is passed), where the units a sale's own venue
  cannot cover come from other venues' lots held at its date, and read through `heldLots` (§3.7), so the
  lots left are the ones `sellableNow` splits into now and later, and never more units than `units`.
- `average = Σ units of buys with a cost > 0 ? invested / Σ those units : null` (pay currency per unit;
  display rounding only).
- `price = prices[coin] in payCurrency` or `null`.
- `value = price !== null ? units × price : null`.
- Costed proceeds: each sale's `amount − amount × uncosted / units`, the quotient half-even at ten
  decimals, where `uncosted` is how many of the sale's units it took from lots with no cost (§3.7), at any
  venue, in matching or in `heldLots`' cover of units no lot held at the sale's date covers (imported
  data). A no-cost unit is held (`unrecordedUnits`) or sold uncosted, never costed.
- `pnl = (units − unrecordedUnits) × price + costed proceeds − invested`, or `null` without a price, or
  when the coin has purchases and none with a cost; `pnlPct = invested > 0 ? pnl / invested × 100 : null`.
  Without an entry of unknown cost this is `value + proceeds − invested`, whatever the context.
- `weight`: by value when every held coin is priced, else by invested (a coin without units and without
  a price weighs zero and does not stop the portfolio being priced; a coin with no cost and no price
  weighs zero too).
- `average` and `price` carry ten decimals, `pnlPct` four, `weight` and `multiple` six; display rounds.

Totals: `invested`, `proceeds`, `fees`, `value` (only when every coin with `units > 0` has a price;
otherwise `null`, never a partial sum), `pnl = Σ (units − unrecordedUnits) × price + Σ costed proceeds −
invested` over every coin, `pnlPct`, `multiple = (Σ costed proceeds + Σ (units − unrecordedUnits) × price)
/ invested`.

Property tests: without an entry of unknown cost every field is the same for any context; a `held` entry
without a cost never changes invested; `unrecordedUnits` is never more than `units`; a `held` entry at cost
0 counts in invested and P/L like any purchase. On imported data (sales before every lot, more sold than bought), for
any context, the units of `held` entries with no cost equal `unrecordedUnits` plus the sales' `uncosted` after
`heldLots`, `now + Σ later` of `sellableNow` equals `units`, and P/L is the formula above over `heldLots`' sales. Under
per-venue scope, for any entries the save accepts, the total
P/L is the sum of the positions' P/L, the lots left are those `sellableNow` leaves, and where every sale is covered by
its own venue the figures are the lot matching's alone. With every entry at one venue the per-venue matching equals the
global one, and for any entries each sale's unmatched units and the remaining units in total equal the global result.

Fees are *not* subtracted from P/L (the prototype shows them separately); keep that and state it in the
UI ("fees shown separately").

### 3.7 Holding eligibility — `eligibleFrom`, `lots`, `eligibility`, `sellableNow`

`eligibleFrom(date, rule)`:

| rule | eligible from |
|---|---|
| `none` | `date` (everything is always "eligible"; UI hides the concept) |
| `days: n` | `addDays(date, n)` — eligible when `today >= eligibleFrom` |
| `years: n` | `addDays(addYearsClamped(date, n), 1)` — the day *after* the anniversary; `addYearsClamped` clamps 29 Feb to 28 Feb |

The UI label follows `effect`: `exempt` → "tax-free from <date>", `lower-rate` → "long-term rate
from <date>"; the core returns the date and the effect, never the words. Where the rule is `none`
nothing is labelled. `ruleFor(date, rule, overrides)` picks the latest `holdingRuleOverride` whose
`acquiredFrom <= date` (on equal dates, the later in the list), otherwise `rule`, the plan's own
holding rule; `lotEligibleFrom` and `holdingStatus` date a purchase with
`eligibleFrom(date, ruleFor(…))`. Overrides exist for enacted changes that depend on the acquisition
date (Germany's draft reform would be one). The early-window check (a sell window that opens before
the last buy passes the rule, §2.1) does not apply overrides yet (planned: M2); every profile has none.
The profile's `holdingRuleConditions` are shown beside the first holding-status date on the surfaces
`docs/LEGAL.md` §4 names, as plain sentences the app cannot verify (Portugal's EU/EEA counterparty
rule), only while the plan keeps the profile's rule: the first in full, the rest behind one control
(`docs/CONTENT-STYLE.md` §3). The date line stands under them (`docs/LEGAL.md` §4).

One total order of a coin's entries, `compareEntries`: the date, then `createdAt` compared as moments, then the id, so
entries logged at one moment (the prototype import stamps one) still have one order and the result never depends on the
order the entries were stored in. `lots` lists its lots, and `matchLots` its sales, in that order.

Each kind has a role, `entryRole` (`packages/core/src/portfolio/effect.ts`): `dca`, `lump`, `extra` and `held` are
purchases, `move` is a move, `sell` is a sale; a kind without a role fails the build (`assertNever`). The role states what the entry does
to its coin's units and nothing else reads the kind for that: a purchase brings its `units` in (`unitsIn`) and takes
none out (`unitsOut` is 0), a sale takes its `units` out and brings none in, the units as stored, and a move brings
none in and takes out its fee in the coin, `units − received`. It also gives the entry's place among its coin's entries
of one date, `sameDayRank`: 0 for a purchase, 1 for a move, 2 for a sale, so purchases come first, then moves, then
sales, whenever they were typed. The matching order, `matchingOrder(a, b)`: the date, then the same-day rank, then `compareEntries`, so a purchase
and a sale on one date can match. `matchLots` and `runningHeld` read a coin's entries in it, and `saleWarning` takes the
entries before a draft sale in it.

`lots(entries, coin, scope, lotRule)`: the purchases of the coin in `compareEntries` order, each with `remainingUnits` after matching sells in the matching order: a sell consumes
only lots bought on or before its date (same-day buys first), the earliest first, or the latest first
where the lot rule is `lifo`; the other lot rules are matched FIFO here and named by the tax-year
export. Units a sell could not match (inconsistent data) are reported by `matchLots`, never dropped
silently. Each lot also keeps its open units by place, `places`: one `{ venue, since, units }` per place, none of them
empty, and the places sum to the lot's `remainingUnits`, never more and never fewer. A lot starts with one place, the
venue it was bought at (`null` when none was named) with `since` null, which means the units are still where they were
bought; a move adds a place at its `to` with `since` the move's date (below). A sale takes units place by place: each open lot's places are its pieces, and the sale's
group (below) is that of a piece's venue. `matchLots` also lists each sale, in `compareEntries` order, with its units, its `unmatched` units,
`uncosted`, the units it took from lots with no cost (a `held` entry without one), which leave out a matching share of its
proceeds in the Portfolio's P/L (§3.6), and `takes`, each lot it took units from as `{ lot, units, venue, since }` in
the order taken, `venue` and `since` the place the units were held at (Σ `takes.units` + `unmatched` = `units`). It
lists each move too, `moves`, as `{ id, units, fee, unmatched, atDestination, takes }` (Σ `takes.units` + `unmatched` =
`units`, the fee's takes first; `atDestination` the fee units taken at `to`, below), and `unmatchedUnits` counts the
sales' unmatched units and the part of each move's fee no piece of the coin covered, `to`'s included (`feeUnmatched`);
the Portfolio names them per coin on two lines, the sales' ("0.002 BTC sold without a purchase dated on or before the
sale. Check the dates and amounts in the Log.") and the fees' ("0.0005 BTC paid as a network fee that no purchase dated on
or before the move covers. Check the dates and amounts in the Log."), in the plan's locale; a fee taken at `to` shows on
neither, and units received that nothing outside `to` covers are never counted. Every write from this device keeps each sale covered by purchases dated
on or before it (#136): `runningHeld(entries, coin)` lists the coin's live entries in the order of one global
queue (the matching order, `matchingOrder`) with the units held after each, those before it plus its `unitsIn` less
its `unitsOut`, never below 0; `heldOn(entries, coin, date)` is
what a sale dated `date` can take, the fewest held from the end of that day on, so a sale never leaves a later one
short; `uncoveredSale(entries, written)` refuses a write (`sell-exceeds-held`, a sale with the units held before it, its units, its date and `written`, true when the write itself stores that sale (the sale saved or edited, or one restored), so the sale is named by its own date, never as a later one;
`fee-exceeds-held`, a move whose fee no piece of the coin covers, with the units held before it, its fee, its date and `written`, true when the write itself stores that move (the move saved or edited, or one restored), so its own fee is never worded as another move's,
ADR-0055: a move's units received are a venue matter and never refuse), an edit, a delete or an undo as well as a new entry, that leaves more units of a coin sold than bought, or more of them unmatched in one global queue, than before it. The refusal names the step the write left worse covered (`firstMadeWorse` in `packages/core/src/portfolio/shortfalls.ts`): the first whose units beyond those held before it grew, a step absent before counting from 0; when none grew, the first whose units beyond what all the coin's purchases leave it grew, with the fewer of the units held before it and that remainder. A sale or a move imported short and left as short is never named, so the sentence is true of the entry the write would leave short. A sale is also bounded by the units held in all (`heldUnits`, purchases less sales whatever their dates), so no write makes the units of a coin sold exceed those bought, or exceed them by more than imported data already did. The checks are
"no worse than before", so data imported short stays as written and unrelated writes still save; it uses the global
queue, because held units are defined by date alone (a per-venue mismatch is not a dating error). With `scope === 'per-venue'` a sale takes
its own `venue`'s lots first (entries without a venue form one group), then other venues' (below); with `'global'` all
entries of the coin form one queue. Countries whose computation model is `portfolio-wide` (France) or
`wealth-snapshot` (Netherlands) do not use lots for eligibility at all; their exports are described
in §3.13. This is the prototype's implicit rule
(it subtracted sold units from the eligible pool first) made explicit; FIFO is also the lot rule in
Portugal and Germany (confirm per country in `docs/JURISDICTIONS.md`; the lot rule becomes a field of
the country profile and a parameter here, default FIFO).

`eligibility(plan, entries, prices?, today)`:

- per coin with `units > 0`: `eligibleUnits = Σ remainingUnits` of lots with `eligibleFrom <= today`;
  `fraction = eligibleUnits / units`;
- `share`: value-weighted mean of `fraction` over the coins that have a price, else invested-weighted
  (exactly as the prototype, so golden tests compare like with like); `eligibleUnits` is capped at
  `units` when a sell exceeded what it could match;
- `allEligibleBy`: the max `eligibleFrom` over all lots with remaining units (the date the last
  purchase passes the rule);
- for `rule.kind === 'none'`: `share = 1`, `allEligibleBy = null`.
- units held with no recorded cost (a `held` entry without one, §2.2) count like any lot in `eligibleUnits`, `share`
  and `sellableNow`; in the invested-weighted fallback a coin held only at no cost weighs 0, since nothing is invested
  in it.
- The country's matching comes in as a `HoldingContext { overrides, lotScope, lotRule }` built by
  `holdingContext(plan, countryRules)`: acquisition-date overrides apply only while the plan uses the
  country's own rule (compared field by field), because a custom rule from Settings applies to every purchase.

Matching per venue (`matchLots`): the coin's events are matched in one global order, `runningHeld`'s (the matching
order, `matchingOrder`), so a sale reaches only lots bought on or before its date. A sale first takes its
own group's open lots by the lot rule. The units its group cannot cover (the save checks coverage in one global queue, so
it accepts such a sale) come from the other groups' lots still open at that moment, earliest first, or latest first under
`lifo`. A move is matched per venue whatever the scope (units sit at a venue even where the law pools them): it takes
its units sent from the pieces at its source by the lot rule, then from the pieces held anywhere but its `to` in the
same order: at the other venues, with no venue named, and those an earlier move delivered. The first units it takes are its fee, which leave their lot (`remainingUnits` drops); the rest stay in
their lot at a place at `to` dated the move, so a lot moved in part keeps its date and its cost and splits by place.
The part of the fee those pieces cannot pay comes from `to`'s own pieces by the lot rule and leaves the coin, never
added to `to` (`atDestination`, ADR-0055); units received never come from `to`. Units no piece outside `to` covers, less
the fee taken there, stay the move's `unmatched`. With 0.5 BTC at Ledger and nothing at Kraken, a move Kraken→Ledger of
0.05 sent and 0.04 received takes 0.01 from the Ledger lot: `atDestination` 0.01, `unmatched` 0.04, `unmatchedUnits` 0,
and 0.49 BTC held at Ledger. Deleting a move gives back exactly its fee. Units taken from a lot with no cost join `uncosted`;
only units no lot of the coin covers at that moment stay `unmatched`. So per-venue `unmatchedUnits`, each sale's
`unmatched` and the total remaining units equal the global result for any entries, and the Log's holding dates
(`eligibleUnits` per group) and the sale warning see a lot that another venue's sale took as gone. Per venue, FIFO, 1 BTC
`held` with no cost at Ledger on 2025-01-01, a sale of 1 BTC for €30,000 at Bitvavo on 2025-06-01, an extra buy of 1 BTC
for €100 at Ledger on 2025-08-01 and a sale of 1 BTC for €300 at Ledger on 2025-09-01: the June sale takes the January
lot (uncosted 1) and the September sale the August one, so at €60,000 the P/L is +€200 and the multiple 3, as under
global scope.

A move that sends more than the Log holds outside its destination is named, never refused (research Q10):
`moveShortfalls(entries, coin, context)` gives, for each live move of the coin in `compareEntries` order, a
`MoveShortfall` with its units sent; `outside`, the units the Log holds outside `to` at the move's place in the matching
order, per venue: the sum, over the venues other than `to`, of what `venueUnitsAtMove` gives (each venue counted from
0, never below), the figures the move form's source cards show; `short`, `sent − outside` when that is above 0, else
0; and from the country's `matchLots` `feeAtDestination` (`atDestination`) and `feeUncovered` (`feeUnmatched`). The
scope rule decides which moves it lists: per-venue lots list a move while `short` is above 0; global lots while `short`
and `feeAtDestination + feeUncovered` are both above 0. Under global lots the matching's pieces sit where global sales
left them, not where the Log shows the units, so a figure read from its takes would contradict the source cards: with
1 BTC bought at Kraken on 2026-01-10 and 1 BTC at Ledger on 2026-02-10, a sale of 1 BTC at Ledger on 2026-03-10 (global
FIFO sells the Kraken lot) and a move Kraken→Ledger of 0.5 sent, 0.4999 received on 2026-04-01, the move takes its fee
from Ledger's lot, but the Log holds 1 BTC at Kraken: no figure is wrong and no line shows. With the fixture's 0.02215
BTC with no venue, 0.08 BTC at Kraken, a move of 0.08 BTC Kraken→Ledger on 2026-09-01 and one of 0.05 sent, 0.0498
received on 2026-10-14, per venue the October move finds 0.02215 outside Ledger and is 0.02785 short; under global
lots its fee is covered outside Ledger and it is not listed. A listed move's source holds fewer units than it sends
(`sourceShort` is set), so the move form shows its short-source line. `moveShortfallOf(entries, move, context)` reads one
move as the save would store it; `movesLeftShort(entries, written, context)` names the stored moves a write leaves
listed that were not listed before, or whose measure (`shortfallMeasure`: `short` per venue, `feeAtDestination +
feeUncovered` under global lots) it made larger, the written entries left out (§6, "Save an entry" and "Record a move").

`heldLots(match)`: the lots as the units held count them (`bought − sold`, whatever the dates). A sale that no lot held at
its date covers (imported data; the save refuses it) leaves the lots more units than are held, so each sale's unmatched
units, in sale order, come off the oldest lots left, whatever the scope and rule, and so does the part of a move's fee
no piece of the coin covered, its destination's included (a fee only `to` covers leaves in matching). Units this takes from a lot with no
cost join that sale's `uncosted`, as when matching takes a no-cost lot: a no-cost unit is held (unrecorded) or sold
uncosted, never costed. The units it takes off a lot come off that lot's places too, from the first place on, and a
place left empty goes, so the places still sum to `remainingUnits`. The sale's `unmatched` and `takes` keep the match at its date, so the Portfolio's line about units
sold without a purchase dated on or before the sale still names them. FIFO, 1 BTC sold for €30,000 on 2025-01-01, 1 BTC
`held` with no cost on 2025-02-01 and an extra buy of 1 BTC for €100 on 2025-03-01: the sale's unit comes off the
February lot, so it is uncosted and its €30,000 drop out; the €100 lot is held, and at €60,000 the P/L is +€59,900 under
either scope (+€29,900 without the `held` entry, where the unit comes off the €100 lot). `sellableNow` and `portfolio`
(§3.6) both read the lots and sales through it, so the units sellable and the units out of P/L describe the same
remaining lots.

The venue figures take no lot rule: `venueUnits` and `venueUnitsAtMove` match per venue and FIFO whatever the country's
scope and rule, and every tax figure keeps the country's rule through `matchLots`. They say where the Log shows the
units, and a lot rule changes them only when a sale or a move takes units its own venue lacks; FIFO then takes the oldest
lots, the likeliest to have no venue, since data logged before the move step often lacks one (ADR-0054, option 6). Italy,
the one LIFO profile, matches globally, so no per-venue LIFO figure exists to agree with. That is one convention, not one
figure: the move form's source cards read `venueUnitsAtMove`, without `heldLots`, and `venueUnits` reads through it. A
sale of 0.2 BTC at Kraken on 2025-12-01 that no lot covers (imported data) and 0.5 BTC bought at Kraken on 2026-01-01:
a move on 2026-02-01 finds 0.5 at Kraken, where `venueUnits` gives 0.3 at the end of the date.

`venueUnits(entries, coin, date)`: the units of the coin held at each venue at the end of `date`, as
`{ venue, units }`, `venue` null for the units bought with none named. It matches the live entries dated on or before
`date` per venue and FIFO whatever the country's scope (units sit at a venue even where the law pools them) and rule,
reads the lots through `heldLots` and adds up their places by venue, so the venues sum to the units held then:
the purchases less the sales dated on or before `date`, never below 0. A venue with no units left is left out; the
venues come in the order of the first lot that still holds units there (`compareEntries`). Per venue, FIFO, 1 BTC bought
at Kraken on 2025-01-01, 1 BTC bought at Ledger on 2025-02-01 and a sale of 0.4 BTC at Ledger on 2025-03-01: on
2025-03-01 Kraken holds 1 and Ledger 0.6; on 2025-01-31 only Kraken, 1.

`venueUnitsAtMove(entries, coin, date, stored)`: the units of the coin at each venue at a move's place
in the matching order on `date`, as `{ venue, units }`: after the date's purchases and the moves before it, before the
date's sales. A move being edited (`stored`) keeps its `createdAt` and id among the date's moves; a new move (null)
comes after all of them, as `saveMove` places it (stamped at its `now`). `entries` leave out the entries being edited.
It matches the live entries before that place per venue and FIFO whatever the scope and rule, and adds up their
places by venue without `heldLots`, so a venue holds exactly what `matchLots` finds there when it reaches the move
(a sale no lot covered is not taken off the lots bought after it). Venues with none are left out, in the order of
`venueUnits`. Per venue, 0.05 BTC bought at Kraken and 0.02 BTC at Bitvavo on 2026-01-15 and a sale of 0.03 BTC at
Kraken on 2026-02-01: a move on 2026-02-01 finds 0.05 at Kraken, where `venueUnits` gives 0.02 at the end of the date.

`sellableNow(plan, entries, coin, today)`: `{ now, later }`, the units past the rule today and the units
that pass it later, by date, over the lots `heldLots` leaves. Shown as one line per coin in the sell phase
("0.1234 BTC sellable now, 0.0100 from 12 Mar 2030"). `now + Σ later` equals the coin's units held
(`portfolio`). On imported data that `heldLots` trims, taking the excess off the oldest lots is conservative, fewer
units past the rule; `eligibility` caps its count at the units held instead, and the two differ only on such data.

`saleWarning(plan, entries, draft, date, context, replaced?)`: for each sale of the draft, if it sells more units than
its own group's lots give it past the rule on `date`, return the sale's id (`sale`) and the text data for "only X of the Y
sold are past the holding rule on this date; the rest may be taxed" (port of `dateHint()`). Each sale counts only its own group, `venueGroup(venue,
lotScope)`, the lots it takes first: with `'per-venue'` its venue's lots (a sale without a venue counts the
lots without one), with `'global'` every lot whatever the venue; `eligibleUnits` with a venue counts the places in that
venue's group of the lots past the rule, without one every place.
The matching may also give it another group's lots for the units its group cannot cover ("Matching per venue" above);
the warning leaves those out, so it warns more, never less.
The entry form reads each sale as the save stores it (a grouped row can hold two sales of a coin at two venues): its
id is the entry `rowEntries` gives its row (§6), the row's own entry when that has the row's coin, else a fresh one,
so the warning names the sale the save keeps; its `createdAt` is that entry's, and a sale with a fresh id takes the
next of the save's fresh ids and `createdAt` now, as the save stamps it; its venue is that of the entry its row was
loaded from while the venue field is unchanged, else the field's. It reads all the draft's sales in one call, whatever
their venues, because the save matches them together and a sale its group cannot cover takes other groups' lots; each
warning's `sale` gives the form that sale's venue, which it names where a coin warns at two venues or more.
The warning matches the entries as the save leaves them: the stored entries less the draft's own and the `replaced`
ids (the entry form passes every entry being edited, because the save replaces or deletes each of them, a row whose
units were cleared included), plus the draft's sales on `date`. Each sale's units past the rule, for the warning, are
those of its own group's lots that the lot matching gives it, with the profile's lot rule and scope, in the matching
order (`matchingOrder`): the units past the rule of its group's lots, on `date`, after the purchases up to `date` and the sales
before it, less those after it is matched too; other groups' lots it takes are left out (above). So under `lifo` a sale that takes the latest lots can warn while a later one takes older lots past the
rule, and a stored sale dated after the draft takes nothing from it. The warnings are listed in draft order. Never
blocks the save.

### 3.8 Sell tranches — `sellTranches(plan)`

Port of `sellTranches()`; only when `sellWindow` exists:

| Part | When | Text |
|---|---|---|
| 1 | first month of the window | sell a third, whatever the price |
| 2 | third month of the window (`addMonthsClamped(opens, 2)`) | sell a third |
| 3 | the month the window closes | sell the rest; nothing is held past `exitBy` |

Each part carries its `month`, its `portion` (`third` or `rest`) and `done` from `plan.sellChecks`; the
words are the UI's. If the window closes before its third calendar month, parts 2 and 3 collapse onto
the closing month (tested).

### 3.9 Transactions (the Log) — `transactions(plan, entries)`

Port of `transactions()`:

- group non-deleted entries by `kind | date | (kind === 'dca' ? slot : '')`, except a move, which is a row of its
  own, `move | date | id` (`transactionKey`), so two moves of one day are two rows; a move's row has no holding date
  and stays out of the month's bought and sold totals; its Amount cell shows its units sent, and it opens to its
  units sent and route (the source with no venue named as the Log names it) and, when above 0, its network fee in the
  coin (`unitsOut`), and, when the scope rule lists the move (§3.7), its `outside` (a `MoveShortfall`, null for every
  other row) with the units the Log holds outside its destination, with Edit, which opens the move form on it, and Delete;
- per group: `total = Σ amount` of the items with a recorded cost, `null` when none has one (a `held`
  group with no cost), `fees = Σ fee`, items sorted by `amount` descending, the items with no cost last,
  `eligibleFrom` of the group's first item for buys (`null` for sells);
- sorted by `date` descending, then group key descending;
- `Skip`s are merged in as rows of kind `skip` dated on the slot's due date, so a skipped month is
  visible where the buy would have been;
- month headers: for each `YYYY-MM` of `date`, the bought and sold totals of that month; `bought`
  leaves `held` out, since coins received or held before the plan were not bought then (§3.10);
- the result is `{ rows, months }`; a transaction row carries the holding status of its first item
  (§3.7: a date and an effect, or nothing where no rule applies).

The UI shows the last 12 transactions, then "Show all N entries" (N the transactions; the Log calls each one an entry).
The tap sets the device preference `logShowAll` (§2.3), so the Log opens with all of them from then on.

### 3.10 Plan totals and progress — `planTotals`, `strip`

Port of `planTotals()` plus skips and pauses, and of the invested figure of the prototype's
`stripLine()` without the extra buys dated before `firstBuy` (§12):

- `slotCount = slots.length`, `activeSlots = slots not skipped/paused`;
- `plannedDca = activeSlots × monthlyAmount`;
- `plannedStarting = max(startingAmount, Σ lump amounts)`;
- `plannedTotal = plannedStarting + plannedDca`;
- `investedSoFar = Σ amount` of the live monthly buys and starting amounts, whatever their date,
  and of the live extra buys dated on or after `firstBuy`; sales and `held` entries never count, and
  `plannedStarting` reads `lump` entries only. Coins held before the plan or received are `held`
  (§2.2), whatever their date: the Portfolio counts their units (§3.6), the plan's totals do not, so an
  old holding does not show a new plan as fully invested. An extra buy dated before `firstBuy` is
  history in the same way: the Portfolio and Today's figure count it, the plan's totals do not (§12).
  Moving `firstBuy` or an extra buy's date moves that buy across the line; monthly buys and starting
  amounts count whatever their date. The Plan names what Portfolio's Invested counts and its figure
  leaves out, in one line under it while there is one, in every phase: the extra buys dated before
  `firstBuy`, and the `held` entries with a recorded cost (at 0 too), whatever their date. A `held`
  entry with no cost is in neither figure, so the line leaves it out;
- `percentIn = min(100, investedSoFar / plannedTotal × 100)` at one decimal, half-even, or `null`
  when nothing is planned (every slot skipped and no starting amount);
- `buysLeft = count of slots with status late/due/upcoming`;
- the strip (Buy / Hold / Sell / exit segments with a today marker): segment boundaries are
  `firstBuy`, `lastBuy`, `sellWindow.opens`, `sellWindow.closes`, `sellWindow.exitBy`; positions are
  `daysBetween(firstBuy, d) / daysBetween(firstBuy, exitBy)`; without a sell window the strip is
  Buy then an open-ended Hold, drawn as long as the buy phase and stretched to `today` once today is
  later, so the today marker always sits on the strip while the plan runs.

Property tests: a `held` entry, whatever its date and cost, and an extra buy dated before `firstBuy`
change no field of `planTotals`; an extra buy dated on
or after it adds its amount to `investedSoFar`, changes no other field but `percentIn`, and leaves
`percentIn` at most 100 and never below its value without it.

### 3.11 Prices, series and the Red day

`PriceSnapshot`: `{ at: Instant, prices: Record<CoinId, Record<CurrencyCode, Decimal>>, change24h?: Record<CoinId, Decimal> }`.
`change24h` is in percent, in the pay currency.
`PriceHistory`: per coin, `Array<[CalendarDate, Decimal]>` of daily closes, strictly ascending by date.
`PriceHistories`: `{ currency, coins: Record<CoinId, PriceHistory> }`, every coin in that one currency.

- `fxRatio(snapshot, from, to, coins)`: units of `to` per unit of `from`, implied by the first of
  `coins` (the plan's, in order) priced in both currencies (port of `fx()`; 12 decimals; `1` when
  `from === to`; null when no coin is priced in both); used only for the display-currency toggle, never
  to convert stored amounts.
- `valueSeries(plan, entries, histories, range)`: port of `valueSeries()`: on the grid of the longest
  history (on a tie, the first coin's) among the coins with entries that have at least two closes, the
  value at each date is `Σ unitsHeldOn(date) × close(date)`; units held on a date count the non-deleted
  entries with `entry.date <= date` (sales subtract; a negative holding counts as none); `close(date)` is
  the close on that date, else the next one, else the last (the prototype's `at()`). The range counts
  back from the last close (`7d`, `30d`, `90d` and `1y` = 365 days, both ends included); `all` starts at
  the first entry. Null when the histories are not in the pay currency, no coin has two closes, or no
  point has a positive value. Amounts are exact; the chart rounds.
- `valueRange(plan, entries, histories, range)`: the dates `valueSeries` covers, `{ start, end }`: `end`
  is the last close of that grid, `start` counts back from it as above, and `all` starts at the first
  entry or, when every entry is later, at `end`. Null for another currency or no coin with two closes;
  the chart names these dates when its first point is later or it has nothing to draw.
- `todayChange(portfolio, snapshot)`: port of `todayChange()`: each held coin's value 24 hours ago is
  `value × 100 / (100 + change24h)` (10 decimals); `{ amount, percent }` compares their sum with today's
  value (percent at 4 decimals). Null unless every held coin has a price and a change (never a partial
  figure), when a change is −100 % or lower, and when nothing is held.
- `heldValueSeries(holdings, histories)`: the portfolio with *constant current units*, so the figures
  reflect the market, not the user's deposits: `Σ currentUnits × close(date)` on every date of the
  longest history of the held coins. The shell passes all the history it has: the 90-day figures need
  the last 90 days, the all-time figure the whole series.
- `drawdowns(series)`, `drawdownNow(series)`: per date, `{ date, sevenDay, fromHigh90, fromAllTimeHigh }`
  in percent, as the research calibrated them (close today against the close seven days ago; the
  trailing 90-day high of closes): `sevenDay` against the latest value at least seven days earlier (null
  in the first week or from a zero); `fromHigh90` below the highest value of the 90 days ending on the
  date (that date and the 89 before it); `fromAllTimeHigh` below the highest value of the series so far.
  Percentages are truncated toward zero at four decimals, so a threshold is crossed only when the exact
  figure crosses it. One pass over the series. `drawdownNow` is the last date's, with that date, which
  the page shows ("(6 Feb 2026)").
- `redDay(drawdown, thresholds = RED_DAY)`: `true` when `sevenDay <= −10` or `fromHigh90 <= −30`.
  `RED_DAY` is a named constant with those defaults, with tests at the boundaries. Calibration
  (`docs/EDUCATION.md` §9 q): on Bitstamp BTC/USD daily closes from 16 Oct 2021 to 16 Oct 2026, a
  seven-day fall of 10 % or more held on 5.7 % of days, about six episodes a year; a close 30 % or
  more below the 90-day high on 11.8 %; either condition on 15.1 %. The module "When the market drops"
  states this frequency with that series and window, the fall page none (`docs/EDUCATION.md` §6,
  `docs/CONTENT-STYLE.md` §3).
- `redDays(series)`: each date flagged on its own drawdown. `redDayEpisode(days, today)`: the episode
  under way on `today` as `{ start, last }`, or null. An episode starts on a Red day; a later Red day
  belongs to it while at most six clear days lie between them; it ends once the condition has been clear
  for `RED_DAY.episodeClearDays` (7) consecutive days, missing days counting as clear. Flags dated after
  `today` are not read, so `start <= last <= today`. The banner shows on one visit per episode
  (`bannerFor` below); the page stays reachable from Learn.
- The complete-closes rule, which the Red day figures follow: the history route dates its last point,
  the live price at the fetch, with the UTC day of the fetch, so a copy's closes count only before the
  UTC day of its `fetchedAt` and never after the user's `today`. The red-day port (`redDay` on the
  Services, `packages/app/src/lib/services/red-day.ts`) drops the rest from each held coin's copy, then
  runs `heldValueSeries` at today's units and reads the episode from the recent drawdowns
  (`recentEpisode` in `packages/app/src/lib/services/red-day-model.ts`): `drawdowns` and `redDay` on
  the last 14 days first, read with the 90 days before them and one older point so each figure is
  exact, then on earlier 90-day blocks only while the episode could have started before what it read,
  with a pause between blocks. The episode and the flags it finds are those of `drawdowns`, `redDay` and
  `redDayEpisode` over the whole series (`packages/app/src/lib/services/red-day-model.property.test.ts`);
  why it reads less: Today's load, `docs/ENGINEERING.md` §4. A held
  coin outside the catalogue is named as missing without a read, and so is one with fewer than two
  complete closes; one failed read fails the figure as a whole (`failed`, which a retry can mend), and
  with no read failed and no held coin left with two complete closes the state is `no-history`. The
  maths and the past falls load on the port's first question, so Today's entry carries only its stub.
- `bannerFor({ today, redDay, ruleChange, annualReview, backupNeeded, dismissed })`: returns at most one of
  `red-day`, `rule-change`, `annual-review`, `backup-needed`, in that priority, or `null` (never stacked), with
  its key (ADR-0013 Readings). The shell adds the key to `dismissedBanners` when the user dismisses the banner:
  `red-day:<episode start>`, `annual-review:<today>` (`Later`) and `backup-needed:<today>`. The red-day key is recorded when the banner
  first shows, not on Dismiss, so it shows on one visit per episode, per device (the prefs never sync):
  `red-day:<d>` covers an episode starting on `s` when `s − RED_DAY.coverDays ≤ d ≤ today`, so a flag
  that clears and returns within a week does not show the banner twice, and the record
  (`withBannerKey(dismissed, key, today)`) keeps one copy of a key and drops `red-day:` keys older than
  `RED_DAY.keptDays`. `annualReview` is `reviewAsked` (§3.12); the review is a candidate while no
  `annual-review:<d>` key is fewer than `REVIEW_SNOOZE_DAYS` (30) days old, with `d` on or before today: a key
  dated after today (a clock set back wrote it) or one that is not a date snoozes nothing. `withBannerKey` keeps
  one `annual-review:` key at most: adding one drops the others, and adding another kind keeps only the latest
  dated on or before today, the one that can snooze. `Later` never counts as a review: only `Prefs.reviewedAt`
  does. On Today, when the visit starts with units held, the shell asks `bannerFor` twice: the red-day foot with
  the episode and no other kind, then, once that has settled on none or been dismissed, the next box with
  `redDay: null` and every other kind, which it renders each by its kind and passes the episode only to
  `reviewAsked`; with no units held it asks once, the next box's way, with no episode. The `rule-change` banner has no stored
  dismissal key: `plan.countryRuleVersion` records it, per plan, so other devices stop showing it and
  a change of country resets it (§3.12, `docs/JURISDICTIONS.md` §6). A dismissed banner
  is passed over and the next one may show; a dismissed backup banner stays away for
  `BACKUP_SNOOZE_DAYS` (90 days, ADR-0004).
- `backupNeeded(entries, prefs, account)`: live entries exist (`liveEntries`; deleted ones do not
  count), no account keeps a copy, and nothing was
  exported after the last change (`changedAt` later than `lastBackupAt`, compared as moments) or ever.
  An export that left out live rows from a newer version does not count (§3.13).

Past-cycle drawdowns shown on the Red day page are content (`packages/content`), not computed.

### 3.12 Reminders, annual review, rule changes

- `nextBuyReminder(plan, entries, today)`: the next slot (not done/skipped/paused) with
  `due >= today`, as `{ key, due }`, or `null` when no slot ahead is open (buying is over, or every slot
  left is paused or skipped; a late slot is never the reminder); Settings tells a paused plan, an ended one and
  one with no buy day left apart (`reminderGap` in `packages/app/src/features/plan/lib/reminder.ts`), and an ended plan gets no calendar file (`reminderFile`), also on the day of the end, whose buy day stays open in the app (§6); the shell schedules it at 09:00 local on `due` (the server stores `buyDay`,
  timezone and email as plaintext metadata so this works even when the plan payload is encrypted later).
- `reviewDue({ createdOn, reviewedOn }, today)`: `true` 12 months (`REVIEW_INTERVAL_MONTHS`) after the
  plan was created and every 12 months after the last review. The shell names the calendar days of
  `plan.createdAt` and `Prefs.reviewedAt` in the user's timezone (the core never derives a date from an
  instant, §1); the later of the two counts, so a review recorded before the plan existed is ignored,
  and the day is clamped (created 29 Feb 2028, due 28 Feb 2029). `nextReviewOn` gives the date.
  The two days come only from `useReviewDates` in `packages/app/src/lib/services`, so every screen names
  the same ones. Only `Mark as reviewed` on `/plan/review` writes `Prefs.reviewedAt`: the clock's now, on
  the prefs as stored, in a prefs-only write that stamps no `changedAt`, so no backup prompt follows;
  opening the page writes nothing. `Mark as reviewed` records the review only for the plan the page showed;
  when another tab has replaced or wiped the plan meanwhile, it records nothing. Its third part lists, for each coin held at the end of today, the units at each
  venue from `venueUnits` (§3.7) and the count of one-tap estimates among the coin's live entries dated on or before
  today (`reviewVenues` in `packages/app/src/features/plan/lib/venues.ts`), and writes nothing either. A JSON import that stores a plan whose id differs from the stored
  plan's, or with no plan stored, sets `reviewedAt` to null in the same write, since a review of the
  replaced plan would postpone this one's and be named as its; an import into the stored plan keeps it.
  A prototype import stamps `createdAt` at the import, so its review counts from that day.
- `reviewAsked(dates, today, { phase, held, redDay })`: what Today's foot passes as `annualReview` (§3.11):
  `reviewDue(dates, today)`, but `false` while a red-day episode is under way (`redDay`, the episode the foot
  read on this visit, whether its banner shows now or showed on an earlier visit: a review in a fall is the
  question ADR-0013 keeps away), and `false` in phase `done` once no units are held. A paused plan, an ended
  one and a plan past its exit date with coins held are asked. The banner names the later of the creation day
  and the last review's (`reviewSince`) and asks; no wording says a year has passed. `Review the plan` opens
  `/plan/review` and writes nothing; `Later` records `annual-review:<today>` (§3.11).
- `ruleChangeNotice(plan, countryRules)`: the profile carries `status.version`, `changedOn` and
  `changeNotice`; while `status.version > plan.countryRuleVersion` it returns
  `{ country, version, changedOn, changeNotice }` ("Portugal updated its rule for 2027. Review your
  plan."; a `null` sentence gets the generic one), else `null`; its `version` is what the plan
  records when the notice is seen (§3.11). The profile of another country is a programmer error, so the shell
  asks only when the rules it holds are the plan's country's: the generic profile of a country with no
  profile of its own carries another code and brings no notice. A plan on `XX` in a country that
  gains its own profile keeps `XX` and gets no notice. The notice reads the plan's own country's
  `status`. The change of country in Settings is the move, and its rows show the new country's rule.
  There are no launched plans to move, so nothing migrates them.
- `acknowledgeRuleChange(plan, version, now)`: the plan with `version` as its `countryRuleVersion`, never
  lowering it, and an `updatedAt` from `stampAfter`, as the risk acknowledgement's `acknowledge` has. Both
  `Dismiss` and `Review` on the banner record the notice: one write in the store's turn, on the plan as
  stored, holds the acknowledged plan; it writes nothing once the plan has seen the version, or when
  the plan stands in another country than the notice's (another tab moved it since the notice showed:
  that country's version is not to be overwritten). The write stamps
  `prefs.changedAt`, so the backup banner can follow the notice. The notice reads `status`, never
  `pendingChanges`. A write that fails keeps the notice on Today and says so in a toast.
- `underReview(status, today)`: `true` once `today` is later than `nextReviewDue` plus 12 months
  (`UNDER_REVIEW_MONTHS`), the day clamped (due 29 Feb 2028: not on 28 Feb 2029, yes on 1 Mar 2029); what
  the card then shows is `docs/JURISDICTIONS.md` §1, and the generic profile is never under review. Nothing
  is stored: the shell asks with `today` on each render.

### 3.13 Export and import

- JSON export (`proof-of-calm-backup-YYYY-MM-DD.json`; `exportFileName(slug, kind, today)` with the
  product's slug from the shell) = `exportBackup(plan, entries, exportedAt)` =
  `{ format: 'proof-of-calm', schemaVersion: 5, exportedAt, plan, entries }`; exports exclude deleted
  entries. It is also the sync payload shape and the backup format. The file is written through
  `writtenBackup`, at the lowest version that holds its plan and entries (§2.1, §2.2): version 5 when
  any entry is a move, else version 4 when any entry is `held`, else version 3 once an acknowledgement is recorded, else version 2 with the v2
  plan, so the previous build imports every file without a move and answers `newer-version` for one
  with it.
  The `format` marker stays `proof-of-calm` whatever the product is called, so that old backups keep importing.
- Import of a Proof of Calm file: `readBackup(json)` validates with the zod schema and answers
  `not-recognised` (no format marker), `newer-version` (a schema version above 5) or `invalid-backup`
  (each issue as `path: code`; a file that holds one entry id twice, which no export writes, is
  `entries: duplicate-id`); files at versions 2 to 5 import, a version 2 file (an earlier build's, or this one's) with its plan read through
  `upgradePlan`, with no acknowledgement (§2.1); `applyImport(current, file, mode, now)` then does "Replace everything"
  or "Add missing entries only" (by `id`; the file's skips and pauses are not merged), as the prototype.
  Imported rows are stamped `updatedAt = now` (ADR-0019), or one millisecond after the row stored here
  (its `updatedAt`, and its `deletedAt` for a tombstone) when `now` is not later, so that a clock behind
  another tab's never moves a row's stamp back and the write is strictly later, so it wins in sync
  (`stampAfter`; ADR-0021: a later write wins, an equal stamp goes to the higher device id); a replace keeps what it removes as tombstones (`deletedAt = now` for a row
  live here), so that sync deletes those rows rather than bringing them back, and stamps the tombstones it
  keeps as well (their `deletedAt` stays), so that an undo of their delete refuses (§6 "Delete entry");
  with no plan yet, both modes take the file's plan. The result counts `added`,
  `skipped` (live here already), `deleted` and `taken`: in "Add missing entries only" a deletion on
  this device wins, because a restored row would carry `updatedAt = now` and beat the tombstone in
  sync, so the file never brings back an entry deleted here and counts it as `deleted`. After the id
  check, a `dca` entry of the file for a month that a live `dca` entry here records, or that this
  plan skips, is not added and counts as `taken`, so a month is never recorded twice or both recorded
  and skipped; the file's coins of a month open here are all added. It adds and never deletes, so a
  deleted entry in the file is ignored (`added + skipped + deleted + taken` is the count of the file's
  live entries, the count Settings' file line names; a replace counts each of the file's entries as `added` and the other three as 0). An add that adds nothing
  writes nothing, so it does not count as a change for the backup banner (§3.11). Both modes keep the file's
  entries as written, a sale dated before the purchases that cover it included: §3.7's write check applies to
  writes from this device, and the Portfolio names the units such a sale leaves unmatched.
  "Add missing entries only" over a plan adds nothing from a file whose plan currency (a backup's
  `plan.payCurrency`, a DCA plan page file's `settings.base`, §7) differs from this plan's `payCurrency`
  (decided 2026-10-27): every logged amount is in the pay currency and never converted (§2.1), so adding the
  file's amounts as written would store them in the wrong currency. `applyImport` then returns this device's
  plan and entries unchanged, every count 0, and `refused: { code: 'currency-mismatch', file, plan }` (null
  otherwise); nothing is written, and Settings' import alert names both currencies (`docs/CONTENT-STYLE.md`
  §3). "Replace everything" and the import with no plan take the file's plan with its currency.
  An import in either mode, with or without a plan, that would leave more than `MAX_ENTRIES` live entries
  (§9; the backup schema's cap) applies nothing in the same way and returns `refused: { code: 'too-many-entries',
  entries, file, max }` (the live entries after it, the file's live entries, the cap); with no plan the result
  carries the file's plan, and nothing is written either way, so that the next export of
  whatever an import leaves reads back. A backup holds at most the cap, so only "Add missing entries only" over a
  plan, or a DCA plan page file (§7, whose import goes through `applyImport`), can reach it.
  Settings reads no file over `IMPORT_MAX_BYTES` (§9): it checks the size before reading the text and names the refusal in the same alert.
  Last, `applyImport` reads every entry it would return with `EntrySchema` (decided 2026-11-09, so that no
  entry reaches a row that its own build, or the one before it, cannot read): one that fails applies nothing in
  the same way and returns `refused: { code: 'invalid-entries', ids }` (the failing entries' ids), and the
  import alert counts them. A DCA plan page file is read the same way in `importPrototype` (§7), whose
  `invalid-entries` error stores nothing and shows the prototype file's alert.
- Import of an exchange's export (decided 2026-11-13, ADR-0056): `readExchangeFile(text)` recognises the
  file and reads it into `{ exchange, rows, first, last, movements, leftOut }`, or refuses it with an
  `ExchangeFileError`. Kraken's ledger is the one export it reads. "Text starting with `PK\^C\^D` is `zip`; a
  header with ordertxid and pair is `kraken-trades`; a header whose names, a last empty one dropped, are all
  among the ledger's (txid, refid, time, type, subtype, aclass, subclass, asset, wallet, amount, fee, balance,
  amountusd) is a Kraken ledger, which is `missing-columns`, naming each, when it lacks txid, refid, time,
  type, asset, amount or fee; a ledger with no data row is `no-rows`; anything else is `not-recognised`." K8
  holds the headers that end in an empty name (a trailing comma) and that add amountusd. The text is split
  by `csvRows` as RFC 4180 reads it (LF, CRLF or CR line ends; a leading byte-order mark dropped). "A blank
  line (one empty cell, or every cell empty) is not a row: the reader skips it, it counts nowhere, and a
  ledger with only blank lines after its header is `no-rows`." A later row keeps its line in the file. "The
  reader reads txid, refid, time, type, subtype, asset, amount and fee by header name, in any order, and never
  reads aclass, subclass, wallet, balance or amountusd." "A time `YYYY-MM-DD HH:MM:SS(.f)` reads as that UTC instant with `Z`; a movement's `at` is its
  coin row's." "Numbers are normalised with `parseDecimal`; a negative zero reads as 0; a fee is its absolute
  value." "A row with an empty txid is a transaction Kraken did not complete (K8): it is dropped, counts in
  rows and in first and last like an identical repeat, and leaves the other rows of its refid as they are."
  Any other txid, and a refid or type, that is empty or outside printable ASCII is unreadable. "A row with an
  unreadable required cell leaves its refid's rows out whole, named by line and column." "A txid twice with
  the same cells keeps one; with different cells, both refids are left out." "Legacy codes normalise as K1,
  K6 or K8 list them (XXBT and XBT to BTC, XETH to ETH, XXDG and XDG to DOGE, ZEUR to EUR, …), each cited
  beside its line." "Fiat is every code K8 lists as fiat (EUR, USD, GBP, CHF, CAD, JPY and AUD among them),
  after normalisation." These are the plain codes of K8's Z-prefixed fiat codes and each government currency
  (ISO 4217) in K8's quote assets, AED first among them; the stablecoins there (USDT, USDC, DAI, PYUSD, …)
  stay coins. "A code ending in one of K8's staked suffixes loses the longest one it ends in,
  then any other dot suffix is cut at the dot, then the legacy map applies; every such code is a balance
  within Kraken, whose rewards are named under the coin before the suffix." K8's staked suffixes are .CORE,
  .HOLD, .INK, .M, .P, .S, 03.S, 04.S, 07.S, 14.S, 21.S and 28.S, so DOT28.S is DOT; .F (K6) and any other
  dot suffix are cut at the dot. ETH2.S is ETH2, as K8 reads it.
  "The bonus rows K1 documents are receipts for a coin; staking, and earn with the reward subtype, are rewards; other earn subtypes, transfer, suffixed and KFEE rows are within Kraken; a deposit or withdrawal
  is cash for fiat and a coin deposit or withdrawal for a coin; every other type is other." A bonus in fiat
  is cash, since an entry's coin is never a currency. "Each type and
  subtype word comes from K1 or K6, cited beside it." (The K keys name the sources
  ADR-0056 cites: Kraken's help pages and API, and a third-party parser.) "Rows pair by refid. A trade, or a spend with a
  receive, of one fiat leg and one coin leg is a purchase when the coin leg is positive and a sale when it is
  negative; two coin legs are a conversion; two fiat legs are cash; any other number of legs is unpaired." A
  coin leg of 0 is unpaired. "A purchase's units are the coin amount less a fee in the coin, a sale's the
  coin amount plus it; units over 10 decimals are cut toward zero and flagged." "A purchase's amount is the
  fiat amount less v, a sale's the fiat amount plus v, and the fee is the fiat fee plus v, where v is the coin
  fee × fiat amount ÷ coin amount, half-even at the currency's minor unit (`MINOR_UNITS`); a currency outside
  `MINOR_UNITS` keeps its raw figures, since the plan leaves it out." So a movement's amount and fee follow
  §2.2's rule. A movement carries its key (`poc-csv-1|kraken|<refid>|<COIN>|<in|out>`, COIN the normalised
  code, so XXBT and BTC give one key), its lines (the header is line 1), `at`, its role (`purchase`, `sale`
  or `receipt`, the bonus's units at no cost), the coin, the units with `unitsCut`, the currency, amount and
  fee (null for a receipt) and `feeInCoin`. Decided 2026-11-13 (ADR-0056, Corrections): the receipts of one
  refid and coin fold into one movement, every line kept and sorted, `at` the earliest row's, its units the
  sum of |amount − fee|, cut and flagged after the sum; a receipt of the coin its refid's purchase bought is
  `unpaired`, named by its line, and the purchase keeps the key. A left-out row carries its reason (`reward`,
  `coin-deposit`, `coin-withdrawal`, `cash`, `within`, `conversion`, `unpaired`, `unreadable` or `other`),
  its lines, its time (the earliest of its rows'), and for a row left out for its type its coin and units
  (|amount − fee|), for an unreadable refid the column and no time. "No refusal, left-out row or thrown error holds a cell's text."
  No raw row, txid, refid or balance is stored. The import's preview shows in Settings (`docs/CONTENT-STYLE.md` §3
  row `Import an exchange's file`); the Log's review and the second exchange's import are planned (M2).
- Meeting the Log (decided 2026-11-13, ADR-0056): `planExchangeImport(file, stored, choices, context)` turns
  the reader's movements into the entries an import would add and names everything it leaves out; it writes
  nothing. The shell passes `today`, `now`, `idOf` (the id of a key, below) and `dateOf`: "The shell dates
  each instant in the device's zone, `dateOf = (at) => todayIn(epochMs(at), clock.timeZone)`; the core never
  dates an instant." "A purchase or sale paid in another currency than the plan's is left out, counted per
  currency, and never converted (ADR-0053)." A receipt at 0 imports whatever the file's currency; when no
  purchase or sale is in the plan's currency, the plan names the file's currencies. "A coin outside the plan
  is left out and named with the fix", with its units. A date group is all of a coin's purchases (or sales,
  or receipts) on one local date. "Each step works on the rows the earlier steps left":
  1. "An imported row's id is derived from its key (D11): a live id is `imported earlier` and a tombstoned
     one `deleted on this device`; neither is added." (D11 is ADR-0056's id rule: a hash of the movement's key, which the shell's `idOf` gives, so
     the same row has the same id on every device and in every later export.)
  2. "Hand-recorded entries (source `manual`, `import-prototype` or `import-json`; `held` entries and moves
     claim nothing), in `compareEntries` order, claim unclaimed dates: a live monthly buy of C for S claims
     C's purchase date nearest S's due within 15 days; every other hand-recorded purchase or sale, and a
     monthly buy that claimed nothing, claims C's nearest date of the same role within 3 days of its own
     date; the earlier date wins a tie; each entry claims one date and each date is claimed once. A claimed
     date is `looks recorded already`: left out and named with both figures and the entry's venue." The 3
     days are `IMPORT_TYPED_DAYS` (§9). Decided 2026-11-13 (ADR-0056, Corrections): "Every step that leaves
     a purchase out runs before any step that stores one: no purchase a hand entry records is stored, and
     none dated on or before a `held` entry of its coin is stored without the person's answer, whether the
     file comes at once or a shorter export comes first." (D2 is the order of this list.)
  3. "In a plan with a starting amount above 0, the purchases dated within 15 days of `firstBuy` are left
     out and named, since the file cannot tell the starting amount from the first monthly buy; a one-tap
     `lump` estimate is never replaced." A date step 2 claimed is `looks recorded already` and is not
     counted here.
  4. "C's purchases and receipts dated on or before the latest live `held` entry of C, at any venue, are
     `may be the coins you added`: left out unless the person ticks `Add these purchases too`, one answer
     for all of them." A `held` entry an exchange import added (a receipt) guards nothing. Ticked, they go
     on to steps 5 and 6, so an estimate whose month has no other purchase stays an estimate until the
     person ticks.
  5. "The live one-tap monthly estimates of coin C for month S take C's purchase date left whose month
     (step 6) is S, nearest S's due date, the earlier on a tie." "The write tombstones them all and adds
     that date's purchases as monthly buys for S, with the note of the first of them in `compareEntries`
     order and the import's venue, whatever venue they carried." Two devices can tap one month, so a
     month's estimates of a coin go together. No estimate takes a date of another month, so a shorter
     export imported first replaces the estimates the whole file replaces.
  6. The months: "A purchase date's month is the plan's month with the anchor nearest it, the earlier month
     on a tie: a month's due date reaches 15 days either side (`IMPORT_MATCH_DAYS`), and each one-tap
     monthly estimate of the coin for that month, live or tombstoned, reaches from 3 days before its date
     (`IMPORT_TYPED_DAYS`) to the day after; a date no anchor reaches makes an extra buy." The one tap is
     dated the tap day, so a late buy tapped within 3 days keeps its month. A tombstoned estimate keeps its
     date (`deleteEntries`), so a later import dates the same purchases alike until sync purges the
     tombstone (M3). Then "for each plan coin with a share above 0 and each month that was late, due or upcoming before the import, the
     coin's unclaimed purchase date nearest the due date, among the dates whose month it is, fills the month
     with all its purchases; the coin's other purchases are extra buys." Done, skipped and paused months
     take extra buys, and a coin at 0 % takes only extra buys. A sale is a `sell` and a receipt `held` at
     amount `'0'` with no fee.

  "The import never changes or tombstones a hand-recorded entry, a `held` entry, a move, a skip, a pause, the
  plan, a tombstone, an entry imported earlier (edited or not) or another exchange's entry; only one-tap
  monthly estimates are tombstoned. No step reads an amount or a venue to decide." Every entry the plan adds
  has source `import-csv`, the venue the person chose (or none), `createdAt` the trade's instant and
  `updatedAt` now. The reader's left-out rows are named by reason with their lines, rewards with their units
  per coin; transfers within the exchange, cash and other kinds are only counted. A coin withdrawal is named
  as having a move or not: "A withdrawal has a move in the Log when a live move of its coin, sent from the
  import's venue, is dated within 1 day of it and sends exactly its units (amount plus fee)", each move
  answering one withdrawal. The plan counts the entries it adds whose units were cut to 10 decimals and
  whose fee was in the coin, "valued at the trade's own price", for the preview.
- The write (decided 2026-11-13, ADR-0056): `applyExchangeImport(stored, plan, now)` writes a plan in one
  write, all or nothing, and Settings' `exchangeImportActions` (`packages/app/src/features/settings/exchange-actions.ts`)
  runs it in the domain store's queue on the entries as stored. Rows from a newer version (below) refuse it
  (`newer-rows`), and so does no plan (`no-plan`). "The preview is computed again on the stored rows with
  the same choices. Any difference in ids, kinds, months or figures writes nothing and shows the new
  preview" (`changed`, with the new plan): `sameImport` compares every field but `updatedAt` of the
  entries added and of the estimates tombstoned (the set across all items), so another tab's one tap, its
  delete or edit of an estimate (amount, units, venue, date or note) or the same import refuses it. The
  preview Settings shows is pinned: it is computed from the plan, the Log and today's date when the file
  is read and when a choice (the venue, the held answer) changes, not when another tab writes or the day
  turns, and Import passes it as the shown plan, so the write refuses `changed` when the plan or the Log
  moved since in a way that changes what the file adds. A new day alone changes nothing the file adds:
  today reaches the plan only through the months' statuses, and late, due and upcoming months are all
  filled. The refusal pins the new preview with the choices kept. Step 5's write: "The write tombstones them all and adds that date's purchases
  as monthly buys for S, with the note of the first of them in `compareEntries` order and the import's
  venue, whatever venue they carried." "A replaced estimate is tombstoned with `deletedAt` and `updatedAt`
  at `stampAfter(now, its updatedAt)`", and the tombstone keeps every other field of the estimate, so a
  later import dates purchases by its date and month (step 6). "`applyExchangeImport` refuses
  `too-many-entries` past `MAX_ENTRIES` live entries and `invalid-entries` for any entry `EntrySchema`
  refuses, and returns the stored entries unchanged." One write never stores two rows under one id: the store
  puts rows by id, so the second would replace the first while the count named both. A plan whose entries
  repeat an id is refused `invalid-entries` with the repeated ids, and the stored entries are returned
  unchanged, as the backup refuses a file with a repeated id (`duplicate-id`; decided 2026-11-13). "An import that adds nothing writes nothing";
  otherwise only the tombstones and the entries added are written. A replaced estimate takes the file's
  amount before the fee, so when the planned amount also paid the fee, Invested, the percent in and the
  average cost drop by it (accepted 2026-11-13).
- Rows from a newer version on this device (ADR-0019 Readings, "Row shape"; decided 2026-10-30): while any
  such row exists, a tombstone included (`newer.plans + newer.entries + newerTombstones > 0`), both imports,
  a backup in either mode and a DCA plan page file (§7), are refused, and Settings' action checks this
  inside the write, before `applyImport`, which sees only the rows this build reads. Nothing is written, and
  the import alert names the fix (`docs/CONTENT-STYLE.md` §3). The JSON and CSV exports still run with what
  this build reads. While a live one exists (`newer.plans + newer.entries > 0`) the JSON export leaves
  `lastBackupAt` as it was, since the file is no backup of those rows, and Settings' data section names the
  entries left out. A tombstone holds nothing a person would lose, so an export beside tombstones alone
  stamps `lastBackupAt` as usual and names nothing. Below the import, a write whose plan is held at a later
  version writes nothing at all (ADR-0019 Readings, "Row shape").
- "Delete everything" (the stores cleared at once, with an Undo) is owned by ADR-0019 Readings.
- CSV export of the log (`proof-of-calm-log-YYYY-MM-DD.csv`), `logCsv(plan, entries, context)`: columns
  `date, coin, kind, slot, amount, currency, units, price, fee, holding_eligible_from, note, venue, to_venue, units_received`
  (`price = amount / units` as the entry form derives it, half-even at `PRICE_FIGURES` significant figures or at
  the currency's minor unit when that keeps more, `quotientSignificant` (§6), so it is never 0 for a coin under a
  cent: 10 for 813,008 PEPE exports 0.0000123; `kind` `lump` is exported as `initial` as in the
  prototype, `held` as `held` and a move as `move`; `amount` and `price` are empty for a `held` entry with no recorded
  cost and for a move, and `to_venue` and `units_received` are empty on every row but a move's); entries in date order, one day's in creation order; `holding_eligible_from` is empty for
  sales and moves and where no rule applies; the note, like every free-text cell (the venue in the tax-year export),
  and the coin, since a `CoinId` may start with `-` (`-A1` reads as the formula `=-A1`), go through
  `textCell(text)`, while the other cells cannot start with a trigger (dates, codes, and amounts, units and
  fees that an entry never holds negative): the text, and every piece of it after a `;` or a line break (CR or LF),
  that starts with `=`, `+`, `-`, `@`, a tab or a CR is prefixed with `'`, then the cell is quoted per
  RFC 4180, so that a spreadsheet never runs it as a formula, also one that splits a double-clicked file on
  `;` and so ends a record at a quoted line break (a de or pt locale, #207); the file stays comma-separated.
- Tax-year export (M2), aligned to the country's tax year and shaped by its computation model; data, not a computation of tax:
  - `per-lot`, `taxYearLots(plan, entries, rules, span, today)` and `taxYearLotsCsv(lots, header)`, for a country whose lot rule is `fifo`, `lifo` or `unspecified` (matched FIFO, as in §3.7); any other model or lot rule throws a `RangeError`. The span is `taxYearSpan(rules.taxYear, endingIn)`, named by the calendar year it ends in (`taxYearEndingIn`, `taxYears` newest first, `defaultTaxYear` the latest ended year, else the running one).
    - Rows are lot pieces from `matchLots` over the live entries dated on or before `span.to`, the matching the Log and Portfolio read: one piece per sale dated in the span that took from a lot, one for what the lot still holds at `span.to` (so a later sale never shrinks it), and one per sale in the span with units no lot covered, its acquisition cells empty, and one per move in the span with fee units no lot of the coin covered, its destination's included (`feeUnmatched`, §3.7), its acquisition cells empty and, as a fee piece, no sale venue or proceeds; both set `unmatched`. A fee a move took at its destination, since nothing outside it was left (ADR-0055), is a fee piece of the lot there, with its acquired date and cost share and `held_at` the destination. Such a piece counts in `feeAtDestination` only when `moveShortfalls` (§3.7, over the same entries, lot scope and lot rule) lists its move: under global lots the matching can take a fee at the destination while the Log holds enough outside it (the Kraken→Ledger example of §3.7), and that piece stays in the file uncounted, since the Log names nothing to check. So the last year end equals Portfolio's units whenever no row lacks an acquired date. On imported data that the save refuses, the file's held units then exceed Portfolio's by those unmatched units, which Portfolio takes off the oldest lots (`heldLots`, §3.7). The sale warning reads the same matching but counts only the lots of the sale's own venue group (§3.7), so a sale that takes another venue's lot can warn that none is past the rule where the file shows that lot past it: in Portugal (per venue, 365 days), an extra buy of 1 BTC for €20,000 at Ledger on 2024-01-01 and a sale of 1 BTC at Bitvavo on 2026-04-01 get the warning, and the 2026 file's row of the Ledger lot has `past_holding_rule` `yes`. The header's `crossVenue` count is where the file names those takes.
    - Columns: `kind, acquired, coin, venue, units, cost_basis, fee, eligible_from, past_holding_rule, disposed_on, sale_venue, proceeds, disposal_fee, units_estimated, held_at, moved_on`. `kind` uses the log's codes (`lump` is `initial`); `venue` stays the purchase venue and `held_at` is where the piece's units were when sold, paid as a network fee, or at the year end (empty for no venue and on a piece with no acquired date, whatever venue the sale named), `moved_on` the date of the move that put them there (empty while they are where they were bought); `sale_venue` is the sale's own venue, and the `crossVenue` count compares it with `held_at`; a fee piece, the units a move paid as its fee, is dated on the move in `disposed_on` with no sale venue, proceeds or `past_holding_rule`, and sets `moveFees`; `units_estimated` is `yes` for a one-tap lot. `coin`, `venue`, `sale_venue` and each header line go through `textCell`; amounts are padded to the currency's minor digits and keep a third decimal of their own.
    - Holding: `eligible_from` by the country's rule and its acquisition-date overrides, never the plan's own rule (the result's `planRuleDiffers` says when they differ, for the header). `past_holding_rule` is `yes` when `eligible_from` ≤ `disposed_on` on a disposal row, or ≤ min(`span.to`, today) on a year-end row; empty where the country has no rule.
    - Rounding: a lot's cost and fee are shared over its takes in matching order across every sale up to `span.to`, then its rest, and a sale's proceeds and fee over its takes, then its unmatched units: `cumulativeShares` (piece k = the half-even share of the units through k minus the share through k − 1, at the currency's minor digits or the figure's own), so a piece has the same figures in every year's file that shows it. A `held` lot with no recorded cost has empty `cost_basis` and `fee`, never 0 (`uncosted`); one at cost 0 shows 0.00.
    - Order: the plan's coins in its order, then any other coin of the log; per coin the lots in `compareEntries` order, each lot's disposal pieces before its year-end piece, then the coin's unmatched rows by sale or move. The file: the header lines the shell words (rule, span, `ongoing` while today ≤ `span.to`, and the flags `uncosted`, `estimated`, `unmatched`, `crossVenue`, `moveFees`, `feeAtDestination`, `planRuleDiffers`), one empty row, the columns, the rows.
    - File name, `taxYearFileName(slug, span, code, today)`: `proof-of-calm-tax-year-2026-PT-YYYY-MM-DD.csv`, a year across two calendar years `2026-27`; it ends with the export day, so the running year's partial file and a later corrected one differ.
  - `portfolio-wide` (France), `taxYearCessions(plan, entries, rules, span, histories, today)` and `taxYearCessionsCsv(file, header)` (decided 2026-11-08); any other model throws a `RangeError`. Per sale, what form 2086 asks that the log records (the date, line 211; the proceeds, 213; the sale fee, 214), the parts of line 212 and the gross sums toward line 220. Nothing from line 221 on: no fraction of capital, no net cost, no gain, no total for the year and no threshold test (`docs/JURISDICTIONS.md` §1).
    - Blocks: one per live `sell` entry dated in the span, and on or before today while the year runs (`ongoing`), in `compareEntries` order across every coin, numbered `cession` 1 to n. Each block is one `holding` row per coin with units above 0 just before the sale, in `coinsWithEntries` order, then the `sale` row. "Before the sale" is the live entries ordered before it by `compareEntries`, all coins and all years (a same-day entry created before the sale counts, one created after does not): purchases and `held` add, sales subtract, and a negative holding counts as none. No purchase rows and no rows for sales before the span: the log CSV lists every entry.
    - Columns `row, cession, date, coin, units, units_estimated, venue, sale_price, sale_fee, price, price_source, value, estimated_portfolio_value, purchase_costs_to_date, purchase_fees_to_date, held_without_cost_to_date`. `date` is the sale's on both kinds of row; `units` the units held just before the sale on a holding row, the units sold on the sale row; `units_estimated` is `yes` on a holding row when a one-tap entry counts in its units, on the sale row when the sale or any of its holding rows is. Sale rows only: `venue`; `sale_price` and `sale_fee` as logged (the fee empty when none was recorded, never 0, and never taken off the price); `estimated_portfolio_value`, the sum of the block's written `value` cells, empty when one of them is, and empty when the log holds fewer units of the coin sold just before the sale than the sale sells (`short`; the units summed across venues as the holding row counts them, which imported or incomplete data can leave; the holding rows stay, the coin sold's own row valued at the sale price), since the log cannot back an estimate of a holding it does not record; `purchase_costs_to_date`, the sum of the recorded amounts of every `dca`, `lump`, `extra` and costed `held` entry before the sale, never reduced by earlier sales; `purchase_fees_to_date`, the same entries' fees; `held_without_cost_to_date`, the count of `held` entries before the sale with no recorded cost (a recorded 0 is a cost).
    - Prices, holding rows only: the coin sold at the sale's own price (`price_source` `sale`; `price` = amount ÷ units as the log CSV writes it, `value` = amount × held ÷ sold, so a whole holding sold is worth exactly its sale price); the others at the close dated the sale day (`close`, ADR-0036: the price at 00:00 UTC on the next day; an exact-date lookup, never a neighbouring close), each `value` units × close; with no such close, or histories in another currency, `price`, `price_source` and `value` are empty and the coin is listed in `missing`. Values come from closes only when the shell gives them, and it gives none from CoinGecko, so until the reference closes of `packages/data` exist (planned: M2) the estimate fills only when the coin sold is the only coin held. The result also carries `estimated`, `uncosted` (a `held` entry before a sale with no cost) and `unvalued` (the sales with no estimate: a holding with no value, or a `short` sale) for the header the shell words.
    - Rounding as the snapshot file: `value` and the estimate half-even at the currency's minor digits, the amounts as logged padded to them. `packages/core/test/tax-year/fr-2026.csv` is worked out by hand in `packages/core/test/tax-year/fr-fixture.ts`.
  - `wealth-snapshot` (Netherlands), `taxYearSnapshot(plan, entries, rules, span, histories, today)` (decided 2026-11-08); any other model throws a `RangeError`. The years offered and the default year are the per-lot file's (`taxYears`, `defaultTaxYear`).
    - Dates: `reference` is the model's date inside the span (`01-01`). The Dutch "1 January" value is the holdings at the start of that day, which is the end of the day before: `opening` is `snapshotValue` of 31 December of the year before, with the entries dated on it and the close dated on it. `closing` is `snapshotValue` of `span.to`, null while today ≤ `span.to` (`ongoing`), so the year-end cells stay empty while the year runs.
    - Rows: one per coin held on the eve of `reference` or with a live entry dated from `reference` to `span.to`, the plan's coins in order, then the others. Each holds the opening units and value, the year's purchases (`dca`, `lump` and `extra`: units, amount, fee), its `held` entries in their own columns, never as purchases (units and cost; the cost is null when any of them has no recorded cost, which sets `uncosted`), its sales (units, proceeds, fee), and the closing units and value. On a log with no short sale, closing units = opening + bought + held − sold − fee units, `fee_units` the units the year's moves paid as their fee.
    - Flags for the header the shell words: `ongoing`, `uncosted`, `estimated` (a one-tap entry dated on or before `span.to`) and `heldInYear` (a `held` entry dated in the year). The header names `held` entries dated in the year, since such coins may have been there on 1 January, which the roadmap's M2 "Decided against" accepts (§2.2).
    - Missing closes: a coin with no close dated on the eve or on `span.to`, and every held coin when the histories are not in the pay currency, has empty value cells and is listed in `opening.missing` or `closing.missing`; the file still saves. The shell passes no closes, since no downloaded file holds values derived from CoinGecko data (ADR-0036 Readings, 2026-11-08): every held coin's value cells stay empty (a coin held at 0 units is worth 0.00) and the header says so rather than naming coins, until the reference closes of `packages/data` exist (planned: M2).
    - File, `taxYearSnapshotCsv(snapshot, header)`, laid out as the per-lot file: the header lines, one empty row, the columns `row, coin, units_on_<MM-DD>, value_on_<MM-DD>, bought_units, bought_amount, bought_fee, held_units, held_cost, sold_units, sold_proceeds, sold_fee, fee_units, units_on_<MM-DD>, value_on_<MM-DD>` (the reference date, then `span.to`), one `coin` row per coin, then one `total` row. `coin` and each header line go through `textCell`. Each amount cell is rounded half-even at the currency's minor digits and padded to them; units are written as stored. The `total` row's units cells are empty and each amount cell is the sum of the written cells above it, empty when one of them is, so the file adds up as a reader sums it (ADR-0017): in `packages/core/test/tax-year/nl-2026.csv` the 1 January total is 30679.01 + 7502.62 = 38181.63, where the exact 38181.63735 would round to 38181.64.
- Tax-year raw listing for the lot rules the app does not match (`pooled`, `specific`, `average`; decided
  2026-11-07), `taxYearPool(plan, entries, rules, span, today)` and `taxYearPoolCsv(pool, header)`: nothing is
  matched. A coin with a disposal dated in the span, a sale or a move whose fee in the coin is above 0, lists
  every live entry dated on or before `span.to`, whole, because a pool needs the earlier disposals (buy 1 at 100, sell 1, buy 1 at 200: the
  section 104 pool's cost is 200, not 150) and a coin fee, a disposal of the fee units in the US
  (`docs/JURISDICTIONS.md` §7.5), takes its basis and holding period from the earlier purchases. Every country
  of this listing widens on a move's fee, since the listing only lists the person's entries and treats none as
  taxed. Under `pooled` it also lists the purchases dated from `span.to` + 1
  to `span.to` + `POOLED_MATCH_DAYS` (§9) that the log holds on the export day, since the UK matches them to a
  disposal in the year (s. 106A: a buy on 6 April to a sale on 20 March). `windowOpen` is true while today ≤
  `span.to` + `POOLED_MATCH_DAYS` under `pooled` (false otherwise), `ongoing` while today ≤ `span.to`. A coin
  with no disposal in the span lists its entries dated in the span. Order: the plan's coins, then any other coin with
  entries, each coin's entries in `compareEntries` order (§3.7). Columns `kind, date, coin, venue, units,
  cost_basis, fee, eligible_from, proceeds, disposal_fee, units_estimated, to_venue, units_received`: `kind` in the Log CSV's codes; a
  purchase fills `cost_basis`, `fee` and `eligible_from`, from the country's holding rule with its overrides,
  not the plan's, and empty where the country has none; a sale fills `proceeds` and `disposal_fee`; amounts and
  units as stored; `units_estimated` is `yes` for a one-tap entry (`isEstimate`, §2.2), else `no`. A `held`
  entry with no recorded cost has an empty `cost_basis` and sets `uncosted` (a move never does); one-tap units set
  `estimated`; a move fills `venue`, `units` (sent), `to_venue` and `units_received` and sets `moves`. The
  file: each header line, passed in (the wording is the app's), on its own row as one `textCell`, an empty row,
  then the columns, `coin` and `venue` through `textCell`. No `tax_year` column: the rows are dated, and the
  header names the span and the window.
- The tax-year file of Settings → Currency & data → Your data (`packages/app/src/features/settings/tax-year.ts`;
  decided 2026-11-07): a select of `taxYears` with `defaultTaxYear` chosen, under the two export buttons and
  their export line (`docs/LEGAL.md` §4), offered under every computation model (a switch ending in
  `assertNever`), with entries, and while the rules and the profile of the plan's country are on the device:
  the year and the rules come only from them, never from the CSV log's fallback to no rules. Once a load has
  ended without them it says so; while either loads (the profile after boot, the rules after a change of
  country) it shows nothing. The download switches on the model first (decided 2026-11-08): `portfolio-wide`
  takes `taxYearCessions`, `wealth-snapshot` `taxYearSnapshot`, both with empty histories (no closes, ADR-0036
  Readings, 2026-11-08), so France's `unspecified` lot rule never reaches the lot pieces; under `per-lot`,
  `fifo`, `lifo` and `unspecified` take `taxYearLots`, the other lot rules `taxYearPool`. The download counts
  nothing (ADR-0028). The per-lot file's and the raw listing's header, its words in
  `docs/CONTENT-STYLE.md` §3, holds in order: the app, the country and the span; the sentence of
  `docs/JURISDICTIONS.md` §4, which names no currency; the currency line, which says the amounts are as logged
  and not converted and names the pay currency, and the country's currency when it differs; no line says that
  every amount is in the pay currency, since after a change of country the amounts logged before it keep the old currency and nothing
  stored dates the change; the country's review line with the lot and holding rules' sources, or under review
  (`docs/JURISDICTIONS.md` §1) its under-review line and then no `lotRuleNote`, condition or source; the
  matching line (the lot rule, or that the raw listing matches nothing) and the `lotRuleNote`; where the country
  has a holding rule, what `eligible_from` and `past_holding_rule` mean, each `holdingRuleConditions` sentence,
  and a line when `planRuleDiffers`; per venue, the venue line and the `crossVenue` count; for the per-lot file, what `held_at` and `moved_on` hold and
  when each is empty (the line is on every such file), and when `moveFees`, what a fee piece is, that it leaves `past_holding_rule` empty and that the
  file does not say whether the country treats the fee as a disposal, then, when `feeAtDestination` is above 0, how
  many rows a move paid its fee from units already at its destination, since the Log shows too few units outside it on that
  day (ADR-0055); for the raw listing, when `moves`, which
  columns a move row fills and that `units` less `units_received` is the fee in the coin, then, when `moveFees`
  (for this file: a move dated in the tax year with `units` above `units_received`), that the file does not say
  whether the country treats that fee as a disposal; for the raw listing
  what it lists, under `pooled` with the 30-day window and, while `windowOpen`, the export day; the format line;
  then, when set, `uncosted` (a `held` row's empty `cost_basis` is no recorded cost, and the line names the other
  rows that leave it empty: the per-lot file's with no acquired date, the raw listing's sales), `estimated`,
  `unmatched` and `ongoing`. The cessions and snapshot headers open with the same four lines (title, export
  sentence, currency, review) and carry no matching, `lotRuleNote`, holding, venue or listing line. The
  cessions header then says what a block holds and that the file leaves the calculation to the person or
  their accountant; that only the coin sold has a price (its sale price), so the estimate
  fills only when it was the only coin held and the log holds the units sold; what the two running sums hold
  (the amounts of the purchases and the recorded costs of the `held` entries logged before the sale, and
  their fees); the format line; and, when set, `uncosted` (as `held_without_cost_to_date`), `estimatedBlock`
  (in place of `estimated`, since a sale row's `units_estimated` is its block's: yes when the sale or any
  holding row in it counts estimated units) and `ongoing`. The snapshot header then says which day each `units_on_` column is, the opening as the start of
  the reference date and the end of the day before, and while the year runs that the year-end column stays
  empty; that the value cells are empty (0.00 where none was held); what `fee_units` holds; the format line; and, when set,
  `heldInYear` (the coins of such entries may have been there before the reference date), `uncosted` (an empty
  `held_cost` is no recorded cost), `estimated` (worded without a column, since the file has none) and
  `ongoing`. Neither names a form line number, a threshold, the Dutch box, a deemed return or a deadline. No
  line names a gain, a loss, tax due, a
  rate or an allowance, calls a row exempt, tax-free or taxable, or calls the file complete or ready to file.
- `snapshotValue(plan, entries, histories, date)`: the portfolio value at the end of a calendar date (decided
  2026-11-08): the units of the live entries dated on or before `date` (sales subtract; a negative holding counts
  as none, as in `valueSeries`, §3.11), each coin priced at the close dated exactly `date`, the price at 00:00 UTC
  on the day after (ADR-0036 Readings, 2026-10-20); no neighbouring close stands in. It returns `{ date,
  currency, coins, total, missing }`: `coins` are the coins with positive units, the plan's in its order, then
  the others, each `{ coin, units, value }`; a coin with no close dated `date`, and every held coin when the
  histories are not in the pay currency, has a null `value` and is listed in `missing`; `total` is the exact sum,
  null while `missing` is not empty. Amounts are exact; the file and the Portfolio line round.
  `holdingsValue(plan, units, histories, closeOn)` is its pricing half, for units counted elsewhere; the French
  cessions read the same exact-date close (`closeDated`) with its price, which their file writes. Used by the Dutch Portfolio line (`docs/JURISDICTIONS.md` §7.8) and the snapshot export.

### 3.14 Chart maths (ADR-0022)

The chart components in `packages/ui` take finished pixels and path strings; `packages/app` computes
them with these helpers. The arithmetic is exact on decimals and only the result becomes a number: a
pixel at one decimal place, the prototype's precision.

- `extent(values)`. `linearScale(domain, range)`: one half-even rounding of the offset, so both ends of
  the domain land exactly on the ends of the range and larger values never map to smaller offsets; a
  range may run backwards (a value axis from the bottom pixel up); a flat domain maps to the middle;
  values outside the domain extrapolate (the component clamps markers). `dateScale(domain, range)`
  places calendar dates by `daysBetween`. `paddedDomain(extent, padding = 0.08)` is the prototype's
  vertical domain: 8 % of the span on each side, a flat series first widened by 1 % of its value (by 1
  around zero).
- `ticks(low, high, count = 5)` and `tickStep`: steps of 1, 2 or 5 × 10^k chosen as d3-array chooses
  them (thresholds √50, √10 and √2, compared squared), the multiples within the domain, exact.
- `linePath(points)`, one command per point, and `areaPath(points, baseline)`; coordinates are written
  at one decimal without a trailing zero.
- `downsample(points, n)`: the prototype's, with positions ⌊i × length / n⌋ in integer arithmetic plus
  the last point; at most n + 1 points, the first and the last kept.
- `runningMax`, `underwaterSegments(values)` as `{ peak, trough, recovery }` positions (the last position
  at the high before the fall, the first lowest one, the first one back at or above the high or
  `null`), and `underwaterPath(points, values)`, the simulator's drawdown shading: per fall, along the
  high (level until the line climbs back through it), then back along the line.

### 3.15 Sync rows (ADR-0021)

- A synced row is `{ id, updatedAt, deviceId, deletedAt, payload }`; a soft delete is a write like any
  other and travels as a tombstone.
- `compareWrites(a, b)`: `updatedAt` compared as moments (`compareInstants`), then `deviceId` as
  lowercase UUID text, which is the database's order. `supersedes(incoming, stored)`: only a strictly
  later write replaces a row, for the push upsert and for a pull alike. After a push the device keeps
  the server's row, with the clamped `updatedAt`, so every replica compares the same stamps.
- A write over a stored row is stamped after it: `stampAfter(now, ...stamps)` gives `now`, or one
  millisecond after the latest of the row's `updatedAt` and `deletedAt` when `now` is not later. These
  writes stamp so, on the row as stored in the write's turn: the save of an entry, its removal from a
  monthly buy, a delete (`before.at`, over every entry it deletes), an undo, an import (§3.13), and
  every plan write (§6): a plan save, a skip and its undo, a pause, a resume, the end of buying, and a
  change of country or of pay currency. A device whose clock is behind still writes a strictly later row.
- `mergeRows(a, b)`: per id the later write, sorted by id. Two rows with identical stamps (one device
  writing twice in a millisecond) are ordered by their JSON text, so the merge is idempotent,
  commutative and associative; this is the only place a payload is read, and never on the server.
- `tombstoneExpired(deletedOn, today)` once `TOMBSTONE_TTL_DAYS` (90) have passed since the day of the
  deletion; `purgeTombstones(rows, today, dayOf)` takes the shell's function from an instant to its
  calendar day (the user's timezone, or UTC for the nightly job).
- Proven by a model-based property test: two or three devices with clocks skewed within the 5-minute
  clamp and different UTC offsets write, delete, restore, push and pull in a random order against a
  model of the server; after everyone pushes and then pulls, every device holds the server's rows,
  which are both the last-writer-wins fold of the writes received and, per row, the write with the
  latest moment by an independent oracle.

---

## 4. Country profile (consumed by the core, authored in `packages/content`)

```ts
type CountryProfile = {
  code: CountryCode; name: string;
  currency: CurrencyCode; locales: string[]; numberFormatLocale: string; dateFormatLocale: string; timezones: string[]; englishConfidence?: 'medium' | 'low';
  taxYear: { start: 'MM-DD'; end: 'MM-DD' };        // e.g. 01-01 / 12-31; UK 04-06 / 04-05
  computationModel: { kind: 'per-lot' } | { kind: 'portfolio-wide' } | { kind: 'wealth-snapshot'; date: 'MM-DD' };
  holdingRule: HoldingRule;                          // the default for new plans in this country
  holdingRuleOverrides: Array<{ acquiredFrom: CalendarDate; rule: HoldingRule; note: string }>;   // enacted rules that depend on the acquisition date; empty until built (docs/JURISDICTIONS.md §2)
  holdingRuleConditions: string[];                   // sentences the app cannot verify; where they show: docs/JURISDICTIONS.md §2
  lotRule: 'fifo' | 'lifo' | 'average' | 'pooled' | 'specific' | 'unspecified';
  lotScope: 'global' | 'per-venue';
  card: JurisdictionCard;                            // short, sourced, dated (schema in docs/JURISDICTIONS.md)
  status: { version: number; changedOn: CalendarDate; changeNotice: string | null; lastReviewed: CalendarDate; nextReviewDue: CalendarDate };
};
```

The core never reads the content package directly; the shell passes it the core's `CountryRules`
(`packages/core/src/schema/country.ts`), which `countryRules(profile)` in `packages/content` maps from
the profile without parsing it on the device (the shell boots on that mapping's generated
`packages/content/rules/<code>.json`, ADR-0049): CI validates the files, and the package's tests parse
every mapped profile with `CountryRulesSchema` (ADR-0031). The authored type is `CountryProfile` in
`packages/content` (`docs/JURISDICTIONS.md` §2), whose `status` also holds `confidence` and
`reviewedBy`. Rule: the app never claims a benefit the country does not give. With
`holdingRule.kind === 'none'` the hold phase is still a hold, "tax-free from" disappears, the
sellable-now line disappears, and the card says every sale is a taxable event.

---

## 5. Templates (starting points)

Templates are content (`packages/content/templates`), validated by a schema, never personalised, never
called recommended. Each has `id`, `name`, `oneLine`, `riskLabel`, `explanation` (why someone would
pick it, what can go wrong; paragraphs separated by a blank line, at most five sentences each), `coins`, `split`, `sellWindow | null`, `references`,
`validUntil?`, `drawdowns`. A template holds no `expectations`, and the strict content schema refuses them: a multiple of the money put in is a projection (`docs/LEGAL.md` §3.6). `holdingRule` is always taken from the user's country at setup; `monthlyAmount`,
`firstBuy`, `startingAmount` are always the user's.

`drawdowns` holds at least one fall per template, each a coin's intraday high to its intraday low
(`coin`, `high`, `low`, `fall` in whole percent) with its `source` on the facts allow-list (and a
`lowSource` when one request to that series cannot reach both ends, or to run to today for a coin
that has not regained its high), its `publisher` and its
`accessed` date, no later than `lastReviewed`. The card composes its dated band from them in the
plan's formats, each coin's ticker before its signed fall and the window that holds every fall,
from the earliest high to the latest low, not each coin's own dates (in the UK's formats: "BTC −78%
and ETH −82%, each high to low between 10 Nov 2021 and 21 Nov 2022"). An explanation names no fall
without the day, month and year of its high and low. The core never reads `drawdowns`; the validator
checks its sources and dates.

| id | Name | Coins / split | Sell window | Risk label |
|---|---|---|---|---|
| `btc-only-hold` | Bitcoin only, no sell window | BTC 100 | none | High risk · single asset |
| `two-coins` | Two coins, no sell window | BTC 70 / ETH 30 | none by default; user may add one | High risk |
| `cycle-plan` | Cycle plan | BTC 40 / ETH 30 / SOL 15 / LINK 15 | opens 2029-06-01, closes 2029-10-31, exitBy 2029-12-31; lastBuy 2028-06-01; references peak 2029-09-01..2029-10-31, halving 2028-04-15; `validUntil` 2028-06-01 | Very high risk · time-bound bet on a cycle |
| `accumulate` | Three coins, no sell window | BTC 50 / ETH 30 / SOL 20 | none | Very high risk |

Names and explanations follow `docs/CONTENT-STYLE.md` §6 (named for the structure). When a template's
`validUntil` has passed, the app asks for dates instead of filling them (port of `recDatesOk`:
`templateDatesUsable(template, today)` is `today < validUntil`, so on `validUntil` itself the dates are
no longer filled). A plan edited away from a template keeps `templateId` for history but is labelled
"your own plan".

- `planFromTemplate(template, start)`: the coins, the split and the references come
  from the template, and a dated template's `lastBuy` and sell window while its dates are usable;
  otherwise the user's `lastBuy` (`dates-needed` without one) and window (or none). `expectations` is
  `{}` on every plan started from a template; numbers a prototype file brought stay the person's own
  (§7), and a stored plan keeps what it holds (ADR-0011). The holding rule,
  the amounts, the first buy, the buy day and the currencies are the user's; `acceptEarlyOpen` records
  that the user kept a window opening before the last purchase passes the rule. Any other invariant the
  choices break is `invalid-plan` with the plan's issue codes. The Cycle plan meets this in Germany: its
  window opens on 2029-06-01, one day before its last purchase (2028-06-01) passes the one-year rule, so
  the onboarding asks the German user to accept it; with Portugal's 365 days the two dates coincide.
- The buy day at setup is the first buy's day of the month, and 28 when the first buy falls on the
  29th to the 31st (`buyDayOf` in `packages/app/src/features/onboarding/model/setup.ts`): the first
  slot is the first buy itself, every later slot falls on the buy day (§3.1), so no month is skipped.
  The onboarding asks for the last buy only when the template's dates cannot be used: it gives none,
  its dates have passed, or the first buy the user typed is after its last buy; the plan then takes the
  user's last buy and no sell window (`needsLastBuy` in the same file).
- The custom path ("Your own coins", after the templates) starts from no template: the user picks the
  coins and the split on plan's coin editor, then the amounts and the dates on its amount-and-dates
  editor, and each step is read by the same `coinSplit` and `schedule` that Settings saves with, over a
  base plan of the chosen country (`basePlan` and `startCustomPlan` in the same file). The plan has no
  `templateId`, no references or expectations and no sell window (Settings adds one); its buy day
  follows the first buy as above until the user picks one in the select.
- The order of the onboarding steps: country, starting point, then the amounts and dates on the
  template path or the coins and then the amounts and dates on the custom path, then on both paths the
  sentence (`why`), the reminder and the summary, whose Start writes the plan. The plan's id is made
  once with the draft and is also the calendar file's UID. The amounts-and-dates step goes on only once
  the plan would start (`checkPlan` in the same file runs `startPlan` or `startCustomPlan` without
  writing), so every refusal, the early window's acceptance among them, comes before the sentence; Start
  runs it again with the time of the tap as `riskAcknowledgedAt`. A later step (the sentence, the
  reminder or the summary) whose plan can no longer be built, because the day moved on, goes back to
  the amounts-and-dates step and drops the reminder chosen for the old dates; its Continue asks the
  later steps again.
- `followsTemplate(plan, template)`: the same template id, the same coins in any order and the same
  split, and for a dated template the same `lastBuy` and window; a template without a window lets the
  user add one ("none by default; user may add one"). Otherwise the UI says "your own plan".

---

## 6. Validation of user actions

| Action | Rules (each a test) |
|---|---|
| Save an entry | `saveTransaction(draft, context)`, one row per coin as the Log form: a row with neither amount nor units is skipped, a row with only one is `amount-and-units` (as the prototype; its words: `docs/CONTENT-STYLE.md` §3, "Record on the Log"), no row left is `no-coins`; for `held` (§2.2) a row needs positive units and its amount may be empty (null) or 0 or more, an amount without units is still `amount-and-units`, and a fee is `fee-not-allowed`, so no fee is split for it, while every other kind still refuses units alone and an amount of 0; the coin is the plan's or already has entries (`unknown-coin`); units carry at most 10 decimals (`units-precision`); `dca` requires a `slot` the plan has, or the one the edited entry already carries (`slot-required`, `unknown-slot`), and a slot the edited entries do not carry must be open: not skipped (`slot-skipped`) and not recorded by another live `dca` entry (`slot-done`), so a month is never recorded twice or both recorded and skipped; other kinds take none (`slot-not-allowed`); the fee is not negative (`fee-negative`); the note holds at most `ENTRY_NOTE_MAX_LENGTH` characters (`note-too-long`) and the venue at most `VENUE_MAX_LENGTH` (`venue-too-long`), each with `max`, so a longer one is named instead of reaching the store's schema (the form's fields hold no more); the fee is split by amount with the largest remainder at the currency's minor unit, or at the fee's own decimals when finer; for `sell`, when the save leaves more units of the coin sold than bought, or more of them unmatched, than before (§3.7): the units sold per coin `<= min(heldUnits(coin), heldOn(coin, the sale's date))`, the entries being edited left out (`sell-exceeds-held`, with both figures; the form names the sale's date), so a sale dated before its purchase is refused, while an edit of a sale imported short that leaves its units and date as they were (a note, a fee, a venue) saves; then any save that would leave a recorded sale uncovered is refused by `uncoveredSale` (§3.7; the form names that sale by its own date, whether it is dated before or after the entry saved, and a sale the save stores, `written`, as above), and one that would leave a recorded move's fee beyond the units held is refused as that move's (`fee-exceeds-held`, with `held`, `fee` and the move's date; the form names the move, never a sale), and any that would leave more than `MAX_ENTRIES` live entries, and more than before it, by `overCap` (`too-many-entries`, with `max`; §9), so the next export of the plan reads back; an edit that adds no live entry, a delete and a tombstone are never refused by it, even over the cap, and an edit that fills a new coin row counts that row (at the cap, filling the empty ETH row of a BTC-only extra buy is refused). A save is never refused for a venue: before `Save` the Log form names the earliest stored move the entries the save stores leave short outside its destination (`movesLeftShort`, §3.7, read on the entries `saveOn` stores), and saves. An edit keeps each row's own entry (id, `createdAt`, `source`, but a `one-tap` row whose units change in value saves as `manual`, §2.2) and soft-deletes the edited entries no row takes (`rowEntries`, under Edit a transaction); the result is the entries to store. With no plan stored (everything deleted in another tab) nothing is saved, so no entry is stored without its plan: a new entry says so by Save, an edit ends as one whose entry was deleted (`docs/CONTENT-STYLE.md` §3). |
| Edit a transaction | The Log form opens a row (§3.9) with its first item's note, its fees summed, and its items' venue when they share one; items at different venues open the Venue field empty, under a line that names them (`editedVenues`; `docs/CONTENT-STYLE.md` §3, "Edit an entry"), so it never reads as if all were at the first one's; `keepUnchanged(saved, { current, draft, editing, changed: changedFields(initial, current) })` runs on what `saveTransaction` returns. Each form row carries the entry it was loaded from (its source); a field the person leaves unchanged takes the source's value, whatever id or coin the saved entry ends up with. The save gives each filled row its entry with `rowEntries(rows, editing)`: first, a row whose source has the row's coin keeps that entry (its id, `createdAt` and `source`); then a row without one (added in the edit, its coin changed, or a draft whose rows name no source) takes the first edited entry of its coin that no row took, in the edited entries' order, else a fresh id; the edited entries no row took are soft-deleted. So the row a person clears is the entry that goes, and a kept sale keeps the time it was logged, which orders same-day sales for the lots (§3.7). Per row, only a kept `one-tap` entry whose units the row changes in value turns `manual` (`savedSource`, §2.2): in a one-tap month of three coins with one row's units changed and one row cleared, the changed row's entry turns `manual`, the cleared row's is soft-deleted and the third keeps `one-tap`. The form opened on a `one-tap` row shows a line that names what the one tap filled and asks for the units from the exchange's confirmation (`docs/CONTENT-STYLE.md` §3, "Edit an entry"). Venue, note and fee stay per entry: a grouped edit sets them on every entry only when the person changes the field (the fee then split as above); a row the edit adds has no source and gets no fee while the fee is unchanged; an amount or units equal in value to the source's keep the text it stored (§2.2). An edit that changes nothing gives back the row's entries apart from `updatedAt`. With nothing being edited (a new transaction) `keepUnchanged` gives back what the save returned, its prefilled fee kept. The shell saves on the entries as stored when its write queue reaches the save (`saveOn`); an entry being edited that is no longer live there (another tab deleted it) saves nothing, so an edit never brings it back. An edit of a purchase (fewer units, a later date, another coin) that would leave a recorded sale uncovered is refused (`sell-exceeds-held`, §3.7), and the form names that sale by its coin and its own date, whether it is dated before or after the entry (as in Save an entry; its words: `docs/CONTENT-STYLE.md` §3, "Edit an entry"); one that would leave a later move's fee beyond the units held is refused as that move's (`fee-exceeds-held`, §3.7). An edit of a purchase's venue alone is never refused: one that leaves a stored move short outside its destination saves, and the move's fee then comes from the destination (§3.7, ADR-0055); the form names that move before `Save` (`movesLeftShort`, as in Save an entry), each row first on its own entry and its venue kept while the Venue field is unchanged. |
| Fill a form row | `fillRow(field, row, coinDecimals, currency)`, the three-way fill of ADR-0034 (port of the prototype's input handler): units edited, `price = amount / units`; price edited, `units = amount / price`; amount edited, the price from the units when they are given, else the units from the price; with all three typed, the field typed last stays and one other is recomputed (an amount or units edit derives the price, a price edit the units). A units or price edit beside no amount fills it, `amount = units × price` half-even at the currency's minor unit (0.002 at 60,000.12 fills 120.00); an amount that rounds to 0 is not filled (1 × 0.005 fills nothing, 1 × 0.006 fills 0.01), and an amount edit or a zero amount is never filled. Units round toward zero at the coin's decimals (at most 10), the price half-even at `PRICE_FIGURES` significant figures, or at the currency's minor unit when that keeps more, as one division (`quotientSignificant`), so a coin under a cent never derives a price of 0 (10 for 813,008 PEPE is 0.0000123); an edit's implied price is the same division of the stored amount and units; a zero amount, or an empty or zero field the rule divides or multiplies by, leaves the row as it was (the prototype wrote 0 units for a zero amount). In the entry form a derived field is never read as a source: an edit whose own text is empty, zero or unreadable leaves the derived text as it is (a pause), an edit that reads while the derived field's other source does not blanks that text and keeps it derived until the source reads again, and so does a units or price edit whose filled amount would round to 0. A derived amount shows 2 decimals, and an amount the person typed, even zero or unreadable, is never filled over. The live price fills the price field half-even at `PRICE_FIGURES` significant figures, or at the currency's minor unit when that keeps more (73,732.759 fills 73,732.76, 0.2734 stays 0.2734, a coin at 0.0000123 never fills as 0), and units the form fills from it come from that rounded price and are derived too, so a new amount recomputes them and never the price; typing into the units ends the derivation. Derived units reach the draft with their amount only when the amount and the price both read as positive; a row that shows derived units without that backing passes them with no amount when they read as positive, and otherwise passes its amount beside them (units that round to 0 read as none), so the save refuses it (`amount-and-units`) as it refuses one field alone, and no row whose amount or units read as positive is skipped. A derived amount reaches the draft only when the units and the price both read as positive; otherwise the row passes the amount alone when it reads as positive, else the units alone, so the save refuses it (`amount-and-units`), or skips it when nothing shows. The price the form fills on a new purchase is the price read as it opened, so it applies only to the opening day (the form's date as it opened) or later (`packages/app/src/features/log/lib/dated.ts`): on an earlier full date every row whose price is still the fill (not derived, and the opened text or empty) has its price and the field derived from it emptied directly, the marker kept, since an edit to empty pauses; back on the opening day or later an emptied price is the opened one again and the fill runs from it, unless that would change a field the person typed. A price typed as the opened text counts as the fill, and a cleared one is filled again on such a date change. A typed or derived price, a sale and an edit are never touched; a cleared or partly typed date changes no price; a restored draft follows the same rule. |
| One-tap | at least one coin priced; otherwise fall back to the form with amounts prefilled. The tap records what the screen showed or nothing: in the write's turn the shell re-derives the open action from `actionsNow` on the plan as stored, and when its planned amount differs (`compare`), its parts differ from the parts shown (`sameParts`: the same coins in the same order, amounts equal by `compare`) or the plan pays in another currency than the one shown, it writes nothing and refuses with `plan-changed` (another tab changed the amount, the split or the currency, a replace included); otherwise it records the re-derived action. A tap whose rows would take the plan past `MAX_ENTRIES` live entries refuses with `too-many-entries` (`overCap`, as the Log's save), counted before the prices, so a coin without a price does not open the form first; nothing is written, Today says so in a toast and opens no form, since the tap would take the plan past the cap (a smaller buy can still be saved on the Log). |
| Skip a month | slot exists and is not `done` and not skipped already (`unknown-slot`, `slot-done`, `slot-skipped`); note optional, at most `NOTE_MAX_LENGTH` characters (`note-too-long`, with `max`; the field holds no more); skipping a `late` slot clears its lateness. `unskipMonth(plan, skipId, now)` is the undo, offered by the toast for 8 s (`UNDO_WINDOW_MS`): it removes that skip, so the month is open again; an id the plan does not have leaves the plan unchanged. |
| Pause | `from <= until` or open-ended (`pause-order`); no overlap with another pause, end days included (`pauses-overlap`); note optional, at most `NOTE_MAX_LENGTH` characters (`note-too-long`, with `max`); once buying ended, `buying-over`, as for Resume (no screen would show the pause and nothing could end it); pausing does not touch existing entries; a slot that is `done` inside a pause stays `done`. The shell's "Pause from today" (`packages/app/src/features/plan/actions.ts`) runs on the plan as stored in the write queue's turn; when a pause there already covers today (another tab paused first) or buying there has ended (another tab ended buying) it writes nothing, reloads the plan as stored and succeeds, where `pausePlan` would refuse it (`pauses-overlap`, `buying-over`). |
| Resume | sets `until = today − 1 day` on the pause in effect today, else on an open-ended pause still to come; a pause that covered no day before today is removed; with neither, `not-paused`; once buying ended, `buying-over`, also on the end day under the pause it ended in (the end wins over the pause, §3.5). The shell's "Resume" on the Plan screen (`packages/app/src/features/plan/actions.ts`) runs on the plan as stored in the write queue's turn; when nothing there is left to end (another tab resumed first, or ended buying) it writes nothing, reloads the plan as stored and succeeds, where `resumePlan` would refuse it (`not-paused`, `buying-over`). |
| End buying today | `lastBuy = today` (if a slot is due today and not done, it stays actionable), `endedBuyingOn = today`; the sell window is kept; refused before `firstBuy` (`before-first-buy`), after `lastBuy` or once ended (`buying-over`). The shell's "End buying today" on the Plan screen (`packages/app/src/features/plan/actions.ts`) runs on the plan as stored in the write queue's turn; when buying there has already ended (another tab ended first) it writes nothing, reloads the plan as stored and succeeds; a refusal writes nothing and reloads it too. Its toast offers the undo for 8 s (`UNDO_WINDOW_MS`): `undoEndBuying(plan, before, now)` puts `before.lastBuy` back and clears `endedBuyingOn`, with the stamp of §3.15, on the plan as stored; a plan whose `endedBuyingOn` or `lastBuy` is no longer `before.endedOn` (changed in another tab since), or that the restored last buy would leave with a `planIssues` issue, refuses (`plan-changed`), nothing is written and the toast says so. The shell restores only the latest end, on a plan only this tab has written since: the domain store keeps, beside each of its last 64 plan writes, the stamp it replaced, the plan's id, `lastBuy` and `endedBuyingOn` (`ownPlanWrites`, in memory, forgotten by Delete everything and its Undo); the undo refuses (`plan-changed`) when a plan write since the end came from another tab, changed `lastBuy` or `endedBuyingOn` (a Settings save of a later last buy, which clears the end, then a second end), or replaced the plan's id (an import that replaces the plan), and the toast says the earlier last buy was not put back. The end hands the toast its stamp (`endedAt`) and the plan's id, and the undo walks back from the stamp stored (`packages/app/src/lib/store/domain.ts`); this tab's own writes since that leave all three as the end wrote them (a skipped month) keep the undo, and a write that keeps the plan's stamp (an Add missing import that adds only entries) is not counted as a plan write. A known case: a backup of this same plan written after this same end, taken back in, leaves the Undo standing, because it is the same end. |
| Delete entry | `deleteEntries(entries, before.ids, before.at)` (soft delete) and `restoreEntries(plan, entries, ids, before, now)` (the undo); the shell takes `before = slotsAtDelete(plan, entries, ids, now)` in the same write as the delete, on the plan and entries as stored: `before.ids` are the entries among `ids` still live, the only ones the delete writes and the undo restores (one another tab deleted first stays its delete); `before.at` is the stamp the delete writes (§3.15); `before.slots` holds each deleted `dca` entry's slot, whether it was skipped, and the other live `dca` entries recording it; its toast offers the undo for 8 s (`UNDO_WINDOW_MS`) and runs it on the plan and entries as stored when its write queue reaches it; a deleted entry written again since the delete (its `updatedAt` or `deletedAt` not `before.at`, which in M1 only a replace does, §3.13, from any tab and whatever its clock, also on a snapshot that had not yet seen the delete) refuses the undo (`changed-since-delete`), nothing is restored and the toast says the data was replaced (known limitation in M1, #130: a replace in another tab in the same millisecond as the delete writes the same stamp, so the undo cannot tell it apart and restores; M3's per-row write identity closes it, `docs/ROADMAP.md` M3); a deleted `dca` entry whose slot was skipped (`slot-skipped`) or recorded by another live `dca` entry (`slot-done`) since the delete, which `before` did not hold, refuses the undo, nothing is restored and the toast says why; a slot that already held a skip or another entry at the delete (a prototype import can leave both) does not refuse it; a delete whose purchases or coins added (`held`) cover a recorded sale is refused (`sell-exceeds-held`), nothing is written (the shell runs `uncoveredSale` on what `deleteEntries` returns, in the same write) and the toast says deleting the row's entries would leave that sale, named by its date, without the units it sells, so they stay; a delete whose purchases or coins added (`held`) cover a move's network fee is refused the same way (`fee-exceeds-held`) and the toast says deleting the row's entries would leave that move, named by its date, without the units its fee takes, so they stay, its words by the row's kind (`deleteRefusalTitle` in `packages/app/src/features/log/lib/row-refusal.ts`): a purchase row names the purchase, a `held` row its Coins added entries, counted; an undo that would leave a sale without the units it sells refuses (`sell-exceeds-held`) and the toast says restoring would leave that sale, named by its date, without them, or, when the sale left short is the one restored (`written`), says so of that sale, and one that would leave a move's fee beyond the units held (`fee-exceeds-held`) says restoring would leave that move, named by its date, without the units its fee takes, or, when the move left short is the one restored (`written`), says so of that move with no date; the Undo toasts count the row's entries, all but the restored move's own, which is the whole row; a row whose restore leaves its own sale short is counted too, one entry worded as restoring that sale and several as the sale among them, whatever made it short, a change since the delete or a backup imported short (`undoRefusalTitle`; the words: `docs/CONTENT-STYLE.md` §3, "Delete an entry"); an undo that would leave more than `MAX_ENTRIES` live entries (entries added since the delete leave no room for the ones it restores) refuses (`too-many-entries`, `overCap`), nothing is restored and the toast says restoring would take the plan past the cap; `before.currency` is the plan's pay currency at the delete (null with no plan), held with the rest of `before` in the toast's memory and never stored, and an undo on a plan whose pay currency differs from it (a change of country or Currency & data's "Change to" since, ADR-0053) refuses when any entry it would restore holds an amount or a fee (`currency-changed`, `currencyMoved` in `packages/core/src/actions/undo.ts`), since an entry carries no currency and its amount would read as the new one: nothing is restored or converted, and the toast says the entries stay deleted, were recorded in the old currency and are logged again only if they were paid in the new one, while entries with neither (held coins without a cost) restore as before; after the window the tombstone remains for sync and is purged after 90 days. |
| Edit the plan | `savePlan(services, fields, opened)` (`packages/app/src/features/settings/actions.ts`): Settings' Plan tab sends the amounts and dates the person changed, Coins & split the coins and the split together once either changed, Hold & sell the holding rule (an own rule equal to the country's goes as the country's, so its acquisition-date overrides still apply, `docs/JURISDICTIONS.md` §5) and the sell window (none, or its three dates in order, `sell-window-order` under the later date), each with the plan as the tab opened it; the fields go onto the plan as stored in the write queue's turn, so another tab's change to the other fields is kept, and the save's stamp follows §3.15; a field it sends that another tab changed since the tab opened the plan refuses with `plan-changed` and the plan as stored, writes nothing, and the tab then shows that plan and says so; `planIssues` on the plan they make refuses with every issue and writes nothing; no changed field writes nothing; with no plan left (deleted in another tab) nothing is saved. On a plan whose buying was ended, a last buy day other than the one stored clears the end (`endedBuyingOn` becomes null, so `lastBuy` stays the end day while it is set, §2): buying runs to the new day, and the months between the end and the edit read as any months past an edited last buy day do; an edit that leaves the last buy day keeps the end. A refused `plan-too-long` names the half that refused it: more than `MAX_SLOTS` buys, or a last buy more than 20 years after the first (a plan with no monthly amount has no buys, so only the years refuse it). A window that opens before the last buy passes the holding rule (§2.1), whether a later last buy on the Plan tab or a rule or window on Hold & sell causes it, shows a notice with both dates and an acceptance; the tab sends the window with `acceptedEarlyOpen` once it is ticked, and a save without it is refused on the acceptance and writes nothing. The Plan tab sends the window only then, as the tab opened it, and never otherwise, so another tab's move of the window is kept. A stored acceptance holds for the last buy (Plan tab) or the rule and dates (Hold & sell) it was given for, which then ask nothing; changing any of them asks again, unticked. |
| Change country | `changeCountry(plan, profile, now, currency)` re-derives the holding rule and the rule version (formats in the shell), and the pay and display currency as `currency` says (ADR-0053; §2.1 wins over this row): `'keep'` leaves both as they are, `'country'` sets both to the profile's; it never converts an amount. `currencyQuestion(plan, entries, profile)` says when the person is asked: the profile's currency is not the pay currency and a live entry holds an amount or a fee; it returns both currencies and the count and the first and last dates of those entries, else null. Logged amounts are relabelled only on the person's answer; with null no question is asked, the change runs with `'country'`, and the currencies follow the country, so the plan's own amounts (`monthlyAmount`, `startingAmount`) take the new currency as typed, which the confirmation's currency rows show before the person confirms, with a row for each of those amounts that is not zero ("€300 becomes £300. Check it in Plan."). When `currencyQuestion` is not null the confirmation asks it: "Keep EUR" or "Change to GBP", two cards with nothing chosen, under them the line that a plan holds one currency; confirming with no answer is refused next to the cards, as the rule tick is, and the summary relabels nothing until "Change to" is chosen. With any live entry, a block above the confirm button offers the current country's tax-year files (Your data's export, under its own export line) before the rules change. `changeCountry` returns what changed for the confirmation, the holding rule among it for explicit confirmation (rules compare field by field), and any invariant the new rule breaks, such as a sell window that now opens early; a new holding rule drops the window's `acceptedEarlyOpen`, given under the old rule, and the same rule keeps it. `changeCountryOf(services, rules, opened, acceptEarly, currency)` (`packages/app/src/features/settings/actions.ts`) runs it on the plan as stored in the write queue's turn, with the answer the screen gave, or null when it asked none: stored entries that now need a question the screen never showed (another tab logged an amount) refuse with `plan-changed`, and an answer the stored entries no longer need stands, since `'keep'` relabels nothing; a country, a currency, a holding rule, a sell window or a last buy (the window's early opening is measured from it) that another tab changed since Currency & data opened the plan refuses with `plan-changed` and the plan as stored, and writes nothing, and the section then shows the change on that plan with every tick and acceptance cleared, or, when that plan is already in the chosen country (whatever its holding rule), has nothing left to change and closes; a window the new rule opens early is stored with `acceptedEarlyOpen` only once the person ticks the notice's acceptance, otherwise the change is refused with its issues (the new currency's or rule's invariants, fixed in Plan or Hold & sell); nothing changed writes nothing. The confirmation lists each change, names the rule being replaced (the person's own or the old country's) and the new country's, waits for a tick before replacing it, and, when no question is asked and the plan has a live entry, says logged amounts stay as typed. Without the plan's country's rules on the device it cannot tell the person's own rule from that country's, so the section offers no change until they load, as Hold & sell disables that card. |
| Change pay currency | `changePayCurrency(plan, currency, now)` in the core. While the plan's pay currency differs from its country's, Currency & data shows a line saying so and a "Change to GBP" button (the country's currency), so a wrong "Keep" is fixed without changing country again; nothing is converted. `changePayCurrencyOf(services, opened, currency)` (`packages/app/src/features/settings/actions.ts`) runs it on the plan as stored, with the display currency following when it equalled the pay currency (§2.1); a country or a currency another tab changed since the section opened the plan refuses with `plan-changed` and writes nothing, and a plan already in that currency writes nothing. The change has no undo yet; one is decided (2026-11-10, #86) and is specified here before it is built. |
| Record a move | `saveMove(draft, context)` (`packages/core/src/actions/moves.ts`) writes one `move` entry (§2.2, ADR-0054) from a `MoveDraft`: coin, date, `from` (null: no venue named), `to`, `sent`, `received` and note; amount, fee and slot are null. Its checks, in order: units sent and received above 0 (`amount-and-units`, the safety check, since the form refuses 0 before saving); the coin is the plan's or already has entries (`unknown-coin`); both at most 10 decimals (`units-precision`); received at most sent (`received-exceeds-sent`); `to` other than `from` (`same-venue`); the note at most `ENTRY_NOTE_MAX_LENGTH` characters (`note-too-long`) and each venue at most `VENUE_MAX_LENGTH` (`venue-too-long`), each with `max`. Then the units sent are at most the units held just before it in the matching order (§3.7, `runningHeld`, the entries being edited left out; a new move comes after every stored move of its date), not `heldOn` (`move-exceeds-held`, with `held` and `sent`; the form names the move's date): a move takes out only its fee, so a later sale it leaves covered never refuses it (`docs/research/move-step-2026-11-09.md` §2, Q9). The check is no worse than before (§3.7): an edit that keeps the coin is refused only when the units it sends beyond those held just before it, at its new date, exceed what the stored move sent beyond the units held before it, over the same other entries, so an edit of a move that a sale dated before it left short saves while its units do not grow (a note, a venue, fewer units), and one that raises them is refused; the stored move's excess is the baseline only in its own coin, so an edit to another coin is judged as a new move of that coin (any units beyond those held refuse it). Then `uncoveredSale` refuses a fee that leaves a sale short (`sell-exceeds-held`; the form names that sale by its date) or a move's fee beyond the units held (`fee-exceeds-held`, with that move's date; the form names a later move's fee, or, when `written`, the fee of the move it saves, a new move or an edit whose fee no unit is left for by date or in total), and `overCap` a move past `MAX_ENTRIES` live entries (`too-many-entries`). An empty `to` throws a RangeError; the form never sends one. A source that holds fewer units than sent is not refused: `sourceShort(entries, draft, except)` gives the units it lacks at the move's place on its date (§3.7, `venueUnitsAtMove`: before the date's sales), null when it holds them, with the move being edited (`except`) left out so its own units count back at its source, and kept at its place among the date's moves; the move form's source cards and `Fill in all units` read the same figures. `matchLots` looks for the units `sourceShort` names in the units held anywhere but `to` (§3.7): it takes all of them when it finds them all there; when it finds some or none, it takes what it finds, the part of the fee it cannot find there comes from `to`'s own pieces and leaves the coin (ADR-0055), and the units received it cannot find stay the move's `unmatched`, never taken from `to` and never refused. `sameMove(entries, draft, except)` names a live move of the same coin, date, venues, units sent and units received, never a deleted one and never the move being edited, so the form can say so before a second is saved. An edit keeps the move's id, `createdAt` and `source`, stamps it after its stored stamp (§3.15) and soft-deletes the other edited entries. Before `Save` the form runs the save on the draft: when the scope rule lists the draft (`moveShortfallOf`, §3.7) it says how much the Log holds outside `to` on that day and how many fewer than sent, in place of the short-source line's second sentence, and under global lots the short-source line shows only then (a listed draft's source always holds fewer than it sends, so the line shows whenever the draft is listed); it also names the earliest stored move the draft leaves short (`movesLeftShort`). A refused draft names neither. |
| Edit or delete a move | the Log's row of a move offers Edit, which opens the move form on it and saves through `saveMove` (§3.9), and Delete with the 8-second undo, as Delete entry. A delete gives back the move's fee in the coin, so it never leaves a sale short; a move's undo is bounded by `uncoveredSale` like any entry, its fee counted as units out (`fee-exceeds-held` when no piece of the coin covers it). A move the scope rule lists says on its row how many units the Log shows outside its destination and how many fewer than it sends (§3.9), and its Edit shows the lines of Record a move. |
| Import prototype data | see §7. |

---

## 7. Migration from the prototype (`localStorage['dcaplan.v1']`)

The importer lives in `packages/core/src/import/prototype.ts`, is pure (takes the parsed JSON), and
doubles as the golden-test fixture source.

| Prototype (`version: 4`) | Proof of Calm |
|---|---|
| `settings.base` | `payCurrency` |
| `settings.quote` | `displayCurrency` |
| `settings.coins[] { id, name, gecko, dec, color }` | `coins[] { id, name, geckoId, decimals, color }` (the prototype's `normCoin()`: the four recommended coins, with the decimals of `docs/DESIGN.md` §5, when the file lists none; a coin with entries but missing from the list is added) |
| `settings.split` | `split` (values to `Decimal` at 4 dp; the sum is normalised to exactly 100 by adjusting the largest share, the first on a tie, by the rounding residue of at most 0.01, the prototype's own tolerance, and the import report says so if it did; a larger gap is the plan's `split-sum`) |
| `settings.monthly`, `settings.initial` | `monthlyAmount`, `startingAmount` (to 2 dp) |
| `settings.firstBuy`, `dcaDay`, `lastBuy` | `firstBuy`, `buyDay`, `lastBuy` |
| `settings.holdDays` | `holdingRule: { kind: 'days', days, effect: 'exempt' }` (rounded to whole days, at most 36,500; 365 when not positive; the import never guesses a country; the user confirms the country, below, and may switch the rule to the country's) |
| `settings.sellFrom`, `sellTo`, `exitBy` | `sellWindow` (null if any is empty; a window that opens before the last purchase passes the rule is kept with `acceptedEarlyOpen`, since the prototype allowed it) |
| `settings.peakFrom`, `peakTo`, `halving` | `references` |
| `settings.expect { bear, base, bull }` | `expectations` |
| `settings.taxNote` | dropped (free text; the import report mentions it) |
| `settings.strategy` | `templateId: 'cycle-plan'` when the prototype's `isRecommended` test holds, else `null` |
| `purchases[] { id, kind, date, coin, eur, units, fee, note, slot }` | `entries[]` with `amount = eur` (the prototype's field is named `eur` whatever the currency), money to 2 dp, units to 10 dp (half-even, from the number as written), `fee: null` when null/empty (or negative, or unreadable), `source: 'import-prototype'`; ids are kept when they match `^p[a-z0-9]+$` (the first of duplicates), otherwise taken from fresh ids the shell passes; an entry without a coin, a finite amount and units above zero after rounding, or a date is dropped; only the prototype's own kinds map (`dca`, `lump`, `extra`, `sell`): any other, `held` included, becomes `extra` with its fee, since coins added (`held`, §2.2) come only from this app's form, its backups and an exchange's import (§3.13); a `dca` entry without its month becomes `extra`; a note is cut at 500 characters |
| `checks { sell1, sell2, sell3 }` | `sellChecks { part1, part2, part3 }` |
| `meta.theme`, `meta.range`, `meta.lastBackupAt` | device preferences (`range` 7, 30, 90, 365 to `7d` … `1y`; `lastBackupAt` from milliseconds to a UTC instant) |
| older shapes handled by the prototype's `normalize()` (`lumpSteps`, `dcaSplit`, missing `firstBuy`) | port the same tolerance: `initial = Σ lumpSteps.eur`; `split = dcaSplit`; `firstBuy = earliest purchase date` |

`importPrototype(json, { planId, country, countryRuleVersion, ids, now, today })` returns
`{ plan, entries, prefs, report }`, or `not-prototype` (no `purchases` list) or `invalid-plan` (each
issue as `path: code`, such as `monthlyAmount: no-amount`) or `invalid-entries` (the ids of the entries it
built that `EntrySchema` does not read, §3.13). The report lists every adjustment as a
coded note (`ImportNote`, one per kind, with counts for entries), which the shell words; the defaults
the prototype itself merged under a file are applied silently, as it did. `recogniseImport(json)` tells
a Proof of Calm backup from a prototype export. Settings' import takes the file chosen or the text pasted into
its paste box (the DCA plan page's export copied whole), read by the same path; a pasted backup is read as a
backup. It (`docs/CONTENT-STYLE.md` §3) passes the plan's
country when a plan exists, otherwise the one the user confirms with one tap in onboarding's country step,
and applies the result through `applyImport` in either mode, as a backup (§3.13); the device preferences
are written only when the file's plan is taken (no plan, or `Replace everything`), never by `Add missing
entries only`. That mode keeps this plan, so its report keeps only the notes with a count, those on the file's
purchases: the others describe a plan it does not take. It adds nothing, with an empty report, when the file's
`settings.base` differs from this plan's `payCurrency` (§3.13). A purchase it adds of a coin this plan does not list is
stored, as from a backup (§3.13 adds by id and month, whatever the coin; §3.6 shows that coin after the plan's
coins; §6 "Save an entry" edits it), and the report names each such coin with the purchases added, alphabetically;
the plan's coins stay as they are. A plan taken words the defaulted last buy and the clamped buy day with its own
`lastBuy` and `buyDay`.

Golden tests: `packages/core/test/golden/` holds four synthetic exports built by `tools/golden/states.ts`
(`two-coins`, `cycle-plan`, `sell-window`, and `late-in-sell`, a month left open in the sell window). The
owner's real export never enters git; pasted into Settings on the owner's own device, it is read as these
are. For each, expected outputs of `slots`, `slotStatuses`, `portfolio`, `eligibility`,
`transactions` and `planTotals` (and the actions, Today's lead, the phase and the sell tranches) are produced by running
the prototype's own functions in Node (jsdom, the clock fixed at noon UTC in a UTC process, the network
refused, the prices seeded into its cache), stored as JSON, and compared with the core at 2 dp for money,
8 dp for units, exactly for dates and statuses. The prototype keeps its code in one IIFE, so the harness
adds one line at its end, in memory, that hands the view functions out; the functions run unchanged. The
import of each synthetic state must need no adjustment. `apps/web/e2e/prototype-golden.spec.ts` pastes each
export at its `today` with its prices and checks Today's lead and Portfolio's invested amount and value
against the same files (the desktop project only; the paste flow runs on the whole matrix).

The country change has no prototype counterpart (the prototype has no country), so its fixture is derived by
hand and lives outside the generated ones: `packages/core/test/country-change/fixture.ts` holds 14 monthly
buys across 29 Feb 2024 with each buy's eligibility day under Portugal's and Germany's rules worked out by
hand, a sell window, and the three profiles as `countryRules` maps them (an app test holds them equal to the
content's profiles); `packages/core/test/country-change/country-change.test.ts` runs PT to DE, DE to PT, PT
to XX and XX to DE against it.

The tax-year export (§3.13) has none either, so its fixtures are derived by hand too, in
`packages/core/test/tax-year/`, each CSV worked out from its fixture's comments and recomputed by the review, never
written by running the code. `pt-fixture.ts` holds a BTC and ETH plan under Portugal's rules (FIFO per venue, 365
days) with a cross-venue sale, a sale before a lot passes the rule, a lot with no recorded cost, one at cost 0, an
unmatched imported sale and a one-tap purchase; `pt-2026.csv` and `pt-2027.csv` are its per-lot files, compared by
"the PT fixture gives the expected CSVs" in `packages/core/src/export/tax-year.test.ts`. `gb-fixture.ts` holds a
pooled plan with sales in 2025-26 and on 2027-03-20, a purchase on 2027-04-06 inside the 30-day window, a lot with no
recorded cost and a one-tap purchase; `gb-2026-27.csv` is its raw listing, compared by
`packages/core/test/tax-year/gb.test.ts`. France's cessions file (`fr-fixture.ts`, `fr-2026.csv`) and the Netherlands' snapshot file
(`nl-fixture.ts`, `nl-2026.csv`) are described with their functions in §3.13 and compared in
`packages/core/src/export/tax-year-cessions.test.ts` and `packages/core/src/export/tax-year-snapshot.test.ts`.

---

## 8. Date rules (summary; the policy is ADR-0018)

- `today` is a `CalendarDate` computed by the shell from the device clock and the user's timezone
  once per render; the core never calls `Date.now()`.
- Instants are ordered by the moment they name, whatever their offsets (`compareInstants`: 10:00+02:00 is
  before 09:00Z), never as strings.
- `addMonthsClamped(date, n, anchorDay?)` clamps the day (31 Jan + 1 month = 28/29 Feb) and keeps the
  anchor day, so 31 Jan → 28 Feb → 31 Mar; `addYearsClamped` clamps 29 Feb to 28 Feb; `addDays` is
  exact; `daysBetween(a, b)` is `b − a` in whole days on the proleptic Gregorian calendar (no DST
  effects, because calendar dates have no time).
- Holding periods in `days` are counted in calendar days from the purchase date; in `years`, eligibility
  starts the day after the anniversary.
- Tests cover: month ends, leap years (2028 is one; 2100 is not), `buyDay` 28 in February, DST
  transition days in Europe/Lisbon and Europe/Berlin (the shell's `todayIn(tz)` must not shift),
  UTC-offset boundaries around midnight, and the 29 Feb anniversary.

---

## 9. Constants (one module, all tested at their boundaries)

| Name | Value | Used by |
|---|---|---|
| `MAX_SLOTS` | 240 | plan invariant |
| `NOTE_MAX_LENGTH` | 200 characters | a skip's or a pause's note: the plan schema, `skipMonth`, `pausePlan` and the skip sheet's field |
| `ENTRY_NOTE_MAX_LENGTH` | 500 characters | an entry's note: the entry schema, `saveTransaction`, `saveMove` and the entry form's field |
| `VENUE_MAX_LENGTH` | 40 characters | an entry's venue and a move's `to`: the entry schema, `saveTransaction`, `saveMove` and the entry form's field |
| `MAX_ENTRIES` | 10,000 live entries | a plan's entries: the backup schema and `applyImport` (§3.13), `saveTransaction`, `saveMove`, `restoreEntries` and the one tap (§6) |
| `IMPORT_MAX_BYTES` | 50,000,000 bytes (50 MB) | the import file Settings reads: above the 36.8 MB a full plan's backup weighs at the most (every note at 500 characters, each escaped to six bytes), about 4 MB without notes |
| `IMPORT_MATCH_DAYS` | 15 days | an exchange import's months: a due date's reach either side, a typed monthly buy's claim and the first buy's 15 days (§3.13) |
| `IMPORT_TYPED_DAYS` | 3 days | an exchange import's typed and tapped dates: a hand-recorded entry's claim either side of its date, and a one-tap estimate's reach before its date (§3.13) |
| `LOG_PAGE` | 12 | Log "show all" threshold |
| `UNDO_WINDOW_MS` | 8000 | every toast but the update prompt, which has none: the Undos (a delete, a skip, End buying, Delete everything), the one tap's Edit, and the save and failure toasts |
| `TOMBSTONE_TTL_DAYS` | 90 | sync purge |
| `RED_DAY.sevenDay` | −10 % | §3.11 |
| `RED_DAY.fromHigh90` | −30 % | §3.11 |
| `RED_DAY.episodeClearDays` | 7 | §3.11 |
| `RED_DAY.coverDays` | 7 | §3.11 |
| `RED_DAY.keptDays` | 365 | §3.11 |
| `BACKUP_SNOOZE_DAYS` | 90 | §3.11 backup banner (ADR-0004) |
| `CHART_RANGES` | 7d, 30d, 90d, 1y, all | Portfolio |
| `PRICE_FIGURES` | 4 | §6 the entry form's price: the live price, the price `fillRow` derives and an edit's implied price; §3.13 the CSV's price |
| `PRICE_TTL` | live 60 s client / 600 s server (one upstream call per 10 minutes, ADR-0006 and ADR-0036); history daily | shell |
| `REVIEW_INTERVAL_MONTHS` | 12 | §3.12 |
| `REVIEW_SNOOZE_DAYS` | 30 | §3.11 the annual review's `Later` |
| `UNDER_REVIEW_MONTHS` | 12 | §3.12 |
| `POOLED_MATCH_DAYS` | 30 days | §3.13 the tax-year raw listing under the `pooled` lot rule: the purchases after the year's end that the UK matches to a disposal within it (TCGA 1992 s. 106A; `docs/JURISDICTIONS.md` §7.4) |

---

## 10. Errors as values

Core functions never throw for user-caused conditions. They return `Result<T, E>`
(`packages/core/src/result.ts`) with a closed union of error codes per family and the data the UI
needs to phrase the message: `ActionError` for the actions of §6 (`sell-exceeds-held` and `fee-exceeds-held`, each
with the date of the sale or move it names and `written`, §3.7,
`move-exceeds-held`, `unknown-coin`, `slot-done`, …), `TemplateError`, `BackupError`, `PrototypeImportError`, `ExchangeFileError` and `ExchangeImportRefusal` (`too-many-entries` with
`entries` and `max`, `invalid-entries` with `ids`, the entries the schema refuses and an id more than one
entry holds; §3.13) and the simulator's
`SimulationError` (`invalid-split`, …). The shell maps codes to localised copy. Programmer errors
(violated invariants) throw. The invariants of the stored entities are coded issues
(`PLAN_ISSUE_CODES`, `ENTRY_ISSUE_CODES`), such as `split-sum`, `sell-window-before-eligibility` and a move's
`received-exceeds-units` (§2.2).

---

## 11. What the core does not do

No formatting (the edge formats with `Intl` per the user's country), no fetching, no storage, no
randomness, no clock, no React, no i18n strings (it returns codes and data), no tax computation
(it returns dates and flags, never amounts of tax).

---

## 12. Differences from the prototype (deliberate)

| Prototype | Proof of Calm | Why |
|---|---|---|
| floats everywhere | exact decimals, strings in storage | correctness; ADR-0017 |
| no record of coins sent between venues; every unit stays at the purchase venue | the `move` entry: units sent, units received, the fee in the coin, the units' place by lot | per-venue matching (Portugal, Germany, the US) and the units a network fee takes; ADR-0054 |
| `Date` objects, local clock | `YYYY-MM-DD` strings, `today` passed in | determinism; ADR-0018 |
| `holdDays` number | `HoldingRule` union | Germany and the US count "more than one year", Portugal counts 365 days |
| `taxNote` free text | `country` + profile | the differentiator |
| no venue on entries | optional `venue` label | Portugal matches lots per platform, Germany and the US per wallet; a label is not an exchange checklist |
| `dateHint()` counted every lot of the coin against a sale | `saleWarning` counts the units the lot matching gives the sale, in its own venue group where the country matches per venue | old coins at one platform, or lots another sale takes, do not make a sale tax-free (§3.7) |
| "recommended strategy" | templates called starting points | ADR-0009; banned word |
| the recommended strategy filled `expect` with 0.7 / 2.3 / 3.5 and showed what the total could be worth | a template holds no expectations and a plan started from one writes `{}`; numbers from a prototype file stay the person's own, and no screen shows them | a multiple of the money put in is a projection (`docs/LEGAL.md` §3.6); the numbers are the user's own or none (ADR-0011) |
| missed month nags forever | skip with a note, pause, end buying | the rule in the brief |
| `stripLine()` counted every purchase, whatever its date, in the invested figure and its share of the plan's total | the Plan's totals count an extra buy only from `firstBuy` on; Portfolio and Today count every purchase (§3.10) | coins held before the plan, recorded as an extra buy dated before it, would count against the plan's total and could show a new plan as fully invested on its first day (decided 2026-11-05); since 2026-11-06 such coins are `held` (§2.2), which the totals leave out whatever its date |
| confirm-to-delete | soft delete with undo | fewer taps, honest history |
| hard error when the window opens before eligibility | warning the user can accept | some countries have no rule; the user may know better |
| 72-slot silent cap | 240-slot validated cap | no silent truncation |
| LINK at 3 decimals in the catalogue | LINK at 4 decimals (`packages/content/coins.json`), so the one-tap fill rounds its units to 4 places | fixed decimals per asset, `docs/DESIGN.md` §5 rule 7; ADR-0036 |
| the merge adds a file's purchases whatever its `settings.base` | "Add missing entries only" adds nothing from a file in another pay currency, and says so (§3.13) | an amount is never converted (§2.1); added as written it would be stored in the wrong currency |
| per-coin `round2` of planned parts and fees | largest-remainder split | parts must sum to the whole |
| `fee` split `round2(fee × amount / total)` | largest remainder | same |
| an amount edit recomputed the units from the price, and units and a price never filled the amount | an amount edit keeps given units and derives the price; units and a price fill an empty amount, half-even at the minor unit and never as 0 (§6) | an entry stores the amount and the units (§2.2), so the price yields; "Type two of the three" holds, and a 0.00 nobody typed is never saved as a cost |
| a zero amount with a price filled 0 units; float units at the coin's decimals | `fillRow` leaves the row as it was; units toward zero (§6) | clearing a field does not wipe what was typed; ADR-0017 |
| a derived or implied price, the live price fill and the CSV's price, at `round2` | half-even at `PRICE_FIGURES` significant figures, or at the currency's minor unit when that keeps more (`quotientSignificant`, `roundSignificant`; §6, §3.13) | a coin under a cent never derives a price of 0.00 (10 for 813,008 PEPE is 0.0000123) |
| the live price filled the entry form's price whatever the date | the filled price applies to the opening day or later; an earlier date empties it and the field derived from it (§6) | the live price is not what an earlier purchase cost, so a filled one would derive units or an amount the exchange never gave |
| no drawdown logic | Red day thresholds and episodes | the "no noise" promise made tangible |
| localStorage | IndexedDB + optional account | durability; ADR-0004, ADR-0019 |
| entries in the order they were added | entries in id order, the order IndexedDB returns them in; items of equal amount in one Log row (a 50/50 split) follow their ids, not the plan's coin order | one order after a reload and in every tab (ADR-0019 readings); `transactions()` sorts by amount only |
