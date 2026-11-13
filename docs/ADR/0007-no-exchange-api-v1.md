# ADR-0007: No exchange API connections in v1; CSV import in v1.1

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session · Amended by ADR-0039, and by ADR-0041 (CSV import for the main exchanges of Portugal and Germany at the launch, M2) and ADR-0056 (Kraken, then Trade Republic; synthetic fixtures)

## Context

Automatic import of purchases from exchanges would remove the monthly tap entirely. It also means
holding API keys (even read-only keys leak balances and history), building and maintaining one
integration per exchange, and absorbing their outages and schema changes. A solo builder without a
security budget cannot store exchange credentials responsibly, and the product promise is custody-free.

## Options considered

1. **Direct read-only API keys** stored by us. Highest convenience; highest liability.
2. **A vetted aggregator** (an API-key custodian with SOC 2-level controls) in a later version; keys
   never touch our servers.
3. **CSV import** from the big exchanges (Kraken, Coinbase, Binance, Bitvavo) in v1.1 (M4); nothing
   automatic in v1.

## Decision

Option 3 for v1 and v1.1. Read-only keys only ever through option 2, never stored by us directly
without a dedicated security budget and a threat model update.

## Consequences

- The one-tap estimate (ADR-0003) is the convenience feature instead; it needs only prices.
- CSV parsers are pure functions in `packages/core` with fixtures from real anonymised exports; the
  mapping UI shows a preview and de-duplicates by exchange transaction id.
- The privacy notice can truthfully say we hold no exchange credentials.
- Competitors with API sync will look more convenient; the trust position ("we cannot touch your
  funds, we do not hold your keys") is the answer, stated plainly in Learn's "Start here".

## Disagreement

None.
