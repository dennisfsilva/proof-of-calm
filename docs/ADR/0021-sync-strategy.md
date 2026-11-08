# ADR-0021: Sync strategy and conflict handling

Status: Accepted; the route handlers superseded by ADR-0045 (the sync endpoints become functions in `server/`) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-backend-security.md` §2)

## Context

One user, one plan, a few hundred entries, one to three devices, offline-first, edits a few times a year, conflicts rare. The server must be able to store payloads it cannot read (client-side encryption in v2, ADR-0030). Export and import must stay a plain JSON file. A solo builder maintains it.

## Options considered

| Option | Verdict |
|---|---|
| (a) Last-writer-wins per row: client UUIDs, client `updated_at` with a server clamp and a device tie-break, server-assigned monotonic `seq` as the pull cursor, soft-delete tombstones, opaque `payload` | **Chosen**: two route handlers and one trigger; the server never merges fields; rows are the export |
| (b) Append-only event log folded on the client | Good second choice; more moving parts (compaction, snapshots) than the data needs |
| (c) CRDTs (Yjs, Automerge, Loro) over Supabase | Over-engineered for a list of facts with rare conflicts; WASM bundles; export becomes a document history |
| (d) Sync frameworks (PowerSync, ElectricSQL, RxDB replication, Zero, Triplit, TanStack DB) | Extra services or pre-1.0 tools; most read the payload server-side, which forecloses encryption; none needed at this size |

## Decision

Option (a), as specified in the research file and summarised here:

- Every synced row: `id uuid` (client), `user_id` (defaulted server-side from `auth.uid()`), `payload jsonb` (opaque to all server code), `enc_version smallint default 0`, `key_id text null`, `nonce bytea null`, `schema_version int`, `updated_at timestamptz` (client, clamped by a trigger to at most 5 minutes in the future), `device_id uuid`, `deleted_at timestamptz null`, `seq bigint` (from one sequence, set by the trigger on insert and update).
- Tables in M3: `plans` (one row per user in v1: settings, pauses, skips, sell checks), `entries`, `devices`, `reminder_prefs` (plaintext by design: enabled, buy day, timezone, local hour, next due), `reminder_sends (user_id, period)` for idempotency; a reserved `user_keys` table for v2.
- `POST /api/sync/push`: up to 500 rows, 1 MB, one transaction, upsert with `where excluded.updated_at > t.updated_at or (equal and excluded.device_id > t.device_id)`; returns applied and superseded rows; idempotent.
- `GET /api/sync/pull?since=<seq>`: rows with `seq > since` ordered by `seq`, paged by 500, `nextSince`, `hasMore`. The cursor is `seq`, never a timestamp.
- Client loop (the `outbox` store in IndexedDB, ADR-0019): push pending → pull since cursor → apply the same LWW comparator locally → store cursor → repeat while `hasMore`.
- Conflicts: entity-level last-writer-wins for entries (atomic facts) and for the plan row; no field merging on the server (it would have to read the payload). If the plan object grows, split it into small rows rather than merging fields.
- Tombstones purged after 90 days by a nightly job; a device whose cursor predates the oldest retained tombstone does a full resync.
- Local-only → account: the local store already uses this row shape and UUIDs; the upgrade is "sign in, register device, mark all rows pending, push, pull". No anonymous Supabase users (their conversion path is fragile and they cannot register passkeys). If the account already holds a plan, the user chooses: keep server, keep this device, or merge entries.
- Import stamps `updated_at = now()` so imported rows win on the next sync; export never contains `enc_version` or ciphertext.

## Consequences

- Convergence is tested with model-based property tests (`fast-check`): N simulated devices, random create/edit/delete, random partitions and sync order, clock skew within the clamp; after quiescence all replicas equal the LWW fold; push is idempotent; purge plus full resync preserves equality. The comparator is one pure function in `packages/core`, shared by server and client.
- A concurrent two-device edit of the plan settings loses one side; the UI shows "updated on another device" from the `superseded` list. Acceptable for a plan edited a few times a year.
- RLS scopes every row to `auth.uid()` (`docs/SECURITY.md` §6), with `(user_id, seq)` indexes.
- The same shape serves the v2 encryption without migration (ADR-0030).

## Disagreement

None. The brief asked for the strategy to be decided here.
