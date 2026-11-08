---
paths:
  - "**/tools/**"
  - "**/.github/**"
  - "**/packages/config/**"
  - "**/biome.json"
  - "**/turbo.json"
  - "**/knip.jsonc"
  - "**/eslint.config.mjs"
  - "**/pnpm-workspace.yaml"
  - "**/pnpm-lock.yaml"
tier: 2
security: true
proof: a run of the changed workflow on the branch (the pull request's run for ci.yml, a dispatch for a workflow that takes one), with the run id
docs:
  - path: docs/ENGINEERING.md
    sections: §2 (what each layer must prove)
  - path: docs/SECURITY.md
    sections: §8 (secrets); §9 (dependencies and supply chain)
  - path: .github/workflows/ci.yml
    sections: the header comment owns the gate's composition
  - path: tools/README.md
  - path: docs/ADR/0025-lint-format-dependency-rule.md
  - path: docs/ADR/0048-learn-modules-mdx.md
    sections: Decision (the compiler and the closed body); Deviations
  - path: packages/config/README.md
    sections: the dependency rules and createHostConfig
  - path: docs/ARCHITECTURE.md
    sections: Packages and their boundaries
---

# Tools, CI and the sensors' configuration

Repository scripts, the workflows, the shared TypeScript and dependency-cruiser configuration, and
the root files of Biome, turbo, knip and ESLint, and pnpm's workspace file and lockfile (the pins,
the catalog, the allowed install scripts). Tier 2 because a defect here switches a check off
without failing anything.

Rules and the tool that checks each:

- A check that is removed or weakened says so in the PR body under Proof, with what replaces it;
  the header comment of `ci.yml` is updated in the same PR (the docs lint, `pnpm lint:docs`, checks
  that the commands it names exist).
- Workflows use pinned actions, least-privilege `permissions:` blocks and no secret in a log;
  a dispatch input is validated before use (`docs/SECURITY.md` §9; the reviewer's checklist).
- Scripts under `tools/` are dependency-free Node with a test beside them, run by `pnpm test`
  through the tools package; they print one line per step and the failing step's output, nothing more.
- Rule names and flags come from the vendor's documentation or the schema in `node_modules`
  (`@biomejs/biome/configuration_schema.json`), never from memory.
- A lint that could fail main lands in warn mode first and is flipped by a one-line PR once main is
  clean.

Security checklist: the reviewer applies it to this path (CI permissions, secrets in logs, the
actions' pins, dependency changes).

Empirical gate (named in the PR's Proof section): a run of the changed workflow on the branch,
green, with its run id: the pull request's own run for `ci.yml`, `gh workflow run
lighthouse-branch.yml --ref <branch>` when the change reaches the Lighthouse job, `gh workflow run
<file> --ref <branch>` for a workflow that takes a dispatch; for a lint or config change, `pnpm check`
output on the branch showing the check fires on a known-bad input.

Escape hatch: none for a weakened check without its replacement named.

Review: tier 2 (reviewer with the security checklist, then a refuter over every finding).
