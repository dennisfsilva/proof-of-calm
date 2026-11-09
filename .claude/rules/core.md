---
paths:
  - "**/packages/core/**"
tier: 2
security: false
proof: golden fixtures and property tests
docs:
  - path: docs/DOMAIN.md
    sections: the section of the function you change; §8 dates; §9 constants; §10 errors
  - path: docs/ENGINEERING.md
    sections: §1.1 to §1.4, §1.6, §2
  - path: docs/ADR/0016-functional-core-imperative-shell.md
  - path: docs/ADR/0017-exact-arithmetic.md
  - path: docs/ADR/0018-date-policy.md
  - path: docs/ADR/0042-today-in-the-clock-adapter.md
  - path: docs/ADR/0053-one-currency-per-plan.md
  - path: docs/ADR/0054-move-between-venues.md
---

# packages/core

Pure domain logic. The behavioural spec is `docs/DOMAIN.md`; read its section before changing a
function, and change the spec in the same PR when behaviour changes.

Rules and the tool that checks each:

- Pure: no `Date`, `Math.random`, `fetch`, `window`, `process.env`, `console`, storage or network;
  `today` is an argument (ADR-0016, ADR-0042). Checked by Biome's `noRestrictedGlobals` override for
  `packages/core/src/**` and by dependency-cruiser (`pnpm lint`). Tests never mock.
- Money, units and percents are the branded decimal types (`Money`, `Units`, `Percent`) over big.js;
  storage holds decimal strings; every division names its rounding mode; sums of rounded parts equal
  the rounded whole (ADR-0017). A `number` for an amount is a bug the typecheck catches
  (`pnpm typecheck`); the rounding mode and the sum identity are test rules.
- Calendar dates are `YYYY-MM-DD` strings in the user's calendar, instants are ISO 8601 with offset,
  one in-house date module (ADR-0018). Month ends, leap years and DST are tested (`docs/DOMAIN.md` §8).
- Closed unions end in `assertNever` in the default branch, so a new status fails the build where it
  is not handled (`pnpm typecheck`). Errors are values: `Result<T, DomainError>` with a closed code union.
- Validate at the boundary with `zod/mini` schemas; infer the type, never write it twice.
- Coverage: 100 % statements and branches (`pnpm test:coverage`; the threshold fails `pnpm test`).

Empirical gate (named in the PR's Proof section): the golden fixtures in `packages/core/test/golden/`
still pass, regenerated only when the prototype or `tools/golden/states.ts` changed (the command is
in `CLAUDE.md`), and the property tests of the module you changed.

Escape hatch: none for purity, decimals or coverage. A deviation from `docs/DOMAIN.md` is recorded in
its §12 ("Differences from the prototype") in the same PR, with the reason.

Review: tier 2 (reviewer, then a refuter over every finding).
