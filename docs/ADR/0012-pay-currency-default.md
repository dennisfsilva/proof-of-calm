# ADR-0012: Coin prices in the pay currency by default, USD as the toggle

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session

## Context

The prototype defaulted the coin-price display to USD because markets quote in dollars, with the pay
currency as the toggle. The audience pays in euros (and pounds, francs); the number they typed on the
exchange is in their currency; showing dollars first makes the holdings table disagree with the log.

## Options considered

1. USD default, pay currency as toggle (the prototype).
2. Pay currency default, USD as the toggle; when the pay currency is USD, EUR is the toggle.

## Decision

Option 2. Logged amounts are stored in the pay currency and never converted (ADR-0017 keeps them
exact). The display-currency toggle affects only coin prices, averages and charts; portfolio value,
invested and P/L are always in the pay currency. The FX ratio for the toggle is derived from the
price feed (the ratio of a coin's price in both currencies), as the prototype did, never from a
separate FX source in v1.

## Consequences

- The holdings table and the log agree by default.
- A user who changes pay currency keeps all logged amounts as typed and is told so (prototype hint
  retained).
- The price cache requests prices in all supported currencies at once (one call), so the toggle is
  instant and offline-capable.

## Disagreement

None.
