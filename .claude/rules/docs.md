---
paths:
  - "**/docs/**"
  - "**/*.md"
tier: 0
security: false
proof: the docs lint
docs:
  - path: docs/README.md
    sections: the table of documents and what each owns
  - path: docs/ADR/README.md
    sections: the conventions and the index
---

# Documents

Specs, standards, ADRs and the Markdown files beside the code. Tier 0: the sensors decide.

Rules and the tool that checks each:

- One owner per fact. A number, a command or a rule lives in one document; every other place points
  to it. `docs/README.md` says which document owns what; `CLAUDE.md` owns the commands and the
  commit and branch limits (`pnpm lint:docs` holds the owned-literals list).
- Every backticked path and command resolves; a path that does not exist yet carries a planned
  marker on its line, `(planned: M<n>)`, with a milestone the roadmap has not finished; a session
  number is a finding, since sessions are renumbered when one is inserted (`pnpm lint:docs`).
- `will`, `soon`, `planned` and `TODO` next to a path or command need the same marker.
- ADRs are decisions under 150 lines: context, options, decision, consequences. Design and evidence
  go to `docs/research/<topic>.md`, dated. An accepted ADR changes only below its `## Corrections`,
  `## Deviations` or `## Readings` heading; to change the decision, write a new ADR that supersedes
  it and link both ways (`pnpm lint:docs` compares the part above the heading with `origin/main`).
- `docs/ADR/README.md` lists every ADR with the first word of its `Status:` line (`pnpm lint:docs`).
- Voice: plain words, no filler, no emoji, no exclamation marks, numbers with a unit and a date,
  imperative instructions for Claude (`docs/CONTENT-STYLE.md` §1 for the product's copy).
- A doc changes in the PR that changes the behaviour it describes, never in a follow-up.

Empirical gate: `pnpm lint:docs` exits 0 (it prints only its summary line).

Escape hatch: a path the lint cannot resolve for a good reason goes on the allow-list at the top of
`tools/lint/docs.ts` with that reason.

Review: tier 0 (no reviewer; a docs-only PR runs `verify` in CI). Copy that a person reads adds the
content roles from `.claude/crew.json`.
