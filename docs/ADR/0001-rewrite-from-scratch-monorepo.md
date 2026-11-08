# ADR-0001: Rewrite from scratch in a monorepo; the prototype's logic becomes `packages/core`

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session

## Context

`DCA-Plan.html` is a 1,908-line single-file prototype: one `<script>` with state, plan maths, market
data, rendering and event plumbing interleaved; floats for money and coin units; `Date` objects and
the local clock throughout; `localStorage` as the store; no tests. It is also a good product: the
page order, the one-action Today page, the strip, the holdings table, the log grouping and the
restraint of the visual language were validated with the owner. Proof of Calm needs tests, exact
arithmetic, i18n, country adaptation, an account, a PWA and later store apps.

## Options considered

1. **Evolve the single file** into modules. Cheapest start; keeps the float and date mistakes alive;
   no clean seam for tests, i18n or a second shell (Capacitor).
2. **Port the UI incrementally** into a framework while keeping the maths as is. The maths is where
   the defects are (rounding, dates, silent caps), so this keeps the worst part.
3. **Rewrite**: the prototype's behaviour becomes a written specification (`docs/DOMAIN.md`), its
   logic is re-implemented as a pure TypeScript package with unit, property and golden tests, and the
   UI is rebuilt against a design system. The prototype stays the UX reference.

## Decision

Option 3, in a monorepo (`apps/web`, `packages/core`, `packages/ui`, `packages/content`,
`packages/config`; `docs/ARCHITECTURE.md`). The prototype's logic is ported function by function with
golden tests that compare outputs on the same data; its UI is a reference, not a source.

## Consequences

- Longer path to the first screen; mitigated by milestone M0 being only scaffold, tokens and the
  core, so the riskiest part (the maths) is finished and proven first.
- The second-system risk (rebuilding bigger than needed) is countered by the roadmap's rule: a
  feature is built only if it removes a tap from the monthly loop, prevents a costly mistake, or
  answers "where am I" faster.
- The owner's real data migrates through an importer that is also the golden-test fixture, so the
  rewrite is checked against reality, not only against the spec.
- Everything the prototype got right is listed in the kickoff brief and in `docs/DOMAIN.md`; anything
  not listed is rebuilt from scratch and may differ.

## Disagreement

None. The planning session agrees that the seam between maths and shell is worth the rewrite.
