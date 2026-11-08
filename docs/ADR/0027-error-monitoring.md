# ADR-0027: Error monitoring

Status: Accepted; the Next.js SDK (`@sentry/nextjs`, `tunnelRoute`) superseded by ADR-0045, the SDK for the Vite host chosen at M3 · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-backend-security.md` §8)

## Context

A solo builder needs to learn about errors without reading logs, and the product holds financial data that must never appear in an error event. The CSP forbids third-party scripts (ADR-0016's shell rules and `docs/SECURITY.md`), so the monitoring SDK must be bundled first-party and its traffic must stay same-origin.

## Options considered

| Option | Notes |
|---|---|
| **Sentry**, EU data region (Frankfurt) | Developer plan free (5k errors, 1 user); `@sentry/nextjs` 11.8.0; `tunnelRoute` keeps traffic same-origin; `dataCollection` options (the former `sendDefaultPii` is deprecated) switch off user info, bodies, query params, headers, cookies; Session Replay simply not configured. Account metadata, settings and DSN keys are stored in the US regardless of region (Sentry data-storage page). |
| GlitchTip (EU) | Sentry-compatible SDK; cheaper at volume; smaller ecosystem |
| Bugsink (EU, hosted or self-hosted) | Sentry-compatible; free 15k events; the EU fallback if US-stored account metadata or the one-user limit becomes a problem; tunnel route needs our own forwarder |

## Decision

Sentry, organisation created in the **EU region** (cannot be changed later), Developer plan, with:

- `withSentryConfig({ tunnelRoute: '/sentry-tunnel' })` (fixed string so the proxy matcher can exclude it); the Sentry loader script is never used.
- `dataCollection: { userInfo: false, httpBodies: [], urlQueryParams: false, httpHeaders: false, cookies: false }`, `tracesSampleRate: 0.05`, logs off, no Replay.
- `beforeSend` and `beforeBreadcrumb` scrubbers (unit-tested): drop `user`, `extra`, device context; redact emails, amounts with a currency or coin symbol, `token_hash` and six-digit codes in messages, exception values, breadcrumbs and URLs; strip query strings, headers, cookies and request data; drop fetch breadcrumbs for `/api/sync` and `/auth/`; never `setUser` with an email; never attach plan or entry payloads.
- Project settings: "Prevent Storing of IP Addresses", advanced scrubbing of `$user.geo.**`, 30-day retention, source maps uploaded and deleted after upload, AI features off.
- Move to Team ($29) only if 5k errors/month is exceeded; Bugsink hosted (€16) as the EU fallback.

## Consequences

- The release checklist includes sending a test event containing an email and an amount and confirming both are redacted.
- The privacy notice names Sentry (US entity, EU event storage, DPF/SCCs) and the 30-day retention.
- Errors from the core carry codes, not data, which keeps events clean by construction.

## Disagreement

None.
