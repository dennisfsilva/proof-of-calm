---
paths:
  - "**/packages/ui/**"
tier: 1
security: false
proof: story tests with axe at 360 and 1280 px, light and dark
docs:
  - path: docs/DESIGN.md
    sections: §1 to §5 for tokens and type; §6 to §8 for spacing, layout and the component inventory; §10 for the checks
  - path: docs/ADR/0022-charts.md
  - path: docs/ADR/0043-class-names-joined-not-merged.md
  - path: docs/ADR/0045-host-vite-spa.md
    sections: §14 (the toast)
---

# packages/ui

Tokens, components and charts. `docs/DESIGN.md` owns every colour, type size, spacing step and
radius; a component carries none of them as literals.

Rules and the tool that checks each:

- Tokens only: no hex colours, px font sizes, font families or removed outlines outside
  `packages/ui/src/styles` (`pnpm lint:styles`, part of `pnpm lint`). Light and dark come from the
  tokens on `data-theme`; never branch on the theme in a component.
- `cn` joins class names without merging (ADR-0043): give each element one utility per property.
  The story tests and the e2e matrix fail on a conflicting pair.
- Every component in `src/components/*.tsx` has a sibling `*.stories.tsx`, and every story passes
  axe at 360 and 1280 px in light and dark (`pnpm storybook:test`; the components-have-stories test
  in `pnpm test`).
- Touch targets 44 px, visible focus, `prefers-reduced-motion` respected, no horizontal scroll at
  360 px (`docs/DESIGN.md` §6; the e2e matrix and the story tests check them).
- shadcn sources are copied from the CLI's dry run and restyled on the tokens (the command is in
  `CLAUDE.md`); `packages/ui` imports `packages/core` types only, never `packages/app` or content
  (dependency-cruiser, `pnpm lint:deps`).
- Charts follow ADR-0022: the maths lives in `packages/core`, the component only draws.

Empirical gate (named in the PR's Proof section): `pnpm storybook:test` green on the changed stories;
a screen-level change also shows the two evaluator projects from `.claude/crew.json`.

Escape hatch: a token the design system lacks is added to `docs/DESIGN.md` and
`packages/ui/src/styles/tokens.css` in the same PR, never as a literal in the component.

Review: tier 1 (one reviewer).
