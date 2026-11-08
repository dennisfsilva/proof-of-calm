# @proofofcalm/ui

Design tokens (the single source of colour, type, spacing, radius and motion), the Tailwind theme made
from them, restyled shadcn components on Base UI, our own toast (ADR-0045 §14), the chart primitives
and Storybook. Specification: `docs/DESIGN.md`. Domain-agnostic: from `@proofofcalm/core` it imports
types only (the dependency rule enforces it), and it holds no copy: every label is a prop.

- `src/styles/`: `tokens.css` (light and dark), `theme.css` (Tailwind and shadcn names), `globals.css`
  (what a host imports), `fonts.css` (the two `@font-face` families; the hosts and Storybook import it). The only place colours, sizes and
  families may be written.
- `src/fonts/`: the self-hosted subsets and how they were made.
- `src/components/`, `src/charts/`, `src/lib/`: the components, the SVG charts and their helpers, each
  with stories beside it, and a stateful component with its component test (Testing Library in jsdom,
  chosen per file); `test/`: the contrast and palette tests over `tokens.css`, and the test that keeps
  the Storybook configuration in the typecheck.
- Links render through the `link` component the app passes (its navigation adapter); nothing here
  imports a router. `src/lib/server-html.test.tsx` renders the components on the server and fails on
  any style attribute, which the CSP would block (`docs/SECURITY.md` §4).

Commands, from the repository root: `pnpm storybook`, `pnpm storybook:test` (every story in Chromium at
360 and 1280 px, light and dark, with axe), `pnpm storybook:build`, and `pnpm test` for the unit and
component tests.
