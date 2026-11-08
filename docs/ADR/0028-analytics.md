# ADR-0028: Analytics

Status: Accepted; counting in route handlers and server actions superseded by ADR-0045 (functions in `server/`) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/legal-regime.md` §3.8, `docs/research/stack-backend-security.md` §9)

## Context

The brief asked for privacy-first analytics or none, with a cookie-free setup so that no consent banner is needed. The research found that "cookie-free" is not the same as "consent-free": under the EDPB's 2023 guidelines on the technical scope of ePrivacy Article 5(3), a script that instructs the browser to send data is "gaining access" to the terminal, so cookieless script tools (Plausible, Umami, Vercel Web Analytics) need consent in Germany (§ 25 TDDDG, DSK guidance: visitor counting is not per se strictly necessary) and in Portugal (Lei 41/2004 has only the strictly-necessary exemption), are exempt in France only under the CNIL's audience-measurement conditions, and are exempt in the UK under the 2026 "statistical purposes" exception with an opt-out. Pure server-side counting from request logs, with no script and no identifier kept, is consent-free in all four. The CSP (no third-party scripts) points the same way.

## Options considered

1. **None at all.** Simplest; the builder flies blind on whether onboarding completes.
2. **Server-side counting**: a handful of events incremented in route handlers and server actions into one table of daily aggregates; no IP, no user id, no cookie, no script.
3. **Cookieless script analytics** (Plausible EU, Umami self-hosted, Vercel Web Analytics). Needs consent in DE and PT, a CSP exception, and a US processing question for Vercel's product.

## Decision

Option 2. One table `events_daily (day, event, count)` and five events: `plan_created`, `entry_logged`, `account_linked`, `reminder_sent`, `export_downloaded`. Traffic volume comes from Vercel's built-in observability (no script); errors from Sentry. CSP violation reports are counted the same way (directive and blocked URI only). No consent banner, and the cookie-free statement (`docs/LEGAL.md`) describes exactly this.

## Consequences

- Funnels, sessions and per-page metrics do not exist. If a product question ever needs them, the path is Plausible (EU) behind an in-app opt-in toggle (consent by action, no banner), recorded as a new ADR, never a default script.
- The events are counted in the shell's actions layer, never in the core, and never in local-only mode where no server is involved (so `plan_created` undercounts by design; the statement says so).
- Copy and legal pages can truthfully say: no cookies or local storage for tracking, advertising or analytics; only what the service you asked for needs.

## Disagreement

None. The brief said "prefer a cookie-free setup so no consent banner is needed"; this is the only setup that achieves it in all launch countries.
