# ADR-0010: Free core forever; "Proof of Calm Plus" later, through a merchant of record

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session · Amended by ADR-0039 (CSV import moves to the free core)

## Context

Trust is the positioning. A planner that nudges towards purchases, carries affiliate links or hides
the core behind a paywall is not trusted. A solo builder still needs the project to pay for its
hosting and, if it grows, for the owner's time. EU VAT on digital services sold to consumers across
member states is a burden a merchant of record removes.

## Options considered

1. **Affiliate links to exchanges.** Standard in the category; converts the educator into a promoter
   and, in the UK, into a financial promotion (`docs/LEGAL.md`).
2. **Ads.** Noise, the opposite of the promise.
3. **Freemium**: the core (plan, log, portfolio, education, country card, export) free forever; a paid
   tier only for sync, reminders, CSV import, multiple plans and reports; optional tips; payments
   through a merchant of record that handles EU VAT and invoicing; no affiliate links in v1.

## Decision

Option 3. Payments arrive in M5, after there are users. The provider choice and the preconditions
(company, VAT, terms, the provider's rules on crypto-adjacent products) are recorded in ADR-0038 and
`docs/LEGAL.md`; the research of this session found that acceptable-use policies differ sharply on
"cryptocurrency" and must be confirmed with the provider before building the tier.

## Consequences

- The free tier is not crippled: one plan, unlimited entries, all education, export and import.
- Entitlements are a small module checked at the feature boundary; the core never knows about tiers.
- Store apps (M3) must not sell the tier in-app unless store rules force it; the web tier remains
  usable inside the wrapper (ADR-0002).
- "Tips" are a one-off payment through the same provider, never a nag.
- Copy never says "upgrade to unlock"; it says what Plus adds and what it costs, with the date of the
  last price change.

## Disagreement

None.
