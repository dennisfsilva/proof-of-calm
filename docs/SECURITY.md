# Security

The baseline for a custody-free app that still holds something precious: a person's investment log
and email. Decisions: ADR-0021 (sync), ADR-0030 (encryption timing), ADR-0035 (auth), ADR-0027
(monitoring), ADR-0037 (jobs). Tool specifics and the current limits are in
`docs/research/stack-backend-security.md`.

## 1. Principles

1. **Hold less.** No keys, no funds, no exchange credentials, no profile, no analytics identifiers.
   The account stores the plan, its log, an email and what reminders need.
2. **No third-party code in the page.** A hashed CSP (`'strict-dynamic'` and the SHA-256 of the app
   shell's two inline scripts) and no external script origins; monitoring
   is a bundled first-party SDK tunnelled through our own route; analytics, if any, is server-side
   counting (ADR-0028).
3. **The database enforces ownership.** Row-level security on every table, tested, with the service
   role never reachable from the client.
4. **Validate at every boundary**; rate-limit every public route; fail closed.
5. **Assume the browser can be lost or shared.** Short sessions on sign-out, no secrets in
   `localStorage` other than the Supabase session (ADR-0032), a visible "sign out everywhere".
6. **Design for client-side encryption now, ship it in v2** (ADR-0030): opaque payloads, minimal
   plaintext metadata, per-row key ids.
7. **Humans publish content.** The review agent only opens pull requests (ADR-0015).

## 2. Threat model (STRIDE) for accounts, sync and reminders

| Threat | Example | Mitigation | Test |
|---|---|---|---|
| Account takeover through the mailbox | attacker controls the user's email, requests a code | Inherent to email auth. Passkeys offered as the stronger path; sign-in notification email; "sign out everywhere"; no password to reuse; account deletion requires a fresh code. | e2e: sign-in from a second context invalidates nothing by default but appears in the sessions list; manual drill |
| One-time link consumed by a scanner | corporate mail gateway opens the magic link | Prefer 6-digit codes typed into the same browser; links, if offered, are single-use and PKCE-bound to the requesting browser; codes expire in 10 minutes; 5 attempts then lockout for 15 minutes. | integration: second use of a code fails; attempt counter |
| Token theft via XSS | injected script reads the session | Strict CSP (`script-src 'self' 'sha256-…' 'strict-dynamic'`), no third-party scripts, React escaping, no sanitiser runs: Learn modules compile to React at build from our own repository, with a closed body and no HTML string (ADR-0048), and the repository holds no `dangerouslySetInnerHTML`. The browser Supabase client keeps the session in `localStorage` (`@capacitor/preferences` in the wrapper) and sends it as a bearer header, with no cookies (ADR-0032); the strict CSP is the compensating control. | CSP report endpoint; e2e asserts no CSP violations on every page; dependency scanning |
| IDOR / RLS mistake | a query returns another user's entries | RLS on every table with `user_id = auth.uid()` for select, insert (with check), update, delete; `user_id` defaulted server-side and not accepted from the client; indexes on `(user_id, seq)`; views and functions `security invoker`. | pgTAP: as user A, select/update/delete of B's rows return 0 rows; insert with B's `user_id` fails; anon has no access; a CI job runs the suite on every migration |
| Session fixation / replay | attacker sets a session before the victim signs in | Auth library rotates on sign-in; refresh tokens rotated and reuse-detected; bearer tokens, no cookies (ADR-0032); HTTPS only. | library guarantees + e2e sign-in/out |
| Email enumeration | "this email is not registered" | Identical response for known and unknown addresses; rate limits per IP and per email. | integration |
| Abuse of `/api/prices` | scraping our cached prices at volume | CDN caching (`s-maxage=600, stale-while-revalidate`) so most hits never reach a function; one Vercel WAF rate-limit rule per IP over `/api/prices` and `/api/history/:coin` (120 requests per 60 s → 429 at the edge; ADR-0005, Vercel Pro at launch); one upstream call per TTL regardless of load; only allow-listed coin ids and currencies; no pass-through of upstream URLs; spending alerts. | load script in CI (smoke), 429 at the edge, upstream counter ≤ 1 per TTL |
| Abuse of `/api/history/:coin` | scraping daily closes, or varying the URL to reach the function and spend upstream credits | CDN caching (`public, s-maxage=` what is left of the copy's day, ADR-0036) so most hits never reach a function; canonical URLs only: no query, or exactly `?currency=` and an upper-case allow-listed code; anything else (letter case, repeats, other parameters, an empty value) gets a 400 with `no-store` from the function, never reaches the upstream and creates no cached entry, and the function load from varied URLs is bounded by the WAF rule of the row above; only allow-listed coin ids and currencies; one upstream call per coin and currency per day per instance through the shared cache until the Runtime Cache store lands (then once across instances); a 60 s pause per key after an upstream failure (502, no body). Worst case against the CoinGecko Demo plan of ADR-0036 (10k credits a month; ADR-0036 owns the plan): 26 coins × 4 currencies × 30 days = 3,120 calls a month per instance, beside about 4,320 for `/api/prices` (one call per 10 minutes), about 7,440 in all; several warm instances multiply the first figure until the Runtime Cache store lands, so that store comes before traffic spreads across instances. | handler tests: canonical URLs, the allow-lists, one upstream call per key per TTL, the pause after a failure; the preview checklist's request checks; 429 at the edge |
| Abuse of auth and sync routes | OTP request floods, sync write floods | Supabase's own limits plus an Upstash fixed window of 5 OTP requests per email per hour (fail closed) and 60 sync calls per user per minute (fail open with a 500 ms timeout); payload caps (1 MB, 500 rows). | integration |
| Abuse of `/api/sync` | flooding writes, huge payloads | Auth required; per-user rate limit; payload size cap (plan 64 kB, entry 4 kB, batch 500); schema validation; quotas (one plan in v1). | integration |
| Supply-chain compromise | a malicious patch release of a dependency | Exact pins, single-version catalog, minimum release age before adoption, install scripts only for the `allowBuilds` list (`strictDepBuilds`), Renovate with the full gate once its app is installed (§9), Dependabot security alerts, lockfile review, OSV scanning in CI, CodeQL if the repository is public. | CI |
| Secrets leakage | the Supabase secret key in a client bundle | `server-only` import guard, environment variable naming (`VITE_` only for public values), a CI grep that fails on known secret shapes in `apps/web/dist`, Vercel env scopes. | CI check |
| Backup leakage | a dump in object storage read by a third party | Dumps encrypted with a key stored outside the storage provider; EU bucket; retention 35 days; access logged. | restore drill |
| Lost or shared device | the phone with the installed PWA | No secret in `localStorage` other than the Supabase session (ADR-0032); the plan is local by design (the threat is to the device owner's own data); "sign out everywhere"; optional device passcode is the OS's job. | manual |
| Malicious import file | crafted JSON/CSV | Parsed by zod with size caps; no `eval`; CSV parsed by a strict parser; numbers parsed as decimals from a validated grammar; import previews before writing. | unit tests with hostile fixtures |
| Prompt injection in the review agent | a tax authority page (or a spoof) containing instructions | The agent cannot merge and can only write under `packages/content`; CI validates the schema and fails any profile or template still at `reviewedBy: agent-draft` (`pnpm validate:content`, which CI runs on every pull request); the control is the owner's reading, because only the owner merges, facts carry no reviewer field, and an injected instruction could make the agent write `reviewedBy: owner` itself (the ruleset requires no code-owner review: `docs/OWNER-SETUP.md` §1); the agent must give a quoted source passage for every change in the PR (`docs/CONTENT-OPS.md` §3); the owner reads the sources. | process; a canary test page in the dry run |
| Reminder email abuse | sending to an address the user does not own | Reminders only to the verified sign-in address; one-click unsubscribe (RFC 8058); per-user daily cap. | integration |
| Denial of wallet (our costs) | a bot hammering functions | Rate limits, WAF rules, spending alerts on Vercel and Supabase, static history served from cache. | alerts configured |

## 3. Data classification

| Data | Where | Class | Retention |
|---|---|---|---|
| Plan and entries (local mode) | IndexedDB on the device | user's own | until the user deletes; export at will |
| Plan and entries (account) | Supabase EU, `payload` column | personal financial data | the life of the account plus 30 days after deletion (undo, `docs/LEGAL.md` §5); 35 days in backups (§10) |
| Email | Supabase Auth | personal | the life of the account plus 30 days after deletion (undo, `docs/LEGAL.md` §5) |
| Reminder metadata (buy day, timezone, next due) | `reminder_prefs` | personal | until opt-out or, with the account, 30 days after its deletion (undo, `docs/LEGAL.md` §5) |
| Error events | Sentry EU, PII scrubbed | technical | 30 days |
| Server-side counters | our database, daily aggregates, no identifiers | technical | 24 months |
| Price cache | the shared cache: the instance's memory until the Runtime Cache store lands; the CDN | public | minutes |
| Last good price copy (`prices:last`) | the instance's memory, and the optional Upstash Redis store (eu-central-1) | public | served while the upstream fails for less than 24 hours after its fetch, then 503; the Redis key expires 24 hours after it was written (CoinGecko's terms, ADR-0036) |
| Daily closes (server, `history:<coin>:<currency>`) | the shared cache: the instance's memory until the Runtime Cache store lands; the CDN | public | served while less than 24 hours after its fetch, then fetched again; the CDN keeps an answer only for what is left of those 24 hours; no last good copy, an upstream failure is a 502 (CoinGecko's terms, ADR-0036) |
| Last prices and daily closes (device) | IndexedDB on the device | public | live prices and daily closes less than 24 hours after the fetch (daily closes by the device's clock, with ADR-0019's five-minute allowance for a clock behind the server's), and live prices whose data (`snapshot.at`) is also less than 24 hours old, so an old copy a cache hands over is not kept; deleted at the next load or read (CoinGecko's terms, ADR-0036; ADR-0019 readings); prices typed by hand until replaced |
| Logs | Vercel, no bodies logged | technical | provider default |

## 4. Headers and CSP

The CSP, its `Reporting-Endpoints` header and the other headers are static (ADR-0045 §4):
`apps/web/scripts/vercel-config.ts` writes them into `apps/web/vercel.json` from
`apps/web/lib/security/csp.ts` and `apps/web/lib/security/headers.ts`, and
`apps/web/lib/vercel-config.test.ts` fails when the committed file differs from the code. The policy
is hashed, not nonced: `script-src` names `'self'`, `'strict-dynamic'` and the SHA-256 of the app
shell's two inline scripts (the theme before paint, `packages/app/src/lib/theme`, and the boot
script, `packages/config/vite/boot.ts`); `style-src` names the hash of the UK page's inline style.
Base UI's inline style elements are off: the ui `Select` wraps its root in
`CSPProvider disableStyleElements` (`packages/ui/src/components/select.tsx`), and the one rule they carried, for
`.base-ui-disable-scrollbar`, is in `packages/ui/src/styles/globals.css`; a Base UI part that renders
a `<style>` takes the same provider, never a hash.
The prerendered site pages carry no script. The UK route of `vercel.json` sends the same headers
with the 451 page (ADR-0029) and `Cache-Control: no-store`; the assets under `/assets/` and the
worker carry the eight headers without the CSP. The redirects Vercel answers before the app carry
none of them, only Vercel's own
`Strict-Transport-Security: max-age=63072000` over HTTPS: the 308 from a path that ends in `/`
(ADR-0045's deviations) and the 308s to `https://proofofcalm.com` from `http://`, `www` and
`proofofcalm.app` (`docs/OWNER-SETUP.md` §4; curl, 2026-10-19). A page's response carries:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'sha256-<theme script>' 'sha256-<boot script>' 'strict-dynamic';
  style-src 'self' 'sha256-<the UK page's style>';   # a hash per inline style; never 'unsafe-inline' in script-src
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';                          # M3 adds https:// and wss://<project-ref>.supabase.co; everything else is same-origin
  worker-src 'self' blob:;
  manifest-src 'self';
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
  upgrade-insecure-requests;                   # on an https origin only
  report-uri /api/csp-report; report-to csp-endpoint
Reporting-Endpoints: csp-endpoint="/api/csp-report"
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   # submit to hstspreload.org only when every subdomain is HTTPS-only
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()   # do not restrict publickey-credentials-* (passkeys)
X-Content-Type-Options: nosniff
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow                # until the public launch after M2
```

No `unsafe-eval` and no `unsafe-inline` anywhere: the policy is the static one in `vercel.json`,
which the e2e suite runs against through `tools/serve/vercel-local.ts` (`vite`'s dev server sends
no CSP); no third-party origins
in `script-src` ever: the Vercel Analytics script, Sentry's loader script, BotID and Turnstile widgets
are therefore not used; Sentry, from M3, is a bundled first-party SDK tunnelled through our own function (§11, ADR-0045 §13).
No `dangerouslySetInnerHTML` anywhere; no sanitiser runs, because Learn modules compile to React at build (§2's XSS row).
Violations go to `/api/csp-report` (the directive and the blocked origin or keyword only, never a path or a query, counted per UTC day in the optional store for 24 months). The e2e suite
asserts zero CSP violations on every page; the release checklist runs the CSP Evaluator.
`/.well-known/security.txt` (RFC 9116) with `Contact`, `Expires` (≤ 12 months), `Preferred-Languages:
en, pt, de`, `Policy` linking the disclosure policy on the Contact page.

## 5. Authentication (ADR-0035)

Six-digit email one-time code as the default (scanner-proof, cross-device), the same email carrying
a click-to-confirm link that verifies only on an explicit POST, never on GET; passkeys through
Supabase's native WebAuthn support as an added method after the first sign-in (experimental API,
pinned and wrapped; RP ID = proofofcalm.com, ADR-0040). No passwords, no anonymous users. The
browser Supabase client with a storage adapter holds the session (tokens sent as bearer headers to
our API; no cookies, so the wrapper and the web share one code path); the strict CSP is the
compensating control for tokens readable by scripts. Keys: the publishable key in the browser, the
secret key only in server code behind `server-only`. Rotating single-use refresh tokens with reuse
detection; "sign out everywhere" in Settings → Account; sign-in notification email; identical
responses for known and unknown addresses. The local-only user upgrades by signing in; the local
data is pushed as the first sync.

## 6. Row-level security and its tests

Tables (M3): `plans`, `entries`, `devices`, `reminder_prefs`, `reminder_sends`, `user_keys`
(reserved), `events_daily`. Every user table: `user_id uuid not null default auth.uid() references
auth.users on delete cascade`, RLS enabled, four policies `to authenticated` with `user_id =
auth.uid()` and `with check` on writes, no grant to `anon`, indexes on `(user_id, seq)`; functions
`security invoker`; a tripwire test asserts RLS is enabled on every table in `public`. Tests run
with pgTAP through `supabase test db` and with Vitest against the local stack on every migration:
for each table and operation, user A cannot read, update or delete user B's rows, cannot insert with
B's `user_id`, anon sees nothing; the secret key is never used from `apps/web` except the cron
route. Migrations live in `supabase/migrations` (planned: M3) and are applied in CI to a fresh
database before the tests; `supabase db push` deploys them.

## 7. Sync protocol security (ADR-0021)

Push: authenticated batch of entity upserts with client `id`, `updatedAt`, `deletedAt`, `payload`;
the server stamps `seq` and clamps `updatedAt` to at most 5 minutes in the future. Pull:
`since=<seq>` returns changed rows for the user only. Payloads are validated for size and JSON
shape; the server does not interpret the plan in v1 beyond that; in v2 the payload is ciphertext and
the server cannot.

## 8. Secrets

- Local: `apps/web/.env.local` (gitignored), the folder Vite and `tools/serve/vercel-local.ts` read
  env files from; `.env.example`
  lists every variable with a comment. Vercel: project environment variables scoped per environment;
  Supabase: dashboard; GitHub Actions: repository secrets.
- Only `VITE_*` reaches the browser, and the hosts' build defines the two it uses
  (`packages/config/vite`'s host table); a CI step (`tools/scan/secrets.ts`, after the web build)
  fails when the client build holds the value of any server-side variable named in `.env.example`, or
  a string shaped like a Supabase secret key, a CoinGecko, Resend or AWS key, a GitHub token or a
  private key.
- Rotation: the CoinGecko key and the Supabase secret key (`sb_secret_…`) yearly or on suspicion;
  the rotation checklist goes here and is not written yet.
- No secrets in logs; no request bodies in logs.

## 9. Dependencies and supply chain

Exact pins in the `pnpm-workspace.yaml` catalog (`catalogMode: strict`); `strictDepBuilds` with an
explicit `allowBuilds` list instead of blanket install scripts; `minimumReleaseAge: 4320` (three
days) with `minimumReleaseAgeStrict`; `trustPolicy: no-downgrade`; `blockExoticSubdeps`;
`--frozen-lockfile` in CI; Renovate (not Dependabot, whose lockfile regeneration conflicts with the
age gate), configured in `renovate.json` and installed by the owner (`docs/OWNER-SETUP.md` §2), with
the full gate on every update; Dependabot security alerts on; OSV-Scanner in CI (accepted advisories
in development and build tooling are listed in `osv-scanner.toml`, each with its reason and an expiry
date; fixed releases in the same major are pinned through pnpm `overrides`); Socket's free GitHub app, as ADR-0025
decides, once the owner installs it (`docs/OWNER-SETUP.md` §2); CodeQL if the repository is public;
GitHub Actions pinned to commit digests with `permissions: {}` at the top of every workflow except
`snapshots.yml`, which sets `contents: read` there for its one job; lockfile changes reviewed by a
human.

## 10. Backups and the restore drill

- Supabase Pro daily backups (seven-day retention, not downloadable); PITR ($100/month) deferred
  until money depends on a two-minute recovery point.
- Our own: a nightly `supabase db dump` (roles, schema, data; verify in the first drill that
  `auth.users` is included) encrypted with `age` (recipient key in the repository, identity key
  offline in the password manager and on paper) and copied to a Cloudflare R2 bucket created with the
  `eu` jurisdiction, lifecycle rules keeping 35 nightly dumps and no monthly copies, a manifest with
  row counts and `max(seq)` beside each dump, write-only token, no artefacts retained in Actions.
  The 35-day window was decided on 2026-10-18, so that a deleted account leaves the backups within
  the 35 days `docs/LEGAL.md` §5 states (this document's §2 and §3 say the same).
- The user's JSON export is the last line of defence and is advertised as such.
- Restore drill, quarterly and before any schema migration: restore the latest dump into a scratch
  project, run the RLS tests and a row-count comparison, open the app against it with a test user,
  log the date, duration and result below.

| Date | Dump | Duration | Result | Notes |
|---|---|---|---|---|
| (none yet) | | | | |

## 11. Monitoring and incident response

Sentry (EU region) collecting no user info, bodies, query strings, headers or cookies, with
`beforeSend` and `beforeBreadcrumb` scrubbing of emails, amounts, coin lists and sign-in codes,
Session Replay disabled (ADR-0027), tunnelled same-origin through our own function (the SDK for the
Vite host is chosen at M3, ADR-0045 §13); Vercel and Supabase spending alerts; uptime check on `/`
and `/api/prices`.

Incident response for a solo builder: (1) stop the bleeding (rotate keys, disable the route, roll
back), (2) measure (which users, which data, which window), (3) notify: users within 72 hours when
personal data is affected, the CNPD (or the competent authority) within 72 hours of awareness where
GDPR Art. 33 applies, (4) write it up here, (5) add the failing test.

## 12. Client-side encryption readiness (ADR-0030)

Rows carry `payload` (opaque), `enc_version smallint not null default 0`, `key_id text null`,
`nonce bytea null` and `schema_version int` (ADR-0030, item 2); v2 writes `enc_version = 1` with the
ciphertext in `payload`. `reminder_prefs` holds the only plaintext the server needs. Key derivation
candidates for v2: WebAuthn PRF from the passkey, or a passphrase with Argon2id, with printed recovery
codes; the choice and the recovery UX are decided when v2 is scheduled, informed by the support matrix
recorded in the research file.

## 13. Disclosure policy (summary for the Contact page)

Report to the security address in `security.txt`; acknowledgement within 72 hours; no legal action
for good-faith research that avoids data access beyond proof, service disruption and public disclosure
before a fix; credit on request.
