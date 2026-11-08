---
paths:
  - "**/packages/app/**"
tier: 1
security: false
proof: the evaluator on the changed flows
docs:
  - path: docs/ARCHITECTURE.md
    sections: Packages and their boundaries; Inside packages/app; the wrapper rules under The API, the hosts and the store wrapper
  - path: docs/ENGINEERING.md
    sections: §1.4 to §1.6
  - path: docs/ADR/0032-repository-architecture.md
  - path: docs/ADR/0033-pwa-offline.md
  - path: docs/ADR/0034-forms-validation-numeric-input.md
  - path: docs/ADR/0045-host-vite-spa.md
    sections: §8 (i18n and per-route messages) and §9 (routes, lazy screens, the navigation adapter)
  - path: docs/ADR/0048-learn-modules-mdx.md
---

# packages/app

The product: `features/*`, `lib/*`, `messages/`. Host-agnostic React; the hosts are thin.

Rules and the tool that checks each:

- Dependency rule: `features` → `lib` → `packages/{core,ui,content,data}`; `lib` never imports
  `features`; a feature imports another only through its `index.ts` (dependency-cruiser, `pnpm lint:deps`).
- Nothing imports `next/*`, `server-only` or the web host's server code (dependency-cruiser; the
  host builds' client-never-imports-server guard; the export build, `pnpm build:export`, must
  pass). API calls go through `packages/app/src/lib/adapters/api-client.ts` with an injectable base
  URL and no cookies, and navigation through `lib/navigation` over wouter, never a host's router
  (review rules, ADR-0032, ADR-0045 §9).
- Side effects live in adapters behind the ports in `lib/ports`; the core gets `today` from the
  Clock port, never from `Date`. Validate every storage read, import file and API response with
  `zod/mini` and infer the type.
- Formatting of money, units and dates happens once, in `lib/format`; `toFixed` and `parseFloat`
  are banned elsewhere (ESLint `no-restricted-syntax`, `pnpm lint`). Numeric input follows ADR-0034.
- Copy: messages are `feature.screen.element` keys in the feature's `messages/` folder, merged with
  `pnpm --filter @proofofcalm/tools messages` (a test fails when the merged file is stale); the
  banned-words lint runs on them (`pnpm validate:content`); the rules are in `docs/CONTENT-STYLE.md`.
- Every stateful component has a test beside it and a story; the flow it belongs to has an e2e test
  on the viewport matrix (`docs/ENGINEERING.md` §2).

Storage, migrations and the store are a separate rule at tier 2: `app-storage.md`.

Empirical gate (named in the PR's Proof section): the evaluator runs the changed proven-by flows on
the two projects named in `.claude/crew.json`, light and dark.

Escape hatch: a new port or adapter is added to `docs/ARCHITECTURE.md`'s `lib/` tree in the same PR.

Review: tier 1 (one reviewer); tier 2 when the storage rule also matches.
