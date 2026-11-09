# ADR-0019: Persistence: IndexedDB through `idb`, with the plan held in memory

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §6 and §16)

## Context

The local store must give a typed schema with migrations, reactive reads, JSON export/import as the backup format, offline-first behaviour, an outbox for the later sync (ADR-0021), and tolerate opaque payloads (ADR-0030). The data is small by design: one plan, a few hundred entries, a price cache. The budget matters: Dexie with its React hooks measures 29 kB brotli, a third of the application allowance on Today; `idb` measures 1.2 kB.

## Options considered

| Option | Size (brotli) | Notes |
|---|---|---|
| Dexie 4.4.6 + dexie-react-hooks | 29 kB | versioned schema, upgraders, `liveQuery` with cross-tab wake-ups; the natural choice for a larger dataset |
| **`idb` 8.0.4 + an in-memory store** | ~2 kB | promise wrapper over IndexedDB; schema versions through its `upgrade` callback; reactivity and migrations are ours |
| TinyBase, RxDB, PowerSync, ElectricSQL, TanStack DB | 20–86 kB | own data models or services; not needed at this size |

## Decision

`idb` 8.0.4 behind the `PlanStore` port, with the domain state held in memory:

- **Startup** loads the plan, its entries, skips, pauses and the price cache from IndexedDB into one immutable snapshot in a Zustand store (ADR-0020); every screen reads from that snapshot; the core's derived views are computed from it with `today` passed in.
- **Writes** go through a feature's `actions` module: validate with the core → produce the new snapshot (immutable update) → persist the changed rows with `idb` in one transaction → append the rows to the `outbox` store (M3 pushes it) → publish a `BroadcastChannel` message so other tabs reload the snapshot. Last writer wins within a device as well.
- **Schema**: object stores `plans`, `entries`, `prefs`, `prices`, `history`, `outbox`, `meta`; row shape identical to the sync rows (`id`, `payload`, `updatedAt`, `deletedAt`, `deviceId`, `schemaVersion`, `encVersion`); string UUID keys; indexes on `planId` and `updatedAt`. Schema versions are integers; each bump ships an explicit migration function tested against a fixture database from the previous version.
- **Validation at the boundary**: every row read from IndexedDB passes through its zod schema; a corrupt row fails loudly and is quarantined into `meta.corrupt` with an in-app line, never silently dropped.
- **Export** serialises the in-memory snapshot (excluding soft-deleted rows) to the backup format in `docs/DOMAIN.md` §3.13; **import** validates, then replaces or merges by id and stamps `updatedAt = now()`.
- **Durability**: `navigator.storage.persist()` is requested after the first entry is saved, never on page load; the durability line and the install nudge follow ADR-0004; the Safari seven-day eviction for non-installed sites is documented in the cookie-free statement.
- **Prices**: the live snapshot and its `fetchedAt` live in the `prices` store, so "prices from 14:05" renders identically online, offline, installed and in the wrapper; the service-worker cache is secondary (ADR-0033).
- **Capacity**: the schemas cap a plan at 10,000 entries; at that size the in-memory snapshot is still a few megabytes. If a later version needs many plans or large imports, Dexie is the documented step up and the row shape does not change.

## Consequences

- Reactivity is a store subscription, not a database query layer; there is no second cache (no TanStack Query for local data).
- Tests: the store and migrations run under Vitest with `fake-indexeddb`; property tests cover import/export round trips and migration idempotence; a Playwright test opens the app in two tabs and asserts the second tab reflects a write from the first.
- The Today page's application code budget (ADR-0005) is met with room for the i18n runtime.

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while implementing it on
2026-10-17 (`packages/app/src/lib/adapters/idb-store.ts` and `idb/`, `lib/store/`).

- **The database.** Named `proof-of-calm`, a constant that, like the backup format marker, does not
  follow a rename. Its version is the length of the migrations list (`idb/database.ts`), 1 today:
  entry *n* upgrades version *n* to *n + 1*, and a shipped entry never changes. The missing steps
  run in the one upgrade transaction; the first that fails aborts it, so the database stays at its
  old version with its data untouched. A step runs once: opening again at the same version runs
  nothing. Each new step is tested against a fixture database of the previous version; a synthetic
  version 2, defined only in the tests, proves the framework. A build older than the database (a
  rollback across a version bump, or an old tab after another tab upgraded) cannot open it:
  IndexedDB refuses with a `VersionError`, every load fails, and the domain store stays `failed`
  with that error, for the error surface to word as "a newer version of the app holds your data;
  reload". Nothing is read or written meanwhile, so the newer data is untouched. A database version
  bump is therefore not rollback-safe, and `docs/RELEASE.md` says how such a release ships.
- **Row shape.** `plans` and `entries` hold `{ id, payload, updatedAt, deletedAt, deviceId,
  schemaVersion, encVersion }`. `payload` is the entity itself, in plain text (`encVersion: 0`);
  `schemaVersion` is the payload's schema version (`docs/DOMAIN.md` §2), not the database's: plans
  are read at v2 and v3 and entries at v2, v3 and v4 (`ROW_SCHEMA_VERSIONS` in `idb/rows.ts`; since
  2026-11-06 for entries, whose v3 adds the `held` kind to the same payload, and since 2026-11-09 v4,
  which adds the `move` kind and its `to` and `received` keys, ADR-0054). A v2 plan row is
  upgraded when read (`upgradePlan`: no acknowledgement); a load rewrites nothing. Since 2026-10-22
  rows are written at the lowest version that holds them (`writtenPlan`, `docs/DOMAIN.md` §2.1): a plan
  row is v2 until an acknowledgement is recorded and v3 only then, so the previous build reads every
  plan row a rollback finds; an entry row is v4 only for a move (since 2026-11-09), v3 only for a
  `held` entry and v2 for every other kind (`writtenEntryVersion`, `docs/DOMAIN.md` §2.2), so the
  previous build, which reads entries up to v3, reads every other entry row and counts a move, its
  tombstone included, as newer and leaves it as it is;
  `updatedAt` and `deletedAt` repeat the entity's, so nothing that compares or purges rows reads the
  payload; `deviceId` is the device that wrote the row. A plan has no `deletedAt` of its own: one
  plan is live at a time, and writing a plan with another id, or `null`, turns the live row into a
  tombstone (`deletedAt` and `updatedAt` set to the moment, or one millisecond after the live row's
  stamp when that is not earlier, as when another device's clock ran ahead or this one went back),
  so that sync deletes it everywhere. A
  plan written again over its own tombstone (an undo, a switch back) keeps its payload, but when its
  `updatedAt` is not later than the tombstone's, its row is stamped one millisecond after the
  tombstone: that stamp was made here and never reached the plan, and under ADR-0021 only a strictly
  later write replaces a row, so the older stamp would let sync delete the plan again.
  v2 adds `keyId` and `nonce` with a migration (ADR-0030). A row whose envelope names a later
  `schemaVersion` or `encVersion` than this build writes (an encrypted one, a newer payload) is left
  in its store, unread and not set aside, and a write never rewrites, tombstones or downgrades it:
  it is the newer build's data, and a rolled-back build or an old tab still open must not strip it
  (`docs/RELEASE.md`, rollback). Since 2026-10-30 the write reads what it would overwrite: for an id
  held at a later version, a tombstone included, it skips an entry's row and its outbox copy, and a
  write whose plan is held that way writes nothing at all: no row, no outbox copy, no tombstone, no
  entry, no preference, no price. `PlanStore.update` gives back only
  what it wrote, so a tab never shows a row the store does not hold. The snapshot counts the live ones
  in `newer` (a newer build's tombstone, a row whose `deletedAt` is an instant, is counted apart, in
  `newerTombstones`; any other value counts as live;
  `storedLive` in `packages/app/src/lib/adapters/idb/rows.ts` is the one test of that): a newer plan turns the screen area into the newer-version screen with
  Reload, so this build neither shows "No plan yet" beside it nor writes a second plan; newer entries
  alone add one line on Today, and any such row, a tombstone included, refuses an import (`docs/DOMAIN.md` §3.13). Quarantine is for rows that fail at the versions this build reads.
- **`planId`.** An entry carries no plan id, so the entry row's envelope does: the id of the plan
  live when the row was written, null before there is one. It is a local index for the multiple
  plans of M5, part of neither the payload nor the synced row: the outbox copy leaves it out. Indexes: `plans.updatedAt`,
  `entries.planId`, `entries.updatedAt`; the shell writes UTC instants, so their text order is their
  time order, and exact comparisons use `compareInstants`.
- **Device-local records.** `prefs` keeps the preferences under the key `device` and `prices` the
  last prices under `latest`, as plain records read through `PrefsSchema` and `PricesStateSchema`.
  The price record is ADR-0033's `{ prices, asOf, fetchedAt, source, stale }`, written
  `{ snapshot, currency, fetchedAt, stale, source }`: `prices` and `asOf` are the core's
  `PriceSnapshot` and its `at`; `currency` is the pay currency its 24-hour change was asked in;
  `stale` is the server's `x-proof-of-calm-stale` (ADR-0036); `source` is `live`, or `manual` for
  prices typed by hand (the price client records the same reading under ADR-0033). Live prices are
  CoinGecko data under the same terms as the closes, so they are kept for less than 24 hours after
  `fetchedAt`, as the history cache is: a load deletes an older live record, or one fetched after
  `now`, and the "prices from" line then has nothing to show until the next fetch or a typed price.
  A price record that no longer reads is deleted too, not set aside, like an unreadable history
  copy: it may hold the same CoinGecko data, and its `source` cannot be trusted to say otherwise.
  Typed prices are the user's and stay until replaced. The preferences and prices records carry no
  version, so a load reads them without their schemas' strictness: a field a later build added, at
  the top or inside the price snapshot, is ignored (docs/RELEASE.md, rollback), while writes are
  still checked by the strict schemas. Since 2026-10-20 a preferences write keeps the unknown keys of
  the stored row under the validated change, so a rolled-back build or an old tab does not reset them.
  The device id is a UUID made once by `crypto.randomUUID` at the first write and kept in `meta` under `deviceId`.
- **Quarantine.** Every row read passes the envelope's schema, then the core's schema for its
  payload, then a check that the payload's id is the row's. A row that fails moves, in the same
  transaction as the read, to the list under `meta.corrupt` as `{ store, id, raw, issues, at }` and
  leaves its store; `issues` are `path: code` strings, the core's own code where it has one
  (`payload.split: split-sum`) and zod's otherwise (`payload.amount: invalid_type`). The snapshot's
  `quarantined` counts the list for the one-line notice; only "Delete everything" clears it, and a
  list that no longer reads becomes the first item of a new one. Market data is never set aside:
  an unreadable price record or history copy is deleted instead (Device-local records, History
  cache). Rows of a later version are not set aside either (Row shape). Writes are checked against the
  same schemas and refused with a `TypeError`, so a bug in an action cannot turn into set-aside data.
- **Outbox.** Keyed `[store, id]`: one record per synced row, a copy of its synced part as last
  written (an entry's local `planId` left out), replaced by every later write of that row in the same
  transaction. It is bounded by the number of rows while nothing pushes it in M1; M3's push reads it,
  maps each record to ADR-0021's columns (snake case; `user_id` and `seq` come from the server; the
  local `store` key is dropped) and removes what the server took.
- **History cache.** The `history` store keeps one coin's daily closes in one currency under
  `[coin, currency]` as `{ coin, currency, closes, fetchedAt }`. `history.get(coin, currency, now)`
  returns closes fetched less than 24 hours before `now` and deletes an older copy (a fetch time
  after `now` counts as expired), and every load sweeps the expired ones, so none outlives the 24
  hours of ADR-0036 however rarely it is read. An unreadable copy is deleted, not quarantined: it is
  market data that may not be kept and can be fetched again.
- **Entry order.** The snapshot lists entries in id order, the order IndexedDB returns them in; the
  memory adapter and the domain store keep the same order, so a snapshot reads the same after a
  reload and in every tab. Views sort for themselves (the Log's tie: `docs/DOMAIN.md` §12).
- **Write order.** The Decision's "produce the new snapshot, then persist" (and ADR-0020's "update
  the domain store immutably, persist") is read as persist first: the domain store's `write` stores
  the rows with their outbox copies in one transaction, then replaces the snapshot, then tells the
  other tabs. A write that fails therefore changes nothing on screen or on disk, and no tab shows
  rows that are not stored. A write after a failed hydration first loads again and is refused with
  the load's error while that still fails, so changes are never merged into the empty snapshot of
  a store that was never read (nor would a plan write tombstone a stored plan nobody saw); the
  failure screen offers Retry only, so "Delete everything" does not run from it. The one-tap's immediate feedback comes from ADR-0020's `useOptimistic`
  (the done block appears at once; the write confirms it), not from updating the store first.
- **Transactions.** A load reads and sets aside in one readwrite transaction. A write is one
  transaction over the stores it touches, with `durability: 'strict'` when it holds the plan or
  entries and `'relaxed'` for prices and preferences alone. "Delete everything" clears every store in
  one transaction instead of deleting the database, which would wait for every tab to close it.
- **Other tabs.** A `BroadcastChannel` named after the database carries `{ kind: 'changed', from }`
  with the sending tab's id; a tab ignores its own id and anything it cannot read, and reloads its
  snapshot on the rest. A write of live prices alone posts nothing: each visible tab fetches its own
  every minute (`PRICE_TTL`), and a full reload in every other tab once a minute would sweep the
  history cache and re-render every subscriber for nothing; prices typed by hand, and any write that
  holds the plan, entries or preferences, are posted. The domain store runs its operations one at a time, so a reload another tab
  asked for waits for this tab's write, and messages that arrive before a reload starts share it.
  A connection that a newer version in another tab needs is closed; the next call opens afresh.
- **Tests.** The storage tests run in Node with `fake-indexeddb`, a fresh `IDBFactory` per test, and
  pin `@vitest-environment node`, so a jsdom default for component tests (ADR-0024) leaves them be.
  Migration idempotence is a property test: over any stored snapshot, the synthetic version 2 runs
  once, and any number of later opens leave the version, the stored records and the snapshot as the
  first upgrade left them.
  The two-tab test runs two adapters, channels and stores on one database; the Playwright test with
  two tabs arrives with the first screen that writes.
- **2026-10-20, the history cache's clock allowance** (replaces "(a fetch time after `now` counts as
  expired)" under History cache). A copy's `fetchedAt` is the server's clock, written by
  `GET /api/history/:coin`, so `historyFresh` keeps a copy whose fetch time is up to five minutes
  after the device's `now` (`CLOCK_SKEW_MS`, a device clock a little behind the server's) instead of
  deleting and refetching it on every read; a fetch time further ahead, or one that does not parse,
  still counts as expired. The bound stays 24 hours after `fetchedAt` on the device's clock, so a
  clock behind by the allowance keeps a copy at most five minutes longer in real time
  (`packages/app/src/lib/adapters/history.ts`). Live prices carry the device's own fetch time and
  get no allowance (`pricesKept`).
- **2026-10-20, `changedAt` on a preferences write** (narrows "keeps the unknown keys of the stored
  row under the validated change" under Device-local records). The change wins for every key but
  `changedAt`, which keeps the stored row's value; only the write's stamp moves it, and a missing or
  unreadable row starts from the defaults. Who stamps and when: `docs/ARCHITECTURE.md`, "Data flow
  for the monthly loop".
- **2026-10-21, the import's stamp** (narrows "stamps `updatedAt = now()`" under Decision). An
  imported row written over one stored here, and a tombstone a replace keeps, is stamped after the
  stored row's stamps when the clock is not later (`stampAfter`), so a clock behind another tab's
  never moves a stamp back. The rule and what it counts: `docs/DOMAIN.md` §3.13.
- **2026-10-21, a write built on the rows as stored** (narrows "persist the changed rows with
  `idb` in one transaction" under Writes). A change built from the current state (the domain
  store's write given a function) runs on `PlanStore.update`: one readwrite transaction over every
  store reads the snapshot
  (quarantine included), calls the build synchronously, checks and writes what it returned, and
  gives back both; a build that throws, or returns a Promise, aborts and writes nothing. A tab whose
  snapshot is older than another tab's write, because the reload message is still on its way,
  therefore builds on that write instead of overwriting it, and shows the snapshot it built on. The
  port method is additive: no row and no schema version changes. The writes that stamp after the row
  as stored are listed in `docs/DOMAIN.md` §3.15; proven in
  `packages/app/src/lib/store/tabs.test.ts` and `packages/app/src/lib/adapters/idb-store.test.ts`.
- **2026-10-21, an update's transaction** (narrows "A write is one transaction over the stores it
  touches" under Transactions). `PlanStore.update` always opens every store with `durability:
  'strict'`, since it reads the whole snapshot before it knows what the build will change.
- **2026-10-21, "Delete everything" at once, with an Undo** (replaces "clears every store in one
  transaction" under Transactions). `PlanStore.wipe` reads every store's rows as stored, unparsed,
  then clears them, in one strict transaction, and gives the rows back as an opaque `WipedRows`
  that only the adapter that made them reads. The toast's Undo (`UNDO_WINDOW_MS`) calls
  `PlanStore.restore`: one transaction writes every row back, set-aside rows and rows of a later
  version included, byte for byte, and only while no plan and no live entry is stored; once another
  tab has started or imported a plan, it writes nothing and gives false, and that plan stays. The
  restored rows are not stamped: `changedAt` and every `updatedAt` are as they were. The wipe is
  posted on the channel as `{ kind: 'wiped', from }` before the usual `changed`, so every tab clears
  its own drafts (ADR-0034 Readings) and a tab of an earlier version still reloads. What the device
  keeps outside IndexedDB, the form drafts in each tab's session storage, is lost on the wipe and
  not brought back by the Undo: a draft of a plan that may never return is not worth a second store.
  The history cache's `put` reads the plans in the same transaction and stores the closes only
  beside a live plan, so a fetch that resolves after the wipe leaves nothing. No row and no schema
  version changes; the read tests are `packages/app/src/lib/adapters/idb-store.test.ts` (wipe and
  restore, the history put) and `packages/app/src/lib/store/tabs.test.ts`.
- **2026-10-22, the "nothing to delete" guard is per tab** (narrows the entry above). The guard in
  `DomainStore.wipe` reads what the tab shows, as its doc comment says, so a second tab that has not
  yet heard the first wipe can wipe the empty stores and get an Undo that restores nothing, while the
  first tab's rows stay in its own Undo, which still restores them (checked 2026-10-22); it is kept
  because the case needs two tabs inside the channel's message latency.
- **2026-10-29, the one tap's feedback** (the Write order reading above). Nothing uses
  `useOptimistic`: the one tap waits for the write, then shows the Recorded toast (ADR-0020,
  corrections recorded on 2026-10-29).
- **2026-10-30, what an update gives back** (narrows "gives back both" under "a write built on the
  rows as stored"). It gives back the snapshot and the changes it wrote, not all it was given: Row
  shape owns which rows a later version holds. A write whose every entry a later version holds still
  stamps `prefs.changedAt`: only a race with another tab gets there, and all it does is ask for a
  backup again.

## Disagreement

The front-end research recommended Dexie; the session chose `idb` because the dataset is tiny, the sync design already needs an outbox and row shape of its own, and the 27 kB difference is the margin between the restated budget and the owner's original figure. Dexie remains the fallback if the in-memory design proves wrong in M1.
