# ADR-0046: Development process v2

Status: Accepted · Date: 2026-10-19 · Deciders: build session, on the owner's delegation

## Context

The process audit of 2026-10-19 measured what version 1 of the process (four user-level skills, a
tracker issue, per-branch review tiers, a per-session multi-lens audit and a milestone stage audit)
cost on M0 and the first two sessions of M1:

- The cost centre is the builders, not the orchestrator. Session 2 ran 43 agents; its five builders
  used 64–124 M tokens each over 280–400 calls at 250–340 K of context, and 70 % of the bytes agents
  received from tools were shell output. The orchestrator made 42–94 calls per session.
- Review found little for its price: five high-risk reviews (two reviewers and a refuter each) in
  session 2 produced 7 findings (0, 1, 1, 3, 2); one of the reviewed fixes was reverted by the same
  session's integration audit. The integration read found every code defect of M1 so far (seven
  cross-package fixes in one PR, a production-only redirect loop and a turbo inputs defect in another).
- Documents drifted because facts had no owner: the gate's composition was described in 6 places,
  the docs-only CI skip in 5, the dependency rule in 7, the supply-chain settings in 4; the skill said
  commit subjects were limited to 72 characters while the repository checks 100. The documentation
  audit that followed found 155 confirmed errors, took 9 PRs and 31 hours, and each 4–5-agent fan-out
  cost about 1 M tokens; the account's weekly limit was hit on 2026-10-18. Audit and accuracy PRs were
  11 of the 53 merged (21 %), and 11 of M1's 22.
- Reading was unscoped: a builder following "Read first" loaded 1,531 lines before any ADR and 5,055
  with the ADR folder; ADR-0045 alone is 1,108 lines, about 700 of them design. The tracker was
  19,232 bytes, 40 % of it a copy of the merged-PR list GitHub already holds.
- Rules lived in prose: no tool counted file length (11 of 351 source files were over the 300-line
  review rule), nothing asserted a story per component (23 components, 22 stories), the PR checklist
  re-asked what CI proves (28 of 47 checklists left the gate box unticked with a note), and labels
  existed on 13 of 53 PRs. CI itself was not the bottleneck: median 4.1 minutes per run, 0 failures in
  the last 37, and the local-build Lighthouse job never failed while the Vercel one caught the one
  real miss. The fast local checks take 30–40 s sequentially, but no command ran only those.

## Options considered

- Keep v1 and tighten the prompts: the same facts in the same places; no tool catches the drift the
  audit measured, and the agent counts stay where they are.
- v2 as specified: the process moves into a plugin, the repository declares its commands, tiers and
  reading sets in files, and deterministic checks replace the audits that re-read documents.
- An AI review run in CI on every pull request: no cost ceiling, no refutation, and nothing it
  finds is tied to a test; the reviewed-and-reverted fix of session 2 is the failure mode.

## Decision

The process is the `crew` plugin, version 2.0.0 or later, installed at user scope from its local
marketplace; sessions run with `/crew:next-checkpoint`. The plugin is stack-agnostic and reads only
what this repository declares. The repository adds:

- `.claude/crew.json`: the commands (`check`, `gate`, `test`, `testCount`, `e2e`, `deadCode`,
  `docsLint`), the default branch, the subject, branch and PR-size limits, the evaluator's viewport
  projects, the content roles, the preview hint.
- `.claude/rules/*.md`, path-scoped, each with its review tier, its empirical gate, the documents and
  ADR sections to read, and the rules the lint cannot hold: `core.md` (tier 2), `ui.md` (tier 1),
  `app.md` (tier 1, with the storage paths at tier 2 in `app-storage.md`), `web.md` (tier 2, security),
  `content.md` (tier 2 for jurisdictions, templates and facts, with counsel), `tools-ci.md` (tier 2,
  security: the sensors' own configuration and the workflows), `docs.md` (tier 0).
- The empirical gates per class, named in the PR body's Proof section: CI and hosting changes, a
  dispatch run of the branch's workflow with its run id; storage, forward and rollback read tests;
  money and dates, golden fixtures; flows, the evaluator on the two viewport projects, light and dark.
- Review by tier: tier 0, sensors only (copy changes add the content roles); tier 1, one reviewer;
  tier 2, a reviewer with the security checklist where the rule says so, a refuter over the shuffled
  findings, and the empirical gate. Findings get one of three verdicts: confirmed (a test or a
  command), refuted (evidence), judgment (a cited rule, run id or screenshot). An integration read
  stays on every wave with more than one merged branch, scoped by the import graph.
- Deterministic sensors: `pnpm check` (the fast tier: typecheck, lint, unit, validation, the docs,
  size and commit-subject lints, quiet output); `pnpm lint:docs` (paths, commands and ADR numbers
  resolve, planned markers with a milestone, the ADR index and Status consistency, owned literals,
  accepted ADRs unedited above their Corrections, Deviations or Readings heading); `pnpm lint:size`
  (400 lines unless the file header carries a reason); Biome's `noSkippedTests` and `noFocusedTests`
  as errors; a test that every `packages/ui` component has a story; CI diffs pushes to `main` so a
  docs-only merge skips the app jobs, runs the local Lighthouse job on pushes only, drops the
  Storybook static build, and checks the PR body for its `Session:` and `Review:` lines and the
  `checkpoint` label.
- Fact ownership: one owner per fact, every other document points.

  | Fact | Owner | Pointers only |
  |---|---|---|
  | commands | `CLAUDE.md` and `package.json` | READMEs; `docs/ENGINEERING.md` |
  | the gate's composition | the header of `.github/workflows/ci.yml`, with `docs/BUILD-PROMPT.md`'s command lines | `docs/ENGINEERING.md` §2 keeps what must have a test per layer; `docs/RELEASE.md`, `docs/ROADMAP.md`, `docs/OWNER-SETUP.md` point |
  | package map and dependency rule | `docs/ARCHITECTURE.md` and `packages/config/dependency-cruiser.cjs` | `CLAUDE.md`'s structure, six lines and a pointer |
  | budgets | `apps/web/lighthouserc.json` and `docs/ENGINEERING.md` §4, numbers only | the history stays in ADR-0005 and ADR-0045 |
  | supply chain | `pnpm-workspace.yaml` and `docs/SECURITY.md` §9 | `docs/ENGINEERING.md` §7 points; Renovate's shape is `renovate.json` and `docs/OWNER-SETUP.md` §2 |
  | headers and CSP | `docs/SECURITY.md` §4 | `docs/ENGINEERING.md` §6 points; `docs/ARCHITECTURE.md`'s proxy paragraph is marked until the switch |
  | review tiers and high-risk paths | `docs/BUILD-PROMPT.md` (the map) and the rules files | the plugin names the tiers, never the paths |
  | owner rules | the `CLAUDE.md` above the repository | the plugin and `docs/BUILD-PROMPT.md` point |
  | disclosures wording and placement | `docs/LEGAL.md` §4, one table | `docs/CONTENT-STYLE.md` §3 rows and `docs/EDUCATION.md` caveats point |
  | banned words | `packages/content/style/banned.json` | `docs/LEGAL.md` §6 and `docs/CONTENT-STYLE.md` keep the why, not the list |

- Session issues and the tracker: one issue per session (label `session`) holds the scope, the risks
  and tier, what proves it, the design notes and the carry-overs as a checklist; at close it gets a
  five-line summary (PRs, findings with confirmed and judgment counts, agents, wall time, tokens) and
  a two-line retrospective. The tracker stays under 40 lines: roadmap, a `Now:` phase marker, the next
  prompt, one line per session, decisions as ADR links, what needs the owner. There is no merged list:
  PRs are found by their `Session: #<issue>` line and the `checkpoint` label. A carry-over not
  scheduled within two sessions becomes an ordinary issue or is closed.
- Labels: `tracker`, `checkpoint`, `needs-owner`, `session`.
- ADRs are decisions under 150 lines; accepted ones are unedited above their Corrections,
  Deviations or Readings heading; design and evidence go to `docs/research/`. The lint enforces the
  first two.

## Consequences

- Per session the owner sees one info box with the cost line (agents, wall time, tokens, measured
  from the transcripts by the plugin's script, never estimated), a preview link with three things to
  look at, and the next prompt; the session issue holds the rest.
- Removed: the per-session multi-lens audit with refutation (the integration read and the evaluator
  replace it), the eight-item PR checklist (the Proof section and CI replace it), the whole-corpus
  documentation fan-outs (the docs lint and the docs-keeper over the merged diff replace them), the
  tracker's merged list, the local Storybook static build, and the full `pnpm gate` as the pre-PR
  step (`pnpm check` is; the gate stays for the switch PR and the stage audit).
- Expected cost: a three-branch wave with two tier-2 branches runs about 10–12 agents, against 43 in
  session 2; builders get `maxTurns` and a smaller context window, quiet check output and no
  whole-file reads; PRs are 100–300 changed non-test lines. The six numbers (change-fail rate, lead
  time, first-pass acceptance, rework PRs, needs-owner wait, review addressed rate) are reported at
  each milestone from the PR bodies and the transcripts, so the next change to the process has data.
- Until the docs lint runs as an error, it runs in warn mode; the one-line PR that flips it opens
  when it prints nothing on `main`.

## Rejected

- Biome's `useExhaustiveSwitchCases`: a nursery rule that enables the type inference engine and the
  project scanner (Biome's documentation, read 2026-10-19); `assertNever` in the default branch stays a
  typed rule the compiler already enforces.
- Splitting ADR-0045 into a decision and a research file: the reading load is cut instead by the rules
  files, which name the sections to read; the ADR is not edited.
- Enabling the plugin at project scope: the repository's `.claude/settings.json` holds permission
  rules only, so nothing plugin-related is committed and the plugin's version is one per machine.
- An AI review in CI: see the options above.

## Deviations recorded on 2026-10-26

- **2026-10-26, the local Lighthouse job runs on a dispatch too** (#170). The Decision's "runs the
  local Lighthouse job on pushes only" no longer holds: ci.yml's `lighthouse` job runs on push and on
  `workflow_dispatch`, never on a pull request, so `gh workflow run ci.yml --ref <branch>` proves the
  job before a merge.

## Deviations recorded on 2026-10-27

- **2026-10-27, a branch's Lighthouse run has its own workflow** (#194). Dispatching `ci.yml` ran the
  whole gate again on the branch to get its `lighthouse` job, about 2,100 minutes from 2026-10-01 to
  2026-10-26. `ci.yml` no longer takes `workflow_dispatch`: `gh workflow run lighthouse-branch.yml
  --ref <branch>` runs the same steps (`tools/lighthouse/workflows.test.ts` holds them equal), and it
  runs by itself on a pull request that changes that file. The entry above stands for the job itself.
