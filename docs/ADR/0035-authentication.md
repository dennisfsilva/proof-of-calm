# ADR-0035: Authentication: one-time email code and passkeys, no password

Status: Accepted; session handling in `proxy.ts` superseded by ADR-0045 (no proxy; the browser client holds the session) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-backend-security.md` §1.1–1.3)

## Context

ADR-0004 fixed "email magic link or passkey, no password, no profile". The research, read from Supabase's own documentation on 2026-10-16, adds three facts: (1) corporate mail scanners (Microsoft Safe Links and similar) open magic links before the user does and burn the token, a limitation Supabase documents with two remedies (send a code, or send a link to a page where the user clicks to confirm); the PKCE code exchange also only works in the browser that started the flow. (2) Supabase Auth has native WebAuthn passkeys since 2026-05-28, marked experimental ("the API may change without notice"), requiring `@supabase/supabase-js` ≥ 2.105.0 and an explicit flag; registration needs a signed-in, confirmed, non-anonymous user; the Relying Party ID is the bare domain and changing it invalidates every passkey. (3) Anonymous sign-ins exist but convert fragilely (manual linking is a beta flag, email collisions must be reconciled by hand, anonymous users cannot register passkeys) and would create database rows for people who never wanted an account.

## Options considered

1. Magic link as the primary method (the prototype of the brief). Scanner-consumed links and the same-browser restriction make this the worst option for a monthly-use tool whose users open mail on one device and the app on another.
2. **6-digit email one-time code as the primary method**, with the same email carrying a click-to-confirm link as a convenience; passkeys as an added second method after the first sign-in; no anonymous users.
3. A third-party passkey provider (Hanko, Corbado, Passwordless.dev) in front of Supabase. A second identity system to reconcile; unnecessary now that Supabase has passkeys.

## Decision

Option 2:

- `signInWithOtp({ email, options: { shouldCreateUser: true } })` with a template that shows `{{ .Token }}` and a link to `/auth/confirm?token_hash={{ .TokenHash }}&type=email`; the confirm page renders a button, and only its POST calls `verifyOtp` and sets the cookies. GET never verifies. Codes expire after 10 minutes (dashboard setting), six digits, identical responses for known and unknown addresses.
- Session handling with `@supabase/ssr` (pinned in the catalog) in `proxy.ts` using `getClaims()`; refresh in one place only; the publishable and secret key pair (`sb_publishable_…` / `sb_secret_…`), the secret key never in the browser.
- Passkeys through Supabase's native API behind a feature flag and one wrapper module, offered on Settings → Account after the first email sign-in ("Add a passkey for faster sign-in"); conditional UI (autofill) on the sign-in screen; email code remains the recovery path. RP ID = the product's bare domain, decided before launch (and therefore after the name decision, see `docs/LEGAL.md` §1); origins include the Capacitor app's Android asset-link origin later.
- No anonymous sign-ins: local-only mode has no server user; the upgrade is sign-in then push (ADR-0021).
- Rate limits: Supabase defaults plus an Upstash fixed window of 5 OTP requests per email per hour (fail closed) and a WAF rule on the auth routes.
- Sign-in notification email with device and time; "sign out everywhere" in Settings; account deletion requires a fresh code.

## Consequences

- "No password" holds; "magic link" becomes "code, or link if your mail client lets you click it", which the onboarding copy says in one line.
- Auth emails go through the mail provider of ADR-0026 (custom SMTP); the built-in Supabase SMTP is unusable beyond the team's addresses.
- The experimental passkey API is pinned and wrapped; a breaking change costs one module.
- The e2e suite covers: code sign-in across two browser contexts, link click-to-confirm, a scanner-style GET on a fresh link creating no session, passkey registration and sign-in on Chromium's virtual authenticator, sign out everywhere.

## Disagreement

None; this refines ADR-0004 with facts that were not available when it was taken.
