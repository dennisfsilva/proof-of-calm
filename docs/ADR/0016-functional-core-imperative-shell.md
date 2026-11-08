# ADR-0016: Functional core, imperative shell

Status: Accepted; the location of the ports and adapters set by ADR-0032 (`packages/app`) · Date: 2026-10-16 · Deciders: planning session

## Context

The prototype interleaves plan maths with rendering, the clock, `localStorage` and the price API in
one closure. That made it untestable and let float and date mistakes hide. Proof of Calm needs the same
maths to run in a web app, a service worker (reminder scheduling), a Node script (golden fixtures,
simulator precomputation) and later a Capacitor shell, with identical results.

## Options considered

1. **Hooks and components own the logic** (typical React app). Fast to write, slow to test, logic
   drifts between screens.
2. **A class-based domain layer with injected services.** Testable, but services leak time and I/O
   into the domain through mocks.
3. **Functional core, imperative shell.** The core is a library of pure functions over plain data;
   time, prices, storage and randomness are inputs; the shell (the Next app) owns all effects behind
   small ports with adapters.

## Decision

Option 3, as specified in `docs/DOMAIN.md` and `docs/ARCHITECTURE.md`:

- `packages/core` has no runtime dependency besides the decimal library and zod; a lint rule forbids
  `Date`, `Math.random`, `fetch`, `window`, `process`, `console` and any import from `apps/*`.
- Every core function takes `today: CalendarDate` (and prices, profiles) explicitly.
- Core functions return values or `Result<T, DomainError>`; they never throw for user-caused
  conditions.
- The shell has ports (`Clock`, `PlanStore`, `PriceSource`, `HistorySource`, `Mailer`, `Analytics`)
  in `apps/web/lib/ports` and adapters in `apps/web/lib/adapters`; tests of features swap adapters,
  tests of the core mock nothing.
- Property-based tests cover the maths where invariants exist (slot generation, splitting,
  eligibility monotonicity, portfolio identities, sync convergence).

## Consequences

- Golden tests against the prototype are straightforward: same inputs, compare outputs.
- The simulator and the reminder job reuse the core unchanged.
- The cost is discipline at the boundary: components never call adapters directly; a feature's
  `actions` module is the only writer.
- Coverage of 100 % for the core is realistic because the core has no branches that depend on the
  environment.

## Disagreement

None; this was requested in the brief and the session confirms it is the right shape for this product.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Decision, fourth bullet: "in `apps/web/lib/ports` and adapters in `apps/web/lib/adapters`".**
  The ports are in `packages/app/src/lib/ports` and the adapters in
  `packages/app/src/lib/adapters`, where ADR-0032 and ADR-0005 (Decision, item 1) put them;
  `apps/web/lib` holds neither. The ports are `Clock`, `PlanStore` with its `HistoryCache`,
  `PriceSource` and `Analytics`, with ADR-0032's `Router` and `Platform`; `HistorySource` and
  `Mailer` are not built yet (`packages/app/src/lib/ports/index.ts`, `docs/ARCHITECTURE.md`).
- **2026-10-20, the bullet above: "`HistorySource` and `Mailer` are not built yet".** `HistorySource`
  is built: one coin's daily closes from `GET /api/history/:coin`, the device's `HistoryCache` first
  (`packages/app/src/lib/ports/index.ts`, `packages/app/src/lib/adapters/history-source.ts`), on the
  services as `history`. `Mailer` is still not built (M3).
