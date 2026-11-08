# ADR-0043: Class names are joined, not merged

Status: Accepted; the plan-B trigger in its consequences was met and is decided by ADR-0045 · Date: 2026-10-17 · Deciders: build session · Supersedes: the runtime merging in `cn` (ADR-0005, deviation "how the shadcn components arrive": "the repository's own `cn` (clsx and tailwind-merge)")

## Context

Measured as Vercel serves it, the Today page broke its script budget: 167,071 bytes against 163,840
(`docs/ENGINEERING.md` §4, ADR-0005). Vercel compresses with brotli quality 3, not the 11 the local
check assumed (ADR-0024, deviations). At that quality React and the Next.js runtime take about 138 kB
of an empty page, where ADR-0005 measured 113 kB at the highest quality, so about 22 kB remain for
everything the product adds. tailwind-merge was 10,083 bytes of it: it resolves conflicting utilities
on every render, in a design system whose components and call sites are all in this repository.

## Options considered

- Keep tailwind-merge and cut elsewhere: next-intl (12,844 bytes with its message parser) carries the
  messages and Serwist (3,373) the offline shell; neither is optional, and the rest is the framework.
- Raise the budget: it is ADR-0005's decision about the bytes users download, and nothing here
  argues for spending more of them on class merging.
- Join classes and treat a conflict as a bug that tests find.

## Decision

`cn` joins class names (clsx) and resolves nothing. Two utilities for one property on one element are
a bug. `packages/ui/src/lib/class-conflicts.ts` runs tailwind-merge with the theme's own scales in
tests only, after every story (`.storybook/preview.tsx`, portals included) and on every page of the
e2e matrix, and fails on any class it would drop. Components give each property one value: a variant
names its own border colour, alignment follows the `numeric` prop, and a colour sits on the element
that owns it. tailwind-merge moves to the UI package's devDependencies.

## Consequences

- Every page loads 8.8 kB less script at Vercel's quality. Together with the Mono font no longer
  preloaded (`docs/DESIGN.md` §5), Today meets its budgets again: 162,699 bytes of script measured
  locally, where request headers count slightly more than on Vercel, and a median largest contentful
  paint of about 2.39 s.
- A caller can no longer override a component's utility with a conflicting class; it adds a variant or
  a prop, and the tests say where.
- The first run found four conflicts, all fixed at their source: the button's transparent border under
  the outline and destructive variants, the ghost icon button's ink under the toast's muted close
  icon, the left alignment of table and chart-table heads under numeric columns, and the table cell's
  ink under muted cells.
- The headroom is thin. M1's Today screen has to fit in about 22 kB of product script beside the
  framework at Vercel's compression, half of the 45 kB ADR-0005 meant for application code. If it
  cannot, that is ADR-0005's plan B trigger, decided in its own ADR with the measurements, not a quiet
  raise of the budget.
