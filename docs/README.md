# Proof of Calm documentation

Start with `BUILD-PROMPT.md`, what this repository adds to the process, if you run a build session.
Start with `ROADMAP.md` if you want to know what is being built and in what order. The rules for a
path you touch (its review tier, what to read first, the documents that own its facts) are the
files in `.claude/rules/`; the process itself is the crew plugin (ADR-0046).

| Document | What it holds |
|---|---|
| `BUILD-PROMPT.md` | What this repository adds to the process: the commands and limits it declares, the high-risk classes and their gates, what only the owner does, the brief lessons, the milestone report |
| `ROADMAP.md` | Milestones M0–M5 with acceptance criteria and the tests that prove them |
| `DOMAIN.md` | The behavioural specification of `packages/core`, extracted from the prototype and extended |
| `ARCHITECTURE.md` | Repository layout, package boundaries, the dependency rule, feature folders, naming |
| `ENGINEERING.md` | Code design principles with examples, what must have a test per layer, the responsiveness regime, the budgets |
| `DESIGN.md` | The brand system: tokens in OKLCH, type, spacing, radius, motion, chart palette, components |
| `CONTENT-STYLE.md` | Voice and tone, microcopy, the banned-words list and the copy-review checklist |
| `EDUCATION.md` | The seven Learn modules, the simulator, the Red day page, with sourced facts |
| `JURISDICTIONS.md` | The country content model, suggestion logic, tax years, and the country facts with sources |
| `CONTENT-OPS.md` | The "agent drafts, human publishes" pipeline: schedule, sources per country, PR template, guard rails |
| `content-review-log.md` | What each owner's review found wrong in the drafts, by kind of mistake |
| `LEGAL.md` | Legal pages and their outlines, disclaimer placement, UK handling, what must happen before charging money |
| `BENCHMARK.md` | The competitor benchmark for disclosures, the regulatory minimum for this product, the patterns to copy and avoid, the open questions; the counsel and brand roles read it |
| `SECURITY.md` | Security baseline, threat model for sync, RLS testing, CSP, secrets, backups and the restore drill |
| `RELEASE.md` | The release checklist |
| `OWNER-SETUP.md` | Steps only the owner can take (GitHub plan and rulesets, Renovate, Vercel, DNS, keys), with the defaults until they are done |
| `GROWTH.md` | The three-year growth plan: position, brand, release stages, channels, targets and the rules for marketing; accepted by the owner on 2026-10-17, its decisions in ADR-0039 to ADR-0041 and the open ones in §9 |
| `ADR/` | Decision records, numbered, with an index that says which paths each one applies to |
| `research/` | Dated research reports with sources, read-only history: the planning session's (2026-10-16) with its scripts, the host measurements behind ADR-0045 (`research/host-plan-b.md`, 2026-10-17), the draft letters to Kraken and Bitstamp (`research/letters/`, 2026-10-17); nothing here is a rule |

Conventions for documents: plain words, dated facts with sources, no filler; one owner per fact,
every other document points to it; a path or command that does not exist yet carries a planned
marker (the rule: `docs/ENGINEERING.md` §2, checked by `pnpm lint:docs`). A document that describes
behaviour is updated in the same PR as the behaviour.
