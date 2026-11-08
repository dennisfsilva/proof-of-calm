# ADR-0030: Client-side encryption of synced plans: v2, with the schema fixed in v1

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-backend-security.md` §3)

## Context

The owner asked that the sync schema allow plans to be encrypted client-side before upload in a later version, and that the session decide whether to do it in v1 or v2. End-to-end encryption means the server, backups, support and any attacker with the database see only ciphertext; it also means a lost key is lost data, reminders need a little plaintext metadata, and every export or report is generated on the client. Key sources: the WebAuthn PRF extension from a passkey (good platform support in 2026: iOS 18.4+, macOS 15+ browsers, Android with Google Password Manager, Windows 11 24H2 with the February 2026 update; Windows 10 and some credential managers no; whether Supabase's two-step passkey API tolerates the `prf` extension is unverified) or a user passphrase (Argon2id via `hash-wasm`, OWASP parameters) plus a printed recovery code. Supabase passkeys are experimental (ADR-0035).

## Options considered

1. **E2E in v1.** Strongest promise from day one; delays M3; recovery UX and the PRF spike are unknowns; support cannot help a user who loses access in the first months.
2. **E2E in v2, schema ready in v1** (`enc_version = 0`, plaintext JSON in an opaque `payload`).
3. **Server-held key** ("encryption at rest" only). Not end-to-end; Supabase already encrypts disks and backups; not worth a design of its own.

## Decision

Option 2. The decisions that land in the first migration so that v2 is a migration, not a rewrite:

1. `payload` is opaque to all server code: no SQL reads inside it, no server-side validation of its contents (the client validates), no logging of it, no PostgREST filters on it. A repository lint bans `payload->` and `payload->>` in server code and migrations.
2. Columns on every synced row: `enc_version smallint not null default 0`, `key_id text null`, `nonce bytea null`, `schema_version int`. v2 writes `enc_version = 1` with the ciphertext in `payload`.
3. Plaintext metadata is limited to what sync and reminders need: ids, `updated_at`, `device_id`, `deleted_at`, `seq`, `schema_version`, `enc_version`, `key_id`, `nonce`, and `reminder_prefs` (enabled, buy day, timezone, local hour, next due). No dates, amounts or coin ids as columns.
4. A reserved `user_keys (user_id, key_id, wrapped_by jsonb, kdf_params jsonb, created_at, revoked_at)` table: the root key wrapped by each unlock method (passphrase KEK, recovery-code KEK, later one PRF KEK per passkey).
5. Last-writer-wins never depends on payload contents (ADR-0021).
6. Exports are always plaintext (the client decrypts); importing an old plaintext export into an encrypted account re-encrypts on the client.
7. The WebAuthn Relying Party ID (the bare product domain) is chosen before launch; PRF salts will be bound to it.

Primitive for v2: WebCrypto AES-GCM-256, fresh 96-bit IV per row, AAD = `table || id || enc_version`, one user root key with HKDF-SHA256 sub-keys per purpose; passphrase path guaranteed, PRF path after a half-day spike against the local Supabase stack.

## Consequences

- v1 server-side code is already written as if it could not read plans; the tax-year export, CSV export and JSON export run on the client from M1 on.
- The privacy notice for M3 says plans are stored encrypted at rest by the provider and that client-side encryption is planned; it does not claim end-to-end encryption until v2 ships.
- Support in v2 cannot read user data; the JSON export is advertised as the user's own recovery path.

## Disagreement

None. The brief asked for the timing to be decided.
